import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, CreditCard, Users, CheckCircle, AlertCircle, 
  ArrowRight, Download, Plus, Minus, QrCode, 
  Lock, Mail, Phone, User, LogOut, Sparkles, Check
} from "lucide-react";
import { UPIQRCode } from "./UPIQRCode";

interface UserSubscription {
  active: boolean;
  limit: number;
  planName: string;
  priceINR: number;
  paymentDate: number;
  invoiceId: string;
}

export interface UserProfile {
  name: string;
  mobile: string;
  email: string;
  subscription: UserSubscription | null;
}

interface AccountPortalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onLoginSuccess: (user: UserProfile) => void;
  onLogout: () => void;
  onSubscriptionUpdate: (updatedSub: UserSubscription) => void;
  roomId?: string; // Optional: if currently inside a room, sync subscription upgrade to room
}

export function AccountPortal({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onLogout,
  onSubscriptionUpdate,
  roomId
}: AccountPortalProps) {
  // Navigation: "signin" | "signup" | "profile"
  const [authView, setAuthView] = useState<"signin" | "signup">("signin");
  const [signInMethod, setSignInMethod] = useState<"credentials" | "google">("credentials");
  const [credentialType, setCredentialType] = useState<"email" | "mobile">("email");

  // Form inputs - Sign In
  const [loginEmail, setLoginEmail] = useState("");
  const [loginMobile, setLoginMobile] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Form inputs - Sign Up
  const [signUpName, setSignUpName] = useState("");
  const [signUpMobile, setSignUpMobile] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");

  // OTP Verification states
  const [isOtpView, setIsOtpView] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [enteredOtp, setEnteredOtp] = useState("");

  // Subscription plan selector (Number of Persons)
  const [nPersons, setNPersons] = useState<number>(2);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "upi">("card");

  // Checkout inputs
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCVV, setCardCVV] = useState("");
  const [upiId, setUpiId] = useState("");

  // Feedbacks
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInvoiceText, setShowInvoiceText] = useState("");

  // Seed default registered users in localStorage for seamless logins
  useEffect(() => {
    const saved = localStorage.getItem("camrolling_registered_users");
    if (!saved) {
      const defaultUsers = [
        {
          name: "Cinema Connoisseur",
          mobile: "9876543210",
          email: "admin@camrolling.com",
          password: "password123",
          subscription: null
        },
        {
          name: "VIP Guest",
          mobile: "9123456789",
          email: "premium@camrolling.com",
          password: "password123",
          subscription: {
            active: true,
            limit: 4,
            planName: "4 Spectators Suite",
            priceINR: 39,
            paymentDate: Date.now(),
            invoiceId: "INV-DEMO77"
          }
        }
      ];
      localStorage.setItem("camrolling_registered_users", JSON.stringify(defaultUsers));
    }
  }, []);

  if (!isOpen) return null;

  // Subscription calculation formulas: Base = (10n - 1), Total = (10n - 1) * 1.18. 1 Person is free.
  const basePrice = nPersons === 1 ? 0 : (10 * nPersons - 1);
  const gstAmount = Number((basePrice * 0.18).toFixed(2));
  const totalAmount = Number((basePrice + gstAmount).toFixed(2));

  // Card input maskers
  const handleCardNumberChange = (val: string) => {
    const clean = val.replace(/\s?/g, "").replace(/\D/g, "");
    if (clean.length <= 16) {
      const chunks = clean.match(/.{1,4}/g);
      setCardNumber(chunks ? chunks.join(" ") : "");
    }
  };

  const handleExpiryChange = (val: string) => {
    const clean = val.replace(/\D/g, "");
    if (clean.length <= 4) {
      if (clean.length > 2) {
        setCardExpiry(`${clean.slice(0, 2)}/${clean.slice(2)}`);
      } else {
        setCardExpiry(clean);
      }
    }
  };

  // Sign In submit handler
  const handleSignInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    
    const usersStr = localStorage.getItem("camrolling_registered_users") || "[]";
    const usersList = JSON.parse(usersStr);

    const match = usersList.find((u: any) => {
      if (credentialType === "email") {
        return u.email.toLowerCase() === loginEmail.trim().toLowerCase() && u.password === loginPassword;
      } else {
        return u.mobile.replace(/\D/g, "") === loginMobile.replace(/\D/g, "") && u.password === loginPassword;
      }
    });

    if (match) {
      const profile: UserProfile = {
        name: match.name,
        mobile: match.mobile,
        email: match.email,
        subscription: match.subscription || null
      };
      onLoginSuccess(profile);
      setSuccessMsg(`Welcome back, ${match.name}!`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } else {
      setErrorMsg("No matching user found with those credentials. Feel free to use the quick-fill test details below, or create a brand-new account!");
    }
  };

  // Quick fill tester helper
  const handleQuickFill = (email: string) => {
    setErrorMsg("");
    setCredentialType("email");
    setLoginEmail(email);
    setLoginPassword("password123");
  };

  // Sign Up / Account Creation handler - Initiates OTP
  const handleSignUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (signUpName.trim().length < 2) {
      setErrorMsg("Please enter a valid Name (minimum 2 characters).");
      return;
    }
    if (signUpMobile.replace(/\D/g, "").length < 10) {
      setErrorMsg("Please enter a valid 10-digit Mobile number.");
      return;
    }
    const emailRegex = /^[\w.-]+@[\w.-]+\.\w+$/;
    if (!emailRegex.test(signUpEmail.trim())) {
      setErrorMsg("Please enter a valid Email address.");
      return;
    }
    if (signUpPassword.length < 5) {
      setErrorMsg("Password must be at least 5 characters long.");
      return;
    }

    const usersStr = localStorage.getItem("camrolling_registered_users") || "[]";
    const usersList = JSON.parse(usersStr);

    // Check for existing
    const exists = usersList.some(
      (u: any) => u.email.toLowerCase() === signUpEmail.trim().toLowerCase() || u.mobile === signUpMobile.trim()
    );

    if (exists) {
      setErrorMsg("An account with this Email or Mobile number already exists!");
      return;
    }

    // Generate simulated random 4-digit security OTP
    const randomOtp = Math.floor(1000 + Math.random() * 9000).toString();
    setGeneratedOtp(randomOtp);
    setEnteredOtp("");
    setIsOtpView(true);
    setSuccessMsg(`Simulated secure OTP dispatch: ${randomOtp}`);
    setTimeout(() => setSuccessMsg(""), 5000);
  };

  // Resend OTP handler
  const handleResendOtp = () => {
    const randomOtp = Math.floor(1000 + Math.random() * 9000).toString();
    setGeneratedOtp(randomOtp);
    setEnteredOtp("");
    setSuccessMsg(`A new security code has been dispatched: ${randomOtp}`);
    setTimeout(() => setSuccessMsg(""), 5000);
  };

  // Confirm OTP and complete registration
  const handleOtpVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (enteredOtp !== generatedOtp) {
      setErrorMsg("Incorrect Verification Code. Please refer to the simulated OTP box and enter the matching 4-digit PIN.");
      return;
    }

    const usersStr = localStorage.getItem("camrolling_registered_users") || "[]";
    const usersList = JSON.parse(usersStr);

    const newUser = {
      name: signUpName.trim(),
      mobile: signUpMobile.trim(),
      email: signUpEmail.trim().toLowerCase(),
      password: signUpPassword,
      subscription: null
    };

    usersList.push(newUser);
    localStorage.setItem("camrolling_registered_users", JSON.stringify(usersList));

    const profile: UserProfile = {
      name: newUser.name,
      mobile: newUser.mobile,
      email: newUser.email,
      subscription: null
    };

    onLoginSuccess(profile);
    setSuccessMsg(`Account created & verified! Welcome, ${newUser.name}.`);
    setIsOtpView(false);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  // Google Simulation Sign In
  const handleGoogleSignIn = () => {
    setErrorMsg("");
    setIsProcessing(true);
    setTimeout(() => {
      const googleUser = {
        name: "Google Spectator",
        mobile: "+91 9900990099",
        email: "google.user@gmail.com",
        subscription: null
      };
      
      // Add to registered if not there
      const usersStr = localStorage.getItem("camrolling_registered_users") || "[]";
      const usersList = JSON.parse(usersStr);
      if (!usersList.some((u: any) => u.email === googleUser.email)) {
        usersList.push({ ...googleUser, password: "google-auth-bypass" });
        localStorage.setItem("camrolling_registered_users", JSON.stringify(usersList));
      }

      onLoginSuccess(googleUser);
      setIsProcessing(false);
      setSuccessMsg("Logged in with Google securely!");
      setTimeout(() => setSuccessMsg(""), 3000);
    }, 1000);
  };

  // Buy/Upgrade Subscription handler
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!currentUser) {
      setErrorMsg("You must be logged in to buy a subscription plan.");
      return;
    }

    if (paymentMethod === "card") {
      if (cardNumber.replace(/\s/g, "").length !== 16) {
        setErrorMsg("Please enter a valid 16-digit credit/debit card.");
        return;
      }
      if (cardName.trim().length < 3) {
        setErrorMsg("Please enter the cardholder name.");
        return;
      }
    } else {
      const upiRegex = /^[\w.-]+@[\w.-]+$/;
      if (!upiRegex.test(upiId.trim())) {
        setErrorMsg("Please enter a valid UPI ID (e.g., name@bank, phone@upi).");
        return;
      }
    }

    setIsProcessing(true);

    // Simulate clearing payment with delay
    setTimeout(async () => {
      const invoiceId = `INV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const now = Date.now();
      
      const newSubscription: UserSubscription = {
        active: true,
        limit: nPersons,
        planName: `${nPersons} Spectators Suite`,
        priceINR: basePrice,
        paymentDate: now,
        invoiceId
      };

      // 1. Update in Registered Users array in localStorage
      const usersStr = localStorage.getItem("camrolling_registered_users") || "[]";
      const usersList = JSON.parse(usersStr);
      const updatedUsersList = usersList.map((u: any) => {
        if (u.email.toLowerCase() === currentUser.email.toLowerCase()) {
          return { ...u, subscription: newSubscription };
        }
        return u;
      });
      localStorage.setItem("camrolling_registered_users", JSON.stringify(updatedUsersList));

      // 2. Trigger parent callbacks to update current session state
      onSubscriptionUpdate(newSubscription);

      // 3. If currently inside a room as Host, push subscription upgrade to room
      if (roomId) {
        try {
          await fetch(`/api/rooms/${roomId}/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              participantLimit: nPersons,
              planName: `${nPersons} Spectators Suite`,
              priceINR: basePrice,
              cardName: paymentMethod === "card" ? cardName.trim() : `UPI: ${upiId.trim()}`
            })
          });
        } catch (err) {
          console.error("Room synchronization failed: ", err);
        }
      }

      // Generate downloadable tax invoice
      const invoiceText = `
=========================================================
          CAMROLLING DIGITAL CINEMA HALLS LTD.
              TAX INVOICE / RECEIPT
=========================================================
Invoice Number:   ${invoiceId}
Transaction ID:   TXN-${Math.random().toString(36).substring(2, 10).toUpperCase()}
Date & Time:      ${new Date(now).toLocaleString()}
Customer Name:    ${currentUser.name}
Customer Email:   ${currentUser.email}
Customer Mobile:  ${currentUser.mobile}
---------------------------------------------------------
ITEM DESCRIPTION                       QTY    BASE PRICE
---------------------------------------------------------
CamRolling Premium Watcher Lounge      1      INR ${basePrice.toFixed(2)}
(Room Capacity: ${nPersons} Persons)

Subtotal:                                     INR ${basePrice.toFixed(2)}
Integrated Goods & Services Tax (18% GST):    INR ${gstAmount.toFixed(2)}
---------------------------------------------------------
TOTAL PAID:       INR ${totalAmount.toFixed(2)}
=========================================================
   Thank you for choosing CamRolling! Enjoy the movie! 🍿
=========================================================
`;
      setShowInvoiceText(invoiceText);
      setIsProcessing(false);
      
      // Auto-trigger file download for user record
      const blob = new Blob([invoiceText.trim()], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `CamRolling_Invoice_${invoiceId}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dimmed glass background */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-lg bg-cinema-card border border-white/10 rounded-3xl shadow-2xl relative overflow-hidden z-10 flex flex-col max-h-[85vh]"
      >
        {/* Subtle accent border */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold/40 via-gold to-gold/40"></div>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/5 flex items-center justify-between bg-neutral-900/40">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-gold/10 text-gold rounded-lg">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="font-serif italic text-lg text-white">
              {currentUser ? "CamRolling Spectator Desk" : "Account & Subscription"}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-lg text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content area */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5">
          
          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex gap-2 items-start leading-relaxed">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl text-xs flex gap-2 items-start leading-relaxed">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* NO CURRENT USER VIEW */}
          {!currentUser ? (
            <div className="flex flex-col gap-5">
              
              {/* Tab navigation */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-black border border-white/5 rounded-xl">
                <button
                  onClick={() => { setAuthView("signin"); setErrorMsg(""); }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    authView === "signin"
                      ? "bg-neutral-900 text-white border border-white/5 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setAuthView("signup"); setErrorMsg(""); }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    authView === "signup"
                      ? "bg-neutral-900 text-white border border-white/5 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {authView === "signin" ? (
                <div className="flex flex-col gap-4">
                  {/* Toggle inner credentials vs google */}
                  <div className="flex border-b border-white/5 mb-2">
                    <button
                      type="button"
                      onClick={() => setSignInMethod("credentials")}
                      className={`flex-1 pb-2 text-[11px] uppercase tracking-wider font-bold transition-colors ${
                        signInMethod === "credentials" ? "text-gold border-b border-gold" : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      Use Email or Mobile No.
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignInMethod("google")}
                      className={`flex-1 pb-2 text-[11px] uppercase tracking-wider font-bold transition-colors ${
                        signInMethod === "google" ? "text-gold border-b border-gold" : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      Sign In with Google
                    </button>
                  </div>

                  {signInMethod === "credentials" ? (
                    <form onSubmit={handleSignInSubmit} className="flex flex-col gap-4">
                      {/* Sub-toggle email vs mobile */}
                      <div className="flex justify-end gap-3 text-[10px] text-neutral-400">
                        <button
                          type="button"
                          onClick={() => setCredentialType("email")}
                          className={`hover:text-white ${credentialType === "email" ? "text-gold font-bold underline" : ""}`}
                        >
                          Use Email ID
                        </button>
                        <span>|</span>
                        <button
                          type="button"
                          onClick={() => setCredentialType("mobile")}
                          className={`hover:text-white ${credentialType === "mobile" ? "text-gold font-bold underline" : ""}`}
                        >
                          Use Mobile No.
                        </button>
                      </div>

                      {credentialType === "email" ? (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">Email Address</label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-2.5 w-4 h-4 text-neutral-600" />
                            <input
                              type="email"
                              required
                              placeholder="admin@camrolling.com"
                              value={loginEmail}
                              onChange={(e) => setLoginEmail(e.target.value)}
                              className="w-full pl-10 pr-4 py-2.5 bg-black border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-gold/40 placeholder:text-neutral-700 font-mono"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">Mobile Number</label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-2.5 w-4 h-4 text-neutral-600" />
                            <input
                              type="tel"
                              required
                              placeholder="9876543210"
                              value={loginMobile}
                              onChange={(e) => setLoginMobile(e.target.value)}
                              className="w-full pl-10 pr-4 py-2.5 bg-black border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-gold/40 placeholder:text-neutral-700 font-mono"
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-2.5 w-4 h-4 text-neutral-600" />
                          <input
                            type="password"
                            required
                            placeholder="••••••••"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-black border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-gold/40 placeholder:text-neutral-700"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 bg-gold hover:bg-gold-hover text-white font-bold rounded-xl text-xs transition-transform active:scale-98 cursor-pointer flex items-center justify-center gap-2 shadow-lg"
                      >
                        Sign In Securely
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 border border-white/5 bg-black/40 rounded-2xl gap-4">
                      <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.81-2.6-1.12-3.41-.84-4.81z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                        </svg>
                      </div>
                      <p className="text-xs text-neutral-400 text-center max-w-xs">
                        Enjoy instantly synced watcher profiles by connecting your Google Account.
                      </p>
                      <button
                        onClick={handleGoogleSignIn}
                        disabled={isProcessing}
                        className="px-6 py-2.5 bg-white text-neutral-900 hover:bg-neutral-100 font-bold rounded-xl text-xs transition-all active:scale-95 cursor-pointer flex items-center gap-2 shadow-md"
                      >
                        {isProcessing ? "Connecting..." : "Continue with Google"}
                      </button>
                    </div>
                  )}

                  {/* Footnote showing default credentials */}
                  <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2 bg-[#050505] p-3 rounded-2xl border border-white/5">
                    <span className="text-[9.5px] font-mono text-neutral-400 uppercase tracking-wider font-bold block">
                      💡 Quick-Fill Test Credentials
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => handleQuickFill("admin@camrolling.com")}
                        className="p-2 bg-neutral-900 border border-white/5 hover:border-gold/30 rounded-lg text-left hover:text-white transition-all"
                      >
                        <span className="text-gold font-bold block">Free Tester</span>
                        <span className="text-[9px] text-neutral-500 block font-mono">admin@camrolling.com</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickFill("premium@camrolling.com")}
                        className="p-2 bg-neutral-900 border border-white/5 hover:border-gold/30 rounded-lg text-left hover:text-white transition-all"
                      >
                        <span className="text-green-400 font-bold block">VIP Premium User</span>
                        <span className="text-[9px] text-neutral-500 block font-mono">premium@camrolling.com</span>
                      </button>
                    </div>
                  </div>

                </div>
              ) : isOtpView ? (
                <form onSubmit={handleOtpVerifySubmit} className="flex flex-col gap-5">
                  <div className="text-center flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-gold/10 text-gold rounded-full flex items-center justify-center mb-1 animate-pulse">
                      <Lock className="w-5 h-5 text-gold" />
                    </div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Confirm Your Account</h3>
                    <p className="text-[11px] text-neutral-400 leading-relaxed max-w-sm">
                      We've dispatched a secure verification OTP to <span className="text-white font-semibold">{signUpEmail.trim()}</span> and <span className="text-white font-semibold">+{signUpMobile.trim()}</span> to confirm this account is real.
                    </p>
                  </div>

                  {/* Highlighted Simulated OTP Box */}
                  <div className="p-4 bg-gold/10 border border-gold/20 rounded-2xl text-center flex flex-col gap-1.5 relative overflow-hidden">
                    <span className="text-[9px] text-neutral-400 font-mono uppercase tracking-widest font-bold">Simulated OTP Delivery</span>
                    <span className="text-lg text-gold font-bold font-mono tracking-[0.2em] pl-[0.2em] select-all animate-bounce">
                      {generatedOtp}
                    </span>
                    <span className="text-[9.5px] text-neutral-500">Copy this secure PIN code into the input field below</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider text-center block">
                      4-Digit Verification PIN
                    </label>
                    <div className="flex justify-center">
                      <input
                        type="text"
                        required
                        maxLength={4}
                        placeholder="••••"
                        value={enteredOtp}
                        onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ""))}
                        className="w-36 py-3 bg-black border border-white/10 rounded-2xl text-xl font-bold text-center tracking-[1.2em] pl-[1.2em] text-white focus:outline-none focus:border-gold/40 placeholder:text-neutral-700 font-mono transition-all shadow-inner"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-2">
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-gold hover:bg-gold-hover text-white font-bold rounded-xl text-xs transition-transform active:scale-98 cursor-pointer flex items-center justify-center gap-2 shadow-lg"
                    >
                      Verify Code & Create Account
                      <Check className="w-4 h-4" />
                    </button>

                    <div className="flex justify-between items-center px-1 mt-1">
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        className="text-[10px] text-neutral-400 hover:text-gold transition-colors font-medium cursor-pointer"
                      >
                        Resend Code
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsOtpView(false)}
                        className="text-[10px] text-neutral-400 hover:text-white transition-colors font-medium cursor-pointer"
                      >
                        Edit Information
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleSignUpSubmit} className="flex flex-col gap-4">
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Create a personal CamRolling credentials passport to preserve your premium subscriptions and download receipts easily.
                  </p>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 w-4 h-4 text-neutral-600" />
                      <input
                        type="text"
                        required
                        placeholder="John Doe"
                        value={signUpName}
                        onChange={(e) => setSignUpName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-black border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-gold/40 placeholder:text-neutral-700"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">Mobile Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-neutral-600" />
                        <input
                          type="tel"
                          required
                          placeholder="9876543210"
                          value={signUpMobile}
                          onChange={(e) => setSignUpMobile(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-black border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-gold/40 placeholder:text-neutral-700 font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-neutral-600" />
                        <input
                          type="email"
                          required
                          placeholder="john@example.com"
                          value={signUpEmail}
                          onChange={(e) => setSignUpEmail(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-black border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-gold/40 placeholder:text-neutral-700 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">Create Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 w-4 h-4 text-neutral-600" />
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={signUpPassword}
                        onChange={(e) => setSignUpPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-black border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-gold/40 placeholder:text-neutral-700"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-gold hover:bg-gold-hover text-white font-bold rounded-xl text-xs transition-transform active:scale-98 cursor-pointer flex items-center justify-center gap-2 shadow-lg"
                  >
                    Register & Setup Profile
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

            </div>
          ) : (
            /* CURRENT SIGNED IN USER INTERFACE */
            <div className="flex flex-col gap-6">
              
              {/* Profile Block */}
              <div className="p-5 rounded-2xl bg-[#050505] border border-white/5 relative overflow-hidden">
                <div className="absolute top-2 right-2 flex items-center justify-center">
                  <span className="px-2 py-0.5 rounded-full bg-gold/10 border border-gold/20 text-[8.5px] font-mono text-gold font-bold">
                    Profile Dashboard
                  </span>
                </div>

                <h3 className="text-xs font-mono text-neutral-400 uppercase tracking-widest mb-3.5 font-bold flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-neutral-500" />
                  1. Spectator Profile Details
                </h3>

                <div className="flex flex-col gap-2.5 text-xs text-neutral-300">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-neutral-500">Name</span>
                    <span className="font-bold text-white">{currentUser.name}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-neutral-500">Mobile No.</span>
                    <span className="font-mono font-bold text-white">{currentUser.mobile}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-neutral-500">Email ID</span>
                    <span className="font-mono font-bold text-white">{currentUser.email}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3.5 border-t border-white/5 flex justify-end">
                  <button
                    onClick={onLogout}
                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                  >
                    <LogOut className="w-3 h-3" />
                    Sign Out Account
                  </button>
                </div>
              </div>

              {/* Subscription Status Block */}
              <div className="p-5 rounded-2xl bg-[#050505] border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-mono text-neutral-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-neutral-500" />
                    2. Subscription Plan
                  </h3>
                  
                  {/* Pulse green/red indicator */}
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${currentUser.subscription?.active ? 'bg-green-500 animate-pulse' : 'bg-red-500 animate-pulse'}`}></span>
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${currentUser.subscription?.active ? 'text-green-500' : 'text-red-500'}`}>
                      {currentUser.subscription?.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                {currentUser.subscription?.active ? (
                  <div className="mb-4 p-3 bg-green-500/5 border border-green-500/10 rounded-xl">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-neutral-400">Current Plan:</span>
                      <span className="font-bold text-green-400">{currentUser.subscription.planName}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Seat Capacity:</span>
                      <span className="font-bold text-white">{currentUser.subscription.limit} Persons limit</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                    Upgrade to a Premium Watcher group. Standard solo rooms are limited to 1 person.
                  </p>
                )}

                {/* Person Capacity Configurator */}
                <div className="bg-neutral-900/60 border border-white/5 rounded-2xl p-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider font-bold">
                      Set Seat Capacity (n)
                    </span>
                    <span className="text-xs text-white font-mono font-bold bg-neutral-950 px-2.5 py-1 rounded-lg border border-white/5">
                      {nPersons} Person{nPersons > 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={nPersons <= 1}
                      onClick={() => setNPersons(Math.max(1, nPersons - 1))}
                      className="p-2 bg-neutral-950 border border-white/5 text-neutral-400 hover:text-white rounded-lg disabled:opacity-30 disabled:hover:text-neutral-400 transition-colors cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    
                    <input
                      type="range"
                      min={1}
                      max={24}
                      value={nPersons}
                      onChange={(e) => setNPersons(Number(e.target.value))}
                      className="flex-1 accent-gold h-1.5 bg-neutral-950 rounded-lg appearance-none cursor-pointer"
                    />

                    <button
                      type="button"
                      disabled={nPersons >= 24}
                      onClick={() => setNPersons(Math.min(24, nPersons + 1))}
                      className="p-2 bg-neutral-950 border border-white/5 text-neutral-400 hover:text-white rounded-lg disabled:opacity-30 disabled:hover:text-neutral-400 transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* detailed price breakdown */}
                  <div className="mt-1 pt-3 border-t border-white/5 flex flex-col gap-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">Base Price:</span>
                      <span className="font-mono text-white">
                        {nPersons === 1 ? "Free" : `INR ${basePrice.toFixed(2)}`}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">Integrated GST (18%):</span>
                      <span className="font-mono text-white">INR {gstAmount.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center text-xs pt-1.5 border-t border-white/5 font-bold">
                      <span className="text-gold">Grand Total Price (INR):</span>
                      <span className="font-mono text-gold text-sm bg-gold/5 px-2 py-0.5 rounded-md border border-gold/10">
                        {nPersons === 1 ? "Free" : `INR ${totalAmount.toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Integrated Payment Gateways */}
                <form onSubmit={handlePaymentSubmit} className="mt-4 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-1 p-1 bg-black border border-white/5 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("card")}
                      className={`py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        paymentMethod === "card"
                          ? "bg-neutral-900 text-white border border-white/5 shadow-sm"
                          : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Card Option
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("upi")}
                      className={`py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        paymentMethod === "upi"
                          ? "bg-neutral-900 text-white border border-white/5 shadow-sm"
                          : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      UPI Option
                    </button>
                  </div>

                  {paymentMethod === "card" ? (
                    <div className="flex flex-col gap-2 p-3 bg-neutral-950/40 border border-white/5 rounded-xl">
                      <span className="text-[9px] text-neutral-400 font-mono uppercase tracking-wider font-bold">
                        🔒 Secure Visa/Mastercard Checkout
                      </span>
                      <div className="grid grid-cols-1 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Cardholder Name"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          className="w-full px-3 py-2 bg-black border border-white/5 rounded-xl text-[11px] text-white focus:outline-none focus:border-gold/30 placeholder:text-neutral-700"
                        />
                        <input
                          type="text"
                          required
                          placeholder="16-Digit Card Number"
                          value={cardNumber}
                          onChange={(e) => handleCardNumberChange(e.target.value)}
                          className="w-full px-3 py-2 bg-black border border-white/5 rounded-xl text-[11px] text-white font-mono focus:outline-none focus:border-gold/30 placeholder:text-neutral-700"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            required
                            placeholder="MM/YY"
                            value={cardExpiry}
                            onChange={(e) => handleExpiryChange(e.target.value)}
                            className="px-3 py-2 bg-black border border-white/5 rounded-xl text-[11px] text-white font-mono focus:outline-none focus:border-gold/30 text-center placeholder:text-neutral-700"
                          />
                          <input
                            type="password"
                            required
                            maxLength={3}
                            placeholder="CVV"
                            value={cardCVV}
                            onChange={(e) => setCardCVV(e.target.value.replace(/\D/g, ""))}
                            className="px-3 py-2 bg-black border border-white/5 rounded-xl text-[11px] text-white font-mono focus:outline-none focus:border-gold/30 text-center placeholder:text-neutral-700"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 p-3 bg-neutral-950/40 border border-white/5 rounded-xl">
                      <span className="text-[9px] text-neutral-400 font-mono uppercase tracking-wider font-bold">
                        ⚡ Real-Time UPI Instant Clearance
                      </span>
                      <div className="flex flex-col items-center justify-center p-2.5 bg-white rounded-xl mb-1 border border-neutral-200">
                        <UPIQRCode amount={totalAmount} roomId={roomId || "LOBBY"} />
                        <span className="text-[9px] text-neutral-500 font-mono mt-1 block">Scan with GPay, PhonePe or Paytm</span>
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="UPI VPA (e.g., name@okicici)"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        className="w-full px-3 py-2 bg-black border border-white/5 rounded-xl text-[11px] text-white font-mono focus:outline-none focus:border-gold/30 placeholder:text-neutral-700"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full py-2.5 bg-gold hover:bg-gold-hover text-white font-bold rounded-xl text-xs transition-transform active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>Processing Clearance...</>
                    ) : currentUser.subscription?.active ? (
                      <>Modify & Upgrade Premium Plan <ArrowRight className="w-4 h-4" /></>
                    ) : (
                      <>Authorize & Activate Premium Plan <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </form>

                {showInvoiceText && (
                  <div className="mt-4 p-3 bg-[#050505] border border-green-500/20 text-green-400 rounded-xl">
                    <div className="flex items-center gap-1.5 text-xs font-bold mb-2">
                      <Check className="w-4 h-4 text-green-400" />
                      <span>Invoice Downloaded Successfully!</span>
                    </div>
                    <pre className="text-[8px] leading-tight text-neutral-500 font-mono overflow-x-auto whitespace-pre p-2 bg-black rounded border border-white/5 max-h-[140px]">
                      {showInvoiceText}
                    </pre>
                  </div>
                )}

              </div>

            </div>
          )}

        </div>
      </motion.div>
    </div>
  );
}
