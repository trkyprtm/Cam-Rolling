import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { RoomState, Member, Message } from "./src/types";
import { WebSocketServer, WebSocket } from "ws";
import Razorpay from "razorpay";
import crypto from "crypto";

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy initialized Razorpay client
let razorpayInstance: any = null;
function getRazorpay() {
  if (!razorpayInstance) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (keyId && keySecret) {
      razorpayInstance = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
    }
  }
  return razorpayInstance;
}

// In-memory store for theater rooms
const rooms: Record<string, RoomState> = {};

// SSE connections registry: roomId -> Array of Response objects
const listeners: Record<string, express.Response[]> = {};

// Helper to broadcast room state update to all SSE listeners in a room
function broadcastRoomUpdate(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  const roomListeners = listeners[roomId] || [];
  const payload = JSON.stringify(room);

  // Filter out closed connections
  listeners[roomId] = roomListeners.filter((res) => {
    try {
      res.write(`data: ${payload}\n\n`);
      return true;
    } catch (err) {
      console.log(`Failed to write to SSE client in room ${roomId}. Client disconnected.`);
      return false;
    }
  });
}

// Inactive member cleanup task running every 5 seconds
setInterval(() => {
  const now = Date.now();
  let updatedAny = false;

  Object.keys(rooms).forEach((roomId) => {
    const room = rooms[roomId];
    let roomUpdated = false;

    room.members = room.members.map((member) => {
      // If active and silent for more than 20 seconds, mark as inactive
      if (member.active && now - member.lastHeartbeat > 20000) {
        member.active = false;
        roomUpdated = true;

        // Add a system event to the chat
        const systemMsg: Message = {
          id: `sys-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          memberId: "system",
          memberName: "System",
          memberAvatar: "",
          text: `${member.name} stepped out of the hall.`,
          timestamp: now,
          type: "system",
        };
        room.messages.push(systemMsg);
        // Keep messages bounded to last 100 entries
        if (room.messages.length > 100) room.messages.shift();
      }
      return member;
    });

    if (roomUpdated) {
      updatedAny = true;
      broadcastRoomUpdate(roomId);
    }
  });
}, 5000);

// Resolve YouTube video title via open oEmbed API
async function fetchYouTubeTitle(videoUrl: string): Promise<string> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
    );
    if (response.ok) {
      const data = await response.json();
      return data.title || "Shared Cinema Video";
    }
  } catch (error) {
    console.warn("Could not fetch YouTube oembed title:", error);
  }
  return "Shared Cinema Video";
}

// Fetch rich YouTube metadata including channel & estimated length
async function fetchYouTubeMetadata(videoUrl: string) {
  const defaultRes = {
    title: "Shared Cinema Video",
    channelName: "YouTube Creator",
    thumbnail: "",
    duration: "0:00",
    videoId: "ScMzIvxBSi4"
  };

  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = videoUrl.match(regExp);
  const videoId = match && match[2].length === 11 ? match[2] : "ScMzIvxBSi4";
  defaultRes.videoId = videoId;
  defaultRes.thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const response = await fetch(oembedUrl);
    if (response.ok) {
      const data = await response.json();
      defaultRes.title = data.title || defaultRes.title;
      defaultRes.channelName = data.author_name || defaultRes.channelName;
    }
  } catch (err) {
    console.warn("oEmbed fetch failed", err);
  }

  // Fetch YouTube watch page directly parsing approxDurationMs to load exact video duration
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const watchRes = await fetch(watchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });
    if (watchRes.ok) {
      const html = await watchRes.text();
      const durMatch = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/);
      if (durMatch && durMatch[1]) {
        const ms = parseInt(durMatch[1], 10);
        const totalSecs = Math.floor(ms / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        defaultRes.duration = `${mins}:${secs.toString().padStart(2, '0')}`;
      } else {
        const lenMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
        if (lenMatch && lenMatch[1]) {
          const totalSecs = parseInt(lenMatch[1], 10);
          const mins = Math.floor(totalSecs / 60);
          const secs = totalSecs % 60;
          defaultRes.duration = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
      }
    }
  } catch (err) {
    console.warn("Watch page parsing for duration failed", err);
  }

  return defaultRes;
}

// --- API ROUTES ---

// Automatic YouTube preview info resolver
app.get("/api/youtube-preview", async (req, res) => {
  const url = req.query.url as string;
  if (!url) {
    return res.status(400).json({ error: "Missing url parameter" });
  }
  try {
    const meta = await fetchYouTubeMetadata(url);
    return res.json(meta);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch metadata" });
  }
});

// Create a new master Room
app.post("/api/rooms", async (req, res) => {
  const { videoUrl, hostName, avatarSeed, subscription } = req.body;

  const cleanUrl = videoUrl && videoUrl.trim() !== "" ? videoUrl.trim() : "https://www.youtube.com/watch?v=ScMzIvxBSi4"; // Default ambient synth movie
  const host = hostName && hostName.trim() !== "" ? hostName.trim() : "Host";
  const seed = avatarSeed || Math.random().toString(36).substring(3, 8);

  const videoTitle = await fetchYouTubeTitle(cleanUrl);

  // Generate 5-character friendly Room ID (e.g. CIN-3F)
  const code = Math.random().toString(36).substr(2, 5).toUpperCase();
  const roomId = `CIN-${code}`;

  const now = Date.now();
  const roomsCount = Object.keys(rooms).length;

  // Prevent memory exhaustion: if server has > 1000 rooms, purge old ones
  if (roomsCount > 1000) {
    const sorted = Object.entries(rooms).sort((a, b) => a[1].lastActionTime - b[1].lastActionTime);
    for (let i = 0; i < 200; i++) {
      const idToPurge = sorted[i][0];
      delete rooms[idToPurge];
      delete listeners[idToPurge];
    }
  }

  // Set default subscription
  const initialSubscription = subscription || {
    active: false,
    participantLimit: 1, // Default limit is 1 (free solo tier)
    planName: "Free Solo Trial",
    priceINR: 0
  };

  const newRoom: RoomState = {
    id: roomId,
    videoUrl: cleanUrl,
    videoTitle,
    videoDuration: 0,
    isPlaying: false,
    playbackTime: 0,
    lastUpdatedBy: "system",
    lastAction: "initial",
    lastActionTime: now,
    members: [
      {
        id: "host-id", // Temporary, will be reassigned upon actual user join
        name: host,
        avatarSeed: seed,
        seatNumber: 1, // Host sits in central seat row 1 (seats 1-12)
        active: true,
        lastHeartbeat: now,
      }
    ],
    messages: [
      {
        id: `sys-${now}`,
        memberId: "system",
        memberName: "System",
        memberAvatar: "",
        text: `Cinema Hall ${roomId} successfully prepared. Grab your popcorn! 🍿`,
        timestamp: now,
        type: "system",
      },
    ],
    subscription: initialSubscription,
  };

  rooms[roomId] = newRoom;
  res.json({ roomId });
});

// Join an existing Room
app.post("/api/rooms/:id/join", (req, res) => {
  const { id } = req.params;
  const { name, avatarSeed } = req.body;

  const room = rooms[id];
  if (!room) {
    return res.status(404).json({ error: "Cinema Hall not found or has closed." });
  }

  const cleanName = name && name.trim() !== "" ? name.trim() : `Viewer-${Math.floor(100 + Math.random() * 900)}`;
  const seed = avatarSeed || Math.random().toString(36).substring(2, 6);
  const now = Date.now();

  // Create unique member ID
  const memberId = `mem-${Math.random().toString(36).substr(2, 9)}`;

  // Determine if this is the Host placeholder remapping
  const isFirstHostJoin = room.members.length === 1 && room.members[0].id === "host-id";

  // Check subscription capacity limit (except for host remapping)
  if (!isFirstHostJoin) {
    const activeParticipants = room.members.filter(m => m.active && m.id !== "host-id");
    const limit = room.subscription?.participantLimit || 1;
    if (activeParticipants.length >= limit) {
      return res.status(403).json({
        error: `Subscription Limit Reached: This Cinema Hall is currently on the '${room.subscription?.planName || "Free Solo Trial"}' plan, which only supports up to ${limit} participant(s). Please ask the host to upgrade their subscription.`,
        limit,
        planName: room.subscription?.planName || "Free Solo Trial",
        priceINR: room.subscription?.priceINR || 0
      });
    }
  }

  // Find a free seat in the rows (Seats 1 up to subscription limit)
  const limit = room.subscription?.participantLimit || 1;
  const occupiedSeats = room.members.filter(m => m.active).map(m => m.seatNumber);
  let assignedSeat = 1;
  for (let seatNum = 1; seatNum <= limit; seatNum++) {
    if (!occupiedSeats.includes(seatNum)) {
      assignedSeat = seatNum;
      break;
    }
  }

  // Add the member
  const newMember: Member = {
    id: memberId,
    name: cleanName,
    avatarSeed: seed,
    seatNumber: assignedSeat,
    active: true,
    lastHeartbeat: now,
  };

  // Re-map host if the temporary placeholder host needs assigning
  if (isFirstHostJoin) {
    newMember.seatNumber = limit >= 10 ? 10 : Math.max(1, Math.floor((limit + 1) / 2));
    room.members = [newMember];
  } else {
    room.members.push(newMember);
  }

  // Push join announcement to system chat log
  const systemMsg: Message = {
    id: `sys-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    memberId: "system",
    memberName: "System",
    memberAvatar: "",
    text: `${cleanName} purchased a ticket and entered Seat ${assignedSeat} 🎟️`,
    timestamp: now,
    type: "system",
  };
  room.messages.push(systemMsg);
  if (room.messages.length > 100) room.messages.shift();

  broadcastRoomUpdate(id);

  res.json({ memberId, seatNumber: assignedSeat });
});

// Get Razorpay Configuration Details (Checking keys and returning Key ID safely)
app.get("/api/payments/config", (req, res) => {
  const isProd = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  res.json({
    isProduction: isProd,
    keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_MOCK_KEY_ID"
  });
});

// Create a Razorpay Order
app.post("/api/payments/create-order", async (req, res) => {
  const { amount, roomId, limit } = req.body;
  if (!amount || isNaN(amount)) {
    return res.status(400).json({ error: "Invalid payment amount specified." });
  }

  const rzp = getRazorpay();
  const amtInPaise = Math.round(Number(amount) * 100);

  if (!rzp) {
    // Sandbox / Development mock mode
    const mockOrderId = `order_mock_${Math.random().toString(36).substring(2, 10)}`;
    return res.json({
      orderId: mockOrderId,
      amount: amtInPaise,
      currency: "INR",
      isMock: true
    });
  }

  try {
    const order = await rzp.orders.create({
      amount: amtInPaise,
      currency: "INR",
      receipt: `rcpt_${roomId || "global"}_${Date.now()}`,
      notes: {
        roomId: roomId || "",
        limit: String(limit || 2)
      }
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      isMock: false
    });
  } catch (err: any) {
    console.error("Razorpay Order Creation Failed:", err);
    res.status(500).json({ error: err.message || "Failed to initiate Razorpay order." });
  }
});

// Verify signature & unlock subscription service
app.post("/api/payments/verify-payment", (req, res) => {
  const {
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
    roomId,
    participantLimit,
    planName,
    priceINR,
    cardName
  } = req.body;

  const room = rooms[roomId];
  if (!room) {
    return res.status(404).json({ error: "Cinema Hall not found." });
  }

  const rzp = getRazorpay();
  const isMockOrder = razorpay_order_id && razorpay_order_id.startsWith("order_mock_");

  if (!rzp || isMockOrder) {
    // Complete verification in sandbox/mock mode
    const now = Date.now();
    const invoiceId = `INV-MOCK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    room.subscription = {
      active: true,
      participantLimit: Number(participantLimit),
      planName: planName || `${participantLimit}-Watcher Plan`,
      priceINR: Number(priceINR),
      paymentDate: now,
      invoiceId
    };

    room.messages.push({
      id: `sys-${now}-${Math.random().toString(36).substr(2, 4)}`,
      memberId: "system",
      memberName: "System",
      memberAvatar: "",
      text: `👑 Subscription upgraded to "${room.subscription.planName}" (${room.subscription.participantLimit} Seats) paid via Simulator-Scan by ${cardName || "Host"}! 🎟️`,
      timestamp: now,
      type: "system"
    });

    if (room.messages.length > 100) room.messages.shift();
    broadcastRoomUpdate(roomId);

    return res.json({ success: true, subscription: room.subscription });
  }

  // Real Production Signature Verification
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed. Signature is invalid!" });
    }

    const now = Date.now();
    const invoiceId = `INV-${razorpay_payment_id.toUpperCase().substring(4, 10)}`;

    room.subscription = {
      active: true,
      participantLimit: Number(participantLimit),
      planName: planName || `${participantLimit}-Watcher Plan`,
      priceINR: Number(priceINR),
      paymentDate: now,
      invoiceId
    };

    room.messages.push({
      id: `sys-${now}-${Math.random().toString(36).substr(2, 4)}`,
      memberId: "system",
      memberName: "System",
      memberAvatar: "",
      text: `👑 Subscription upgraded to "${room.subscription.planName}" (${room.subscription.participantLimit} Seats) paid via Razorpay by ${cardName || "Host"}! (Ref: ${razorpay_payment_id}) 🎟️`,
      timestamp: now,
      type: "system"
    });

    if (room.messages.length > 100) room.messages.shift();
    broadcastRoomUpdate(roomId);

    return res.json({ success: true, subscription: room.subscription });
  } catch (err: any) {
    console.error("Signature Verification Error:", err);
    res.status(500).json({ error: "Failed to process payment confirmation." });
  }
});

// Update Room Subscription Tier
app.post("/api/rooms/:id/subscribe", (req, res) => {
  const { id } = req.params;
  const { participantLimit, planName, priceINR, cardName } = req.body;

  const room = rooms[id];
  if (!room) {
    return res.status(404).json({ error: "Cinema Hall not found." });
  }

  const now = Date.now();
  const invoiceId = `INV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  room.subscription = {
    active: true,
    participantLimit: Number(participantLimit),
    planName: planName || `${participantLimit}-Watcher Plan`,
    priceINR: Number(priceINR),
    paymentDate: now,
    invoiceId
  };

  // Push announcement to room chats
  room.messages.push({
    id: `sys-${now}-${Math.random().toString(36).substr(2, 4)}`,
    memberId: "system",
    memberName: "System",
    memberAvatar: "",
    text: `👑 Subscription upgraded to "${room.subscription.planName}" (${room.subscription.participantLimit} Seats limit) paid by ${cardName || "Host"} for ${room.subscription.priceINR} INR! Real-time co-watching limit successfully expanded! 🎟️`,
    timestamp: now,
    type: "system"
  });

  if (room.messages.length > 100) room.messages.shift();

  broadcastRoomUpdate(id);

  res.json({ success: true, subscription: room.subscription });
});

// Post transactional action (play, pause, seek, change-video, system operations)
app.post("/api/rooms/:id/action", async (req, res) => {
  const { id } = req.params;
  const { type, memberId, time, url, text, emoji } = req.body;

  const room = rooms[id];
  if (!room) {
    return res.status(404).json({ error: "Cinema Hall not found." });
  }

  const now = Date.now();
  const caller = room.members.find((m) => m.id === memberId);

  // Perform heartbeat update for the caller
  if (caller) {
    caller.lastHeartbeat = now;
    if (!caller.active) {
      caller.active = true;
      // Add a rejoin announcement
      room.messages.push({
        id: `sys-${now}`,
        memberId: "system",
        memberName: "System",
        memberAvatar: "",
        text: `${caller.name} returned to their seat.`,
        timestamp: now,
        type: "system"
      });
      if (room.messages.length > 100) room.messages.shift();
    }
  }

  let stateUpdated = false;

  switch (type) {
    case "play":
      room.isPlaying = true;
      if (typeof time === "number") room.playbackTime = time;
      room.lastUpdatedBy = memberId || "unknown";
      room.lastAction = "play";
      room.lastActionTime = now;
      stateUpdated = true;
      break;

    case "pause":
      room.isPlaying = false;
      if (typeof time === "number") room.playbackTime = time;
      room.lastUpdatedBy = memberId || "unknown";
      room.lastAction = "pause";
      room.lastActionTime = now;
      stateUpdated = true;
      break;

    case "seek":
      if (typeof time === "number") room.playbackTime = time;
      room.lastUpdatedBy = memberId || "unknown";
      room.lastAction = "seek";
      room.lastActionTime = now;
      stateUpdated = true;
      break;

    case "change-video":
      if (url && url.trim() !== "") {
        const cleanUrl = url.trim();
        room.videoUrl = cleanUrl;
        room.isPlaying = false;
        room.playbackTime = 0;
        room.lastUpdatedBy = memberId || "unknown";
        room.lastAction = "change-video";
        room.lastActionTime = now;
        // Fetch oEmbed title asynchronously to avoid blocking response
        const newTitle = await fetchYouTubeTitle(cleanUrl);
        room.videoTitle = newTitle;

        // Push announcement
        room.messages.push({
          id: `sys-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          memberId: "system",
          memberName: "System",
          memberAvatar: "",
          text: `${caller?.name || "Someone"} changed the cinema feed to: "${newTitle}" 🎬`,
          timestamp: now,
          type: "system",
        });
        if (room.messages.length > 100) room.messages.shift();
        stateUpdated = true;
      }
      break;

    case "chat":
      if (text && text.trim() !== "") {
        const newMessage: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          memberId: memberId || "unknown",
          memberName: caller?.name || "Viewer",
          memberAvatar: caller?.avatarSeed || "1",
          text: text.trim(),
          timestamp: now,
          type: "chat",
        };
        room.messages.push(newMessage);
        if (room.messages.length > 100) room.messages.shift();
        room.lastActionTime = now;
        stateUpdated = true;
      }
      break;

    case "reaction":
      if (emoji) {
        const newReaction: Message = {
          id: `react-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          memberId: memberId || "unknown",
          memberName: caller?.name || "Viewer",
          memberAvatar: caller?.avatarSeed || "1",
          text: `${caller?.name || "Viewer"} reacted with ${emoji}`,
          timestamp: now,
          type: "reaction",
          reactionEmoji: emoji,
        };
        room.messages.push(newReaction);
        if (room.messages.length > 100) room.messages.shift();
        room.lastActionTime = now;
        stateUpdated = true;
      }
      break;

    case "heartbeat":
      // Caller' heartbeat is already updated. Just return success.
      stateUpdated = false;
      break;
  }

  if (stateUpdated) {
    broadcastRoomUpdate(id);
  }

  res.json({ success: true, roomState: room });
});

// Real-time Event Stream (SSE endpoint)
app.get("/api/rooms/:id/stream", (req, res) => {
  const { id } = req.params;
  const room = rooms[id];

  if (!room) {
    return res.status(404).json({ error: "Cinema Hall not found." });
  }

  // Standard server-sent events headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Insert client into listener pool
  if (!listeners[id]) {
    listeners[id] = [];
  }
  listeners[id].push(res);

  // Immediately send current state as first payload
  res.write(`data: ${JSON.stringify(room)}\n\n`);

  // Client connection teardown handling
  req.on("close", () => {
    listeners[id] = (listeners[id] || []).filter((r) => r !== res);
  });
});

// Full-stack Vite & static asset serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Cinema Hall Node Server listening and routing live on port ${PORT}`);
  });

  // Instantiate WebSocket server piggybacking on HTTP
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: any) => {
    ws.on("message", (message: string) => {
      try {
        const payload = JSON.parse(message);
        switch (payload.type) {
          case "join":
            ws.roomId = payload.roomId;
            ws.memberId = payload.memberId;
            console.log(`Live audio socket joined for Room ${payload.roomId}, member ${payload.memberId}`);
            break;

          case "voice-state": {
            const { roomId, memberId, isMuted, isSpeaking } = payload;
            const room = rooms[roomId];
            if (room) {
              const member = room.members.find(m => m.id === memberId);
              if (member) {
                if (typeof isMuted === "boolean") member.isMuted = isMuted;
                if (typeof isSpeaking === "boolean") member.isSpeaking = isSpeaking;
                broadcastRoomUpdate(roomId);
              }
            }
            break;
          }

          case "audio": {
            const { roomId, memberId } = ws;
            if (roomId && memberId) {
              const dataStr = payload.data;
              wss.clients.forEach((client: any) => {
                if (
                  client !== ws &&
                  client.readyState === WebSocket.OPEN &&
                  client.roomId === roomId &&
                  client.memberId !== memberId
                ) {
                  client.send(JSON.stringify({
                    type: "audio",
                    memberId,
                    data: dataStr
                  }));
                }
              });
            }
            break;
          }
        }
      } catch (err) {
        console.error("Websocket server message processing error:", err);
      }
    });

    ws.on("close", () => {
      // Upon disconnect, mark member as not speaking if desired
      const { roomId, memberId } = ws;
      if (roomId && memberId) {
        const room = rooms[roomId];
        if (room) {
          const member = room.members.find(m => m.id === memberId);
          if (member) {
            member.isSpeaking = false;
            broadcastRoomUpdate(roomId);
          }
        }
      }
    });
  });
}

startServer();
