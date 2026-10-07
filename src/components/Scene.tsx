// The window background: a loop recorded from the game itself, the high glide
// over the maze (tools/record_launcher_loop.py writes both files), under a dark
// scrim that keeps the text readable. The gradients below are what is left of
// the drawn scene: the highlight card still paints with them.

import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import loop from '../assets/menu-loop.mp4';
import poster from '../assets/menu-poster.jpg';

/** Gradients of the highlight card. Rendered once. */
export function SceneDefs() {
  return (
    <svg className="defs" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="g-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="st-sky-a" />
          <stop offset="0.6" className="st-sky-b" />
        </linearGradient>
        <linearGradient id="g-wall-r" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" className="st-stone" />
          <stop offset="1" className="st-stone-lit" />
        </linearGradient>
        <linearGradient id="g-floor" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" className="st-floor" />
          <stop offset="1" className="st-floor-lit" />
        </linearGradient>
        <radialGradient id="g-warm">
          <stop offset="0" className="st-warm" />
          <stop offset="1" className="st-warm-0" />
        </radialGradient>
        <radialGradient id="g-cry">
          <stop offset="0" className="st-cry" />
          <stop offset="1" className="st-cry-0" />
        </radialGradient>
        <linearGradient id="g-left" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="st-night" />
          <stop offset="0.36" className="st-night-mid" />
          <stop offset="0.64" className="st-night-0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * The full window background. The poster is the first frame of the loop: it is
 * there at once, and it stays when the video cannot play or motion is unwanted.
 */
export function Scene() {
  const video = useRef<HTMLVideoElement>(null);

  // Played from here and not by `autoplay`, so one place decides: no motion for
  // someone who asked for less of it, and no decoding while the window is
  // minimised or hidden.
  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    // WebView2 keeps reporting a minimised window as visible (seen on Windows
    // 11: `document.hidden` stays false), so the window's own move event is
    // read too: Windows parks a minimised window at -32000, -32000.
    let minimised = false;
    const sync = () => {
      const element = video.current;
      if (!element) return;
      if (minimised || document.hidden || still.matches) element.pause();
      // A refused play leaves the poster, which is the fallback anyway.
      else element.play().catch(() => {});
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    still.addEventListener('change', sync);
    // Outside the launcher (the page in a browser) there is nothing to listen to.
    const unlisten = listen<{ x: number }>('tauri://move', event => {
      minimised = event.payload.x === -32000;
      sync();
    }).catch(() => undefined);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      still.removeEventListener('change', sync);
      void unlisten.then(off => off?.());
    };
  }, []);

  return (
    <div className="scene" aria-hidden="true">
      {/* preload="none": with reduced motion the 2 MB file is never read. */}
      <video
        ref={video}
        src={loop}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        tabIndex={-1}
        disablePictureInPicture
      />
    </div>
  );
}
