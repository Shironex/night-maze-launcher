// What the ledger shows besides the view of view.ts: the sentence under the
// header, the notes in the margin of the left page, and which release on the
// right page is still waiting. Pure functions, like view.ts, so each has a test.

import type { Snapshot } from '../bindings';
import { localNoticeText, type NoticeView, type ViewInput } from './view';

/**
 * One sentence about the game for the states that have no notice. A state
 * with a notice shows the notice in its place.
 */
export function statusSentence(
  input: Pick<ViewInput, 'snapshot' | 'progress' | 'checking' | 'fatal'>
): string {
  const { snapshot, progress, checking, fatal } = input;
  if (fatal) return 'The launcher could not start.';
  if (!snapshot) return 'The launcher is starting.';

  const { current, remote, activity } = snapshot;
  if (activity.kind === 'installing') {
    const phase = progress?.phase ?? 'downloading';
    const verb =
      phase === 'downloading' ? 'Fetching' : phase === 'verifying' ? 'Checking' : 'Unpacking';
    return `${verb} Night Maze ${activity.version}.`;
  }
  if (activity.kind === 'running') return `Night Maze ${activity.version} is running.`;
  if (!current) {
    if (remote.kind === 'update_available') {
      return `Night Maze ${remote.version} is ready to install.`;
    }
    return checking ? 'Looking for the newest Night Maze.' : 'Night Maze is not installed yet.';
  }
  switch (remote.kind) {
    case 'update_available':
      return `Night Maze ${remote.version} is out. ${current} is installed here.`;
    case 'up_to_date':
      return `Night Maze ${current} is installed and up to date.`;
    case 'unknown':
      return checking
        ? `Night Maze ${current} is installed. Checking for updates.`
        : `Night Maze ${current} is installed.`;
    default:
      return `Night Maze ${current} is installed.`;
  }
}

/** The version that is found or being installed and not ready to start yet. */
export function waitingVersion(snapshot: Snapshot | null): string | null {
  if (!snapshot) return null;
  if (snapshot.activity.kind === 'installing') return snapshot.activity.version;
  return snapshot.remote.kind === 'update_available' ? snapshot.remote.version : null;
}

/** A note in the margin of the left page. */
export interface MarginNote {
  key: string;
  /** Where it comes from: `This computer`, `Notice` or `Warning`. */
  label: string;
  text: string;
  /** The body of a notice from the feed, or the log line of a local one. */
  detail?: string;
}

/**
 * Every notice the notice line does not already show: the author's notices
 * from the feed, and the launcher's own ones except the one in `shown`.
 */
export function marginNotes(
  snapshot: Snapshot | null,
  shown: NoticeView | undefined
): MarginNote[] {
  if (!snapshot) return [];
  const shownId = shown?.actions
    .map(entry => entry.action)
    .find(action => action.type === 'dismiss')?.id;
  const local = snapshot.notices
    .filter(notice => notice.id !== shownId)
    .map(notice => ({
      key: notice.id,
      label: 'This computer',
      text: localNoticeText(notice),
      detail: notice.detail ?? undefined,
    }));
  const remote = (snapshot.feed?.notices ?? []).map((notice, index) => ({
    key: `${notice.id}-${index}`,
    label: notice.level === 'warning' ? 'Warning' : 'Notice',
    text: notice.title ?? '',
    detail: notice.body,
  }));
  return [...local, ...remote];
}
