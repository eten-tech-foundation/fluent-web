/**
 * `TtsBoundaryPrompt` — the end-of-page prompt (T16, §5.3).
 *
 * T16: reaching the end of the current page PAUSES and asks; it never carries
 * the reader onward on its own. This component therefore imports no router
 * and holds no navigation of its own — the only way anything moves is the
 * host's `onContinue`, reachable exclusively from the confirm button. Closing
 * by Escape, the overlay, or Not now returns to idle (§5.2: no stale state).
 *
 * Feature-agnostic (T3): "page" is whatever the host says it is — a chapter
 * today, a pericope if paging changes later — so the label is passed in
 * rather than computed here.
 */

import React from 'react';

import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface TtsBoundaryPromptProps {
  open: boolean;
  /**
   * Human-readable name of the page that would be opened, e.g. "Genesis 2".
   * The host only supplies this when a next page provably exists, which is
   * why the prompt has no "nothing follows" state to render.
   */
  nextPageLabel: string;
  /** Confirmed: the host may navigate. The ONLY path onward (T16). */
  onContinue: () => void;
  /** Declined or dismissed: stay put, return to idle. Never navigates. */
  onDismiss: () => void;
  /** True while the host is flushing pending work before it navigates. */
  isContinuing?: boolean;
}

export const TtsBoundaryPrompt: React.FC<TtsBoundaryPromptProps> = ({
  open,
  nextPageLabel,
  onContinue,
  onDismiss,
  isContinuing = false,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={isOpen => {
        // Escape / overlay / close button all mean "stay here" (T16).
        if (!isOpen && !isContinuing) onDismiss();
      }}
    >
      <DialogContent className='sm:max-w-md' data-testid='tts-boundary-prompt'>
        <DialogHeader>
          <DialogTitle>{t('ttsContinueNextPageTitle', 'Continue on the next page?')}</DialogTitle>
          <DialogDescription>
            {t(
              'ttsContinueNextPageBody',
              'Playback reached the end of this page. Continue with {{nextPageLabel}}?',
              { nextPageLabel }
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            data-testid='tts-boundary-dismiss'
            disabled={isContinuing}
            variant='outline'
            onClick={onDismiss}
          >
            {t('ttsContinueNextPageDecline', 'Not now')}
          </Button>
          <Button data-testid='tts-boundary-continue' disabled={isContinuing} onClick={onContinue}>
            {isContinuing && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('ttsContinueNextPageConfirm', 'Continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
