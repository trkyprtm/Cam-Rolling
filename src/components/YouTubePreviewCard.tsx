import { useEffect, useState } from "react";
import { Youtube, User, Clock, AlertCircle, Film, PlayCircle } from "lucide-react";

interface YouTubePreviewCardProps {
  url: string;
}

interface YouTubeMetadata {
  title: string;
  channelName: string;
  thumbnail: string;
  duration: string;
  videoId: string;
}

export function YouTubePreviewCard({ url }: YouTubePreviewCardProps) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<YouTubeMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to extract ID from YouTube URLs
  const getYouTubeId = (urlStr: string): string | null => {
    if (!urlStr || urlStr.trim() === "") return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = urlStr.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  useEffect(() => {
    const extractedId = getYouTubeId(url);
    setVideoId(extractedId);

    if (!extractedId) {
      setMetadata(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    // Fetch rich metadata from our custom preview endpoint
    fetch(`/api/youtube-preview?url=${encodeURIComponent(url)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load metadata");
        return res.json();
      })
      .then((data: YouTubeMetadata) => {
        setMetadata(data);
      })
      .catch((err) => {
        console.error("Error fetching preview metadata:", err);
        // Fallback metadata so the preview still works even if offline or server fails
        setMetadata({
          title: "YouTube Synchronized Video",
          channelName: "YouTube Creator",
          thumbnail: `https://img.youtube.com/vi/${extractedId}/mqdefault.jpg`,
          duration: "Live / Estimate",
          videoId: extractedId
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [url]);

  if (!videoId) return null;

  return (
    <div className="mt-4 p-5 rounded-2xl bg-[#09090b] border border-[#C5A059]/25 shadow-2xl relative overflow-hidden transition-all duration-300">
      <div className="absolute top-0 right-0 p-2 bg-[#C5A059]/10 text-[#C5A059] rounded-bl-xl font-mono text-[9px] uppercase tracking-wider font-semibold border-l border-b border-[#C5A059]/20">
        AUTO LIVE PREVIEW
      </div>

      <div className="flex flex-col gap-4">
        {/* Top Header info (Extracts video ID) */}
        <div className="flex items-center gap-2 pb-2.5 border-b border-white/5">
          <Youtube className="w-4 h-4 text-red-500 animate-pulse" />
          <span className="font-mono text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            Parsed Video ID: <span className="text-[#C5A059]">{videoId}</span>
          </span>
        </div>

        {/* Dynamic Display Layout */}
        <div className="flex flex-col lg:flex-row gap-5">
          
          {/* Official Embedded YouTube Player Preview block */}
          <div className="w-full lg:w-1/2 aspect-video rounded-xl overflow-hidden bg-black border border-white/10 shadow-lg relative group">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=0&mute=1&controls=1&rel=0`}
              title="YouTube Preview Player"
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>

          {/* Details Block (Thumbnail, Title, Channel Name, Duration) */}
          <div className="flex-1 flex flex-col justify-between gap-3 text-left">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#C5A059] font-semibold">
                STAGE DETAILS REVELATION
              </span>
              
              {loading ? (
                <div className="space-y-2 py-2">
                  <div className="h-4 bg-white/5 rounded w-3/4 animate-pulse"></div>
                  <div className="h-3 bg-white/5 rounded w-1/2 animate-pulse"></div>
                  <div className="h-3 bg-white/5 rounded w-1/3 animate-pulse"></div>
                </div>
              ) : (
                <>
                  <h4 className="font-serif italic text-lg text-white leading-tight font-medium">
                    {metadata?.title}
                  </h4>
                  
                  <div className="flex flex-col gap-1.5 mt-2 text-neutral-400 text-xs">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-neutral-500" />
                      <span className="font-medium text-white">{metadata?.channelName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Duration: <span className="font-mono text-gray-200">{metadata?.duration || "N/A"}</span></span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Thumbnail Preview strip */}
            {metadata?.thumbnail && !loading && (
              <div className="flex gap-3 items-center p-2 rounded-xl bg-white/5 border border-white/5">
                <div className="w-14 h-9 rounded overflow-hidden flex-shrink-0 bg-neutral-900 border border-white/10">
                  <img 
                    referrerPolicy="no-referrer"
                    src={metadata.thumbnail} 
                    alt="Preview Thumbnail" 
                    className="w-full h-full object-cover scale-105"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-[#C5A059] font-mono uppercase tracking-widest font-bold">
                    HQ Thumbnail Loaded
                  </span>
                  <span className="text-[10px] text-neutral-400 truncate max-w-[180px]">
                    {metadata.thumbnail.replace("https://img.youtube.com/vi/", "vi/")}
                  </span>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
