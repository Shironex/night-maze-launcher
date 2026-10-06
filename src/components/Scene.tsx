// The placeholder night scene: a corridor of the maze, lit by the flashlight,
// with three crystals, the moon and stars. Drawn in SVG from the colour tokens,
// so it needs no image file. Generated art replaces it later.

/** Gradients shared by the scene and the highlight card. Rendered once. */
export function SceneDefs() {
  return (
    <svg className="defs" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="g-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="st-sky-a" />
          <stop offset="0.6" className="st-sky-b" />
        </linearGradient>
        <linearGradient id="g-wall-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.25" className="st-stone" />
          <stop offset="1" className="st-stone-lit" />
        </linearGradient>
        <linearGradient id="g-wall-r" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" className="st-stone" />
          <stop offset="1" className="st-stone-lit" />
        </linearGradient>
        <linearGradient id="g-floor" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" className="st-floor" />
          <stop offset="1" className="st-floor-lit" />
        </linearGradient>
        <linearGradient id="g-cone" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" className="st-warm-0" />
          <stop offset="1" className="st-warm-soft" />
        </linearGradient>
        <radialGradient id="g-warm">
          <stop offset="0" className="st-warm" />
          <stop offset="1" className="st-warm-0" />
        </radialGradient>
        <radialGradient id="g-warm-soft">
          <stop offset="0" className="st-warm-soft" />
          <stop offset="1" className="st-warm-0" />
        </radialGradient>
        <radialGradient id="g-cry">
          <stop offset="0" className="st-cry" />
          <stop offset="1" className="st-cry-0" />
        </radialGradient>
        <radialGradient id="g-moon">
          <stop offset="0" className="st-moon" />
          <stop offset="1" className="st-moon-0" />
        </radialGradient>
        <linearGradient id="g-left" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="st-night" />
          <stop offset="0.36" className="st-night-mid" />
          <stop offset="0.64" className="st-night-0" />
        </linearGradient>
        <linearGradient id="g-bottom" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" className="st-night-mid" />
          <stop offset="0.32" className="st-night-0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** The full window background. It covers the window and crops from the centre. */
export function Scene() {
  return (
    <svg
      className="scene"
      viewBox="0 0 1280 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="1280" height="800" fill="url(#g-sky)" />
      <circle className="sky-star" cx="300" cy="20" r="1.8" opacity="0.55" />
      <circle className="sky-star" cx="380" cy="60" r="1.2" opacity="0.9" />
      <circle className="sky-star" cx="455" cy="28" r="1.2" opacity="0.9" />
      <circle className="sky-star" cx="520" cy="110" r="1.2" opacity="0.55" />
      <circle className="sky-star" cx="560" cy="60" r="1.8" opacity="0.9" />
      <circle className="sky-star" cx="610" cy="180" r="1.2" opacity="0.9" />
      <circle className="sky-star" cx="640" cy="90" r="1.2" opacity="0.55" />
      <circle className="sky-star" cx="690" cy="230" r="1.2" opacity="0.9" />
      <circle className="sky-star" cx="720" cy="140" r="1.8" opacity="0.9" />
      <circle className="sky-star" cx="760" cy="60" r="1.2" opacity="0.55" />
      <circle className="sky-star" cx="800" cy="200" r="1.2" opacity="0.9" />
      <circle className="sky-star" cx="830" cy="110" r="1.2" opacity="0.9" />
      <circle className="sky-star" cx="880" cy="40" r="1.8" opacity="0.55" />
      <circle className="sky-star" cx="900" cy="260" r="1.2" opacity="0.9" />
      <circle className="sky-star" cx="930" cy="160" r="1.2" opacity="0.9" />
      <circle className="sky-star" cx="1060" cy="180" r="1.2" opacity="0.55" />
      <circle className="sky-star" cx="1100" cy="90" r="1.8" opacity="0.9" />
      <circle className="sky-star" cx="1150" cy="120" r="1.2" opacity="0.9" />
      <circle className="sky-star" cx="1190" cy="62" r="1.2" opacity="0.55" />
      <circle className="sky-star" cx="980" cy="250" r="1.2" opacity="0.9" />
      <circle className="sky-star" cx="700" cy="30" r="1.8" opacity="0.9" />
      <circle className="sky-star" cx="850" cy="290" r="1.2" opacity="0.55" />
      <circle className="sky-star" cx="790" cy="300" r="1.2" opacity="0.9" />
      <circle cx="1010" cy="140" r="95" fill="url(#g-moon)" />
      <circle className="moon" cx="1010" cy="140" r="30" />
      <circle className="moon-cut" cx="1024" cy="130" r="27" />
      <path d="M266 800L760 500h200l320 260v40z" fill="url(#g-floor)" />
      <path
        className="joint"
        d="M420 800L860 430M640 800L860 430M860 800V430M1080 800L860 430M1280 790L860 430M0 524h1280M0 556h1280M0 604h1280M0 676h1280"
      />
      <path d="M690 800L810 500h100l120 300z" fill="url(#g-cone)" />
      <ellipse cx="860" cy="585" rx="250" ry="92" fill="url(#g-warm)" />
      <path d="M0 -176L760 340v160L0 961z" fill="url(#g-wall-l)" />
      <path d="M1280 60L960 340v160l320 260z" fill="url(#g-wall-r)" />
      <path
        className="joint"
        d="M0 108L760 380M0 392L760 420M0 677L760 460M120 -94V889M330 48V761M500 164V658M620 245V585M700 300V536"
      />
      <path
        className="joint"
        d="M1280 235L960 380M1280 410L960 420M1280 585L960 460M1210 121V703M1110 209V622M1030 279V557M985 318V520"
      />
      <rect className="end" x="760" y="340" width="200" height="160" />
      <path
        className="joint"
        d="M760 380h200M760 420h200M760 460h200M810 340v40M910 340v40M785 380v40M935 380v40"
      />
      <rect className="door" x="828" y="392" width="64" height="108" />
      <circle cx="860" cy="430" r="130" fill="url(#g-warm-soft)" />
      <circle className="glow" cx="860" cy="468" r="40" fill="url(#g-cry)" />
      <path className="gem" d="M860 452l8 12-8 19-8-19z" />
      <path className="gem-line" d="M852 464h16" />
      <circle className="glow" cx="742" cy="528" r="30" fill="url(#g-cry)" />
      <path className="gem" d="M742 516l6 9-6 14-6-14z" />
      <path className="gem-line" d="M736 525h12" />
      <circle className="glow" cx="1088" cy="632" r="95" fill="url(#g-cry)" />
      <path className="gem" d="M1088 594l19 30-19 45-19-45z" />
      <path className="gem-line" d="M1069 624h38" />
      <rect className="fog" x="0" y="470" width="1280" height="90" />
      <rect width="1280" height="800" fill="url(#g-left)" />
      <rect width="1280" height="800" fill="url(#g-bottom)" />
    </svg>
  );
}
