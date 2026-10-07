import { describe, expect, it } from 'vitest';
import { longDate, megabytes, megabytesOf, percent, shortDate } from './format';

const MEGABYTE = 1024 * 1024;

describe('format', () => {
  it('writes sizes with one decimal', () => {
    expect(megabytes(18 * MEGABYTE)).toBe('18.0 MB');
    expect(megabytes(1_559_552)).toBe('1.5 MB');
    expect(megabytesOf(11.2 * MEGABYTE, 18 * MEGABYTE)).toBe('11.2 of 18.0 MB');
  });

  it('keeps a percentage between 0 and 100', () => {
    expect(percent(0, 100)).toBe(0);
    expect(percent(62, 100)).toBe(62);
    expect(percent(150, 100)).toBe(100);
    expect(percent(5, 0)).toBe(0);
    expect(percent(Number.NaN, 100)).toBe(0);
  });

  it('formats dates and leaves other text alone', () => {
    expect(shortDate('2026-10-25')).toBe('10.25');
    expect(longDate('2026-10-25')).toBe('Oct 25, 2026');
    expect(longDate('2026-01-05')).toBe('Jan 5, 2026');
    expect(shortDate('soon')).toBe('');
    expect(longDate('soon')).toBe('soon');
    expect(shortDate('2026-13-40')).toBe('');
  });
});
