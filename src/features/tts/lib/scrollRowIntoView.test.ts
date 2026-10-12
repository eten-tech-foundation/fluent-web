import { describe, expect, it, vi } from 'vitest';

import {
  isRowFullyVisible,
  scrollRowIntoViewIfNeeded,
  type ScrollableRow,
  type ScrollViewport,
} from './scrollRowIntoView';

/**
 * jsdom reports every rect as 0x0, so real layout cannot be observed here.
 * These fakes inject the geometry directly — the module was written against
 * narrow interfaces precisely so the arithmetic stays testable.
 */
const makeRow = (top: number, bottom: number) => {
  const scrollIntoView = vi.fn();
  const focus = vi.fn();
  const row: ScrollableRow & { focus: () => void } = {
    getBoundingClientRect: () => ({ top, bottom }),
    scrollIntoView,
    focus,
  };
  return { row, scrollIntoView, focus };
};

const viewport = (top: number, bottom: number): ScrollViewport => ({
  getBoundingClientRect: () => ({ top, bottom }),
});

describe('isRowFullyVisible', () => {
  const view = viewport(100, 500);

  it('is true for a row wholly inside the viewport', () => {
    expect(isRowFullyVisible(makeRow(200, 260).row, view)).toBe(true);
  });

  it('is true for a row flush with the viewport edges', () => {
    expect(isRowFullyVisible(makeRow(100, 500).row, view)).toBe(true);
  });

  it('is false for a row clipped at the top', () => {
    expect(isRowFullyVisible(makeRow(60, 160).row, view)).toBe(false);
  });

  it('is false for a row clipped at the bottom', () => {
    // Partially visible still is not followable while listening.
    expect(isRowFullyVisible(makeRow(450, 560).row, view)).toBe(false);
  });
});

describe('scrollRowIntoViewIfNeeded', () => {
  it('does not scroll a row that is already fully visible (§5.3 step 2)', () => {
    const { row, scrollIntoView } = makeRow(200, 260);

    expect(scrollRowIntoViewIfNeeded(row, viewport(100, 500))).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls a row that is off-screen, nudging it to the nearest edge', () => {
    const { row, scrollIntoView } = makeRow(900, 960);

    expect(scrollRowIntoViewIfNeeded(row, viewport(100, 500))).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  });

  it('never steals focus from the target editor', () => {
    const { row, focus } = makeRow(900, 960);

    scrollRowIntoViewIfNeeded(row, viewport(100, 500));

    expect(focus).not.toHaveBeenCalled();
  });

  it('does nothing when the viewport is unknown, rather than scrolling blindly', () => {
    const { row, scrollIntoView } = makeRow(900, 960);

    expect(scrollRowIntoViewIfNeeded(row, null)).toBe(false);
    expect(scrollRowIntoViewIfNeeded(row, undefined)).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does nothing when the row is not mounted', () => {
    expect(scrollRowIntoViewIfNeeded(null, viewport(100, 500))).toBe(false);
    expect(scrollRowIntoViewIfNeeded(undefined, viewport(100, 500))).toBe(false);
  });

  it('survives an environment without scrollIntoView', () => {
    const row: ScrollableRow = { getBoundingClientRect: () => ({ top: 900, bottom: 960 }) };

    expect(() => scrollRowIntoViewIfNeeded(row, viewport(100, 500))).not.toThrow();
  });
});
