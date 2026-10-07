import type { Action, ToastView } from '../state/view';
import { Icon } from './Icon';

interface LauncherToastProps {
  toast: ToastView;
  onAction: (action: Action) => void;
}

/**
 * The toast at the top right: a newer launcher was found, with a button that
 * installs it the way the button in the settings does.
 *
 * It never takes the focus. Its text is announced when it appears and when it
 * changes, a failed update as an alert. The close button, or Escape while the
 * focus is inside, hides it until the launcher is started again. While the
 * download runs it cannot be closed, so a failure is always seen.
 */
export function LauncherToast({ toast, onAction }: LauncherToastProps) {
  const failed = toast.tone === 'warn';
  const { busy } = toast.update;
  const dismiss = () => onAction({ type: 'dismiss_launcher_update', version: toast.version });

  return (
    <div
      className={failed ? 'toast notice warn' : 'toast notice'}
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
        <button type="button" className="t-x" aria-label="Dismiss" onClick={dismiss}>
          <Icon name="close" />
        </button>
      )}
      <div className="acts">
        <button
          type="button"
          className="sbtn"
          disabled={busy}
          onClick={() => onAction({ type: 'update_launcher' })}
        >
          <Icon name={toast.update.icon} />
          {toast.update.label}
        </button>
      </div>
    </div>
  );
}
