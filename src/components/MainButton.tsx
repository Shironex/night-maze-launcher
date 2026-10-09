import type { Action, CtaView } from '../state/view';

interface MainButtonProps {
  cta: CtaView;
  onAction: (action: Action) => void;
}

/**
 * The action line of the left page: Launch, Update, Install, or the progress
 * of a running install. A mark, the word, a dotted leader and the version, the
 * way a ledger line ends in its amount.
 *
 * The line is drawn twice. The outline is always there and carries the text
 * for a screen reader. The amber layer lies over it: complete when the line
 * can be pressed, and cut off at the percentage while it works, so the line
 * inks in from the left. Percent and size are text; the ink repeats them.
 */
export function MainButton({ cta, onAction }: MainButtonProps) {
  const action = cta.action;
  const done = cta.percent ?? 0;
  const line = (
    <>
      <i className="gem" />
      <b>{cta.title}</b>
      <span className="dots" />
      <span className="v">{cta.sub}</span>
    </>
  );

  return (
    <button
      type="button"
      className={`act ${cta.style}`}
      disabled={!action}
      onClick={action ? () => onAction(action) : undefined}
    >
      <span className="a-in base">{line}</span>
      {cta.style === 'primary' && (
        <span className="a-in fill" aria-hidden="true">
          {line}
        </span>
      )}
      {cta.style === 'busy' && (
        <span
          className="a-in fill"
          style={{ clipPath: `inset(0 ${100 - done}% 0 0)` }}
          role="progressbar"
          aria-label="Install progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={done}
        >
          {line}
        </span>
      )}
    </button>
  );
}
