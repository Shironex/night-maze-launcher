// The launcher's icons: line drawings on a 16 by 16 grid, drawn with the
// current text colour. A handful of paths is smaller than an icon package.

const PATHS = {
  play: 'M4.5 2.5v11l9-5.5z',
  download: 'M8 2.5v8.5M4.5 7.8L8 11.2l3.5-3.4M3 14h10',
  upload: 'M8 13.5V5M4.5 8.2L8 4.8l3.5 3.4M3 2h10',
  clock: 'M8 2a6 6 0 100 12A6 6 0 008 2zM8 4.8V8l2.2 1.6',
  offline: 'M8 2a6 6 0 100 12A6 6 0 008 2zM3.8 3.8l8.4 8.4',
  warning: 'M8 2.2l6.3 11.3H1.7zM8 6.5v3.2M8 11.8v.2',
  retry: 'M12.5 8a4.5 4.5 0 11-1.4-3.2M12.8 2.5v2.800H10',
  check: 'M3 8.5l3.2 3L13 4.500',
  pending: 'M8 6.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  info: 'M8 2a6 6 0 100 12A6 6 0 008 2zM8 7.3v3.6M8 5v.2',
  settings: 'M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.100V4.900zM8 6a2 2 0 100 4 2 2 0 000-4z',
  folder: 'M2 4.5h4l1.2 1.5H14v6.5H2z',
  minimize: 'M3.5 8h9',
  maximize: 'M3.5 3.5h9v9h-9z',
  close: 'M4 4l8 8M12 4l-8 8',
} as const;

export type IconName = keyof typeof PATHS;

/** Icons that are filled shapes, not outlines. */
const SOLID: ReadonlySet<IconName> = new Set<IconName>(['play']);

/** A decorative icon. The text next to it carries the meaning. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className={SOLID.has(name) ? 'ico solid' : 'ico'}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
