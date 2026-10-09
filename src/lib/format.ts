// Small text helpers. Hand written: the launcher shows three kinds of numbers
// and two kinds of dates, which does not justify a formatting library.

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A byte count as megabytes with one decimal: `18.0 MB`. */
export function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Progress as `11.2 of 18.0 MB`. */
export function megabytesOf(received: number, total: number): string {
  return `${(received / (1024 * 1024)).toFixed(1)} of ${megabytes(total)}`;
}

/** A whole percentage from 0 to 100, also when the total is unknown or zero. */
export function percent(received: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(received)) return 0;
  return Math.min(100, Math.max(0, Math.round((received / total) * 100)));
}

/** The parts of a `YYYY-MM-DD` date, or null when the text is something else. */
function dateParts(date: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** `2026-10-25` as `10.25`, the short form of the release list. */
export function shortDate(date: string): string {
  const parts = dateParts(date);
  if (!parts) return '';
  return `${String(parts.month).padStart(2, '0')}.${String(parts.day).padStart(2, '0')}`;
}

/** `2026-10-25` as `Oct 25, 2026`. Text that is not a date is returned as it is. */
export function longDate(date: string): string {
  const parts = dateParts(date);
  if (!parts) return date;
  return `${MONTHS[parts.month - 1]?.slice(0, 3)} ${parts.day}, ${parts.year}`;
}

/** A day as `9 October 2026`, the form of the ledger's header. */
export function ledgerDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
