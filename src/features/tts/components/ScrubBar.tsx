import { useEffect, useRef, useState } from 'react';

import { useTranslation } from 'react-i18next';

import { Slider } from '@/components/ui/slider';

import { type BarSpan, segmentAt } from '../lib/barGeometry';

export interface ScrubBarProps {
  spans: readonly BarSpan[];
  verseRefs: readonly string[];
  position: number;
  disabled?: boolean;
  onSeek: (index: number, fraction: number) => void;
}

const seekKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

/** Pointer movement previews only. One release commits one seek; keys step by verse. */
export function ScrubBar({ spans, verseRefs, position, disabled = false, onSeek }: ScrubBarProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<number | null>(null);
  const keyboardDraft = useRef<number | null>(null);
  const inert = disabled || spans.length === 0;
  const value = draft ?? position;
  const selected = segmentAt(spans, value);
  useEffect(() => {
    if (inert) {
      setDraft(null);
      keyboardDraft.current = null;
    }
  }, [inert]);
  const commit = (values: number[]) => {
    const target = segmentAt(spans, values[0]);
    setDraft(null);
    keyboardDraft.current = null;
    if (!inert) onSeek(target.index, target.fraction);
  };
  return (
    <Slider
      className={
        draft === null
          ? '[&>span:has([role=slider])]:transition-[left,right] [&>span:has([role=slider])]:duration-150 motion-reduce:[&>span:has([role=slider])]:transition-none'
          : undefined
      }
      disabled={inert}
      max={1}
      min={0}
      step={0.0001}
      thumbProps={{
        'aria-label': t('ttsSeekAudio', 'Seek audio'),
        'aria-valuetext': verseRefs[selected.index] ?? '',
      }}
      trackChildren={spans.slice(1).map((span, index) => (
        <span
          key={index}
          aria-hidden='true'
          className='bg-background pointer-events-none absolute -top-0.5 h-2 w-px'
          data-testid='audio-segment-boundary'
          style={{ left: `${span.start * 100}%` }}
        />
      ))}
      value={[value]}
      onBlur={() => {
        setDraft(null);
        keyboardDraft.current = null;
      }}
      onKeyDown={event => {
        if (!seekKeys.has(event.key)) return;
        // Radix normally commits every keydown. This bar commits on release instead.
        event.preventDefault();
        if (inert) return;
        const current = segmentAt(spans, keyboardDraft.current ?? value).index;
        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? spans.length - 1
              : Math.max(
                  0,
                  Math.min(
                    spans.length - 1,
                    current + (event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1)
                  )
                );
        const next = spans[nextIndex].start;
        keyboardDraft.current = next;
        setDraft(next);
      }}
      onKeyUp={event => {
        if (!seekKeys.has(event.key) || keyboardDraft.current === null) return;
        event.preventDefault();
        commit([keyboardDraft.current]);
      }}
      onPointerCancel={() => {
        setDraft(null);
        keyboardDraft.current = null;
      }}
      onValueChange={values => {
        if (!inert) setDraft(values[0]);
      }}
      onValueCommit={commit}
    />
  );
}
