import type { Action, NoticeView, PillView, StepView } from '../state/view';
import { Icon } from './Icon';

/** The state in a few words, in the line under the action. Announced when it changes. */
export function StatusPill({ pill }: { pill: PillView }) {
  const tone = pill.tone === 'ok' ? '' : ` ${pill.tone}`;
  return (
    <span className={`pill${tone}`} role="status" aria-live="polite">
      {pill.icon === 'dot' ? <i /> : <Icon name={pill.icon} />}
      {pill.text}
    </span>
  );
}

/**
 * A message in the place of the status sentence. Its actions are text links in
 * the line under the action, see `NoticeActions`.
 */
export function NoticeLine({ notice }: { notice: NoticeView }) {
  return (
    <div className={notice.tone === 'warn' ? 'notice warn' : 'notice'} role="alert">
      <p className="st">
        <Icon name={notice.icon} />
        {notice.text}
        {notice.dim && <span className="dim"> {notice.dim}</span>}
      </p>
      {notice.detail && <div className="detail selectable">{notice.detail}</div>}
    </div>
  );
}

interface NoticeActionsProps {
  notice: NoticeView;
  onAction: (action: Action) => void;
}

/** What can be done about a notice, as text links. */
export function NoticeActions({ notice, onAction }: NoticeActionsProps) {
  return notice.actions.map(entry => (
    <button type="button" className="lnk" key={entry.label} onClick={() => onAction(entry.action)}>
      {entry.label}
    </button>
  ));
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
