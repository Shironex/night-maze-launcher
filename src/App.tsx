import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChangelogModal } from './components/ChangelogModal';
import { Ledger } from './components/Ledger';
import { Scene } from './components/Scene';
import { SettingsModal } from './components/SettingsModal';
import { TitleBar } from './components/TitleBar';
import { statusSentence } from './state/ledger';
import { useLauncher } from './state/store';
import { deriveView, type Action } from './state/view';

/** How often the date in the header of the ledger is read again. */
const DATE_REFRESH_MS = 10 * 60 * 1000;

type Dialog = { kind: 'changelog'; version: string | null } | { kind: 'settings' } | null;

export function App() {
  const snapshot = useLauncher(store => store.snapshot);
  const progress = useLauncher(store => store.progress);
  const checking = useLauncher(store => store.checking);
  const error = useLauncher(store => store.error);
  const fatal = useLauncher(store => store.fatal);
  const launcher = useLauncher(store => store.launcher);
  const dismissedLauncher = useLauncher(store => store.dismissedLauncher);
  const start = useLauncher(store => store.start);
  const run = useLauncher(store => store.run);
  const openFolder = useLauncher(store => store.openFolder);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    void start();
  }, [start]);

  // A launcher that stays open over midnight shows the new day.
  useEffect(() => {
    const timer = setInterval(() => setToday(new Date()), DATE_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const view = useMemo(
    () => deriveView({ snapshot, progress, checking, error, fatal, launcher, dismissedLauncher }),
    [snapshot, progress, checking, error, fatal, launcher, dismissedLauncher]
  );
  const onAction = useCallback((action: Action) => void run(action), [run]);
  const closeDialog = useCallback(() => setDialog(null), []);

  return (
    <div className="win">
      <Scene />
      <TitleBar />

      {/* While a dialog is open the window behind it is out of reach. */}
      <main inert={dialog !== null}>
        <Ledger
          view={view}
          snapshot={snapshot}
          sentence={statusSentence({ snapshot, progress, checking, fatal })}
          today={today}
          onAction={onAction}
          onOpenRelease={version => setDialog({ kind: 'changelog', version })}
          onOpenSettings={() => setDialog({ kind: 'settings' })}
          onOpenFolder={folder => void openFolder(folder)}
        />
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
