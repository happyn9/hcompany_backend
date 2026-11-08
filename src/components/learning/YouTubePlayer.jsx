import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

// Lecteur YouTube (youtube-nocookie) piloté par l'API IFrame : on sait ainsi
// quand la vidéo se termine (passage à la suite), et où la personne en est
// (reprise). Si le script YouTube est bloqué, on retombe sur un iframe simple.
let apiPromise;
function loadApi() {
  if (typeof window === "undefined") return Promise.reject();
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.onerror = () => {
        apiPromise = null;
        reject(new Error("yt-blocked"));
      };
      document.head.appendChild(s);
      setTimeout(() => !window.YT?.Player && reject(new Error("yt-timeout")), 8000);
    });
  }
  return apiPromise;
}

export default function YouTubePlayer({ videoId, startAt = 0, onEnded, onProgress, labels }) {
  const host = useRef(null);
  const player = useRef(null);
  const cb = useRef({ onEnded, onProgress });
  cb.current = { onEnded, onProgress };
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    setFallback(false);
    let cancelled = false;
    let timer;
    loadApi()
      .then((YT) => {
        if (cancelled || !host.current) return;
        const el = document.createElement("div");
        host.current.innerHTML = "";
        host.current.appendChild(el);
        player.current = new YT.Player(el, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, start: Math.floor(startAt) || 0 },
          events: {
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.ENDED) cb.current.onEnded?.();
            },
            onError: () => setFallback(true),
          },
        });
        timer = setInterval(() => {
          const p = player.current;
          if (p?.getPlayerState?.() === 1) cb.current.onProgress?.(Math.floor(p.getCurrentTime()), Math.floor(p.getDuration() || 0));
        }, 5000);
      })
      .catch(() => !cancelled && setFallback(true));
    return () => {
      cancelled = true;
      clearInterval(timer);
      try {
        player.current?.destroy?.();
      } catch {
        // déjà détruit
      }
      player.current = null;
    };
    // startAt n'est lu qu'au changement de vidéo : volontaire
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-[0_30px_60px_-30px_rgba(30,26,23,0.6)]">
      {fallback ? (
        <>
          <iframe
            title="YouTube"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
          {labels?.openYoutube && (
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noreferrer"
              className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 text-white text-xs px-3 py-1.5"
            >
              <ExternalLink size={12} />
              {labels.openYoutube}
            </a>
          )}
        </>
      ) : (
        <div ref={host} className="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full" />
      )}
    </div>
  );
}
