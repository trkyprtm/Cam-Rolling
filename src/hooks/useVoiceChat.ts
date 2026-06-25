import { useEffect, useRef, useState } from "react";

interface UseVoiceChatProps {
  roomId: string | null;
  memberId: string | null;
}

export function useVoiceChat({ roomId, memberId }: UseVoiceChatProps) {
  const [isMuted, setIsMuted] = useState(true); // Default to muted for safety against instant audio loops
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Helper to convert blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64 = base64String.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Play audio chunk received from server
  const playAudioChunk = (base64Data: string) => {
    if (!base64Data) return;
    try {
      const binaryStr = window.atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/webm" });
      const blobUrl = URL.createObjectURL(blob);
      const audio = new Audio(blobUrl);
      audio.play().catch((err) => {
        // Safe play failure catch for autoplay policies
        console.debug("Autoplay audio blocked or pending user engagement:", err);
      });
    } catch (error) {
      console.warn("Could not play audio chunk:", error);
    }
  };

  // Set up WebSocket and audio capturing loop
  useEffect(() => {
    if (!roomId || !memberId) return;

    // 1. Establish WebSocket
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsVoiceConnected(true);
      setError(null);
      
      // Notify join and initial state
      ws.send(JSON.stringify({ type: "join", roomId, memberId }));
      ws.send(JSON.stringify({
        type: "voice-state",
        roomId,
        memberId,
        isMuted,
        isSpeaking: false
      }));
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "audio") {
          playAudioChunk(payload.data);
        }
      } catch (err) {
        console.error("Error processing voice message:", err);
      }
    };

    ws.onclose = () => {
      setIsVoiceConnected(false);
    };

    ws.onerror = () => {
      setError("WebSocket connection failed.");
      setIsVoiceConnected(false);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [roomId, memberId]);

  // Handle active audio recording and precise Voice Activity Detection
  useEffect(() => {
    if (!isVoiceConnected || !roomId || !memberId) return;

    let isStopped = false;

    const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (isStopped) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        // Toggle capture track state based on mute
        stream.getAudioTracks().forEach(track => {
          track.enabled = !isMuted;
        });

        // Setup MediaRecorder
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = async (e) => {
          if (isStopped) return;
          if (e.data && e.data.size > 0 && !isMuted && wsRef.current?.readyState === WebSocket.OPEN) {
            try {
              const base64 = await blobToBase64(e.data);
              wsRef.current.send(JSON.stringify({ type: "audio", data: base64 }));
            } catch (error) {
              console.warn("Chunk conversion error:", error);
            }
          }
        };

        // Stream audio in short sequential slices (250ms)
        mediaRecorder.start(250);

        // Web Audio API for actual Voice Activity Detection (VAD)
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let lastSpeakingState = false;

        const checkVolumeActivity = () => {
          if (isStopped) return;
          if (!streamRef.current || !streamRef.current.active) return;

          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const averageVolume = sum / bufferLength;
          const isSpeakingNow = averageVolume > 8 && !isMuted; // Threshold > 8 is general vocal noise

          if (isSpeakingNow !== lastSpeakingState) {
            lastSpeakingState = isSpeakingNow;
            // Broadcast live voice-state to server
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: "voice-state",
                roomId,
                memberId,
                isMuted,
                isSpeaking: isSpeakingNow
              }));
            }
          }

          animationFrameRef.current = requestAnimationFrame(checkVolumeActivity);
        };

        checkVolumeActivity();

      } catch (err) {
        console.warn("Could not capture audio stream:", err);
        setError("Microphone disabled. To join discussion, please enable browser microphone permissions.");
      }
    };

    startRecording();

    return () => {
      isStopped = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [isVoiceConnected, isMuted, roomId, memberId]);

  // Mute toggle handler
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    // Ensure audio tracks are enabled/disabled immediately
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
    }

    // Instantly notify websocket of new mute configuration
    if (wsRef.current?.readyState === WebSocket.OPEN && roomId && memberId) {
      wsRef.current.send(JSON.stringify({
        type: "voice-state",
        roomId,
        memberId,
        isMuted: nextMuted,
        isSpeaking: false // Reset speaking instantly on mute
      }));
    }
  };

  return {
    isMuted,
    isVoiceConnected,
    error,
    toggleMute
  };
}
