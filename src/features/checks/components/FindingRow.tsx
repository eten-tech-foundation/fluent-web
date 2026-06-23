import { useState } from 'react';

import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { type InactiveReason, type ResolvedFinding } from '../checks.types';

/**
 * Human-readable ignore-type label for an inactive finding (§6.4, revised #278).
 *
 * Note the deliberate label mismatch: the **active** button is "Ignore
 * Everywhere", but a finding inactivated by a global rule shows "Ignore Always"
 * — that is the term the #278 mock uses for the inactive label. Don't unify the
 * two (conventions §G / phase-03 gotchas).
 */
const INACTIVE_LABEL: Record<InactiveReason, string> = {
  occurrence: 'Ignore Here',
  global: 'Ignore Always',
  legitimate: 'Default Ignore',
};

export interface FindingRowProps {
  /** The cascade-resolved finding to render. */
  resolved: ResolvedFinding;
  /** Hide the global "Ignore Everywhere" affordance when the backend half is
   *  absent (feature detection, W8). */
  globalIgnoresAvailable: boolean;
  /** Active: suppress just this occurrence ("Ignore Here"). */
  onIgnoreHere: (occurrenceKey: string) => void;
  /** Active: suppress this word pair globally — called **only after** the user
   *  confirms the dialog (S7). */
  onIgnoreEverywhere: (repeatedWord: string) => void;
  /** Inactive `[Undo ▾]` default click: reverse at the occurrence layer. */
  onUndo: (resolved: ResolvedFinding) => void;
  /** Inactive `[Undo ▾]` chevron: deliberately stop ignoring this pair
   *  everywhere (only offered when `globalIgnoresAvailable`). */
  onStopIgnoringEverywhere: (repeatedWord: string) => void;
}

/**
 * One repeated-word finding row (§5.1, §6.4–§6.5).
 *
 * - **Active** findings show the context snippet plus two solid-blue buttons,
 *   `[Ignore Here]` and (when available) `[Ignore Everywhere]`. The latter opens
 *   a confirm dialog (S7) and only fires `onIgnoreEverywhere` on confirm, while
 *   the resulting inactive row stays reversible via `[Undo ▾]` — the two are
 *   complementary (confirm guards the click; undo guards the mistake).
 * - **Inactive** findings render greyed/dimmed with their ignore-type label and
 *   one `[Undo ▾]` split button: the main button reverses at the occurrence
 *   layer; the chevron offers the deliberate global "stop ignoring everywhere".
 *
 * Presentational only: it owns the confirm-dialog open state (local to the row)
 * but never the suppression hook or the check query.
 */
export const FindingRow: React.FC<FindingRowProps> = ({
  resolved,
  globalIgnoresAvailable,
  onIgnoreHere,
  onIgnoreEverywhere,
  onUndo,
  onStopIgnoringEverywhere,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { finding, isActive, inactiveReason, occurrenceKey } = resolved;
  // Display the original surface text (preserves casing); never compare on it —
  // all matching already happened in the cascade (conventions §C).
  const snippet = finding.surf;

  if (isActive) {
    return (
      <div className='py-2' data-testid='finding-row'>
        <p className='text-sm'>{snippet}</p>
        <div className='mt-2 flex flex-wrap gap-2'>
          <Button size='sm' type='button' onClick={() => onIgnoreHere(occurrenceKey)}>
            Ignore Here
          </Button>
          {globalIgnoresAvailable && (
            <Button size='sm' type='button' onClick={() => setConfirmOpen(true)}>
              Ignore Everywhere
            </Button>
          )}
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ignore everywhere?</DialogTitle>
              <DialogDescription>
                Fluent will not flag this word pair again across all your projects. Are you sure?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                type='button'
                onClick={() => {
                  setConfirmOpen(false);
                  onIgnoreEverywhere(finding.repeated_word);
                }}
              >
                Ignore Everywhere
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Inactive — greyed, ignore-type label, [Undo ▾] split button.
  const label = inactiveReason ? INACTIVE_LABEL[inactiveReason] : 'Ignored';

  return (
    <div className='py-2 opacity-50' data-testid='finding-row'>
      <p className='text-sm'>{snippet}</p>
      <div className='mt-2 flex flex-wrap items-center justify-between gap-2'>
        <span className='text-muted-foreground text-xs font-medium' data-testid='inactive-label'>
          {label}
        </span>
        <div className='flex'>
          <Button
            className={cn(globalIgnoresAvailable && 'rounded-r-none')}
            size='sm'
            type='button'
            variant='outline'
            onClick={() => onUndo(resolved)}
          >
            Undo Ignore
          </Button>
          {globalIgnoresAvailable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label='More undo options'
                  className='rounded-l-none border-l-0 px-2'
                  size='sm'
                  type='button'
                  variant='outline'
                >
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onClick={() => onStopIgnoringEverywhere(finding.repeated_word)}>
                  Stop ignoring “{finding.repeated_word}” everywhere
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
};

export default FindingRow;
