import { type ComponentProps } from 'react';

import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type Slider } from '@/components/ui/slider';

import { buildSpans } from '../lib/barGeometry';

import { ScrubBar } from './ScrubBar';

let slider: ComponentProps<typeof Slider>;
vi.mock('@/components/ui/slider', () => ({
  Slider: (props: ComponentProps<typeof Slider>) => {
    slider = props;
    return <div />;
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_: string, text: string) => text }),
}));

describe('ScrubBar — Radix release contract', () => {
  it('previews every move but starts audio only once when Radix reports the release', () => {
    const onSeek = vi.fn();
    render(
      <ScrubBar
        position={0}
        spans={buildSpans([{ text: 'one' }, { text: 'two' }])}
        verseRefs={['1', '2']}
        onSeek={onSeek}
      />
    );
    act(() => slider.onValueChange?.([0.25]));
    act(() => slider.onValueChange?.([0.5]));
    act(() => slider.onValueChange?.([0.75]));
    expect(onSeek).not.toHaveBeenCalled();
    act(() => slider.onValueCommit?.([0.75]));
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(1, 0.5);
  });
});
