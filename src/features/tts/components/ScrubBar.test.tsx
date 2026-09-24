import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildSpans, segmentAt } from '../lib/barGeometry';

import { ScrubBar } from './ScrubBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_: string, text: string) => text }),
}));

const spans = buildSpans([{ text: 'a' }, { text: 'bbb' }, { text: 'cc' }]);

describe('ScrubBar', () => {
  it('maps fixed unequal spans to segment-local fractions', () => {
    expect(segmentAt(spans, 0.25)).toEqual({ index: 1, fraction: (0.25 - 1 / 6) / 0.5 });
    expect(segmentAt(spans, 1)).toEqual({ index: 2, fraction: 1 });
  });
  it('steps by verse with the keyboard and commits once on release, not on repeat or move', () => {
    const onSeek = vi.fn();
    render(<ScrubBar position={0} spans={spans} verseRefs={['1', '2', '3']} onSeek={onSeek} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onSeek).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute('aria-valuetext', '2');
    fireEvent.keyDown(slider, { key: 'ArrowRight', repeat: true });
    expect(onSeek).not.toHaveBeenCalled();
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(2, 0);
  });
  it('does not commit a cancelled keyboard gesture or any offline gesture', () => {
    const onSeek = vi.fn();
    const h = render(
      <ScrubBar position={0} spans={spans} verseRefs={['1', '2', '3']} onSeek={onSeek} />
    );
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.blur(slider);
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect(onSeek).not.toHaveBeenCalled();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    h.rerender(
      <ScrubBar disabled position={0} spans={spans} verseRefs={['1', '2', '3']} onSeek={onSeek} />
    );
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect(onSeek).not.toHaveBeenCalled();
  });
});
