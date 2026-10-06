import type { Action, NoticeView, PillView, StepView } from '../state/view';
import { Icon } from './Icon';

/** The version pill under the name. Announced when it changes. */
export function StatusPill({ pill }: { pill: PillView }) {
  const tone = pill.tone === 'ok' ? '' : ` ${pill.tone}`;
  return (
    <span className={`pill${tone}`} role="status" aria-live="polite">
      {pill.icon === 'dot' ? <i /> : <Icon name={pill.icon} />}
      {pill.text}
    </span>
  );
}

interface NoticeLineProps {
  notice: NoticeView;
  onAction: (action: Action) => void;
}

/** One message above the release list, with its actions as text links. */
export function NoticeLine({ notice, onAction }: NoticeLineProps) {
  return (
    <div className={notice.tone === 'warn' ? 'notice warn' : 'notice'} role="alert">
      <Icon name={notice.icon} />
      <p>
        {notice.text}
        {notice.dim && <span className="dim"> {notice.dim}</span>}
      </p>
      {notice.detail && <div className="detail selectable">{notice.detail}</div>}
      {notice.actions.length > 0 && (
        <div className="acts">
          {notice.actions.map(entry => (
            <button
              type="button"
              className="lnk"
              key={entry.label}
              onClick={() => onAction(entry.action)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The four steps of an install, shown while the last two run. */
export function StepLine({ steps }: { steps: StepView[] }) {
  return (
    <ol className="steps" aria-label="Install steps">
      {steps.map(step => (
        <li
          key={step.label}
          className={step.state === 'todo' ? undefined : step.state}
          aria-current={step.state === 'now' ? 'step' : undefined}
        >
          <Icon
            name={step.state === 'done' ? 'check' : step.state === 'now' ? 'clock' : 'pending'}
          />
          {step.label}
        </li>
      ))}
    </ol>
  );
}
