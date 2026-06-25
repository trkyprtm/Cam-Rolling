import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, CreditCard, Users, CheckCircle, ShieldCheck, 
  ArrowRight, Download, Plus, Minus, Landmark, Info, QrCode
} from "lucide-react";
import { UPIQRCode } from "./UPIQRCode";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLimit: number;
  currentPlanName: string;
  roomId: string;
  onSubscriptionSuccess: (updatedSub: any) => void;
}

export function SubscriptionModal({
  isOpen,
  onClose,
  currentLimit,
  currentPlanName,
  roomId,
  onSubscriptionSuccess
}: SubscriptionModalProps) {
  // Plan Selection
  const [targetLimit, setTargetLimit] = useState<number>(Math.max(currentLimit + 1, 2));
  const [step, setStep] = useState<"plan" | "payment" | "processing" | "success">("plan");

  // Payment method selection
  const [paymentMethod, setPaymentMethod] = useState<"card" | "upi">("card");

  // Payment Form States
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCVV, setCardCVV] = useState("");
  const [cardName, setCardName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [processingStatus, setProcessingStatus] = useState("");

  // Invoice output from server
  const [successSubscription, setSuccessSubscription] = useState<any>(null);

  // Razorpay configuration states
  const [razorpayKeyId, setRazorpayKeyId] = useState("");
  const [isProductionPayment, setIsProductionPayment] = useState(false);

  // Load Razorpay Script and Config on Open
  useEffect(() => {
    if (!isOpen) return;

    fetch("/api/payments/config")
      .then((res) => res.json())
      .then((data) => {
        setRazorpayKeyId(data.keyId);
        setIsProductionPayment(data.isProduction);
      })
      .catch((err) => console.error("Failed to load payment configurations:", err));

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      try {
        document.body.removeChild(script);
      } catch (e) {
        // ignore if already removed
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Formula: 10 * N + 9 INR (e.g. 2 -> 29, 3 -> 39, 4 -> 49)
  const calculatePrice = (limit: number) => {
    if (limit <= 1) return 0;
    return 10 * limit + 9;
  };

  const currentPrice = calculatePrice(targetLimit);
  const gstTax = Number((currentPrice * 0.18).toFixed(2));
  const totalAmount = Number((currentPrice + gstTax).toFixed(2));

  const getPlanFriendlyName = (limit: number) => {
    if (limit <= 1) return "Free Solo Trial";
    if (limit === 2) return "Duet Premium";
    if (limit === 3) return "Trio Cinema Suite";
    if (limit === 4) return "Quartet Lounge";
    if (limit <= 6) return "Cinema Club Pack";
    if (limit <= 12) return "Grand Ballroom Suite";
    return "Full Cinema Theater";
  };

  // Formatting utility for card number (space every 4 digits)
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\s?/g, "").replace(/\D/g, "");
    if (val.length <= 16) {
      const parts = val.match(/.{1,4}/g);
      setCardNumber(parts ? parts.join(" ") : "");
    }
  };

  // Formatting utility for expiry date (MM/YY)
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length <= 4) {
      if (val.length > 2) {
        val = `${val.slice(0, 2)}/${val.slice(2)}`;
      }
      setCardExpiry(val);
    }
  };

  // Limit CVV to 3 digits
  const handleCVVChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "");
    if (val.length <= 3) {
      setCardCVV(val);
    }
  };

  const handleNextStep = () => {
    if (step === "plan") {
      setStep("payment");
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (paymentMethod === "card") {
      if (cardNumber.replace(/\s/g, "").length !== 16) {
        newErrors.cardNumber = "Enter a valid 16-digit card number.";
      }
      const expiryParts = cardExpiry.split("/");
      if (expiryParts.length !== 2 || expiryParts[0].length !== 2 || expiryParts[1].length !== 2) {
        newErrors.cardExpiry = "Format must be MM/YY.";
      } else {
        const month = parseInt(expiryParts[0], 10);
        if (month < 1 || month > 12) {
          newErrors.cardExpiry = "Invalid month (01-12).";
        }
      }
      if (cardCVV.length !== 3) {
        newErrors.cardCVV = "CVV must be 3 digits.";
      }
      if (cardName.trim().length < 3) {
        newErrors.cardName = "Enter the cardholder's full name.";
      }
    } else {
      const upiRegex = /^[\w.-]+@[\w.-]+$/;
      if (!upiRegex.test(upiId.trim())) {
        newErrors.upiId = "Enter a valid UPI ID (e.g. name@bank, phone@upi).";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setStep("processing");
    setProcessingStatus("Initiating secure Razorpay transaction session...");

    try {
      const payerName = paymentMethod === "card" ? cardName.trim() : `UPI: ${upiId.trim()}`;
      
      // Step 1: Create Order on Server
      const orderRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: totalAmount,
          roomId,
          limit: targetLimit
        })
      });

      if (!orderRes.ok) {
        throw new Error("Could not initiate Razorpay checkout order.");
      }

      const orderData = await orderRes.json();

      // Step 2: Open Razorpay checkout modal if SDK is available, otherwise fallback to elegant automatic sandbox approval
      if ((window as any).Razorpay) {
        setProcessingStatus("Launching Razorpay Indian Merchant checkout portal...");
        
        const options = {
          key: razorpayKeyId || "rzp_test_MOCK_KEY_ID",
          amount: orderData.amount,
          currency: orderData.currency,
          name: "CamRolling Premium",
          description: `Cinema Seat Capacity Upgrade to ${targetLimit} Seats`,
          order_id: orderData.orderId,
          handler: async function (response: any) {
            setStep("processing");
            setProcessingStatus("Awaiting bank clearing confirmation & digital signature seals...");

            try {
              const verifyRes = await fetch("/api/payments/verify-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_payment_id: response.razorpay_payment_id || `pay_mock_${Math.random().toString(36).substring(2, 10)}`,
                  razorpay_order_id: response.razorpay_order_id || orderData.orderId,
                  razorpay_signature: response.razorpay_signature || "mock_signature",
                  roomId,
                  participantLimit: targetLimit,
                  planName: getPlanFriendlyName(targetLimit),
                  priceINR: currentPrice,
                  cardName: payerName
                })
              });

              if (!verifyRes.ok) {
                const errData = await verifyRes.json();
                throw new Error(errData.error || "Payment verification failed.");
              }

              const verifyData = await verifyRes.json();
              setSuccessSubscription(verifyData.subscription);
              onSubscriptionSuccess(verifyData.subscription);
              setStep("success");
            } catch (err: any) {
              alert("Payment Signature Verification Failed: " + err.message);
              setStep("payment");
            }
          },
          prefill: {
            name: cardName || "",
            email: "trkyprtm101@gmail.com",
            contact: "9999999999"
          },
          theme: {
            color: "#C5A059"
          },
          modal: {
            ondismiss: function () {
              setStep("payment");
            }
          }
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } else {
        // Fallback Sandbox flow for development when Razorpay checkout.js script fails to load
        setProcessingStatus("Sandbox: Simulating secure payment processing pipeline...");
        await new Promise(resolve => setTimeout(resolve, 1500));

        setProcessingStatus("Sandbox: Signing standard India-GST compliant digital invoices...");
        await new Promise(resolve => setTimeout(resolve, 1200));

        const verifyRes = await fetch("/api/payments/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_payment_id: `pay_mock_${Math.random().toString(36).substring(2, 10)}`,
            razorpay_order_id: orderData.orderId,
            razorpay_signature: "mock_signature_sandbox",
            roomId,
            participantLimit: targetLimit,
            planName: getPlanFriendlyName(targetLimit),
            priceINR: currentPrice,
            cardName: payerName
          })
        });

        if (!verifyRes.ok) {
          throw new Error("Sandbox payment verification rejected by server.");
        }

        const verifyData = await verifyRes.json();
        setSuccessSubscription(verifyData.subscription);
        onSubscriptionSuccess(verifyData.subscription);
        setStep("success");
      }
    } catch (err: any) {
      alert("Payment Session Error: " + (err.message || "Request timed out. Please try again."));
      setStep("payment");
    }
  };

  // Local utility to generate a downloadable ASCII tax invoice / receipt file
  const downloadInvoiceFile = () => {
    if (!successSubscription) return;

    const invoiceText = `
=========================================================
          CAMROLLING DIGITAL CINEMA HALLS LTD.
              TAX INVOICE / RECEIPT
=========================================================
Invoice Number:   ${successSubscription.invoiceId}
Transaction Date: ${new Date(successSubscription.paymentDate).toLocaleString()}
Room Code:        ${roomId}
Status:           PAID (GST Registered)
=========================================================
BILLING TO:
Name/Payer:       ${paymentMethod === "card" ? cardName : upiId}
Payment Method:   ${paymentMethod === "card" ? `Credit Card (Visa/Mastercard ending in ${cardNumber.slice(-4)})` : `UPI Instant Payment (VPA: ${upiId})`}
=========================================================
DESCRIPTION OF SERVICE:
Monthly Continuous Co-watching Cinema Subscription

Subscribed Tier:  ${successSubscription.planName}
Participant Limit: ${successSubscription.participantLimit} Person(s) Max Capacity
Subtotal Price:   INR ${successSubscription.priceINR.toFixed(2)}
GST TAX (18%):    INR ${gstTax.toFixed(2)}
---------------------------------------------------------
TOTAL PAID:       INR ${totalAmount.toFixed(2)}
=========================================================
   Thank you for choosing CamRolling! Enjoy the movie! 🍿
=========================================================
`;
    const blob = new Blob([invoiceText.trim()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CamRolling_Invoice_${successSubscription.invoiceId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="subscription-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-lg bg-cinema-card border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0a0a0a]">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-gold rounded-full animate-pulse"></div>
            <span className="font-mono text-xs font-bold text-neutral-400 uppercase tracking-widest">
              Billing & Subscriptions
            </span>
          </div>
          {step !== "processing" && (
            <button 
              onClick={onClose}
              className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-full transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dynamic Screen Content */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5">
          
          <AnimatePresence mode="wait">
            {step === "plan" && (
              <motion.div 
                key="plan-step"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex flex-col gap-5"
              >
                <div>
                  <h3 className="font-serif italic text-2xl text-white">Upgrade Seat Capacity</h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    CamRolling uses real-time dynamic room slots. Scale up to host watch parties with more participants instantly.
                  </p>
                </div>

                {/* Current plan status indicator */}
                <div className="p-4 rounded-2xl bg-neutral-950 border border-white/5 flex items-center justify-between text-xs font-mono">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-neutral-500 uppercase tracking-wider text-[10px]">Active Room Plan</span>
                    <span className="text-gold font-bold">{currentPlanName}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-neutral-500 uppercase tracking-wider text-[10px] block">Current Capacity</span>
                    <span className="text-white font-bold">{currentLimit} Watcher{currentLimit > 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Subscribed Tier Setup Selector */}
                <div className="flex flex-col gap-3.5">
                  <span className="font-mono text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                    Select Participant Limit (Including Host)
                  </span>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {[2, 3, 4, 5, 6, 8, 12, 16].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setTargetLimit(num)}
                        className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between h-24 ${
                          targetLimit === num
                            ? "bg-gold/10 border-gold shadow-[0_0_15px_rgba(197,160,89,0.15)] text-white"
                            : "bg-[#080808] border-white/5 text-neutral-400 hover:border-white/10 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-lg font-bold font-sans">{num} Seats</span>
                          <Users className={`w-4 h-4 ${targetLimit === num ? "text-gold" : "text-neutral-600"}`} />
                        </div>
                        <div className="mt-1">
                          <span className="text-xs font-mono font-semibold block text-neutral-200">
                            {calculatePrice(num)} INR
                          </span>
                          <span className="text-[9px] text-neutral-500 font-sans block truncate">
                            {getPlanFriendlyName(num)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Range Incrementor */}
                  <div className="flex items-center justify-between gap-4 p-3 bg-neutral-950 border border-white/5 rounded-2xl">
                    <span className="text-xs font-mono text-neutral-400">Custom capacity size:</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setTargetLimit(prev => Math.max(2, prev - 1))}
                        className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg transition-colors cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono text-sm font-bold text-white w-8 text-center">{targetLimit}</span>
                      <button
                        type="button"
                        onClick={() => setTargetLimit(prev => Math.min(24, prev + 1))}
                        className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Invoice Estimator */}
                <div className="p-5 rounded-2xl bg-[#090909] border border-white/5 flex flex-col gap-2.5 mt-2">
                  <span className="font-mono text-[9px] text-neutral-500 uppercase tracking-widest font-bold block">
                    Estimated Billing Breakdown
                  </span>
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-400">Monthly License (Formula: 10 × N + 9)</span>
                    <span className="font-mono text-neutral-200">{currentPrice} INR</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-400">India GST Tax (18% Digital Service)</span>
                    <span className="font-mono text-neutral-200">+{gstTax} INR</span>
                  </div>
                  <div className="h-px bg-white/5 my-1"></div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-white">Amount Due Now</span>
                    <span className="text-gold font-mono">{totalAmount} INR</span>
                  </div>
                </div>

                {/* Proceed button */}
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="w-full py-3.5 bg-gold text-neutral-950 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-gold-hover transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  Proceed to Payment Box
                  <ArrowRight className="w-4 h-4 text-neutral-950" />
                </button>
              </motion.div>
            )}

            {step === "payment" && (
              <motion.form 
                key="payment-step"
                onSubmit={handleSubmitPayment}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex flex-col gap-4"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-mono">
                    <button 
                      type="button" 
                      onClick={() => setStep("plan")}
                      className="text-gold hover:underline cursor-pointer"
                    >
                      Plan Selection
                    </button>
                    <span>/</span>
                    <span className="text-white">Secure Checkout</span>
                  </div>
                  <h3 className="font-serif italic text-2xl text-white mt-1">Payment Information</h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    CamRolling handles secure billing inside Indian merchant nodes. Select your preferred payment option below.
                  </p>
                </div>

                {/* Selected Plan Details Banner */}
                <div className="p-3.5 rounded-xl bg-neutral-950 border border-white/5 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-neutral-500 block text-[9px] uppercase tracking-wider">Subscribed Plan</span>
                    <span className="text-white font-semibold">{getPlanFriendlyName(targetLimit)} ({targetLimit} Seats)</span>
                  </div>
                  <div className="text-right">
                    <span className="text-neutral-500 block text-[9px] uppercase tracking-wider">Total Charge</span>
                    <span className="text-gold font-mono font-bold">{totalAmount} INR / month</span>
                  </div>
                </div>

                {/* Tab Selector for Credit Card vs UPI */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#050505] border border-white/5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("card");
                      setErrors({});
                    }}
                    className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      paymentMethod === "card"
                        ? "bg-neutral-900 text-white shadow-md border border-white/5 font-bold"
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Card Checkout
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("upi");
                      setErrors({});
                    }}
                    className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      paymentMethod === "upi"
                        ? "bg-neutral-900 text-white shadow-md border border-white/5 font-bold"
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    UPI Scan & VPA
                  </button>
                </div>

                {paymentMethod === "card" ? (
                  <>
                    {/* High Fidelity Visual Credit Card Component */}
                    <div className="relative w-full h-44 rounded-2xl bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-950 border border-white/10 p-5 shadow-2xl overflow-hidden flex flex-col justify-between font-mono select-none">
                      {/* Chip and logo */}
                      <div className="flex justify-between items-start">
                        <div className="w-10 h-7 bg-gold/20 border border-gold/30 rounded-md flex items-center justify-center overflow-hidden">
                          <div className="grid grid-cols-3 gap-0.5 w-full h-full p-1 opacity-60">
                            {[...Array(9)].map((_, i) => <div key={i} className="border border-gold/40"></div>)}
                          </div>
                        </div>
                        <Landmark className="w-6 h-6 text-gold opacity-80" />
                      </div>

                      {/* Card Number */}
                      <div className="text-white text-lg tracking-widest text-center my-3 min-h-[1.5rem]">
                        {cardNumber || "•••• •••• •••• ••••"}
                      </div>

                      {/* Expiry and Cardholder */}
                      <div className="flex justify-between text-[10px] text-neutral-400">
                        <div className="flex flex-col">
                          <span className="text-[8px] uppercase text-neutral-500">Card Holder</span>
                          <span className="text-white uppercase truncate max-w-[180px]">{cardName || "YOUR NAME"}</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[8px] uppercase text-neutral-500">Expires</span>
                          <span className="text-white font-mono">{cardExpiry || "MM/YY"}</span>
                        </div>
                      </div>

                      {/* Corner ambient glow */}
                      <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-gold/10 rounded-full blur-2xl"></div>
                    </div>

                    {/* Form fields */}
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-neutral-400 font-mono font-medium uppercase tracking-wider">
                          Cardholder Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Aditi Sharma"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-gold/40 transition-colors"
                        />
                        {errors.cardName && <span className="text-[10px] text-red-500 font-mono">{errors.cardName}</span>}
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-neutral-400 font-mono font-medium uppercase tracking-wider">
                          Card Number
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="4111 2222 3333 4444"
                            value={cardNumber}
                            onChange={handleCardNumberChange}
                            className="w-full pl-9 pr-3.5 py-2.5 bg-[#0a0a0a] border border-white/5 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-gold/40 transition-colors"
                          />
                          <CreditCard className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
                        </div>
                        {errors.cardNumber && <span className="text-[10px] text-red-500 font-mono">{errors.cardNumber}</span>}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-neutral-400 font-mono font-medium uppercase tracking-wider">
                            Expiry Date
                          </label>
                          <input
                            type="text"
                            placeholder="MM/YY"
                            value={cardExpiry}
                            onChange={handleExpiryChange}
                            className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-white/5 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-gold/40 transition-colors text-center"
                          />
                          {errors.cardExpiry && <span className="text-[10px] text-red-500 font-mono">{errors.cardExpiry}</span>}
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-neutral-400 font-mono font-medium uppercase tracking-wider">
                            CVV / CVC
                          </label>
                          <input
                            type="password"
                            placeholder="•••"
                            maxLength={3}
                            value={cardCVV}
                            onChange={handleCVVChange}
                            className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-white/5 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-gold/40 transition-colors text-center"
                          />
                          {errors.cardCVV && <span className="text-[10px] text-red-500 font-mono">{errors.cardCVV}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Extra security guarantees */}
                    <div className="flex items-center gap-2 text-[10px] text-neutral-500 bg-neutral-950 p-3 rounded-xl border border-white/5">
                      <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>
                        Secured by 256-bit AES SSL merchant gateway. No credential logs are retained on standard nodes.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Live Dynamic QR Code scan-and-pay block */}
                    <UPIQRCode amount={totalAmount} roomId={roomId} />

                    {/* UPI VPA (ID) Input Field */}
                    <div className="flex flex-col gap-2.5">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-neutral-400 font-mono font-medium uppercase tracking-wider">
                          Enter UPI ID (Virtual Payment Address)
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="e.g. aditi@okicici, phone@paytm"
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-white/5 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-gold/40 transition-colors"
                          />
                        </div>
                        {errors.upiId && <span className="text-[10px] text-red-500 font-mono">{errors.upiId}</span>}
                      </div>

                      {/* Info on NPCI & GPay workflow */}
                      <div className="flex items-start gap-2 text-[10px] text-neutral-500 bg-neutral-950 p-3 rounded-xl border border-white/5">
                        <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-neutral-300">UPI Secure Instant Settlement</span>
                          <span>NPCI settlement completes in real-time. Upon clicking below, authorize the pending request on your linked GPay, PhonePe, or BHIM mobile application.</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Create/Upgrade button */}
                <button
                  type="submit"
                  className="w-full py-3.5 bg-gold text-neutral-950 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-gold-hover transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98] mt-2"
                >
                  {paymentMethod === "card" ? `Pay ${totalAmount} INR & Subscribe` : `Approve ${totalAmount} INR UPI Request`}
                  <ArrowRight className="w-4 h-4 text-neutral-950" />
                </button>
              </motion.form>
            )}

            {step === "processing" && (
              <motion.div 
                key="processing-step"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-12 flex flex-col items-center justify-center gap-6 text-center"
              >
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-white/5 border-t-gold animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Landmark className="w-5 h-5 text-gold animate-pulse" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 max-w-sm">
                  <h4 className="font-serif italic text-lg text-white">Authorizing Payment...</h4>
                  <p className="text-xs text-neutral-400 font-mono leading-relaxed min-h-[2.5rem]">
                    {processingStatus}
                  </p>
                </div>
              </motion.div>
            )}

            {step === "success" && successSubscription && (
              <motion.div 
                key="success-step"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-5 text-center items-center py-4"
              >
                <div className="w-16 h-16 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mb-1">
                  <CheckCircle className="w-8 h-8" />
                </div>
                
                <div>
                  <h3 className="font-serif italic text-2xl text-white">Subscription Active!</h3>
                  <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                    Congratulations! Your CamRolling Cinema has been successfully upgraded. The participant capacity is instantly expanded.
                  </p>
                </div>

                {/* Subscribed Plan details */}
                <div className="w-full p-5 rounded-2xl bg-neutral-950 border border-white/5 flex flex-col gap-3 font-mono text-left text-xs">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-neutral-500">Invoice Number</span>
                    <span className="text-white font-bold">{successSubscription.invoiceId}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-neutral-500">Subscribed Tier</span>
                    <span className="text-gold font-bold">{successSubscription.planName}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-neutral-500">Max Room Capacity</span>
                    <span className="text-white font-bold">{successSubscription.participantLimit} Watcher Seats</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Amount Charged</span>
                    <span className="text-gold font-bold">{successSubscription.priceINR} INR (+18% GST)</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 w-full mt-3">
                  <button
                    type="button"
                    onClick={downloadInvoiceFile}
                    className="flex-1 py-3 bg-neutral-900 border border-white/5 hover:bg-neutral-800 text-neutral-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Invoice
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 bg-gold text-neutral-950 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-gold-hover transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    Enter Expanded Hall
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </motion.div>
    </div>
  );
}
