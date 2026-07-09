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

import {
  type InactiveReason,
  type RepeatedWordsFinding,
  type ResolvedFinding,
} from '../checks.types';
import { buildVerseWindow } from '../highlight/verse-window';

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
  /**
   * As-checked verse text keyed by `snt_id` (the hydrated snapshot captured by
   * `useRepeatedWordsCheck` — the exact text the finding's offsets are relative
   * to, NOT the live drafting text). Used to render the verse window around
   * the repeated word; a missing entry falls back to `finding.surf`.
   */
  verseTextBySntId: ReadonlyMap<string, string>;
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

interface VerseContextProps {
  /** The raw wire finding (offsets are relative to the snapshot text). */
  finding: RepeatedWordsFinding;
  /** As-checked `snt_id → verseText` snapshot (see FindingRowProps). */
  verseTextBySntId: ReadonlyMap<string, string>;
  /** Active rows flag the word in red + bold; dimmed rows use bold alone. */
  isActive?: boolean;
}

/**
 * The verse-context snippet shared by BOTH the active and the inactive row
 * branches: the verse text windowed around the match (Task 1's
 * `buildVerseWindow`), with the repeated word emphasized in place.
 *
 * - Highlights `w.match` — the actual slice of the verse text — NOT
 *   `finding.surf` (the util is surf-agnostic; `surf` contributes only its
 *   length, so casing/whitespace always render as they appear in the verse).
 * - Active rows: `text-red-600 font-semibold` (red flags "this is the flagged
 *   repeated word"). Dimmed/ignored rows: `font-semibold` only — ignored means
 *   "designated not a problem", so the alarm-red is deliberately dropped.
 *   NOTE: the dimmed card's `opacity-50` wrapper creates a stacking context
 *   descendants cannot escape (a child `opacity-100`/near-black is still
 *   washed to 50%), so bold — not color — is the reliable distinguisher there.
 * - A leading/trailing `…` renders only for a real (non-boundary) cut; the
 *   spaces around the `…` are purely presentational (Task 1 already strips
 *   boundary whitespace from `before`/`after`).
 */
const VerseContext: React.FC<VerseContextProps> = ({
  finding,
  verseTextBySntId,
  isActive = false,
}) => {
  const verseText = verseTextBySntId.get(finding.snt_id);

  // Fallback: no snapshot text for this snt_id (should be rare — findings and
  // their verse text are hydrated together, so a miss signals a malformed or
  // absent snapshot rather than a routine race). Render the bare surface text
  // exactly as before this feature: never crash, never render an empty card.
  if (verseText === undefined) {
    return <p className='text-sm'>{finding.surf}</p>;
  }

  const w = buildVerseWindow(verseText, finding.start_position, finding.surf.length);
  const highlightClass = isActive ? 'text-red-600 font-semibold' : 'font-semibold';

  return (
    <p className='text-sm'>
      {w.truncatedStart && '… '}
      {w.before}
      {/* highlight w.match — the actual verse slice — NOT finding.surf */}
      <span className={highlightClass} data-testid='verse-highlight'>
        {w.match}
      </span>
      {w.after}
      {w.truncatedEnd && ' …'}
    </p>
  );
};

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
  verseTextBySntId,
  globalIgnoresAvailable,
  onIgnoreHere,
  onIgnoreEverywhere,
  onUndo,
  onStopIgnoringEverywhere,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { finding, isActive, inactiveReason, occurrenceKey } = resolved;

  if (isActive) {
    return (
      <div className='py-2' data-testid='finding-row'>
        <VerseContext isActive finding={finding} verseTextBySntId={verseTextBySntId} />
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
      <VerseContext finding={finding} verseTextBySntId={verseTextBySntId} />
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
