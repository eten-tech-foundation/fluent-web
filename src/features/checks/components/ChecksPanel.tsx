import { useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import { type ResolvedFinding, type ResolvedFindings } from '../checks.types';

import { FindingRow } from './FindingRow';

export interface ChecksPanelProps {
  /** Cascade output: `{ active[], inactive[] }` from `useResolvedFindings`. */
  resolved: ResolvedFindings;
  /** The check query errored — show the inline red line (W9). */
  isError: boolean;
  /** Hide the global "Ignore Everywhere" affordance when unavailable (W8). */
  globalIgnoresAvailable: boolean;
  /** Active: suppress this occurrence ("Ignore Here"). */
  onIgnoreHere: (occurrenceKey: string) => void;
  /** Active: suppress this word pair globally (called only after confirm, S7). */
  onIgnoreEverywhere: (repeatedWord: string) => void;
  /** Inactive `[Undo ▾]` default click. */
  onUndo: (resolved: ResolvedFinding) => void;
  /** Inactive `[Undo ▾]` chevron: stop ignoring this pair everywhere. */
  onStopIgnoringEverywhere: (repeatedWord: string) => void;
}

/**
 * Derive the "Verse N" group heading from a `snt_id` (`"{book} {ch}:{verse}"`,
 * e.g. `"JDG 4:3"` → "Verse 3"). Robust: take the segment after the last `:`;
 * if it isn't a number (malformed `snt_id`), fall back to the raw `snt_id` so
 * the heading is never blank.
 */
const verseHeading = (sntId: string): string => {
  const afterColon = sntId.includes(':') ? sntId.slice(sntId.lastIndexOf(':') + 1).trim() : '';
  return /^\d+$/.test(afterColon) ? `Verse ${afterColon}` : sntId;
};

interface VerseGroup {
  sntId: string;
  heading: string;
  rows: ResolvedFinding[];
}

/**
 * Group resolved findings by verse (`snt_id`), preserving first-seen verse order
 * and, within each verse, active findings before inactive ones. Only verses that
 * actually have rows to show produce a group (§5.1, §6.4).
 */
const groupByVerse = (
  active: ResolvedFinding[],
  inactive: ResolvedFinding[],
  showIgnored: boolean
): VerseGroup[] => {
  const order: string[] = [];
  const byVerse = new Map<string, { active: ResolvedFinding[]; inactive: ResolvedFinding[] }>();

  const bucket = (sntId: string) => {
    let entry = byVerse.get(sntId);
    if (!entry) {
      entry = { active: [], inactive: [] };
      byVerse.set(sntId, entry);
      order.push(sntId);
    }
    return entry;
  };

  for (const f of active) bucket(f.finding.snt_id).active.push(f);
  if (showIgnored) {
    for (const f of inactive) bucket(f.finding.snt_id).inactive.push(f);
  }

  return order
    .map(sntId => {
      const entry = byVerse.get(sntId) ?? { active: [], inactive: [] };
      return {
        sntId,
        heading: verseHeading(sntId),
        rows: [...entry.active, ...entry.inactive],
      };
    })
    .filter(group => group.rows.length > 0);
};

/**
 * The Checks-tab body (§5.1, §6.4–§6.6).
 *
 * A per-check accordion (only "Repeated Words" is wired; the structure
 * anticipates sibling checks) containing verse-grouped findings, a bottom
 * "Show Ignored" toggle, a zero state, and an inline error line. Purely
 * presentational — it receives the cascade-resolved buckets and the suppression
 * callbacks; it owns neither the check query nor the suppression hook (Phase 4
 * composes them), and only the session-local "Show Ignored" toggle is local
 * state (deliberately **not** persisted, per revised #278).
 */
export const ChecksPanel: React.FC<ChecksPanelProps> = ({
  resolved,
  isError,
  globalIgnoresAvailable,
  onIgnoreHere,
  onIgnoreEverywhere,
  onUndo,
  onStopIgnoringEverywhere,
}) => {
  const [showIgnored, setShowIgnored] = useState(false);

  const { active, inactive } = resolved;
  const groups = groupByVerse(active, inactive, showIgnored);
  // The zero state must never show on error (§9.2 — an error line over an empty
  // section instead) and only when there is genuinely nothing to display: no
  // active findings AND nothing currently revealed by the "Show Ignored" toggle.
  const showZeroState = !isError && groups.length === 0;
  const hasIgnored = inactive.length > 0;

  return (
    <div className='px-1 py-3'>
      {isError && (
        <p className='mb-2 text-sm text-red-500' role='alert'>
          Checks failed to refresh
        </p>
      )}

      <div className='rounded-lg border p-2'>
        <Accordion collapsible defaultValue='repeated-words' type='single'>
          <AccordionItem className='border-b-0' value='repeated-words'>
            <AccordionTrigger className='py-2 text-base'>Repeated Words</AccordionTrigger>
            <AccordionContent>
              {showZeroState ? (
                <p className='py-4 text-center text-sm font-bold'>No issues found</p>
              ) : (
                <div>
                  {groups.map((group, index) => (
                    <div key={group.sntId}>
                      {index > 0 && <Separator className='my-2' />}
                      <h4 className='text-sm font-bold'>{group.heading}</h4>
                      {group.rows.map(row => (
                        <FindingRow
                          key={row.occurrenceKey}
                          globalIgnoresAvailable={globalIgnoresAvailable}
                          resolved={row}
                          onIgnoreEverywhere={onIgnoreEverywhere}
                          onIgnoreHere={onIgnoreHere}
                          onStopIgnoringEverywhere={onStopIgnoringEverywhere}
                          onUndo={onUndo}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {hasIgnored && (
                <div className='mt-3 flex items-center gap-2 border-t pt-3'>
                  <Checkbox
                    checked={showIgnored}
                    id='checks-show-ignored'
                    onCheckedChange={value => setShowIgnored(value === true)}
                  />
                  <Label className='text-sm font-normal' htmlFor='checks-show-ignored'>
                    Show Ignored
                  </Label>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export default ChecksPanel;
