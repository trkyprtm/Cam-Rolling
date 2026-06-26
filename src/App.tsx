import React, { useState, useEffect, useRef } from "react";
import { 
  Film, Ticket, Copy, Check, LogOut, ArrowRight, Video, 
  Lightbulb, LightbulbOff, HelpCircle, Shuffle, ChevronRight, Play,
  Mic, MicOff, Volume2, VolumeX, QrCode, CreditCard, Menu, CheckCircle,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { RoomState } from "./types";
import { YouTubePlayer } from "./components/YouTubePlayer";
import { CinemaSeats, Avatar } from "./components/CinemaSeats";
import { ChatSidebar } from "./components/ChatSidebar";
import { YouTubePreviewCard } from "./components/YouTubePreviewCard";
import { useVoiceChat } from "./hooks/useVoiceChat";
import { AccountPortal, UserProfile } from "./components/AccountPortal";
import { auth, getRedirectResult } from "./firebase";
const camrollingLogo = "/src/assets/images/camrolling_icon_notext_1782329632171.jpg";

const createPlanNames: Record<number, string> = {
  1: "Free Solo Trial",
  2: "Duet Premium",
  3: "Trio Cinema Suite",
  4: "Quartet Lounge"
};

export default function App() {
  // Screen and session states
  const [screen, setScreen] = useState<"welcome" | "theater">("welcome");
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");

  // Input states
  const [nameInput, setNameInput] = useState("");
  const [joinRoomIdInput, setJoinRoomIdInput] = useState("");
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [changeVideoUrl, setChangeVideoUrl] = useState(""); 
  const [avatarSeed, setAvatarSeed] = useState(() => Math.random().toString(36).substring(3, 8));

  // Account & subscription portal controls
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("camrolling_user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  // Sync name input with logged-in user profile
  useEffect(() => {
    if (currentUser && nameInput === "") {
      setNameInput(currentUser.name);
    }
  }, [currentUser, nameInput]);

  // Active Session states
  const [roomId, setRoomId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [seatNumber, setSeatNumber] = useState<number | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);

  // Live Real-Time Continuous Voice Chat Connection Hook
  const { isMuted, isVoiceConnected, error: voiceChatError, toggleMute } = useVoiceChat({
    roomId: roomId || null,
    memberId: memberId || null
  });

  // Decorative UI preferences
  const [theaterDimmed, setTheaterDimmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  // 1. Check for invitation hashes on startup
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith("#CIN-")) {
      const code = hash.replace("#", "").trim().toUpperCase();
      setJoinRoomIdInput(code);
      setActiveTab("join");
    }
  }, []);

  // 1.5. Handle Firebase Google Sign-In redirect result
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          const firebaseUser = result.user;
          const usersStr = localStorage.getItem("camrolling_registered_users") || "[]";
          const usersList = JSON.parse(usersStr);
          const match = usersList.find((u: any) => u.email.toLowerCase() === firebaseUser.email?.toLowerCase());

          const profile: UserProfile = {
            name: firebaseUser.displayName || "Google Spectator",
            mobile: firebaseUser.phoneNumber || match?.mobile || "",
            email: firebaseUser.email || "",
            subscription: match?.subscription || null
          };

          if (!usersList.some((u: any) => u.email.toLowerCase() === profile.email.toLowerCase())) {
            usersList.push({
              name: profile.name,
              mobile: profile.mobile,
              email: profile.email,
              password: "google-authenticated",
              subscription: null
            });
            localStorage.setItem("camrolling_registered_users", JSON.stringify(usersList));
          }

          setCurrentUser(profile);
          localStorage.setItem("camrolling_user", JSON.stringify(profile));
          setIsAccountOpen(true);
        }
      })
      .catch((err: any) => {
        console.error("Firebase Redirect auth error: ", err);
        setErrorMessage("Google Sign-In Redirect failed: " + err.message);
      });
  }, []);

  // 2. SSE subscription manager when roomId and memberId are active
  useEffect(() => {
    if (!roomId || !memberId) return;

    // Close any previous stream
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const streamUrl = `/api/rooms/${roomId}/stream`;
    const sse = new EventSource(streamUrl);
    eventSourceRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RoomState;
        setRoomState(payload);
        setErrorMessage("");
      } catch (err) {
        console.error("Error parsing room stream update: ", err);
      }
    };

    sse.onerror = (err) => {
      console.warn("Room stream encountered an error. Reconnecting...", err);
    };

    // 3. Heartbeat scheduler: keep client active on backend
    const heartbeatTimer = setInterval(() => {
      fetch(`/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "heartbeat", memberId }),
      }).catch((e) => console.warn("Failed sending ticket heartbeat: ", e));
    }, 12000);

    return () => {
      sse.close();
      clearInterval(heartbeatTimer);
    };
  }, [roomId, memberId]);

  // Randomize current SVG avatar seed
  const rerollAvatar = () => {
    setAvatarSeed(Math.random().toString(36).substring(3, 8));
  };

  // Create a brand new Cinema Hall
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setErrorMessage("");
    setIsLoading(true);

    const userName = nameInput.trim() !== "" ? nameInput.trim() : "Host Manager";
    const initialUrl = videoUrlInput.trim() !== "" ? videoUrlInput.trim() : "https://www.youtube.com/watch?v=ScMzIvxBSi4";

    // Build the monthly subscription tier payload
    const subPayload = currentUser && currentUser.subscription && currentUser.subscription.active ? {
      active: true,
      participantLimit: currentUser.subscription.limit,
      planName: currentUser.subscription.planName,
      priceINR: currentUser.subscription.priceINR,
      paymentDate: currentUser.subscription.paymentDate || Date.now(),
      invoiceId: currentUser.subscription.invoiceId || `INV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      cardName: currentUser.name
    } : {
      active: false,
      participantLimit: 1,
      planName: "Free Solo Trial",
      priceINR: 0
    };

    try {
      // Step A: Create room on server
      const createRes = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: initialUrl,
          hostName: userName,
          avatarSeed,
          subscription: subPayload,
        }),
      });

      if (!createRes.ok) {
        throw new Error("Failed to prepare the cinema hall database.");
      }

      const { roomId: createdId } = await createRes.json();

      // Step B: Join that room immediately as Host
      const joinRes = await fetch(`/api/rooms/${createdId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userName,
          avatarSeed,
        }),
      });

      if (!joinRes.ok) {
        throw new Error("Could not reserve a seat inside the cinema hall.");
      }

      const joinData = await joinRes.json();

      // Configure session variables
      setRoomId(createdId);
      setMemberId(joinData.memberId);
      setSeatNumber(joinData.seatNumber);
      window.location.hash = createdId; // Update hash for quick share URL parsing
      setScreen("theater");
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected system fault occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  // Join an existing Private Cinema Hall
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const formattedRoomId = joinRoomIdInput.trim().toUpperCase();
    if (!formattedRoomId.startsWith("CIN-")) {
      setErrorMessage("Ticket code must resemble the format 'CIN-ABCDE'.");
      return;
    }

    setErrorMessage("");
    setIsLoading(true);

    const userName = nameInput.trim() !== "" ? nameInput.trim() : `Viewer #${Math.floor(100 + Math.random() * 900)}`;

    try {
      const joinRes = await fetch(`/api/rooms/${formattedRoomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userName,
          avatarSeed,
        }),
      });

      if (!joinRes.ok) {
        const errorData = await joinRes.json();
        throw new Error(errorData.error || "Specified Ticket Box code is unrecognized or closed.");
      }

      const joinData = await joinRes.json();

      setRoomId(formattedRoomId);
      setMemberId(joinData.memberId);
      setSeatNumber(joinData.seatNumber);
      window.location.hash = formattedRoomId;
      setScreen("theater");
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred while entering the theater.");
    } finally {
      setIsLoading(false);
    }
  };

  // Dispatch live sync actions (play, pause, seek, load-url)
  const postAction = async (actionType: "play" | "pause" | "seek", time: number) => {
    if (!roomId || !memberId) return;

    try {
      await fetch(`/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: actionType,
          memberId,
          time,
        }),
      });
    } catch (e) {
      console.warn("Could not dispatch theater controller action: ", e);
    }
  };

  // Dispatch change video feed action
  const handleChangeVideoFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changeVideoUrl.trim() === "" || !roomId || !memberId) return;

    try {
      const targetUrl = changeVideoUrl.trim();
      setChangeVideoUrl("");

      await fetch(`/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "change-video",
          memberId,
          url: targetUrl,
        }),
      });
    } catch (e) {
      console.warn("Failed changing video feed: ", e);
    }
  };

  // Dispatch chat log updates
  const postTextMessage = async (text: string) => {
    if (!roomId || !memberId) return;
    try {
      await fetch(`/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "chat",
          memberId,
          text,
        }),
      });
    } catch (e) {
      console.warn("Could not broadcast note: ", e);
    }
  };

  // Dispatch floating seat emoji reactions
  const postReaction = async (emoji: string) => {
    if (!roomId || !memberId) return;
    try {
      await fetch(`/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "reaction",
          memberId,
          emoji,
        }),
      });
    } catch (e) {
      console.warn("Could not post reaction: ", e);
    }
  };

  // Terminate current Cinema Session and exit back to lobby
  const leaveTheater = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setScreen("welcome");
    setRoomState(null);
    setRoomId("");
    setMemberId("");
    setSeatNumber(null);
    window.location.hash = "";
  };

  // Copy invitation link helper
  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}#${roomId}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-cinema-bg text-gray-200 font-sans flex flex-col relative transition-opacity duration-700 overflow-x-hidden">
      
      {/* Immersive glow elements mapped in the skies */}
      <div className="absolute top-0 left-1/4 w-[50vw] h-[40vh] bg-gold/5 rounded-full blur-[120px] pointer-events-none select-none z-0"></div>
      <div className="absolute bottom-0 right-1/4 w-[40vw] h-[40vh] bg-gold/5 rounded-full blur-[120px] pointer-events-none select-none z-0"></div>

      {/* Floating 3-Line Account Portal Menu Button in the top right corner */}
      {screen !== "theater" && (
        <div className="absolute top-6 right-6 z-40">
          <button
            onClick={() => setIsAccountOpen(true)}
            className="p-3 bg-neutral-900/95 hover:bg-neutral-800 border border-white/15 rounded-2xl text-white hover:text-gold transition-all active:scale-95 shadow-xl cursor-pointer flex items-center gap-2 font-semibold"
            id="hamburger-menu-btn"
            title="Account & Subscription"
          >
            <Menu className="w-5 h-5" />
            {currentUser ? (
              <span className="text-[11px] font-mono text-gold hidden sm:inline-block font-bold">
                {currentUser.name.split(" ")[0]}
              </span>
            ) : (
              <span className="text-[11px] font-mono text-neutral-400 hidden sm:inline-block">
                Sign In
              </span>
            )}
          </button>
        </div>
      )}

      {screen === "welcome" ? (
        /* WELCOME ENTRANCE SCREEN */
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 z-10 py-16 md:py-24">
          <div className="w-full max-w-xl flex flex-col gap-8 md:gap-11">
            
            {/* Elegant Branding Header */}
            <div className="text-center flex flex-col items-center">
              <div className="w-20 h-20 mb-3 rounded-full overflow-hidden border border-gold/40 shadow-[0_0_30px_rgba(197,160,89,0.3)] bg-neutral-950 p-0.5 flex items-center justify-center">
                <img 
                  src={camrollingLogo} 
                  alt="CamRolling Camera with Reel Logo" 
                  className="w-full h-full object-cover rounded-full"
                  referrerPolicy="no-referrer"
                />
              </div>
              <h1 className="font-serif italic text-5xl md:text-6xl tracking-tight text-white mb-2">
                CamRolling
              </h1>
              <p className="font-serif italic text-neutral-400 text-sm md:text-base max-w-md leading-relaxed">
                Shared Presence, Infinite Content. Enjoy synchronized cinematic movie feeds.
              </p>
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md mx-auto"
              >
                {errorMessage.includes("unauthorized-domain") ? (
                  <div className="p-5 rounded-2xl bg-red-950/40 border border-red-500/30 text-left flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider font-mono">Firebase Domain Authorization Required</span>
                    </div>
                    
                    <p className="text-[11px] text-neutral-300 leading-relaxed">
                      Google Sign-In failed because <span className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded break-all">{window.location.hostname}</span> has not been authorized in your Firebase console.
                    </p>

                    <div className="bg-black/50 p-3 rounded-xl border border-white/5 flex flex-col gap-2">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[10px] text-neutral-400 font-mono">Your App Domain:</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.hostname);
                            alert("Copied domain name to clipboard: " + window.location.hostname);
                          }}
                          className="px-2.5 py-1 bg-white/10 hover:bg-white/25 text-white rounded text-[10px] font-mono transition-all active:scale-95 cursor-pointer"
                        >
                          Copy Domain
                        </button>
                      </div>
                      <div className="text-xs text-white font-mono bg-black/40 px-2 py-1.5 rounded select-all break-all border border-white/5">
                        {window.location.hostname}
                      </div>
                    </div>

                    <div className="text-[11px] text-neutral-400 leading-relaxed space-y-1.5 border-t border-white/5 pt-3">
                      <span className="text-amber-400 font-bold text-[11px] block">To fix this in your Firebase Console:</span>
                      <ol className="list-decimal pl-4 space-y-1 text-[10px]">
                        <li>Open the <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-gold underline hover:text-yellow-400">Firebase Console</a> and select your project.</li>
                        <li>In the left sidebar, click on <strong className="text-white">Authentication</strong>.</li>
                        <li>Click on the <strong className="text-white">Settings</strong> tab at the top.</li>
                        <li>Select <strong className="text-white">Authorized domains</strong> from the settings list.</li>
                        <li>Click <strong className="text-white">Add domain</strong>.</li>
                        <li>Paste <span className="text-white font-mono bg-white/5 px-1 py-0.5 rounded">{window.location.hostname}</span> and click <strong className="text-white">Add</strong>.</li>
                      </ol>
                      <p className="text-[9px] text-neutral-500 italic mt-1">
                        Once added, refresh this page and Google Sign-In will work perfectly on your Railway site!
                      </p>
                    </div>

                    <button
                      onClick={() => setErrorMessage("")}
                      className="mt-2 w-full py-1.5 bg-white/5 hover:bg-white/15 text-neutral-400 hover:text-white rounded-lg text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer"
                    >
                      Dismiss Error
                    </button>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 text-center font-mono leading-relaxed relative">
                    {errorMessage}
                    <button 
                      onClick={() => setErrorMessage("")}
                      className="absolute top-1 right-2 text-neutral-500 hover:text-neutral-300 text-[10px] font-bold"
                    >
                      ×
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Main Interactive Ticket Stub Card */}
            <div className="bg-cinema-card/40 border border-white/5 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md flex flex-col">
              
              {/* Card Ribbon / Top Headers */}
              <div className="flex border-b border-white/5 bg-cinema-card">
                <button
                  onClick={() => setActiveTab("create")}
                  className={`flex-1 py-4.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    activeTab === "create"
                      ? "text-gold bg-cinema-bg"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Video className="w-4.5 h-4.5" />
                  Issue Ticket (Host)
                </button>
                <button
                  onClick={() => setActiveTab("join")}
                  className={`flex-1 py-4.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    activeTab === "join"
                      ? "text-gold bg-cinema-bg"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Ticket className="w-4.5 h-4.5" />
                  Enter private Box
                </button>
              </div>

              {/* Form Panels */}
              <div className="p-6 md:p-8 flex flex-col gap-6">
                
                {/* 1. Pick identity layout */}
                <div className="flex flex-col gap-4.5 p-4 md:p-5 rounded-2xl bg-cinema-card/60 border border-white/5">
                  <span className="font-mono text-[10px] text-neutral-400 font-bold uppercase tracking-widest">
                    Your Spectator Avatar
                  </span>

                  <div className="flex items-center gap-5">
                    {/* Generates inline SVG avatar */}
                    <div className="relative group p-0.5 rounded-2xl border border-white/10 hover:border-gold/50 transition-colors bg-neutral-900 flex-shrink-0">
                      <Avatar seed={avatarSeed} size={58} showGlasses={true} />
                      <button
                        type="button"
                        onClick={rerollAvatar}
                        className="absolute -bottom-1 -right-1 p-1 bg-gold hover:bg-gold-hover text-white rounded-full shadow-lg transition-transform hover:scale-110 cursor-pointer active:scale-95"
                      >
                        <Shuffle className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                        Set Display Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Popcorn Enthusiast"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-neutral-900 border border-white/10 rounded-xl text-white focus:outline-none focus:border-gold/40 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Create vs Join inputs selection */}
                {activeTab === "create" ? (
                  <form onSubmit={handleCreateRoom} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-neutral-400 font-mono font-medium uppercase tracking-widest">
                        YouTube Feed URL (Optional)
                      </label>
                      <input
                        type="url"
                        placeholder="Paste standard YouTube link (Or witness default chill track)"
                        value={videoUrlInput}
                        onChange={(e) => setVideoUrlInput(e.target.value)}
                        className="w-full px-4 py-3 bg-cinema-card border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-gold/40 transition-colors placeholder:text-neutral-500"
                      />
                      <span className="text-[9px] text-neutral-500 italic mt-0.5">
                        Tip: You can change the video freely from inside the hall controllers later anytime!
                      </span>
                    </div>

                    <YouTubePreviewCard url={videoUrlInput} />

                    {/* Info note about capacity */}
                    <div className="p-4 rounded-2xl bg-neutral-900/60 border border-white/5 text-[11px] text-neutral-400 leading-relaxed">
                      {currentUser && currentUser.subscription && currentUser.subscription.active ? (
                        <p className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                          <span>Logged in as <strong className="text-white">{currentUser.name}</strong>. Your cinema hall will be created with your Premium Seat capacity: <strong className="text-gold">{currentUser.subscription.limit} spectators</strong>.</span>
                        </p>
                      ) : (
                        <p>
                          Standard solo theater starts with 1 seat capacity. To unlock multi-user spectator seats, tap the <strong>Menu (three lines)</strong> icon in the top right to log in or configure a premium subscription anytime!
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-4 bg-gold text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-gold-hover transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98] mt-2 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <>Preparing Cinema Corridor...</>
                      ) : (
                        <>
                          Open CamRolling Cinema
                          <ArrowRight className="w-4 h-4 text-white" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleJoinRoom} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-neutral-400 font-mono font-medium uppercase tracking-widest">
                        Ticket Code (Required)
                      </label>
                      <input
                        type="text"
                        placeholder="Paste code (e.g. CIN-ABCDE)"
                        value={joinRoomIdInput}
                        onChange={(e) => setJoinRoomIdInput(e.target.value)}
                        required
                        className="w-full px-4 py-3 bg-cinema-card border border-white/5 rounded-xl text-xs text-white uppercase focus:outline-none focus:border-gold/40 transition-colors placeholder:text-neutral-500 font-mono tracking-wider"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-4 bg-gold text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-gold-hover transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98] mt-2 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <>Validating Ticket seat...</>
                      ) : (
                        <>
                          Enter Private Seat box
                          <ArrowRight className="w-4 h-4 text-white" />
                        </>
                      )}
                    </button>
                  </form>
                )}

              </div>
            </div>

            {/* Visual ticket perforation decorator */}
            <div className="flex items-center justify-between pointer-events-none select-none h-2 opacity-30 px-6">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="w-2.5 h-2.5 rounded-full bg-neutral-900 border border-neutral-950 border-r border-b"></div>
              ))}
            </div>

            {/* Quick Helper guidelines card */}
            <div className="p-4 rounded-2xl bg-cinema-card/40 border border-white/5 flex gap-3 text-neutral-400 items-start select-none">
              <HelpCircle className="w-5 h-5 text-gold/60 mt-0.5 flex-shrink-0" />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-white">How does synchronization work?</span>
                <p className="text-[11px] leading-relaxed">
                  The application routes playback play/pause state and progress seeks seamlessly. To co-watch, click play/pause in the custom controller: watch as everyone inside your cinema hall syncs immediately!
                </p>
              </div>
            </div>

          </div>
        </div>
      ) : (        /* ACTIVE THEATER WATCH ROOM SCREEN */
        <div className={`flex-1 flex flex-col p-4 md:p-6 lg:p-8 z-10 gap-6 transition-all duration-500 ${
          theaterDimmed ? "bg-black/95 opacity-90" : ""
        }`}>
          {/* Top Header Ticket ribbon */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-3 border-b border-white/5 select-none bg-cinema-card px-5 rounded-3xl border">
            
            {/* Title / Info branding */}
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-gold/15 border border-gold/25 text-gold rounded-xl">
                <Film className="w-5 h-5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-sm font-semibold tracking-wide text-white uppercase">
                    {roomState?.videoTitle || "Shared Cinema Reel"}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] text-[#C5A059] bg-[#C5A059]/5 px-2 py-0.5 rounded-full border border-[#C5A059]/15 tracking-widest font-bold">
                    TICKET PIN: {roomId}
                  </span>
                  <span className="text-neutral-500 text-[10px] hidden sm:inline">|</span>
                  <span className="text-[10px] font-mono text-neutral-400 hidden sm:inline">
                    Seat S{seatNumber}
                  </span>
                </div>
              </div>
            </div>

            {/* Interaction ticket buttons */}
            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              
              {/* Upgrade Subscription capacity button */}
              <button
                onClick={() => setIsAccountOpen(true)}
                title="Manage seat subscription capacity & invoices"
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-gold/10 hover:bg-gold/20 border border-gold/30 hover:border-gold/50 text-gold rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-95"
              >
                <Ticket className="w-4 h-4 text-gold" />
                <span>Seats & Billing ({roomState?.subscription?.participantLimit || 1})</span>
              </button>

              {/* Real-time Voice Chat Microphone Toggle */}
              <button
                onClick={toggleMute}
                title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                  !isMuted
                    ? "bg-gold text-white border-gold shadow-[0_0_12px_rgba(139,92,246,0.3)] hover:brightness-110"
                    : "bg-cinema-card hover:bg-neutral-800 border-white/5 text-neutral-400 hover:text-white"
                }`}
              >
                {isMuted ? (
                  <>
                    <MicOff className="w-4 h-4 text-red-500" />
                    <span className="hidden md:inline">Mic Muted</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 text-white animate-pulse" />
                    <span className="animate-pulse">Voice Live</span>
                  </>
                )}
              </button>

              {/* Dim/Brighten lights button */}
              <button
                onClick={() => setTheaterDimmed(!theaterDimmed)}
                title={theaterDimmed ? "Turn on theater lights" : "Dim theater lights"}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                  theaterDimmed 
                    ? "bg-gold/20 border-gold/30 text-gold" 
                    : "bg-cinema-card hover:bg-neutral-800 border-white/5 text-neutral-400 hover:text-white"
                }`}
              >
                {theaterDimmed ? <Lightbulb className="w-4.5 h-4.5" /> : <LightbulbOff className="w-4.5 h-4.5" />}
              </button>

              {/* Copy share invite ticket */}
              <button
                onClick={copyInviteLink}
                className="px-3.5 py-2.5 bg-cinema-card hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-xl border border-white/5 text-xs font-semibold cursor-pointer flex items-center gap-2 transition-all"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-neutral-400" />
                    Share Invite
                  </>
                )}
              </button>

              {/* Leave theater */}
              <button
                onClick={leaveTheater}
                className="px-3.5 py-2.5 bg-red-950/20 hover:bg-red-900/30 text-red-400 hover:text-red-300 rounded-xl border border-red-900/20 text-xs font-semibold cursor-pointer flex items-center gap-2 transition-all ml-auto sm:ml-0"
              >
                <LogOut className="w-4 h-4" />
                Leave Hall
              </button>
            </div>
          </div>

          {/* Voice Chat Consent/Status Announcement Bar */}
          {voiceChatError && (
            <div className="bg-red-950/45 border border-red-500/10 text-red-400 p-3 rounded-2xl text-xs flex items-center gap-2 select-none animate-pulse">
              <MicOff className="w-4 h-4 flex-shrink-0 text-red-500" />
              <span>{voiceChatError}</span>
            </div>
          )}

          {/* Change video URL banner controller */}
          <div className="flex flex-col gap-3">
            <div className="bg-cinema-card p-4 md:p-5 rounded-3xl border border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cinema-bg rounded-xl text-neutral-400 border border-white/5 flex-shrink-0">
                  <Video className="w-4 h-4" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-white">Load New Cinema Feed</span>
                  <p className="text-[10px] text-neutral-400 leading-relaxed font-sans">
                    Paste any public YouTube URL below to reload the screen for everyone in the theater room.
                  </p>
                </div>
              </div>

              <form onSubmit={handleChangeVideoFeed} className="flex gap-2 w-full md:w-auto max-w-lg flex-1">
                <input
                  type="url"
                  placeholder="Paste standard YouTube URL (e.g. watch?v=...)"
                  value={changeVideoUrl}
                  onChange={(e) => setChangeVideoUrl(e.target.value)}
                  required
                  className="w-full md:max-w-xs px-3 py-2.5 bg-neutral-950 border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-gold/40 transition-colors placeholder:text-neutral-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-gold hover:bg-gold-hover text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  Stream Feed
                </button>
              </form>
            </div>

            <YouTubePreviewCard url={changeVideoUrl} />
          </div>

          {/* Core Co-Watch grid (Screen, Seats, and Chat Sidebar side-by-side) */}
          <div className="flex-1 flex flex-col lg:flex-row gap-6 items-stretch">
            
            {/* Left Column: Screen Board and seating chair deck */}
            <div className="flex-1 flex flex-col gap-6 lg:max-w-4xl">
              
              {/* Media Synchronized Iframe Container */}
              {roomState && (
                <YouTubePlayer
                  roomState={roomState}
                  memberId={memberId}
                  onPostAction={postAction}
                  isLoggedIn={!!currentUser}
                  onRequireLogin={() => setIsAccountOpen(true)}
                />
              )}

              {/* Theater layout diagram */}
              {roomState && (
                <CinemaSeats
                  members={roomState.members}
                  messages={roomState.messages}
                  localMemberId={memberId}
                  maxCapacity={roomState?.subscription?.participantLimit || 1}
                />
              )}
            </div>

            {/* Right Column: Chat channel & active seat ticket listings */}
            <div className="flex-shrink-0 flex flex-col items-stretch lg:h-auto">
              {roomState && (
                <ChatSidebar
                  roomState={roomState}
                  memberId={memberId}
                  onPostTextMessage={postTextMessage}
                  onPostReaction={postReaction}
                />
              )}
            </div>

          </div>
        </div>
      )}

      {/* Account & Subscription Portal Modal */}
      <AnimatePresence>
        {isAccountOpen && (
          <AccountPortal
            isOpen={isAccountOpen}
            onClose={() => setIsAccountOpen(false)}
            currentUser={currentUser}
            onLoginSuccess={(user) => {
              setCurrentUser(user);
              localStorage.setItem("camrolling_user", JSON.stringify(user));
            }}
            onLogout={() => {
              setCurrentUser(null);
              localStorage.removeItem("camrolling_user");
            }}
            onSubscriptionUpdate={(updatedSub) => {
              if (currentUser) {
                const updatedUser = { ...currentUser, subscription: updatedSub };
                setCurrentUser(updatedUser);
                localStorage.setItem("camrolling_user", JSON.stringify(updatedUser));
                
                // If we have an active theater, let's update the active theater limit state!
                if (roomState && roomId) {
                  setRoomState(prev => prev ? {
                    ...prev,
                    subscription: updatedSub
                  } : null);
                }
              }
            }}
            roomId={roomId || undefined}
          />
        )}
      </AnimatePresence>

      {/* Persistent / Responsive gold-hued Sophisticated Dark status panel footer */}
      <footer className="h-11 bg-gold flex items-center justify-between px-8 text-black shadow-2xl relative z-40 select-none">
        <div className="text-[10px] uppercase font-bold tracking-widest flex items-center gap-4">
          <span>{roomState ? roomState.members.filter(m => m.active).length : 1} Watcher(s) Online</span>
          <span className="opacity-40">|</span>
          <span>Room Code: {roomId || "LOBBY"}</span>
          <span className="opacity-40">|</span>
          <span className="flex items-center gap-1">
            <Volume2 className="w-3.5 h-3.5" />
            <span>Voice Chat: {isVoiceConnected ? (isMuted ? "Connected (MUTED)" : "Connected (LIVE)") : "Connecting..."}</span>
          </span>
          {roomState && (
            <>
              <span className="opacity-40">|</span>
              <button
                onClick={() => setIsAccountOpen(true)}
                className="hover:underline flex items-center gap-1 cursor-pointer transition-colors text-black uppercase font-bold"
              >
                <Ticket className="w-3.5 h-3.5 text-black" />
                <span>Plan: {roomState.subscription?.planName || "Free Solo"} ({roomState.subscription?.participantLimit} Seats)</span>
              </button>
            </>
          )}
        </div>
        <div className="text-[10px] font-serif italic hidden sm:block">
          CamRolling: Shared Presence, Infinite Content.
        </div>
      </footer>
    </div>
  );
}
