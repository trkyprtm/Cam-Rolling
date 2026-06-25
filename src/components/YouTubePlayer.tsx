import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RefreshCw, Volume2, VolumeX, Maximize2, Minimize2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { RoomState } from "../types";

interface YouTubePlayerProps {
  roomState: RoomState;
  memberId: string;
  onPostAction: (actionType: "play" | "pause" | "seek", time: number) => void;
  isLoggedIn?: boolean;
  onRequireLogin?: () => void;
}

// Global script loader for YouTube Iframe API
let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  const win = window as any;
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      if (win.YT && win.YT.Player) {
        resolve();
        return;
      }
      // Register global callback
      const previousCallback = win.onYouTubeIframeAPIReady;
      win.onYouTubeIframeAPIReady = () => {
        if (previousCallback) previousCallback();
        resolve();
      };

      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    });
  }
  return ytApiPromise;
}

export function YouTubePlayer({ roomState, memberId, onPostAction, isLoggedIn = false, onRequireLogin }: YouTubePlayerProps) {
  const win = window as any;
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const isSyncingRef = useRef<boolean>(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(50);
  const [theaterMode, setTheaterMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Unsigned-in warning overlays
  const [showLoginWarning, setShowLoginWarning] = useState(false);
  const warningTimeoutRef = useRef<any>(null);

  const triggerLoginWarning = () => {
    setShowLoginWarning(true);
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    warningTimeoutRef.current = setTimeout(() => {
      setShowLoginWarning(false);
    }, 4000);

    if (onRequireLogin) {
      onRequireLogin();
    }
  };

  // Cleanup warning timer
  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, []);

  // Handle native full-screen state change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerWrapperRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!playerWrapperRef.current) return;
    if (!document.fullscreenElement) {
      playerWrapperRef.current.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable full-screen mode:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Auto-hide controls and initial thumbnail poster states
  const [showControls, setShowControls] = useState(true);
  const [hasPlayed, setHasPlayed] = useState(false);
  const controlsTimeoutRef = useRef<any>(null);

  const triggerControlsShow = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 5000);
  };

  // Reset controls timer on mount and clean up
  useEffect(() => {
    triggerControlsShow();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Update hasPlayed state whenever the room starts playing
  useEffect(() => {
    if (roomState.isPlaying) {
      setHasPlayed(true);
      triggerControlsShow();
    }
  }, [roomState.isPlaying]);

  // Helper to extract clean ID from YouTube URLs
  const getYouTubeId = (url: string): string => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : "ScMzIvxBSi4";
  };

  const videoId = getYouTubeId(roomState.videoUrl);

  // Initialize player once the target element is loaded in DOM and YT script is ready
  useEffect(() => {
    let active = true;
    let localPlayer: any = null;

    loadYouTubeApi().then(() => {
      if (!active) return;

      // Clean up previous iframe container if exists
      const oldElement = document.getElementById("yt-player-iframe");
      if (oldElement) {
        oldElement.innerHTML = "";
      }

      const playerDiv = document.createElement("div");
      playerDiv.id = "yt-player-target";
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(playerDiv);
      }

      localPlayer = new win.YT.Player("yt-player-target", {
        height: "100%",
        width: "100%",
        videoId: videoId,
        playerVars: {
          controls: 0, // Disable native player controls to enforce co-watch sync UI!
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            if (!active) return;
            playerRef.current = event.target;
            setPlayerReady(true);
            setDuration(event.target.getDuration() || 0);

            // Apply initial sync values
            isSyncingRef.current = true;
            event.target.seekTo(roomState.playbackTime, true);
            if (roomState.isPlaying) {
              event.target.playVideo();
            } else {
              event.target.pauseVideo();
            }
            setTimeout(() => {
              isSyncingRef.current = false;
            }, 800);
          },
          onStateChange: (event: any) => {
            if (!active || !playerRef.current) return;

            const state = event.data;
            const currentYTTime = playerRef.current.getCurrentTime() || 0;

            // If this change is triggered programmatically by incoming SSE, suppress sending anything back to server!
            if (isSyncingRef.current) return;

            // YT States: 1 = PLAYING, 2 = PAUSED
            if (state === win.YT.PlayerState.PLAYING) {
              // Local user pressed play button
              if (!roomState.isPlaying) {
                onPostAction("play", currentYTTime);
              }
            } else if (state === win.YT.PlayerState.PAUSED) {
              // Local user pressed pause button
              if (roomState.isPlaying) {
                onPostAction("pause", currentYTTime);
              }
            }
          },
        },
      });
    });

    return () => {
      active = false;
      if (localPlayer && typeof localPlayer.destroy === "function") {
        try {
          localPlayer.destroy();
        } catch (e) {
          console.warn("Error destroying YTPlayer: ", e);
        }
      }
    };
  }, [videoId]);

  // Reset thumbnail view if the video URL changes
  useEffect(() => {
    setHasPlayed(false);
  }, [videoId]);

  // Sync state FROM server (SSE updates)
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;

    // Suppress loops during command dispatching
    isSyncingRef.current = true;

    try {
      // 1. Handle Play / Pause sync
      const isPlayerPlaying = playerRef.current.getPlayerState() === win.YT.PlayerState.PLAYING;
      if (roomState.isPlaying && !isPlayerPlaying) {
        playerRef.current.playVideo();
      } else if (!roomState.isPlaying && isPlayerPlaying) {
        playerRef.current.pauseVideo();
      }

      // 2. Handle Timeline synchronization
      const currentYTTime = playerRef.current.getCurrentTime() || 0;
      const timeDiff = Math.abs(currentYTTime - roomState.playbackTime);

      // Seek if difference exceeds 2.5 seconds (allow slight network lag adjustments)
      if (timeDiff > 2.5) {
        playerRef.current.seekTo(roomState.playbackTime, true);
      }
    } catch (e) {
      console.warn("Sync seek/play error: ", e);
    }

    const timer = setTimeout(() => {
      isSyncingRef.current = false;
    }, 500);

    return () => clearTimeout(timer);
  }, [roomState.isPlaying, roomState.playbackTime, roomState.lastActionTime, playerReady]);

  // Local clock loop to update timeline scrubber
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;

    const interval = setInterval(() => {
      try {
        const time = playerRef.current.getCurrentTime() || 0;
        setCurrentTime(time);
        const actualDur = playerRef.current.getDuration() || 0;
        if (actualDur > 0 && duration !== actualDur) {
          setDuration(actualDur);
        }
      } catch (e) {}
    }, 500);

    return () => clearInterval(interval);
  }, [playerReady, duration]);

  // Controller Handlers
  const handlePlayPause = () => {
    if (!isLoggedIn) {
      triggerLoginWarning();
      return;
    }
    if (!playerReady || !playerRef.current) return;
    const isPlaying = playerRef.current.getPlayerState() === win.YT.PlayerState.PLAYING;
    const currentYTTime = playerRef.current.getCurrentTime() || 0;

    if (isPlaying) {
      playerRef.current.pauseVideo();
      onPostAction("pause", currentYTTime);
    } else {
      playerRef.current.playVideo();
      onPostAction("play", currentYTTime);
    }
  };

  const handleScrub = (value: number) => {
    if (!isLoggedIn) {
      triggerLoginWarning();
      return;
    }
    if (!playerReady || !playerRef.current) return;
    isSyncingRef.current = true;
    playerRef.current.seekTo(value, true);
    setCurrentTime(value);
    onPostAction("seek", value);
    setTimeout(() => {
      isSyncingRef.current = false;
    }, 500);
  };

  const toggleMute = () => {
    if (!playerReady || !playerRef.current) return;
    if (isMuted) {
      playerRef.current.unMute();
      playerRef.current.setVolume(volume);
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (vol: number) => {
    if (!playerReady || !playerRef.current) return;
    setVolume(vol);
    playerRef.current.setVolume(vol);
    if (vol > 0 && isMuted) {
      playerRef.current.unMute();
      setIsMuted(false);
    }
  };

  // Helper to format playback seconds to hh:mm:ss
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const mStr = m < 10 && h > 0 ? `0${m}` : `${m}`;
    const sStr = s < 10 ? `0${s}` : `${s}`;
    return h > 0 ? `${h}:${mStr}:${sStr}` : `${mStr}:${sStr}`;
  };

  return (
    <div 
      ref={playerWrapperRef}
      onMouseMove={triggerControlsShow}
      onMouseEnter={triggerControlsShow}
      onTouchStart={triggerControlsShow}
      onMouseLeave={() => setShowControls(false)}
      className={`relative group bg-black shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/5 transition-all duration-300 ${
        isFullscreen ? "w-screen h-screen rounded-none" : "w-full aspect-video rounded-2xl"
      }`}
    >
      {/* Absolute Glow Layer behind screen */}
      <div className="absolute inset-0 bg-radial-gradient from-gold/15 to-transparent pointer-events-none mix-blend-color-dodge opacity-70 blur-3xl scale-110 z-0"></div>

      {/* The Actual Player Iframe */}
      <div ref={containerRef} className="w-full h-full pointer-events-none z-10 select-none">
        <div id="yt-player-target" />
      </div>

      {/* High Quality Video Poster Thumbnail (Seen before playing) */}
      {!hasPlayed && playerReady && (
        <div className="absolute inset-0 z-15 pointer-events-none transition-opacity duration-500">
          <img
            src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            }}
            alt="Video Poster Thumbnail"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          {/* Dark cinematic filter with a centered gold play button */}
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div 
              onClick={(e) => {
                e.stopPropagation();
                if (!isLoggedIn) {
                  triggerLoginWarning();
                  return;
                }
                handlePlayPause();
                triggerControlsShow();
              }}
              className="p-5 bg-gold hover:bg-gold-hover text-white rounded-full shadow-[0_0_30px_rgba(197,160,89,0.5)] transform hover:scale-110 active:scale-95 transition-all pointer-events-auto cursor-pointer flex items-center justify-center"
            >
              <Play className="w-8 h-8 fill-white translate-x-0.5 text-white" />
            </div>
          </div>
        </div>
      )}

      {/* Guard overlay to lock click-stealing inside iframe and let us click for custom UI pause/play */}
      <div 
        onClick={(e) => {
          if (!isLoggedIn) {
            triggerLoginWarning();
            return;
          }
          handlePlayPause();
          triggerControlsShow();
        }}
        className="absolute inset-x-0 top-0 bottom-16 z-20 cursor-pointer"
      >
        {/* Loading / Ready state Overlay */}
        {!playerReady && (
          <div className="absolute inset-0 bg-neutral-900 flex flex-col items-center justify-center gap-4 text-white z-30">
            <RefreshCw className="w-8 h-8 animate-spin text-gold" />
            <p className="font-mono text-sm tracking-wider text-neutral-400">Dimming theater lights...</p>
          </div>
        )}
      </div>

      {/* Sign-in required Warning Toast Banner overlay */}
      <AnimatePresence>
        {showLoginWarning && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/95 border border-gold/40 text-white rounded-xl py-3 px-5 shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center gap-3 font-mono text-xs max-w-sm text-center"
          >
            <div className="w-2.5 h-2.5 bg-gold rounded-full animate-ping shrink-0" />
            <span>Sign In Required! Please login or register to control & play the cinema.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Synced Media Controller Controls Bar */}
      <div 
        className={`absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-neutral-950 via-neutral-950/90 to-transparent px-4 flex flex-col justify-end pb-3 gap-2 z-30 select-none transition-all duration-300 ${
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        }`}
      >
        
        {/* Playback Progress Slider */}
        <div className="flex items-center gap-2 w-full group/scrub">
          <span className="font-mono text-xs text-neutral-400">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => handleScrub(Number(e.target.value))}
            className="flex-1 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-gold hover:h-1.5 transition-all outline-none"
          />
          <span className="font-mono text-xs text-neutral-400">{formatTime(duration)}</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            {/* Play/Pause Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePlayPause();
                triggerControlsShow();
              }}
              disabled={!playerReady}
              className="p-1.5 bg-gold text-white rounded-full hover:bg-gold-hover active:scale-95 transition-all text-sm cursor-pointer disabled:opacity-50"
            >
              {roomState.isPlaying ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 fill-white" />
              )}
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-2 group/volume">
              <button 
                onClick={toggleMute} 
                className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-16 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-gold group-hover/volume:w-24 transition-all duration-300 outline-none"
              />
            </div>

            {/* Sync Alert Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-mono text-[10px] text-emerald-400 font-medium tracking-wide">SYNC STATUS: LIVE</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Displaying Current Speaker / Modifier */}
            {roomState.lastAction !== "initial" && (
              <span className="text-[10px] text-neutral-400 italic hidden md:inline">
                Last modified by client
              </span>
            )}

            {/* Watch in Full Screen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 text-neutral-400 hover:text-gold hover:bg-white/5 active:scale-95 transition-all text-sm cursor-pointer rounded-xl flex items-center justify-center gap-1"
              title={isFullscreen ? "Exit Fullscreen" : "Watch on Full Screen"}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-gold" />
              ) : (
                <Maximize2 className="w-4 h-4 hover:scale-110 transition-transform" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default YouTubePlayer;
