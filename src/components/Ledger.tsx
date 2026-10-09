import type { Folder, Snapshot } from '../bindings';
import { ledgerDate } from '../lib/format';
import { marginNotes, waitingVersion } from '../state/ledger';
import type { Action, View } from '../state/view';
import { LauncherLine, LauncherToast } from './LauncherToast';
import { MainButton } from './MainButton';
import { ReleasePanel } from './ReleasePanel';
import { NoticeActions, NoticeLine, StatusPill, StepLine } from './StatusLine';

/** The systems a release exists for, shown in the footer. Add a system here when it ships. */
const PLATFORMS = ['Windows'];

interface LedgerProps {
  view: View;
  snapshot: Snapshot | null;
  /** The sentence under the header, for a state without a notice. */
  sentence: string;
  today: Date;
  onAction: (action: Action) => void;
  onOpenRelease: (version: string | null) => void;
  onOpenSettings: () => void;
  onOpenFolder: (folder: Folder) => void;
}

/**
 * Everything in the window besides the background and the title bar: the
 * caption on the video and the open ledger along the bottom, tonight's entry
 * on the left page and the releases on the right one. The book is as tall as
 * the left page needs, in whole ruled lines, and never shorter than eight.
 */
export function Ledger({
  view,
  snapshot,
  sentence,
  today,
  onAction,
  onOpenRelease,
  onOpenSettings,
  onOpenFolder,
}: LedgerProps) {
  const notes = marginNotes(snapshot, view.notice);

  return (
    <>
      <h1 className="cap">
        <i className="gem" />
        <b>NIGHT MAZE</b>
        <span>The Last Lamp</span>
      </h1>

      <div className="desk">
        {/* First in the window, so it is the first stop of the Tab key. */}
        {view.toast && <LauncherToast toast={view.toast} onAction={onAction} />}
        <div className="book">
          <section className="pg l" aria-labelledby="ledger">
            <div className="ph">
              <span id="ledger">The lamplighter's ledger</span>
              <span>{ledgerDate(today)}</span>
            </div>
            {view.notice ? <NoticeLine notice={view.notice} /> : <p className="st">{sentence}</p>}
            <MainButton cta={view.cta} onAction={onAction} />
            <div className="ex">
              {view.secondary && (
                <button
                  type="button"
                  className="lnk"
                  onClick={() => view.secondary && onAction(view.secondary.action)}
                >
                  {view.secondary.label}
                </button>
              )}
              {view.notice && <NoticeActions notice={view.notice} onAction={onAction} />}
              <StatusPill pill={view.pill} />
            </div>
            {view.steps && <StepLine steps={view.steps} />}
            {view.toast && snapshot && (
              <LauncherLine
                toast={view.toast}
                current={snapshot.launcher_version}
                onAction={onAction}
              />
            )}
            {notes.map(note => (
              <p className="note" key={note.key}>
                <b>{note.label}</b> {note.text}
                {note.detail && <span className="dim selectable"> {note.detail}</span>}
              </p>
            ))}
            <div className="pf">
              {/* Both need the state of the launcher, so neither is offered without it. */}
              <span>
                {snapshot && (
                  <>
                    <button type="button" className="lnk" onClick={onOpenSettings}>
                      Settings
                    </button>
                    <button type="button" className="lnk" onClick={() => onOpenFolder('install')}>
                      Install folder
                    </button>
                  </>
                )}
              </span>
              <span className="mono">
                {snapshot && `launcher ${snapshot.launcher_version} · `}
                {PLATFORMS.join(' · ')}
              </span>
            </div>
          </section>
          <ReleasePanel
            feed={snapshot?.feed ?? null}
            fallbackNotes={snapshot?.notes ?? null}
            waiting={waitingVersion(snapshot)}
            kept={snapshot?.remote.kind === 'offline'}
            onOpenRelease={onOpenRelease}
          />
        </div>
      </div>
    </>
  );
}
