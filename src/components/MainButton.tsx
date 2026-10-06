import type { Action, CtaView } from '../state/view';
import { Icon } from './Icon';

interface MainButtonProps {
  cta: CtaView;
  onAction: (action: Action) => void;
}

/**
 * The large button at the bottom right: Launch, Update, Install, or the
 * progress of a running install. Percent and size are text; the thin line
 * along the bottom edge repeats them.
 */
export function MainButton({ cta, onAction }: MainButtonProps) {
  const action = cta.action;
  const style = cta.style === 'primary' ? 'cta' : `cta ${cta.style}`;

  return (
    <button
      type="button"
      className={style}
      disabled={!action}
      onClick={action ? () => onAction(action) : undefined}
    >
      <span className="sq">
        <Icon name={cta.icon} />
      </span>
      <span className="l">
        <b>{cta.title}</b>
        <span>{cta.sub}</span>
      </span>
      {cta.style === 'busy' && (
        <span
          className="bar"
          style={{ width: `${cta.percent ?? 0}%` }}
          role="progressbar"
          aria-label="Install progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={cta.percent ?? 0}
        />
      )}
    </button>
  );
}
