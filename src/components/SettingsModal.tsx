import { useState } from 'react';
import type { Snapshot } from '../bindings';
import { percent } from '../lib/format';
import { useLauncher } from '../state/store';
import { launcherStatusText, sentence } from '../state/view';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';

type Section = 'updates' | 'about';

const SECTIONS: { id: Section; label: string; icon: IconName }[] = [
  { id: 'updates', label: 'Updates', icon: 'download' },
  { id: 'about', label: 'About', icon: 'info' },
];

interface SettingsModalProps {
  snapshot: Snapshot;
  onClose: () => void;
}

/** Settings: where the game lives, the update check, and the log. */
export function SettingsModal({ snapshot, onClose }: SettingsModalProps) {
  const [section, setSection] = useState<Section>('updates');
  const setCheckOnStart = useLauncher(store => store.setCheckOnStart);
  const openFolder = useLauncher(store => store.openFolder);
  const checkOnStart = snapshot.check_on_start;

  const side = (
    <>
      <div className="m-brand">
        <b>Settings</b>
        <span>Night Maze launcher</span>
      </div>
      <div role="tablist" aria-label="Settings sections" aria-orientation="vertical">
        {SECTIONS.map(entry => (
          <button
            type="button"
            role="tab"
            key={entry.id}
            className="m-item"
            aria-selected={entry.id === section}
            onClick={() => setSection(entry.id)}
          >
            <Icon name={entry.icon} />
            {entry.label}
          </button>
        ))}
      </div>
      <div className="m-foot">launcher v{snapshot.launcher_version}</div>
    </>
  );

  return (
    <Modal label="Settings" onClose={onClose} side={side}>
      {section === 'updates' ? (
        <div role="tabpanel">
          <h2 className="m-h">Downloads & updates</h2>
          <p className="m-sub">Where the game lives and how it stays current.</p>
          <div className="m-rows">
            <div className="m-row">
              <div>
                <b>Install folder</b>
                <span className="path selectable">{snapshot.install_root}</span>
              </div>
              <button type="button" className="sbtn" onClick={() => void openFolder('install')}>
                <Icon name="folder" />
                Open
              </button>
            </div>
            <div className="m-row">
              <div>
                <b id="check-on-start">Check for updates on start</b>
                <span className="d">
                  Reads the release manifest and the notes each time the launcher opens
                </span>
              </div>
              <button
                type="button"
                role="switch"
                className="tog"
                aria-checked={checkOnStart}
                aria-labelledby="check-on-start"
                onClick={() => void setCheckOnStart(!checkOnStart)}
              >
                {checkOnStart ? 'On' : 'Off'}
                <i />
              </button>
            </div>
            <div className="m-row">
              <div>
                <b>One previous version is kept</b>
                <span className="d">
                  {snapshot.previous
                    ? `Version ${snapshot.previous} stays on disk, so the launcher can go back when a new version does not start`
                    : 'After the next update the version before it stays on disk, so the launcher can go back when a new version does not start'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div role="tabpanel">
          <h2 className="m-h">About</h2>
          <p className="m-sub">Night Maze launcher {snapshot.launcher_version}</p>
          <div className="m-rows">
            <LauncherVersionRow version={snapshot.launcher_version} />
            <div className="m-row">
              <div>
                <b>No telemetry</b>
                <span className="d">
                  This launcher only talks to github.com: the release manifest, the notes, the game
                  download and its own update. Logs stay on this computer.
                </span>
              </div>
            </div>
            <div className="m-row">
              <div>
                <b>Game log</b>
                <span className="path selectable">{snapshot.log_file}</span>
              </div>
              <button type="button" className="sbtn" onClick={() => void openFolder('logs')}>
                <Icon name="folder" />
                Open log folder
              </button>
            </div>
            <div className="m-row">
              <div>
                <b>Fonts</b>
                <span className="d">
                  Atkinson Hyperlegible Next and Mono, and Cormorant Garamond, under the SIL Open
                  Font License 1.1
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * The launcher's own version and update. One button: it checks, and once a
 * newer launcher was found it installs that one. What it shows is what the
 * Rust side answered, the page asks nobody else.
 */
function LauncherVersionRow({ version }: { version: string }) {
  const launcher = useLauncher(store => store.launcher);
  const checkLauncherUpdate = useLauncher(store => store.checkLauncherUpdate);
  const installLauncherUpdate = useLauncher(store => store.installLauncherUpdate);

  const newer = launcher.update?.kind === 'available' ? launcher.update : null;
  const busy = launcher.checking || launcher.installing;
  const done = percent(launcher.progress?.received ?? 0, launcher.progress?.total ?? 0);

  return (
    <div className="m-row">
      <div>
        <b>Launcher version</b>
        <span className="d" role="status" aria-live="polite">
          {launcherStatusText(version, launcher)}
        </span>
        {launcher.installing && (
          <span
            className="m-bar"
            role="progressbar"
            aria-label="Launcher update progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={done}
          >
            <i style={{ width: `${done}%` }} />
          </span>
        )}
        {newer?.notes && !launcher.installing && <span className="d notes">{newer.notes}</span>}
        {launcher.error && (
          <span className="d fail" role="alert">
            <Icon name="warning" />
            {sentence(launcher.error)}
          </span>
        )}
      </div>
      <button
        type="button"
        className="sbtn"
        disabled={busy}
        onClick={() => void (newer ? installLauncherUpdate() : checkLauncherUpdate())}
      >
        <Icon name={newer ? 'upload' : 'retry'} />
        {newer ? `Update to v${newer.version}` : 'Check for launcher updates'}
      </button>
    </div>
  );
}
