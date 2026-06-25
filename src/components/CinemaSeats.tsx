import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Member, Message } from "../types";
import { Mic, MicOff } from "lucide-react";

interface CinemaSeatsProps {
  members: Member[];
  messages: Message[];
  localMemberId: string;
  maxCapacity?: number;
}

interface ReactionBubble {
  id: string;
  emoji: string;
  seatNumber: number;
}

// Generate beautiful, consistent vector mini avatars with 3D theater glasses!
export function Avatar({ seed, size = 40, showGlasses = true }: { seed: string; size?: number; showGlasses?: boolean }) {
  const avatarSvg = useMemo(() => {
    // Basic hash helper to derive colors/shapes from seed string
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const absHash = Math.abs(hash);

    const colors = [
      "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#6366F1", "#8B5CF6", 
      "#EC4899", "#14B8A6", "#06B6D4", "#F43F5E"
    ];
    const bgColors = [
      "#1E293B", "#0F172A", "#172554", "#1F2937", "#1E1B4B", "#311042"
    ];

    const faceColor = colors[absHash % colors.length];
    const bgColor = bgColors[(absHash >> 3) % bgColors.length];
    
    // Choose nose type
    const shapes = [
      '<circle cx="20" cy="22" r="2.5" fill="#ffffff" opacity="0.8" />', 
      '<rect x="18" y="20" width="4" height="4" rx="1.5" fill="#ffffff" opacity="0.8" />',
      '<polygon points="20,18 17,23 23,23" fill="#ffffff" opacity="0.8" />'
    ];
    const nose = shapes[absHash % shapes.length];

    // Determine smile arc
    const smiles = [
      "M 14 26 Q 20 32 26 26",
      "M 15 27 Q 20 30 25 27",
      "M 13 25 Q 20 35 27 25",
    ];
    const smile = smiles[absHash % smiles.length];

    return `
      <svg viewBox="0 0 40 40" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <!-- Background circular coin -->
        <circle cx="20" cy="20" r="19" fill="${bgColor}" stroke="#334155" stroke-width="1.5" />
        
        <!-- Main bald face circle -->
        <circle cx="20" cy="20" r="13" fill="${faceColor}" />
        
        <!-- Eyes -->
        <circle cx="15" cy="18" r="2" fill="#000000" />
        <circle cx="25" cy="18" r="2" fill="#000000" />
        
        <!-- Blushing on cheeks -->
        <circle cx="12" cy="22" r="1.5" fill="#ffffff" opacity="0.4" />
        <circle cx="28" cy="22" r="1.5" fill="#ffffff" opacity="0.4" />

        <!-- Nose -->
        ${nose}

        <!-- Happy mouth path -->
        <path d="${smile}" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" fill="none" />
      </svg>
    `;
  }, [seed]);

  return (
    <div 
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      <div 
        className="w-full h-full"
        dangerouslySetInnerHTML={{ __html: avatarSvg }} 
      />
      {/* Absolute overlay of 3D Cinema Glasses */}
      {showGlasses && (
        <div className="absolute top-1/4 left-0 right-0 h-4 flex items-center justify-center scale-110 pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          <svg viewBox="0 0 40 12" className="w-[85%] h-full">
            {/* Glasses Frame */}
            <path d="M 3 3 L 37 3 L 37 9 L 29 9 L 26 5 L 14 5 L 11 9 L 3 9 Z" fill="#1e1e1e" />
            {/* Left lens (Red) */}
            <rect x="5" y="4" width="10" height="4" fill="#ef4444" rx="0.5" />
            {/* Right lens (Cyan) */}
            <rect x="25" y="4" width="10" height="4" fill="#06b6d4" rx="0.5" />
            {/* Nose bridge highlight */}
            <line x1="18" y1="4.5" x2="22" y2="4.5" stroke="#ffffff" strokeWidth="1" opacity="0.6" />
          </svg>
        </div>
      )}
    </div>
  );
}

export function CinemaSeats({ members, messages, localMemberId, maxCapacity = 24 }: CinemaSeatsProps) {
  const [activeReactions, setActiveReactions] = useState<ReactionBubble[]>([]);

  // Create mapping of active members to their seat numbers
  const seatOccupants = useMemo(() => {
    const occupants: Record<number, Member> = {};
    members.forEach((m) => {
      if (m.active) {
        occupants[m.seatNumber] = m;
      }
    });
    return occupants;
  }, [members]);

  // Generate the list of interactive seats dynamically based on maxCapacity (the capacity the host paid for)
  const rows = useMemo(() => {
    const maxSeatsPerRow = 6;
    const numRows = Math.ceil(maxCapacity / maxSeatsPerRow);
    const dynamicRows = [];

    for (let r = numRows - 1; r >= 0; r--) {
      const start = r * maxSeatsPerRow + 1;
      const count = Math.min(maxSeatsPerRow, maxCapacity - (r * maxSeatsPerRow));
      
      let label = `Row ${String.fromCharCode(65 + r)}`; // Row A, Row B, Row C...
      if (r === 0) {
        label += " (VIP Seats)";
      } else if (r === numRows - 1 && numRows > 1) {
        label += " (Back Row)";
      }
      
      dynamicRows.push({
        label,
        start,
        count
      });
    }
    return dynamicRows;
  }, [maxCapacity]);

  // Capture incoming messages to trigger the floating reaction bubbles!
  useEffect(() => {
    if (messages.length === 0) return;
    const latest = messages[messages.length - 1];

    // Trigger only if the reaction was made in the very last 2 seconds to avoid history replays
    if (latest.type === "reaction" && latest.reactionEmoji && Date.now() - latest.timestamp < 2000) {
      const sender = members.find((m) => m.id === latest.memberId);
      if (sender && sender.active) {
        const bubbleId = `${latest.id}-${Math.random().toString(36).substr(2, 4)}`;
        const newBubble: ReactionBubble = {
          id: bubbleId,
          emoji: latest.reactionEmoji,
          seatNumber: sender.seatNumber,
        };

        // Append to active array and trim to handle high volume safely
        setActiveReactions((prev) => [...prev, newBubble]);

        // Auto removal after animation completes (1.8s)
        setTimeout(() => {
          setActiveReactions((prev) => prev.filter((b) => b.id !== bubbleId));
        }, 1800);
      }
    }
  }, [messages, members]);

  return (
    <div className="w-full bg-[#0a0a0a] p-6 md:p-8 rounded-3xl border border-white/5 shadow-2xl flex flex-col items-center select-none overflow-hidden relative">
      
      {/* Absolute Ambient Screen Light reflection decoration */}
      <div className="absolute top-0 inset-x-20 h-1 bg-gold/25 blur-[15px] rounded-full animate-pulse"></div>

      {/* Title Header */}
      <div className="mb-8 text-center">
        <h3 className="font-serif text-xs uppercase tracking-widest text-[#C5A059] font-semibold mb-1">
          Cinema Seating Layout
        </h3>
        <p className="font-mono text-[10px] text-gray-400 uppercase tracking-wider">
          {members.filter(m => m.active).length} viewer(s) in seats
        </p>
      </div>

      {/* Floating Reaction Bubbles Renderer */}
      <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
        <AnimatePresence>
          {activeReactions.map((bubble) => {
            const seatIndex = bubble.seatNumber;
            const maxSeatsPerRow = 6;
            const numRows = Math.ceil(maxCapacity / maxSeatsPerRow);
            const rowNumber = numRows - Math.ceil(seatIndex / maxSeatsPerRow);
            const colNumber = (seatIndex - 1) % maxSeatsPerRow;

            // Align approximate grid percentage
            const leftPct = 15 + colNumber * 14; 
            const topPct = 35 + rowNumber * 12;

            return (
              <motion.div
                key={bubble.id}
                initial={{ opacity: 0, y: topPct + "%", x: `${leftPct}%`, scale: 0.2 }}
                animate={{ 
                  opacity: [0, 1, 1, 0], 
                  y: `${topPct - 25}%`,
                  scale: [0.3, 1.4, 1.4, 0.4] 
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="absolute text-3xl z-50 filter drop-shadow-[0_4px_8px_rgba(197,160,89,0.35)] select-none pointer-events-none font-sans"
              >
                {bubble.emoji}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Main Seating Room rows */}
      <div className="w-full max-w-xl flex flex-col gap-6 relative">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-1.5">
            {/* Row header label */}
            <span className="font-mono text-[9px] text-neutral-500 font-medium tracking-widest uppercase mb-1">
              {row.label}
            </span>

            {/* Row Chairs */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4.5">
              {Array.from({ length: row.count }).map((_, colIndex) => {
                const seatIndex = row.start + colIndex;
                const occupant = seatOccupants[seatIndex];
                const isLocal = occupant?.id === localMemberId;

                return (
                  <div
                    key={seatIndex}
                    className="relative flex flex-col items-center justify-center group"
                  >
                    {/* User Avatar if occupied, otherwise empty theater seat */}
                    {occupant ? (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                        className="relative z-20 cursor-help"
                      >
                        {/* Member Identity Tag */}
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 scale-0 group-hover:scale-100 bg-neutral-950/95 text-white text-[10px] py-1 px-2.5 rounded-lg border border-white/5 shadow-2xl whitespace-nowrap transition-transform duration-200 z-30 font-medium font-sans flex items-center gap-1.5">
                          <span>{occupant.name} {isLocal && " (You)"}</span>
                          {occupant.isMuted && <span className="text-red-400 font-mono text-[9px] font-bold">[Muted]</span>}
                          {occupant.isSpeaking && <span className="text-gold font-mono text-[9px] font-bold">[Speaking]</span>}
                        </div>

                        {/* Avatar with speaking aura */}
                        <div className={`relative rounded-full p-0.5 transition-all duration-300 ${
                          occupant.isSpeaking 
                            ? "ring-2 ring-gold shadow-[0_0_12px_rgba(197,160,89,1)] animate-pulse scale-105" 
                            : ""
                        }`}>
                          <Avatar seed={occupant.avatarSeed} size={42} showGlasses={true} />
                        </div>

                        {/* Muted Mic / Speaking indicators overlay */}
                        {occupant.isMuted ? (
                          <div className="absolute -bottom-1 -left-1 p-0.5 bg-red-950/95 border border-red-500/20 text-red-400 rounded-full shadow-lg z-30" title="Microphone Muted">
                            <MicOff className="w-2.5 h-2.5" />
                          </div>
                        ) : occupant.isSpeaking ? (
                          <div className="absolute -bottom-1 -left-1 p-0.5 bg-gold border border-[#C5A059]/40 text-black rounded-full shadow-lg z-30 animate-pulse" title="Microphone Active">
                            <Mic className="w-2.5 h-2.5" />
                          </div>
                        ) : (
                          <div className="absolute -bottom-1 -left-1 p-0.5 bg-green-950/95 border border-green-500/20 text-green-400 rounded-full shadow-lg z-30" title="Microphone Unmuted">
                            <Mic className="w-2.5 h-2.5" />
                          </div>
                        )}

                        {/* Popcorn bucket indicator for host or active users occasionally */}
                        {occupant.seatNumber % 4 === 1 && (
                          <span className="absolute -bottom-1 -right-1 text-xs select-none">🍿</span>
                        )}
                      </motion.div>
                    ) : (
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl relative bg-red-950/20 border border-red-900/30 hover:border-red-500/40 hover:bg-red-900/20 flex flex-col items-center justify-center transition-all duration-300 z-10">
                        {/* Styled Seat Backrest */}
                        <div className="w-5 h-5 rounded bg-red-900/30 border border-red-900/40 mb-0.5 group-hover:bg-red-500/30 group-hover:border-red-500/40 transition-colors"></div>
                        {/* Seat Cushion Armrests styling */}
                        <div className="w-7 h-1.5 rounded-sm bg-red-900/40 border border-red-900/50 group-hover:bg-red-500/40 group-hover:border-red-500/50 transition-colors flex justify-between gap-3">
                          <div className="w-1 h-2 bg-red-950/80 rounded-full"></div>
                          <div className="w-1 h-2 bg-red-950/80 rounded-full"></div>
                        </div>
                      </div>
                    )}

                    {/* Seat code label subscript */}
                    <span className="text-[8px] font-mono font-medium text-neutral-600 mt-1">
                      S{seatIndex}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Immersive Cinema Screen Arch at bottom or top of rows.
          Let's place the Screen projection board at the BOTTOM showing the perspective looking down, of the majestic screen! */}
      <div className="w-full max-w-lg mt-8 flex flex-col items-center justify-center gap-1.5 z-20">
        <div className="w-full h-1 rounded-full bg-gradient-to-r from-neutral-800 via-gold/30 to-neutral-800 blur-[2px]"></div>
        <span className="font-serif text-[10px] text-gray-500 font-bold uppercase tracking-widest text-center">
          Main Hall Silver Screen Reflection
        </span>
      </div>
    </div>
  );
}
export default CinemaSeats;
