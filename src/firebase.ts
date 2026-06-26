import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Configuration from /firebase-applet-config.json
const isBrowser = typeof window !== "undefined";
const isAIStudioPreview = isBrowser && window.location.hostname.endsWith(".run.app");

const defaultSandboxConfig = {
  projectId: "quirky-proton-4wjrd",
  appId: "1:914512333165:web:358d8676a68c8e7c24b264",
  apiKey: "AIzaSyDLg5Hxz-6dahOm3MghGBVImN4AT8GPCnk",
  authDomain: "quirky-proton-4wjrd.firebaseapp.com",
  storageBucket: "quirky-proton-4wjrd.firebasestorage.app",
  messagingSenderId: "914512333165"
};

const customUserConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
};

const hasCustomConfig = !!(
  customUserConfig.projectId && 
  customUserConfig.appId && 
  customUserConfig.apiKey
);

// Auto-fallback to Sandbox on AI Studio previews (*.run.app) to prevent domain authorization issues
const useSandbox = isAIStudioPreview || !hasCustomConfig;

const firebaseConfig = useSandbox ? defaultSandboxConfig : {
  projectId: customUserConfig.projectId!,
  appId: customUserConfig.appId!,
  apiKey: customUserConfig.apiKey!,
  authDomain: customUserConfig.authDomain || `${customUserConfig.projectId}.firebaseapp.com`,
  storageBucket: customUserConfig.storageBucket || `${customUserConfig.projectId}.firebasestorage.app`,
  messagingSenderId: customUserConfig.messagingSenderId!
};

const databaseId = useSandbox ? undefined : import.meta.env.VITE_FIREBASE_DATABASE_ID;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = databaseId && databaseId !== "(default)" ? getFirestore(app, databaseId) : getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const isUsingDefaultSandbox = useSandbox;

export { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
};
