import { useRef, type ReactNode } from 'react';

import {
  AlignLeft,
  CornerDownLeft,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import {
  blockKindOf,
  HEADING_LEVELS,
  indentedMarker,
  levelOf,
  markerFor,
  outdentedMarker,
  type BlockKind,
} from '../lib/block-types';
import { isHeadingMarker } from '../lib/heading-markers';

export interface FormatBarProps {
  /** The block the cursor sits in, as the editor reports it. */
  blockMarker: string | undefined;
  onFormat: (marker: string) => void;
  onInsertParagraph?: () => void;
  /** Puts the caret back in the text once a heading level is picked from the menu. */
  focusEditor?: () => void;
  canAddHeading: boolean;
  disabled?: boolean;
}

const KINDS: Array<{ kind: BlockKind; labelKey: string; fallback: string; icon: LucideIcon }> = [
  { kind: 'paragraph', labelKey: 'blockParagraph', fallback: 'Paragraph', icon: Pilcrow },
  { kind: 'heading', labelKey: 'blockSectionHeading', fallback: 'Section Heading', icon: Heading },
  { kind: 'poetry', labelKey: 'blockPoetryLine', fallback: 'Poetry Line', icon: AlignLeft },
];

const HEADING_ICONS = { 1: Heading1, 2: Heading2, 3: Heading3, 4: Heading4 };

const ICON_BUTTON =
  'text-muted-foreground hover:bg-hover h-7 w-7 cursor-pointer rounded-md bg-transparent p-0';

/**
 * A control whose tooltip is its name, enabled or not: a disabled icon is still the same control,
 * so its tooltip does not switch to explaining why it is off (#472 QA). Disabled buttons get no
 * pointer or focus events, so a focusable wrapper shows the name for them.
 */
function FormatButton({ label, ...props }: ButtonProps & { label: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {props.disabled ? (
            <span
              aria-label={label}
              className='focus-visible:ring-ring inline-flex cursor-not-allowed rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
              role='group'
              tabIndex={0}
            >
              <Button aria-label={label} {...props} />
            </span>
          ) : (
            <Button aria-label={label} {...props} />
          )}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * H inside a heading. The levels open from it as a menu instead of lining up in the bar, where
 * all four pushed into the language name (#472 QA). Picking one hands the caret back to the text;
 * Escape leaves focus on H, as any menu does.
 */
function HeadingLevelMenu({
  label,
  level,
  className,
  focusEditor,
  onPick,
  children,
}: {
  label: string;
  level: number;
  className: string;
  focusEditor?: () => void;
  onPick: (level: number) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const pickedRef = useRef(false);

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button aria-pressed aria-label={label} className={className}>
                {children}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent
        align='end'
        className='min-w-0'
        onCloseAutoFocus={event => {
          if (!pickedRef.current || !focusEditor) return;
          pickedRef.current = false;
          event.preventDefault();
          focusEditor();
        }}
      >
        <DropdownMenuRadioGroup
          value={String(level)}
          onValueChange={value => {
            pickedRef.current = true;
            onPick(Number(value));
          }}
        >
          {HEADING_LEVELS.map(headingLevel => {
            const Icon = HEADING_ICONS[headingLevel];
            return (
              <DropdownMenuRadioItem
                key={headingLevel}
                aria-label={`${t('headingLevel', 'Level')} ${headingLevel}`}
                className='data-[state=checked]:text-primary cursor-pointer font-semibold'
                value={String(headingLevel)}
              >
                <Icon aria-hidden='true' className='size-5 text-current' />
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The chapter view's structural authoring control (#397): always visible, always reflecting the
 * block the cursor is in.
 *
 * The level control and the indent controls are contextual by design — heading levels only mean
 * something inside a heading, and indenting only means something inside poetry — so they appear
 * with their block rather than sitting there disabled. Inside a heading the levels open from H,
 * which keeps the bar the same width as everywhere else.
 *
 * A block the bar cannot author — an imported `\ms`, or poetry indented deeper than it writes —
 * says so, because three unpressed buttons on their own read as "this block has no formatting".
 * The marker is left as it came until the translator picks one of the three.
 */
export function FormatBar({
  blockMarker,
  onFormat,
  onInsertParagraph,
  focusEditor,
  canAddHeading,
  disabled = false,
}: FormatBarProps) {
  const { t } = useTranslation();
  // With no cursor in the editor there is no block to format, so nothing reads as pressed and
  // every control is off, as Section Heading and Insert paragraph already were (#530 QA).
  const hasBlock = blockMarker !== undefined;
  const kind = hasBlock ? blockKindOf(blockMarker) : undefined;
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
          const insideHeading = isHeadingMarker(blockMarker);
          const unavailable =
            !hasBlock ||
            (option.kind === 'heading' ? !insideHeading && !canAddHeading : insideHeading);
          const Icon = option.icon;
          const label = t(option.labelKey, option.fallback);
          const className = `h-7 w-7 rounded-md p-0 transition-colors ${
            unavailable ? 'cursor-not-allowed' : 'cursor-pointer'
          } ${
            kind === option.kind
              ? 'bg-primary text-white'
              : 'text-muted-foreground hover:bg-hover bg-transparent'
          }`;
          if (option.kind === 'heading' && kind === 'heading' && !disabled) {
            return (
              <HeadingLevelMenu
                key={option.kind}
                className={className}
                focusEditor={focusEditor}
                label={label}
                level={level}
                onPick={headingLevel => onFormat(markerFor('heading', headingLevel))}
              >
                <Icon aria-hidden='true' className='h-4 w-4' />
              </HeadingLevelMenu>
            );
          }
          return (
            <FormatButton
              key={option.kind}
              aria-pressed={kind === option.kind}
              className={className}
              disabled={disabled || unavailable}
              label={label}
              onClick={() => onFormat(markerFor(option.kind, level))}
            >
              <Icon aria-hidden='true' className='h-4 w-4' />
            </FormatButton>
          );
        })}
      </div>

      {onInsertParagraph && (
        <FormatButton
          className={ICON_BUTTON}
          disabled={disabled || !hasBlock}
          label={t('insertParagraph', 'Insert paragraph')}
          onClick={onInsertParagraph}
          onMouseDown={event => event.preventDefault()}
        >
          <CornerDownLeft aria-hidden='true' className='h-4 w-4' />
        </FormatButton>
      )}

      {kind === 'other' && (
        <span className='text-muted-foreground pl-2 text-xs' data-testid='other-block'>
          {t('blockOther', 'Other')}
        </span>
      )}

      {kind === 'poetry' && (
        <div className='flex items-center gap-1' data-testid='poetry-indent'>
          <FormatButton
            className={ICON_BUTTON}
            disabled={disabled || !canOutdent}
            label={t('decreaseIndent', 'Decrease indent')}
            onClick={() => {
              const marker = outdentedMarker(blockMarker);
              if (marker) onFormat(marker);
            }}
          >
            <IndentDecrease aria-hidden='true' className='h-4 w-4' />
          </FormatButton>
          <FormatButton
            className={ICON_BUTTON}
            disabled={disabled || !canIndent}
            label={t('increaseIndent', 'Increase indent')}
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
