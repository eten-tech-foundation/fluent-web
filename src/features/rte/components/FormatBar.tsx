import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import {
  blockKindOf,
  HEADING_LEVELS,
  indentedMarker,
  levelOf,
  markerFor,
  outdentedMarker,
  type BlockKind,
} from '../lib/block-types';

export interface FormatBarProps {
  /** The block the cursor sits in, as the editor reports it. */
  blockMarker: string | undefined;
  onFormat: (marker: string) => void;
}

const KINDS: Array<{ kind: BlockKind; labelKey: string; fallback: string }> = [
  { kind: 'paragraph', labelKey: 'blockParagraph', fallback: 'Paragraph' },
  { kind: 'heading', labelKey: 'blockSectionHeading', fallback: 'Section Heading' },
  { kind: 'poetry', labelKey: 'blockPoetryLine', fallback: 'Poetry Line' },
];

/**
 * Kinds the bar shows but will not apply. Section Heading is off until the API can store one
 * (#432): a heading is a paragraph carrying its own words, while a verse row holds one verse's
 * text, so applying it here puts the verse *inside* the heading and exports invalid USFM.
 *
 * It stays in the bar rather than being removed, because the bar's job is to report the block the
 * cursor is in. Drop the button and an existing heading would show three unpressed buttons, which
 * reads as "no formatting here" — the same lie the "Other" badge exists to prevent.
 */
const UNAVAILABLE_KINDS: ReadonlySet<BlockKind> = new Set<BlockKind>(['heading']);

/**
 * The chapter view's structural authoring control (#397): always visible, always reflecting the
 * block the cursor is in.
 *
 * The level control and the indent controls are contextual by design — heading levels only mean
 * something inside a heading, and indenting only means something inside poetry — so they appear
 * with their block rather than sitting there disabled.
 *
 * A block the bar cannot author — an imported `\ms`, or poetry indented deeper than it writes —
 * says so, because three unpressed buttons on their own read as "this block has no formatting".
 * The marker is left as it came until the translator picks one of the three.
 */
export function FormatBar({ blockMarker, onFormat }: FormatBarProps) {
  const { t } = useTranslation();
  const kind = blockKindOf(blockMarker);
  const level = levelOf(blockMarker) ?? 1;
  const canIndent = indentedMarker(blockMarker) !== undefined;
  const canOutdent = outdentedMarker(blockMarker) !== undefined;

  return (
    <div
      aria-label={t('formatBar', 'Formatting')}
      className='border-border bg-background sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b px-6 py-2'
      role='toolbar'
    >
      <div className='flex items-center gap-1'>
        {KINDS.map(option => {
          const unavailable = UNAVAILABLE_KINDS.has(option.kind);
          return (
            <Button
              key={option.kind}
              aria-pressed={kind === option.kind}
              className={`h-7 rounded-md px-3 text-xs font-semibold transition-colors ${
                unavailable ? 'cursor-not-allowed' : 'cursor-pointer'
              } ${
                kind === option.kind
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-hover bg-transparent'
              }`}
              disabled={unavailable}
              title={
                unavailable
                  ? t('blockSectionHeadingUnavailable', 'Section headings are not available yet')
                  : undefined
              }
              onClick={() => onFormat(markerFor(option.kind, level))}
            >
              {t(option.labelKey, option.fallback)}
            </Button>
          );
        })}
      </div>

      {kind === 'other' && (
        <span className='text-muted-foreground pl-2 text-xs' data-testid='other-block'>
          {t('blockOther', 'Other')}
        </span>
      )}

      {kind === 'heading' && (
        <div className='flex items-center gap-1 pl-2' data-testid='heading-levels'>
          <span className='text-muted-foreground text-xs'>{t('headingLevel', 'Level')}</span>
          {HEADING_LEVELS.map(headingLevel => (
            <Button
              key={headingLevel}
              aria-pressed={level === headingLevel}
              className={`h-7 w-7 cursor-pointer rounded-md p-0 text-xs font-semibold transition-colors ${
                level === headingLevel
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-hover bg-transparent'
              }`}
              onClick={() => onFormat(markerFor('heading', headingLevel))}
            >
              {headingLevel}
            </Button>
          ))}
        </div>
      )}

      {kind === 'poetry' && (
        <div className='flex items-center gap-1 pl-2' data-testid='poetry-indent'>
          <Button
            aria-label={t('decreaseIndent', 'Decrease indent')}
            className='text-muted-foreground hover:bg-hover h-7 cursor-pointer rounded-md bg-transparent px-2 text-xs font-semibold'
            disabled={!canOutdent}
            onClick={() => {
              const marker = outdentedMarker(blockMarker);
              if (marker) onFormat(marker);
            }}
          >
            ⇤
          </Button>
          <Button
            aria-label={t('increaseIndent', 'Increase indent')}
            className='text-muted-foreground hover:bg-hover h-7 cursor-pointer rounded-md bg-transparent px-2 text-xs font-semibold'
            disabled={!canIndent}
            onClick={() => {
              const marker = indentedMarker(blockMarker);
              if (marker) onFormat(marker);
            }}
          >
            ⇥
          </Button>
        </div>
      )}
    </div>
  );
}
