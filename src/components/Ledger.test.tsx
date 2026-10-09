// The ledger as markup, for every preview state of src/dev/preview.ts. The
// components are rendered to a string, so no browser is needed: what is
// checked is which words, roles and values each state puts on the pages.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PREVIEW_NAMES, previewNamed } from '../dev/preview';
import { statusSentence } from '../state/ledger';
import { deriveView } from '../state/view';
import { Ledger } from './Ledger';

const TODAY = new Date(2026, 9, 9);
const nothing = () => undefined;

/** The window in one preview state: the view of that state and its markup, in parts. */
function page(name: string) {
  const preview = previewNamed(name);
  if (!preview) throw new Error(`There is no preview named ${name}.`);
  const view = deriveView(preview);
  const html = renderToStaticMarkup(
    <Ledger
      view={view}
      snapshot={preview.snapshot}
      sentence={statusSentence(preview)}
      today={TODAY}
      onAction={nothing}
      onOpenRelease={nothing}
      onOpenSettings={nothing}
      onOpenFolder={nothing}
    />
  );
  const book = html.indexOf('<div class="book">');
  const right = html.indexOf('<section class="pg r"');
  return {
    preview,
    view,
    html,
    /** What lies on the video above the book: the caption and the slip. */
    above: html.slice(0, book),
    left: html.slice(book, right),
    right: html.slice(right),
  };
}

/** The words of a piece of markup, without its tags. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The action line of a page: its word, what stands at its end, and whether it can be pressed. */
function action(left: string) {
  const button = /<button type="button" class="act [^>]*>.*?<\/button>/.exec(left)?.[0] ?? '';
  const base = /<span class="a-in base">(.*?)<\/span><\/span>/.exec(button)?.[1] ?? '';
  return {
    word: text(/<b>(.*?)<\/b>/.exec(base)?.[1] ?? ''),
    end: text(/<span class="v">(.*)/.exec(base)?.[1] ?? ''),
    disabled: button.includes('disabled=""'),
    progress: /role="progressbar"[^>]*aria-valuenow="(\d+)"/.exec(button)?.[1],
    ink: /clip-path:inset\(0 (\d+)% 0 0\)/.exec(button)?.[1],
  };
}

describe('the ledger in every preview state', () => {
  it.each(PREVIEW_NAMES)('%s: shows everything its view holds', name => {
    const { view, preview, left, above, right } = page(name);
    const words = text(left);

    expect(action(left)).toMatchObject({
      word: view.cta.title,
      end: view.cta.sub,
      disabled: !view.cta.action,
    });
    expect(words).toContain(view.pill.text);
    if (view.notice) {
      expect(words).toContain(view.notice.text);
      if (view.notice.dim) expect(words).toContain(view.notice.dim);
      if (view.notice.detail) expect(words).toContain(view.notice.detail);
      for (const entry of view.notice.actions) expect(words).toContain(entry.label);
    } else {
      expect(words).toContain(statusSentence(preview));
    }
    if (view.secondary) expect(words).toContain(view.secondary.label);
    for (const step of view.steps ?? []) expect(words).toContain(step.label);
    if (view.toast) {
      expect(text(above)).toContain(`${view.toast.text} ${view.toast.dim}`);
      expect(words).toContain(view.toast.update.label);
    } else {
      expect(above).not.toContain('class="slip');
    }
    expect(words).toContain(`launcher ${preview.snapshot.launcher_version} · Windows`);
    for (const release of preview.snapshot.feed?.updates ?? []) {
      expect(right).toContain(`<span class="v">${release.version}</span>`);
    }
  });
});

describe('the action line', () => {
  it.each([
    ['ready', 'Launch', 'v0.10.0', false],
    ['update', 'Update', 'v0.9.0 → v0.10.0', false],
    ['downloading', 'Updating 38%', '11.1 of 29.2 MB', true],
    ['installing', 'Installing', 'SHA-256 matches', true],
    ['running', 'Running', 'v0.10.0', true],
    ['first-run', 'Install', 'v0.10.0 · 29.2 MB', false],
    ['first-run-offline', 'Install', 'no connection', true],
    ['launcher-update', 'Update launcher', 'v0.1.2 → v0.2.0', false],
    ['launcher-downloading', 'Updating launcher 62%', '3.1 of 5.0 MB', true],
    ['fatal', 'Launch', 'not ready', true],
  ])('%s: says %s, then %s', (name, word, end, disabled) => {
    expect(action(page(name).left)).toMatchObject({ word, end, disabled });
  });

  it('has a progress value and inks in to it while it works', () => {
    expect(action(page('downloading').left)).toMatchObject({ progress: '38', ink: '62' });
    expect(action(page('installing').left)).toMatchObject({ progress: '100', ink: '0' });
    expect(action(page('launcher-downloading').left)).toMatchObject({ progress: '62', ink: '38' });
    expect(page('downloading').left).toContain('aria-label="Install progress"');
  });

  it('has no progress when nothing is being downloaded', () => {
    for (const name of ['ready', 'update', 'first-run', 'first-run-offline', 'running']) {
      expect(action(page(name).left).progress).toBeUndefined();
    }
  });

  it('is amber only when it can be pressed or is being inked in', () => {
    expect(page('ready').left).toContain('class="a-in fill" aria-hidden="true"');
    expect(page('first-run-offline').left).not.toContain('a-in fill');
    expect(page('running').left).not.toContain('a-in fill');
  });
});

describe('the lines under the action', () => {
  it('announces the state in a few words', () => {
    expect(page('ready').left).toMatch(
      /<span class="pill" role="status" aria-live="polite">.*?v 0\.10\.0 · up to date<\/span>/
    );
  });

  it('keeps the installed version one line below an update', () => {
    const { left } = page('update');
    expect(left).toContain('<button type="button" class="lnk">Launch v0.9.0</button>');
    expect(text(left)).toContain('Night Maze 0.10.0 is out. 0.9.0 is installed here.');
  });

  it('shows the four steps while the download is unpacked', () => {
    const { left } = page('installing');
    expect(left).toContain('<ol class="steps" aria-label="Install steps">');
    expect(left).toMatch(/<li class="now" aria-current="step">.*?Installing<\/li>/);
    expect(page('downloading').left).not.toContain('class="steps"');
  });

  it('has the settings and the install folder in the footer', () => {
    const { left } = page('ready');
    expect(left).toContain('<button type="button" class="lnk">Settings</button>');
    expect(left).toContain('<button type="button" class="lnk">Install folder</button>');
    expect(text(left)).toContain("The lamplighter's ledger 9 October 2026");
  });
});

describe('the notice line', () => {
  it('stands in the place of the status sentence, as an alert', () => {
    const { left, preview } = page('offline');
    expect(left).toMatch(/<div class="notice" role="alert"><p class="st">/);
    expect(text(left)).toContain('Could not check for updates. Version 0.10.0 still starts.');
    expect(text(left)).not.toContain(statusSentence(preview));
    expect(left).toContain('<button type="button" class="lnk">Try again</button>');
  });

  it('shows the line of the game log and what can be done about it', () => {
    const { left } = page('rolled-back');
    expect(left).toContain('<div class="notice warn" role="alert">');
    expect(left).toContain(
      '<div class="detail selectable">[error] Fatal: Failed to create the window (OpenGL 4.1 is required)</div>'
    );
    for (const label of ['Open log folder', 'Copy log path', 'Dismiss']) {
      expect(left).toContain(`<button type="button" class="lnk">${label}</button>`);
    }
  });

  it('puts the notices it does not show itself into the margin', () => {
    const { left } = page('news');
    const notes = [...left.matchAll(/<p class="note">(.*?)<\/p>/g)].map(match => text(match[1]!));
    expect(notes).toEqual([
      'This computer Version 0.8.0 did not start.',
      'Warning Version 0.10.0 was pulled. It did not start on some graphics cards. A fixed version follows.',
    ]);
    // The newest notice of this computer is the notice line, and only that.
    expect(text(left).match(/You are back on 0\.9\.0\./g)).toHaveLength(1);
    expect(page('ready').left).not.toContain('class="note"');
  });
});

describe('the release list', () => {
  /** The rows of the right page: date, version, headline, and whether it waits. */
  function rows(right: string) {
    return [...right.matchAll(/<button type="button" class="(row[^"]*)">(.*?)<\/button>/g)].map(
      match => ({ wait: match[1]!.includes('wait'), words: text(match[2]!) })
    );
  }

  it('is one line a release, newest on top, with the date from the feed', () => {
    const { right, preview } = page('ready');
    const list = rows(right);
    expect(list).toHaveLength(preview.snapshot.feed?.updates?.length ?? 0);
    expect(list[0]).toEqual({
      wait: false,
      words: '10.07 0.10.0 The maze is no longer silent: the first sounds.',
    });
    expect(list[1]?.words).toMatch(/^10\.06 0\.9\.0 /);
    expect(right).toContain('class="row new"');
    expect(text(right)).toContain('What changed all 10 releases');
  });

  it('draws a release that is not installed yet as waiting', () => {
    for (const name of ['update', 'downloading', 'installing', 'first-run']) {
      const list = rows(page(name).right);
      expect(list[0]).toMatchObject({ wait: true });
      expect(list[0]?.words).toMatch(/waiting$/);
      expect(list.filter(row => row.wait)).toHaveLength(1);
    }
    expect(rows(page('ready').right).some(row => row.wait)).toBe(false);
  });

  it('says that the entries are the kept ones when the check failed', () => {
    expect(text(page('offline').right)).toContain('as of the last check · all 10 releases');
    expect(text(page('ready').right)).not.toContain('as of the last check');
  });

  it('says where the notes will appear when there are none', () => {
    const { right } = page('first-run-offline');
    expect(rows(right)).toHaveLength(0);
    expect(text(right)).toContain('Release notes appear here after the first update check.');
    expect(right).toContain('<button type="button" class="lnk">release notes</button>');
  });

  it('begins with the news when there are posts', () => {
    const { right } = page('news');
    const words = text(right);
    expect(right).toContain('aria-labelledby="news"');
    expect(words).toMatch(/^News 2 posts 10\.09 A playtest evening on Friday I will be online/);
    expect(words).toContain(
      '10.02 The launcher has its own repository now Nothing changes for you'
    );
    expect(words.indexOf('What changed all 10 releases')).toBeGreaterThan(
      words.indexOf('Nothing changes for you')
    );
    expect(rows(right)).toHaveLength(10);
    expect(page('ready').right).not.toContain('class="post"');
  });
});

describe('the slip', () => {
  it('offers a newer launcher, with its action as a line on the left page', () => {
    const { above, left } = page('launcher-toast');
    expect(above).toContain('<div class="slip" role="region" aria-label="Launcher update">');
    expect(above).toMatch(/<p role="status">Launcher 0\.2\.0 is available\./);
    expect(above).toContain('<button type="button" class="lnk">Not now</button>');
    expect(left).toContain('<button type="button" class="lnk teal">Update launcher</button>');
    expect(text(left)).toContain('Update launcher launcher 0.1.2 → 0.2.0');
  });

  it('cannot be closed or pressed while the launcher downloads', () => {
    const { above, left } = page('launcher-toast-downloading');
    expect(text(above)).toContain('Downloading launcher 0.2.0.');
    expect(above).not.toContain('Not now');
    expect(left).toContain('<button type="button" class="lnk teal" disabled="">');
  });

  it('is an alert after a failed update, and offers another try', () => {
    const { above, left } = page('launcher-toast-failed');
    expect(above).toContain('<div class="slip warn" role="region"');
    expect(above).toMatch(/<p role="alert">Could not reach the launcher update server\./);
    expect(left).toContain('<button type="button" class="lnk teal">Try again</button>');
  });

  it('comes before the book, so it is the first stop of the Tab key', () => {
    const { html } = page('launcher-toast');
    expect(html.indexOf('Not now')).toBeLessThan(html.indexOf('class="act '));
  });

  it('is not there when it was closed or when the action line offers the update', () => {
    for (const name of ['launcher-newer', 'launcher-update', 'launcher-downloading', 'ready']) {
      const { above, left } = page(name);
      expect(above).not.toContain('class="slip');
      expect(left).not.toContain('lnk teal');
    }
  });
});
