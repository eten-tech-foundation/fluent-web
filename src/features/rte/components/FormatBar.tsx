import {
  AlignLeft,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  IndentDecrease,
  IndentIncrease,
  Pilcrow,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, type ButtonProps } from '@/components/ui/button';

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

const KINDS: Array<{ kind: BlockKind; labelKey: string; fallback: string; icon: LucideIcon }> = [
  { kind: 'paragraph', labelKey: 'blockParagraph', fallback: 'Paragraph', icon: Pilcrow },
  { kind: 'heading', labelKey: 'blockSectionHeading', fallback: 'Section Heading', icon: Heading },
  { kind: 'poetry', labelKey: 'blockPoetryLine', fallback: 'Poetry Line', icon: AlignLeft },
];

const HEADING_ICONS = { 1: Heading1, 2: Heading2, 3: Heading3, 4: Heading4 };

/** Disabled buttons ignore pointer events, so their wrapper owns the hover tooltip. */
function FormatButton({ title, ...props }: ButtonProps & { title: string }) {
  return (
    <span
      className={props.disabled ? 'inline-flex cursor-not-allowed' : 'inline-flex'}
      title={title}
    >
      <Button {...props} title={title} />
    </span>
  );
}

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
      className='ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2'
      role='toolbar'
    >
      <div className='flex items-center gap-1'>
        {KINDS.map(option => {
          const unavailable = UNAVAILABLE_KINDS.has(option.kind);
          const Icon = option.icon;
          const label = t(option.labelKey, option.fallback);
          const tooltip = unavailable
            ? t('blockSectionHeadingUnavailable', 'Section headings are not available yet')
            : label;
          return (
            <FormatButton
              key={option.kind}
              aria-label={label}
              aria-pressed={kind === option.kind}
              className={`h-7 w-7 rounded-md p-0 transition-colors ${
                unavailable ? 'cursor-not-allowed' : 'cursor-pointer'
              } ${
                kind === option.kind
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-hover bg-transparent'
              }`}
              disabled={unavailable}
              title={tooltip}
              onClick={() => onFormat(markerFor(option.kind, level))}
            >
              <Icon aria-hidden='true' className='h-4 w-4' />
            </FormatButton>
          );
        })}
      </div>

      {kind === 'other' && (
        <span className='text-muted-foreground pl-2 text-xs' data-testid='other-block'>
          {t('blockOther', 'Other')}
        </span>
      )}

      {kind === 'heading' && (
        <div className='flex flex-wrap items-center justify-end gap-1' data-testid='heading-levels'>
          {HEADING_LEVELS.map(headingLevel => {
            const Icon = HEADING_ICONS[headingLevel];
            const label = `${t('headingLevel', 'Level')} ${headingLevel}`;
            return (
              <FormatButton
                key={headingLevel}
                aria-label={label}
                aria-pressed={level === headingLevel}
                className={`h-7 w-7 cursor-pointer rounded-md p-0 text-xs font-semibold transition-colors ${
                  level === headingLevel
                    ? 'bg-primary text-white'
                    : 'text-muted-foreground hover:bg-hover bg-transparent'
                }`}
                title={label}
                onClick={() => onFormat(markerFor('heading', headingLevel))}
              >
                <Icon aria-hidden='true' className='h-4 w-4' />
              </FormatButton>
            );
          })}
        </div>
      )}

      {kind === 'poetry' && (
        <div className='flex items-center gap-1' data-testid='poetry-indent'>
          <FormatButton
            aria-label={t('decreaseIndent', 'Decrease indent')}
            className='text-muted-foreground hover:bg-hover h-7 w-7 cursor-pointer rounded-md bg-transparent p-0'
            disabled={!canOutdent}
            title={t('decreaseIndent', 'Decrease indent')}
            onClick={() => {
              const marker = outdentedMarker(blockMarker);
              if (marker) onFormat(marker);
            }}
          >
            <IndentDecrease aria-hidden='true' className='h-4 w-4' />
          </FormatButton>
          <FormatButton
            aria-label={t('increaseIndent', 'Increase indent')}
            className='text-muted-foreground hover:bg-hover h-7 w-7 cursor-pointer rounded-md bg-transparent p-0'
            disabled={!canIndent}
            title={t('increaseIndent', 'Increase indent')}
            onClick={() => {
              const marker = indentedMarker(blockMarker);
              if (marker) onFormat(marker);
            }}
          >
            <IndentIncrease aria-hidden='true' className='h-4 w-4' />
          </FormatButton>
        </div>
      )}
    </div>
  );
}
