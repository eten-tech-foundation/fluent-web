import { useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

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
 * Parse the verse number out of a `snt_id` (segment after the last `:`) for
 * sort ordering. For a verse range (e.g. `"JDG 4:4-5"`) the leading number
 * before the dash is used. A malformed `snt_id` (no colon / no leading digits)
 * yields `Number.POSITIVE_INFINITY` so it sorts to the end — preserving the
 * never-blank-heading guarantee (`verseHeading` still renders the raw id).
 */
const verseNum = (sntId: string): number => {
  const afterColon = sntId.slice(sntId.lastIndexOf(':') + 1).trim();
  const leadingDigits = /^\d+/.exec(afterColon)?.[0];
  return leadingDigits ? Number(leadingDigits) : Number.POSITIVE_INFINITY;
};

/**
 * Group one bucket of resolved findings by verse (`snt_id`), sorted by verse
 * number. Only verses that actually have rows produce a group (§5.1, §6.4).
 * Active and inactive findings are grouped **separately** now (revised #278
 * mock): active findings render above the "Show Ignored" toggle, ignored
 * findings in their own dedicated section below it — so each call groups a
 * single, already-filtered bucket rather than merging the two.
 */
const groupByVerse = (findings: ResolvedFinding[]): VerseGroup[] => {
  const order: string[] = [];
  const byVerse = new Map<string, ResolvedFinding[]>();

  for (const f of findings) {
    const sntId = f.finding.snt_id;
    let rows = byVerse.get(sntId);
    if (!rows) {
      rows = [];
      byVerse.set(sntId, rows);
      order.push(sntId);
    }
    rows.push(f);
  }

  return order
    .map(sntId => ({
      sntId,
      heading: verseHeading(sntId),
      rows: byVerse.get(sntId) ?? [],
    }))
    .sort((a, b) => verseNum(a.sntId) - verseNum(b.sntId));
};

/** Render a list of verse groups with separators between (one fewer than groups). */
const renderGroups = (
  groups: VerseGroup[],
  globalIgnoresAvailable: boolean,
  handlers: Pick<
    ChecksPanelProps,
    'onIgnoreHere' | 'onIgnoreEverywhere' | 'onUndo' | 'onStopIgnoringEverywhere'
  >
) =>
  groups.map((group, index) => (
    <div key={group.sntId}>
      {index > 0 && <Separator className='my-2' />}
      <h4 className='text-sm font-bold'>{group.heading}</h4>
      {group.rows.map(row => (
        <FindingRow
          key={row.occurrenceKey}
          globalIgnoresAvailable={globalIgnoresAvailable}
          resolved={row}
          onIgnoreEverywhere={handlers.onIgnoreEverywhere}
          onIgnoreHere={handlers.onIgnoreHere}
          onStopIgnoringEverywhere={handlers.onStopIgnoringEverywhere}
          onUndo={handlers.onUndo}
        />
      ))}
    </div>
  ));

/**
 * The Checks-tab body (§5.1, §6.4–§6.6).
 *
 * A per-check accordion (only "Repeated Words" is wired; the structure
 * anticipates sibling checks) containing the active verse-grouped findings, a
 * "Show Ignored" toggle, and — when toggled on — a dedicated **ignored** section
 * *below* the toggle (revised #278 mock layout: ignored occurrences appear below
 * the active flags, visually distinct/dimmed). Also a zero state and an inline
 * error line. Purely presentational — it receives the cascade-resolved buckets
 * and the suppression callbacks; it owns neither the check query nor the
 * suppression hook (Phase 4 composes them), and only the session-local "Show
 * Ignored" toggle is local state (deliberately **not** persisted, per #278).
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
  const handlers = { onIgnoreHere, onIgnoreEverywhere, onUndo, onStopIgnoringEverywhere };
  const activeGroups = groupByVerse(active);
  const ignoredGroups = groupByVerse(inactive);
  const hasIgnored = inactive.length > 0;
  const showingIgnored = showIgnored && hasIgnored;
  // The zero state must never show on error (§9.2 — an error line over an empty
  // section instead) and only when there is genuinely nothing to display: no
  // active findings AND nothing currently revealed by the "Show Ignored" toggle.
  const showZeroState = !isError && activeGroups.length === 0 && !showingIgnored;

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
                <div>{renderGroups(activeGroups, globalIgnoresAvailable, handlers)}</div>
              )}

              {hasIgnored && (
                <div className='mt-3 flex items-center gap-2 border-t pt-3'>
                  <Switch
                    checked={showIgnored}
                    id='checks-show-ignored'
                    onCheckedChange={setShowIgnored}
                  />
                  <Label className='text-sm font-normal' htmlFor='checks-show-ignored'>
                    Show Ignored
                  </Label>
                </div>
              )}

              {showingIgnored && (
                <div className='mt-3' data-testid='ignored-section'>
                  {renderGroups(ignoredGroups, globalIgnoresAvailable, handlers)}
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
