import React from 'react';

import { useTranslation } from 'react-i18next';

import { useAppStore, type DisplayMode } from '@/store/store';

/**
 * The drafting views, in the order the toggle shows them (#396). Chapter is the entry point into
 * the continuous chapter surface; switching between any of them only changes how the same chapter
 * is presented, never its content.
 */
const DISPLAY_MODES: Array<{ mode: DisplayMode; labelKey: string; fallback: string }> = [
  { mode: 'verse', labelKey: 'verse', fallback: 'Verse' },
  { mode: 'pericope', labelKey: 'pericope', fallback: 'Pericope' },
  { mode: 'chapter', labelKey: 'chapter', fallback: 'Chapter' },
];

/**
 * The Display selector in the drafting settings menu.
 *
 * A radiogroup rather than three loose buttons: it is one choice among three, and a screen reader
 * should announce it as one control with a selected option.
 */
export const DisplayModeToggle: React.FC = () => {
  const { t } = useTranslation();
  const displayMode = useAppStore(state => state.displayMode);
  const setDisplayMode = useAppStore(state => state.setDisplayMode);
  const label = t('display', 'Display');

  return (
    <div className='border-primary bg-background flex w-full items-center justify-between rounded-[12px] border p-4 shadow-sm'>
      <span className='text-foreground text-sm font-semibold'>{label}</span>
      <div
        aria-label={label}
        className='border-primary bg-background flex h-9 items-center overflow-hidden rounded-full border'
        role='radiogroup'
      >
        {DISPLAY_MODES.map((option, index) => (
          <React.Fragment key={option.mode}>
            {index > 0 && <div className='bg-primary h-full w-px' />}
            <button
              aria-checked={displayMode === option.mode}
              className={`flex h-full items-center justify-center px-5 text-xs font-semibold transition-all hover:cursor-pointer ${
                displayMode === option.mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-primary hover:bg-primary/10 bg-background'
              }`}
              role='radio'
              type='button'
              onClick={() => setDisplayMode(option.mode)}
            >
              {t(option.labelKey, option.fallback)}
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
