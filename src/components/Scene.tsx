// The window background: a loop recorded from the game itself, the high glide
// over the maze (tools/record_launcher_loop.py writes both files). It runs
// clear above the ledger: the only scrims are a short one along the top, under
// the caption and the window buttons, and one that meets the book.

import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import loop from '../assets/menu-loop.mp4';
import poster from '../assets/menu-poster.jpg';

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
