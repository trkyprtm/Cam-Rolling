import React, { useState, useRef, useEffect } from "react";
import { Send, Users, MessageSquare, Flame } from "lucide-react";
import { RoomState, Message } from "../types";
import { Avatar } from "./CinemaSeats";

interface ChatSidebarProps {
  roomState: RoomState;
  memberId: string;
  onPostTextMessage: (text: string) => void;
  onPostReaction: (emoji: string) => void;
}

const QUICK_EMOJIS = [
  { emoji: "🍿", label: "Popcorn" },
  { emoji: "😂", label: "Laugh" },
  { emoji: "😮", label: "Gasp" },
  { emoji: "👏", label: "Clap" },
  { emoji: "❤️", label: "Love" },
  { emoji: "🔥", label: "Fire" },
];

export function ChatSidebar({ roomState, memberId, onPostTextMessage, onPostReaction }: ChatSidebarProps) {
  const [inputText, setInputText] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "spectators">("chat");
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat log to bottom when message content expands
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [roomState.messages, activeTab]);

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() === "") return;
    onPostTextMessage(inputText);
    setInputText("");
  };

  const activeMembersOnly = roomState.members.filter((m) => m.active);

  return (
    <div className="w-full lg:w-96 bg-neutral-950/20 border border-white/5 rounded-3xl flex flex-col h-[550px] lg:h-full relative overflow-hidden select-none shadow-2xl">
      {/* Sidebar Tabs */}
      <div className="flex border-b border-white/5 bg-neutral-900/40">
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-1 py-4 text-center text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all ${
            activeTab === "chat"
              ? "text-gold border-b-2 border-gold bg-neutral-950/10"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Cinema Chat ({roomState.messages.filter(m => m.type === 'chat').length})
        </button>
        <button
          onClick={() => setActiveTab("spectators")}
          className={`flex-1 py-4 text-center text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all ${
            activeTab === "spectators"
              ? "text-gold border-b-2 border-gold bg-neutral-950/10"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Live Seats ({activeMembersOnly.length})
        </button>
      </div>

      {activeTab === "chat" ? (
        <>
          {/* Chat log channel */}
          <div 
            ref={listRef}
            className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-none"
          >
            {roomState.messages.map((msg) => {
              const isSystem = msg.type === "system";
              const isReaction = msg.type === "reaction";
              const isMe = msg.memberId === memberId;

              if (isSystem) {
                return (
                  <div key={msg.id} className="text-center py-1.5 px-3 bg-white/[0.02] border border-white/5 rounded-xl border-dashed">
                    <p className="font-mono text-[10px] text-neutral-400 italic font-medium leading-relaxed leading-3">
                      {msg.text}
                    </p>
                  </div>
                );
              }

              if (isReaction) {
                return (
                  <div key={msg.id} className="flex items-center gap-2 text-center text-[10px] text-gold font-mono opacity-85 self-center bg-gold/10 px-2.5 py-1 rounded-full border border-gold/15">
                    <span className="text-sm">{msg.reactionEmoji}</span>
                    <span className="font-semibold text-gold">{msg.memberName}</span> 
                    <span className="text-neutral-400">reacted</span>
                  </div>
                );
              }

              return (
                <div 
                  key={msg.id} 
                  className={`flex items-start gap-2.5 max-w-[85%] ${
                    isMe ? "self-end flex-row-reverse" : "self-start"
                  }`}
                >
                  {/* Small Avatar icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    <Avatar seed={msg.memberAvatar} size={28} showGlasses={false} />
                  </div>

                  <div className="flex flex-col gap-0.5">
                    {/* Timestamp & Name */}
                    <span className={`text-[10px] font-mono text-neutral-400 ${isMe ? "text-right" : ""}`}>
                      {msg.memberName}
                    </span>

                    {/* Chat Bubble box */}
                    <div className={`p-3 rounded-2xl text-xs font-sans shadow-lg leading-relaxed ${
                      isMe 
                        ? "bg-gold text-white font-semibold rounded-tr-none" 
                        : "bg-[#0a0a0a]/90 text-white rounded-tl-none border border-white/5"
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Reaction Panel */}
          <div className="px-4 py-2 border-t border-white/5 bg-neutral-900/15">
            <p className="text-[10px] font-mono uppercase text-neutral-500 font-semibold tracking-wider mb-2 text-center">
              Tap Row Reaction
            </p>
            <div className="flex items-center justify-between gap-1.5">
              {QUICK_EMOJIS.map((item) => (
                <button
                  key={item.emoji}
                  title={item.label}
                  onClick={() => onPostReaction(item.emoji)}
                  className="flex-1 py-2 text-lg rounded-xl bg-neutral-900/50 hover:bg-neutral-800 border border-white/5 hover:border-gold/30 active:scale-90 transition-all cursor-pointer flex items-center justify-center"
                >
                  {item.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Input text form */}
          <form 
            onSubmit={handleSendText}
            className="p-4 border-t border-white/5 flex gap-2 bg-neutral-900/30"
          >
            <input
              type="text"
              placeholder="Whisper during movie..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-4 py-3 rounded-xl bg-neutral-900 border border-white/5 text-xs text-white focus:outline-none focus:border-gold/50 transition-colors placeholder:text-neutral-500"
            />
            <button
              type="submit"
              className="p-3 bg-gold text-white rounded-xl hover:bg-gold-hover transition-colors cursor-pointer flex items-center justify-center active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </>
      ) : (
        /* Spectators listing view */
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
          <p className="font-mono text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">
            Active Watchers ({activeMembersOnly.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {activeMembersOnly.map((occupant) => {
              const isLocalMe = occupant.id === memberId;
              return (
                <div 
                  key={occupant.id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-neutral-900/60 border border-white/5 shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <Avatar seed={occupant.avatarSeed} size={32} showGlasses={true} />
                    <div className="flex flex-col">
                      <span className="text-xs text-white font-medium">
                        {occupant.name} {isLocalMe && " (You)"}
                      </span>
                      <span className="text-[9px] font-mono text-neutral-400">
                        Seat: ROW {Math.ceil(occupant.seatNumber / 6)}-S{occupant.seatNumber}
                      </span>
                    </div>
                  </div>

                  <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/10">
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                    ACTIVE
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
export default ChatSidebar;
