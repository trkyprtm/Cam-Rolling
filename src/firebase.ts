import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Configuration from /firebase-applet-config.json
const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "quirky-proton-4wjrd",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:914512333165:web:358d8676a68c8e7c24b264",
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDLg5Hxz-6dahOm3MghGBVImN4AT8GPCnk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "quirky-proton-4wjrd.firebaseapp.com",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "quirky-proton-4wjrd.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "914512333165"
};

const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = databaseId && databaseId !== "(default)" ? getFirestore(app, databaseId) : getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
};
