// Night Maze Launcher: README and hero images, captured with @noctcore/showcase-kit.
//
// Regenerate everything with `pnpm showcase`. It needs Node, pnpm and the Chromium that
// `pnpm exec playwright install chromium` downloads once. Nothing in it is specific to one
// system, but it has only been run on Windows 11 so far.
//
// What it captures: the launcher window as a web page. The kit starts `pnpm dev` (Vite on port
// 15190, the port `pnpm tauri dev` uses too; a server that already answers there is reused) and
// opens the built-in preview states of src/dev/preview.ts at the real window size, 1280 x 800.
// No Rust build, no installer, no network. The release notes in the previews are copied from the
// news.json that the game published (all ten releases, 0.0.0 to 0.10.0). No real path or account is on
// screen: the install folder in the previews is an invented one.
//
// What it freezes:
// - The background video. The kit asks for reduced motion, and Scene.tsx then keeps the video
//   paused on its poster (src/assets/menu-poster.jpg). The helper below checks, before every
//   shot, that the video is paused and that the poster is decoded.
// - Transitions and animations (the kit does it), fonts (every face is loaded and awaited), the
//   mouse (parked in the corner), requests (anything outside the dev server is aborted).
// - The user agent, so the window buttons at the top right look the same on every OS:
//   TitleBar.tsx hides them when the user agent says macOS.
// - There is no clock to freeze: every date on screen is a fixed string in the preview data.
//
// Refresh the data: when the game publishes a release, update src/dev/preview-feed.ts from the
// news.json of that release (the header of that file says how).
//
// Outputs: showcase-out/raw/<id>.png (raw captures, not committed), assets/showcase/<id>.webp and
// assets/showcase/hero.webp (committed, linked from README.md).
import { defineConfig } from '@noctcore/showcase-kit';

const PORT = 15190;
const ORIGIN = `http://localhost:${PORT}`;

const WINDOWS_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// Crystal teal (--color-crystal-deep) into the deep night navy (--color-deep) of src/styles.css.
const BACKGROUND = { type: 'gradient', from: '#12444c', to: '#090d1a', angle: 135 };

/**
 * Open a preview state and wait until it is really on screen, then run `open` (a click that opens
 * a dialog) and park the mouse where it leaves no hover state. `pill` is the text the version
 * pill shows once the state has been applied: before that the window says "starting".
 */
function view(state, pill, open) {
  return async page => {
    await page.goto(`${ORIGIN}/?preview=${state}`, { waitUntil: 'load' });
    await page.locator('.pill', { hasText: pill }).first().waitFor({ state: 'visible' });
    await page.evaluate(async () => {
      await Promise.all([...document.fonts].map(face => face.load()));
      const video = document.querySelector('.scene video');
      if (!video?.paused) throw new Error('The background video is playing: no still picture.');
      const poster = new Image();
      poster.src = video.poster;
      await poster.decode();
    });
    if (open) await open(page);
    await page.mouse.move(0, 0);
  };
}

export default defineConfig({
  name: 'Night Maze Launcher',
  slug: 'night-maze-launcher',
  target: {
    mode: 'url',
    url: ORIGIN,
    start: 'pnpm dev',
    readyTimeoutMs: 120000,
  },
  ready: '#root > *',
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  // The window is English only, so the output paths need no {lang} token.
  langs: ['en'],
  css: ':focus-visible { outline: none !important; }',
  setup: async ({ context }) => {
    await context.addInitScript(userAgent => {
      Object.defineProperty(navigator, 'userAgent', { get: () => userAgent });
    }, WINDOWS_USER_AGENT);
    await context.route(
      url => !url.href.startsWith(ORIGIN) && !url.href.startsWith('data:'),
      route => route.abort()
    );
  },
  shots: [
    {
      id: 'first-start',
      title: 'First start',
      caption: 'Nothing is installed yet: one button downloads the newest game.',
      nav: view('first-run', 'not installed'),
      waitFor: '.cta',
    },
    {
      id: 'ready',
      title: 'Ready',
      caption: 'The game is installed and up to date, with its release notes beside it.',
      nav: view('ready', 'up to date'),
      waitFor: '.rel',
    },
    {
      id: 'update',
      title: 'Update',
      caption: 'A newer game version is found: update, or start the one you have.',
      nav: view('update', 'update available'),
      waitFor: '.sbtn',
    },
    {
      id: 'installing',
      title: 'Installing',
      caption: 'The download is checked and unpacked in steps.',
      nav: view('installing', 'installing v0.10.0'),
      waitFor: '.steps',
    },
    {
      id: 'changelog',
      title: 'Release notes',
      caption: 'Every release of the game, with what changed in it.',
      nav: view('ready', 'up to date', page =>
        page.getByRole('button', { name: 'Release notes', exact: true }).click()
      ),
      waitFor: '[role="dialog"][aria-label="Changelog"] .cl-g',
    },
    {
      id: 'settings',
      title: 'Settings',
      caption: 'Where the game lives, and whether to look for updates on start.',
      nav: view('ready', 'up to date', page =>
        page.getByRole('button', { name: 'Settings', exact: true }).click()
      ),
      waitFor: '[role="dialog"][aria-label="Settings"] .m-rows',
    },
    {
      id: 'about',
      title: 'About',
      caption: 'The launcher finds its own update and shows its notes under Settings, About.',
      nav: view('launcher-newer', 'up to date', async page => {
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByRole('tab', { name: 'About', exact: true }).click();
      }),
      waitFor: '[role="dialog"][aria-label="Settings"] .m-rows .notes',
    },
    {
      id: 'offline',
      title: 'Offline',
      caption: 'Without a network the installed game still starts.',
      nav: view('offline', 'offline'),
      waitFor: '.notice',
    },
  ],
  frame: {
    // The launcher draws its own window buttons, so no second window frame around it.
    style: 'none',
    theme: 'dark',
    background: BACKGROUND,
    padding: 72,
    radius: 14,
    shadow: true,
    maxWidth: 1800,
  },
  hero: {
    layout: 'stack',
    tagline: 'Installs Night Maze, keeps it up to date and starts it.',
    logo: 'src-tauri/icons/icon.png',
    shots: ['changelog', 'update', 'ready'],
    background: BACKGROUND,
    theme: 'dark',
  },
  outputs: {
    raw: 'showcase-out/raw/{id}.png',
    readme: 'assets/showcase/{id}.webp',
  },
});
