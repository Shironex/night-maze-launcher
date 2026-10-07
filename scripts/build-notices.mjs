// Assembles THIRD-PARTY-NOTICES.txt for the game package from the licence files
// of the libraries that are linked into night_maze.
//
//   node launcher/scripts/build-notices.mjs --deps build/release/_deps [--out THIRD-PARTY-NOTICES.txt]
//
// The licence texts are copied from the downloaded sources, never typed by
// hand. Run it again after a dependency version changes in
// cmake/Dependencies.cmake and commit the result. doctest is left out: it is
// only linked into the test program, which is not shipped.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const deps = argument('deps');
if (!deps) {
  console.error('usage: build-notices.mjs --deps <build dir>/_deps [--out <file>]');
  process.exit(2);
}
const out = resolve(argument('out', join(repoRoot, 'THIRD-PARTY-NOTICES.txt')));

/** The version a dependency is pinned to, read from cmake/Dependencies.cmake. */
function pinnedTag(repository) {
  const cmake = readFileSync(join(repoRoot, 'cmake', 'Dependencies.cmake'), 'utf8');
  const start = cmake.indexOf(repository);
  if (start === -1) return 'unknown version';
  const match = /GIT_TAG\s+(\S+)/.exec(cmake.slice(start));
  return match ? match[1] : 'unknown version';
}

/** The first comment block of a C header, where generated files keep their licence. */
function leadingComment(file) {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf('/*');
  const end = text.indexOf('*/', start);
  return start === -1 || end === -1 ? '' : text.slice(start, end + 2);
}

function read(file, encoding = 'utf8') {
  if (!existsSync(file)) {
    console.error(`missing licence file: ${file}`);
    process.exit(1);
  }
  return readFileSync(file, encoding).replace(/\r\n/g, '\n').trim();
}

const sections = [
  {
    name: `GLFW ${pinnedTag('glfw/glfw.git')}`,
    url: 'https://www.glfw.org',
    text: read(join(deps, 'glfw-src', 'LICENSE.md')),
  },
  {
    name: `GLM ${pinnedTag('g-truc/glm.git')}`,
    url: 'https://github.com/g-truc/glm',
    text: read(join(deps, 'glm-src', 'copying.txt')),
  },
  {
    name: `Dear ImGui ${pinnedTag('ocornut/imgui.git')}`,
    url: 'https://github.com/ocornut/imgui',
    text: read(join(deps, 'imgui-src', 'LICENSE.txt')),
  },
  {
    name: `stb_image (stb commit ${pinnedTag('nothings/stb.git')})`,
    url: 'https://github.com/nothings/stb',
    text: read(join(deps, 'stb-src', 'LICENSE')),
  },
  {
    name: `miniaudio ${pinnedTag('mackron/miniaudio.git')}`,
    url: 'https://miniaud.io',
    // miniaudio offers two licences to choose from (public domain or MIT No
    // Attribution). Neither asks for a notice. Its LICENSE file holds both texts.
    text: read(join(deps, 'miniaudio-src', 'LICENSE')),
  },
  {
    name: `RmlUi ${pinnedTag('mikke89/RmlUi.git')}`,
    url: 'https://github.com/mikke89/RmlUi',
    text: read(join(deps, 'rmlui-src', 'LICENSE.txt')),
  },
  {
    name: 'Containers that are part of RmlUi (itlib, robin_hood)',
    url: 'https://github.com/mikke89/RmlUi/tree/master/Include/RmlUi/Core/Containers',
    text: read(join(deps, 'rmlui-src', 'Include', 'RmlUi', 'Core', 'Containers', 'LICENSE.txt')),
  },
  {
    name: `FreeType ${pinnedTag('freetype/freetype.git')}`,
    url: 'https://freetype.org',
    // FreeType is used under the FreeType License (FTL), which asks for this credit
    // line. FTL.TXT is stored in Latin-1, not in UTF-8.
    text: [
      'Portions of this software are copyright (C) 2026 The FreeType Project',
      '(www.freetype.org). All rights reserved.',
      '',
      'FreeType is used under the FreeType License (FTL), docs/FTL.TXT in its source:',
      '',
      read(join(deps, 'freetype-src', 'docs', 'FTL.TXT'), 'latin1'),
    ].join('\n'),
  },
  {
    name: 'zlib, the copy inside the FreeType source (src/gzip)',
    url: 'https://zlib.net',
    text: [
      'Notice at the top of src/gzip/zlib.h in the FreeType source:',
      leadingComment(join(deps, 'freetype-src', 'src', 'gzip', 'zlib.h')),
    ].join('\n'),
  },
  {
    name: 'GLAD generated OpenGL loader (external/glad)',
    url: 'https://github.com/Dav1dde/glad',
    text: [
      'Notice at the top of external/glad/include/glad/gl.h:',
      leadingComment(join(repoRoot, 'external', 'glad', 'include', 'glad', 'gl.h')),
      '',
      'Notice at the top of external/glad/include/KHR/khrplatform.h:',
      leadingComment(join(repoRoot, 'external', 'glad', 'include', 'KHR', 'khrplatform.h')),
    ].join('\n'),
  },
  {
    name: 'Atkinson Hyperlegible (assets/fonts/AtkinsonHyperlegible-Regular.ttf)',
    url: 'https://github.com/googlefonts/atkinson-hyperlegible',
    text: read(join(repoRoot, 'assets', 'fonts', 'OFL.txt')),
  },
];

const rule = '='.repeat(78);
const body = [
  'Night Maze: third-party notices',
  '',
  'Night Maze contains the following third-party software and material. Each is',
  'used under the licence printed below it.',
  '',
  ...sections.flatMap(section => [rule, section.name, section.url, rule, '', section.text, '']),
].join('\n');

writeFileSync(out, body.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
console.log(`wrote ${out} (${sections.length} sections)`);
