/**
 * Shared types for the Digital Cinema Hall application.
 */

export interface Member {
  id: string;
  name: string;
  avatarSeed: string; // Used to generate a fun, consistent SVG mini-avatar
  seatNumber: number;  // 1-indexed seat inside the theater row layout
  active: boolean;
  lastHeartbeat: number;
  isMuted?: boolean;
  isSpeaking?: boolean;
}

export interface Message {
  id: string;
  memberId: string;
  memberName: string;
  memberAvatar: string;
  text: string;
  timestamp: number;
  type: 'chat' | 'reaction' | 'system';
  reactionEmoji?: string; // e.g. "🍿", "😂", "😮"
}

export interface Subscription {
  active: boolean;
  participantLimit: number; // e.g. 1 (Free), 2, 3, 4, 5, etc.
  planName: string;        // e.g. "Free Tier", "Duet", "Trio", "Quartet", "Party Pack"
  priceINR: number;        // Price based on formula: (10 * participants) + 9 INR, except 1-person free
  paymentDate?: number;    // timestamp
  invoiceId?: string;      // generated unique ID
}

export interface RoomState {
  id: string;
  videoUrl: string;
  videoTitle: string;
  videoDuration: number;
  isPlaying: boolean;
  playbackTime: number; // in seconds
  lastUpdatedBy: string; // memberId
  lastAction: 'play' | 'pause' | 'seek' | 'change-video' | 'initial';
  lastActionTime: number; // Server timestamp
  members: Member[];
  messages: Message[];
  subscription: Subscription;
}

export interface ActionResult {
  success: boolean;
  roomState: RoomState;
}
