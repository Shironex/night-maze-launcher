// The release notes the previews show: the `updates` of the news.json that the game
// published with release v0.10.0 (ten releases, 0.0.0 to 0.10.0, there is no 0.2.0), copied
// as they are. Empty tags and summaries are empty in the published file too. `news` and
// `notices` are empty there as well.
//
// Development only, like preview.ts, which is the one file that imports it. Nothing is
// fetched when the page runs.
//
// To refresh it after a new game release, download the published file and copy its
// `updates` over the ones below, then run `pnpm format`:
//
//   gh release download <tag> -R Shironex/night-maze -p news.json

import type { NewsFeed } from '../bindings';

export const FEED: NewsFeed = {
  schema: 1,
  updates: [
    {
      version: '0.10.0',
      date: '2026-10-07',
      tag: '',
      title: 'The maze is no longer silent: the first sounds.',
      summary: '',
      highlight: true,
      groups: [
        {
          title: "What's new",
          items: [
            'The flashlight clicks when you switch it on and off with F.',
            'When the battery is empty the switch only gives a dull click, and you hear the same click at the moment the light dies.',
            'A low battery now warns you with a slow pulse, like a heartbeat. It gets faster as the battery runs down, and it stops when a crystal charges the battery again.',
            'Picking up a crystal chimes.',
            'A lever clunks when you pull it, and the gate grinds open when you have collected enough crystals.',
            'A volume slider on the settings screen, from 0 to 100. It is saved with your other settings, and a short click lets you hear the level while you move it.',
          ],
        },
      ],
    },
    {
      version: '0.9.0',
      date: '2026-10-06',
      tag: '',
      title: 'The game gets a front door: menus, difficulty levels and settings.',
      summary: '',
      highlight: false,
      groups: [
        {
          title: "What's new",
          items: [
            'The game now starts in a main menu with Play, Settings and Quit. Move with the arrow keys or Tab and choose with Enter.',
            'Behind the main menu a short video of the maze loops. If the video cannot play, a still picture of the same scene is shown instead.',
            'Three difficulty levels, Easy, Normal and Hard, chosen in the main menu. A higher level gives you a bigger maze, more crystals to find and a shorter flashlight battery. Easy is the game as it was before.',
            'You can type a seed in the main menu, or press New seed for another one. The same seed and difficulty always give the same maze.',
            'Press Escape while you play to pause. From the pause screen you can resume, restart the maze, open the settings or go back to the menu.',
            'The round now ends with a screen that shows your time, your crystals, the difficulty and the seed. From there you can play the same maze again, start a new maze or go back to the menu.',
            'A settings screen with mouse sensitivity, field of view, fullscreen and window size. Your choices are saved to a file and are still there the next time you start the game.',
            'The round pauses by itself when the window loses focus.',
            'The panels that show information about the game are now one window, with search and pinning.',
          ],
        },
      ],
    },
    {
      version: '0.8.0',
      date: '2026-10-06',
      tag: '',
      title: 'Levers, notes and a sky you can see in the water.',
      summary: '',
      highlight: false,
      groups: [
        {
          title: "What's new",
          items: [
            'Crystals and puddles now mirror the night sky, so the maze shimmers a little.',
            'Some walls carry a lever. Look at it and press E (or click) to pull it, and a shortcut wall sinks into the ground.',
            'Some walls carry a note. Press E to read it: it points you towards the exit, towards the nearest crystal, or just says something.',
            'A small prompt at the bottom of the screen tells you when you are looking at something you can use.',
            'Press E or click again to close a note. Walking away from it closes it too.',
          ],
        },
      ],
    },
    {
      version: '0.7.0',
      date: '2026-10-06',
      tag: '',
      title: 'The night gets moody: shadows, glow, fog and a map.',
      summary: '',
      highlight: false,
      groups: [
        {
          title: "What's new",
          items: [
            'The moon casts shadows across the maze, and so does your flashlight.',
            'The brightest things, like the crystals, glow softly.',
            'A low mist hangs over the ground and the edges of the screen darken a little.',
            'The flashlight is now held in your hand, a bit to the right and below your eyes, so shadows fall in a natural way.',
            'A small map of the maze sits in the bottom right corner. It only shows the corridors you have already seen, and it is switched on and off with M.',
          ],
        },
      ],
    },
    {
      version: '0.6.0',
      date: '2026-10-05',
      tag: '',
      title: 'A real night sky and uneven ground.',
      summary: '',
      highlight: false,
      groups: [
        {
          title: "What's new",
          items: [
            'A starry night sky now surrounds the maze.',
            'The ground is no longer flat: it rises and falls, and the maze, the crystals and you stand on it.',
            'Grass grows along the bottom of the walls.',
          ],
        },
      ],
    },
    {
      version: '0.5.0',
      date: '2026-10-05',
      tag: '',
      title: 'Now it is a game: collect crystals and escape.',
      summary: '',
      highlight: false,
      groups: [
        {
          title: "What's new",
          items: [
            'Glowing crystals are hidden in the maze. Walk into one to pick it up.',
            'Your flashlight battery drains while the flashlight is on, and it flickers when it runs low. Every crystal charges it back a little.',
            'Collect enough crystals and the gate to the exit sinks into the ground. Then find the exit, which is in the corner farthest from where you start.',
            'The screen shows your crystals, the battery and the time. When you escape you see your time.',
            'Press F to switch the flashlight on and off, and R to start again.',
          ],
        },
      ],
    },
    {
      version: '0.4.0',
      date: '2026-10-05',
      tag: '',
      title: 'The maze is lit by the moon and your flashlight.',
      summary: '',
      highlight: false,
      groups: [
        {
          title: "What's new",
          items: [
            'The maze is dark, lit by the moon and by a flashlight you carry. Press F to switch it on and off.',
            'Stone walls now show bumps and cracks when the light hits them from the side.',
            'Flashlight and moonlight are both easy to tell apart: the flashlight makes a bright round spot, the moon gives a soft blue wash.',
          ],
        },
      ],
    },
    {
      version: '0.3.0',
      date: '2026-10-05',
      tag: '',
      title: 'A maze to walk through.',
      summary: '',
      highlight: false,
      groups: [
        {
          title: "What's new",
          items: [
            'A stone maze with walls, pillars and a floor, built by the game itself.',
            'You walk inside it on foot with W, A, S and D, look around with the mouse and cannot walk through walls. You slide along them instead.',
            'Click in the window to grab the mouse, press Escape to give it back, and press Escape again to quit.',
            'Press N to fly through the walls and look at the maze from outside. Space goes up and Left Shift goes down.',
            'The panels that show information about the game now use a dark theme, and the key left of 1 hides them.',
          ],
        },
      ],
    },
    {
      version: '0.1.0',
      date: '2026-10-05',
      tag: '',
      title: 'First flight: a cube in the dark.',
      summary: '',
      highlight: false,
      groups: [
        {
          title: "What's new",
          items: [
            'A cube floats in the window, and you fly around it. Click to grab the mouse, look with the mouse and move with W, A, S and D.',
            'Space moves you up and Left Shift moves you down.',
            'Escape gives the mouse back.',
          ],
        },
      ],
    },
    {
      version: '0.0.0',
      date: '2026-10-04',
      tag: '',
      title: 'The very first start: an empty window.',
      summary: '',
      highlight: false,
      groups: [
        {
          title: "What's new",
          items: [
            'The game opens a window and shows a plain coloured background.',
            'A small panel shows the frame rate and information about your graphics card.',
            'Escape closes the window.',
          ],
        },
      ],
    },
  ],
  news: [],
  notices: [],
};
