import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChangelogModal } from './components/ChangelogModal';
import { Icon } from './components/Icon';
import { MainButton } from './components/MainButton';
import { ReleasePanel } from './components/ReleasePanel';
import { Scene, SceneDefs } from './components/Scene';
import { SettingsModal } from './components/SettingsModal';
import { NoticeLine, StatusPill, StepLine } from './components/StatusLine';
import { TitleBar } from './components/TitleBar';
import { useLauncher } from './state/store';
import { deriveView, type Action } from './state/view';

/** The systems a release exists for, shown in the header. Add a system here when it ships. */
const PLATFORMS = ['Windows'];

type Dialog = { kind: 'changelog'; version: string | null } | { kind: 'settings' } | null;

export function App() {
  const snapshot = useLauncher(store => store.snapshot);
  const progress = useLauncher(store => store.progress);
  const checking = useLauncher(store => store.checking);
  const error = useLauncher(store => store.error);
  const fatal = useLauncher(store => store.fatal);
  const launcher = useLauncher(store => store.launcher);
  const start = useLauncher(store => store.start);
  const run = useLauncher(store => store.run);
  const [dialog, setDialog] = useState<Dialog>(null);

  useEffect(() => {
    void start();
  }, [start]);

  const view = useMemo(
    () => deriveView({ snapshot, progress, checking, error, fatal, launcher }),
    [snapshot, progress, checking, error, fatal, launcher]
  );
  const onAction = useCallback((action: Action) => void run(action), [run]);
  const closeDialog = useCallback(() => setDialog(null), []);

  return (
    <div className="win">
      <SceneDefs />
      <Scene />
      <TitleBar />

      {/* While a dialog is open the window behind it is out of reach. */}
      <main inert={dialog !== null}>
        <div className="w-id">
          <div className="w-pub">
            Shironex
            <i />
            <span>{PLATFORMS.join(' · ')}</span>
          </div>
          <h1 className="w-word">NIGHT MAZE</h1>
          <p className="w-tag">A stone maze at night. One flashlight. Find the crystals.</p>
          <StatusPill pill={view.pill} />
        </div>

        <div className="w-col">
          {view.notice && <NoticeLine notice={view.notice} onAction={onAction} />}
          {view.steps && <StepLine steps={view.steps} />}
          <ReleasePanel
            feed={snapshot?.feed ?? null}
            fallbackNotes={snapshot?.notes ?? null}
            localNotices={snapshot?.notices ?? []}
            onOpenRelease={version => setDialog({ kind: 'changelog', version })}
          />
        </div>

        <div className="w-cta">
          <button
            type="button"
            className="ibtn"
            aria-label="Release notes"
            onClick={() => setDialog({ kind: 'changelog', version: null })}
          >
            <Icon name="info" />
          </button>
          <button
            type="button"
            className="ibtn"
            aria-label="Settings"
            onClick={() => setDialog({ kind: 'settings' })}
          >
            <Icon name="settings" />
          </button>
          {view.secondary && (
            <button
              type="button"
              className="sbtn"
              onClick={() => view.secondary && onAction(view.secondary.action)}
            >
              <Icon name={view.secondary.icon} />
              {view.secondary.label}
            </button>
          )}
          <MainButton cta={view.cta} onAction={onAction} />
        </div>
      </main>

      {dialog?.kind === 'changelog' && (
        <ChangelogModal
          releases={snapshot?.feed?.updates ?? []}
          initialVersion={dialog.version}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'settings' && snapshot && (
        <SettingsModal snapshot={snapshot} onClose={closeDialog} />
      )}
    </div>
  );
}
