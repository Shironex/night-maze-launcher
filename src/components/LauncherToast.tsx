import type { Action, ToastView } from '../state/view';
import { Icon } from './Icon';

interface LauncherToastProps {
  toast: ToastView;
  onAction: (action: Action) => void;
}

/**
 * The slip of paper that sticks out of the book: a newer launcher was found.
 * The button that installs it is a line on the left page, see `LauncherLine`.
 *
 * It never takes the focus. Its text is a status, and a failed update an
 * alert. A screen reader is sure to read out the alert; whether it reads a
 * status that appears already filled depends on the reader. "Not now", or
 * Escape while the focus is inside, hides it until the launcher is started
 * again. While the download runs it cannot be closed, so a failure is always
 * seen.
 */
export function LauncherToast({ toast, onAction }: LauncherToastProps) {
  const failed = toast.tone === 'warn';
  const { busy } = toast.update;
  const dismiss = () => onAction({ type: 'dismiss_launcher_update', version: toast.version });

  return (
    <div
      className={failed ? 'slip warn' : 'slip'}
      role="region"
      aria-label="Launcher update"
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) dismiss();
      }}
    >
      <Icon name={toast.icon} />
      {/* The key makes a failure a new element, so it is announced as an alert. */}
      <p key={toast.tone} role={failed ? 'alert' : 'status'}>
        {toast.text}
        <span className="dim"> {toast.dim}</span>
      </p>
      {!busy && (
        <button type="button" className="lnk" onClick={dismiss}>
          Not now
        </button>
      )}
    </div>
  );
}

interface LauncherLineProps extends LauncherToastProps {
  /** The version of this launcher. */
  current: string;
}

/** The line on the left page that installs the launcher the slip names. */
export function LauncherLine({ toast, current, onAction }: LauncherLineProps) {
  return (
    <div className="ex">
      <button
        type="button"
        className="lnk teal"
        disabled={toast.update.busy}
        onClick={() => onAction({ type: 'update_launcher' })}
      >
        {toast.update.label}
      </button>
      <span className="mono">
        launcher {current} → {toast.version}
      </span>
    </div>
  );
}
