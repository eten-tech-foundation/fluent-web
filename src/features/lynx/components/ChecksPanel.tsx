import { useState } from 'react';

import { DiagnosticSeverity } from '@sillsdev/lynx';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';

import type { AnnotatedDiagnostic } from '../hooks/useLynxDocument';

interface ChecksPanelProps {
  diagnostics: AnnotatedDiagnostic[];
  onApplyFix: (diagnostic: AnnotatedDiagnostic, fixIndex: number) => void;
  onDismiss: (key: string) => void;
  onUndismiss: (key: string) => void;
  onReveal: (diagnostic: AnnotatedDiagnostic) => void;
}

/** Human labels for the provider ids registered in the PoC workspace. */
const PROVIDER_LABELS: Record<string, string> = {
  'quotation-mark-checker': 'Quotation marks',
  'allowed-character-set-checker': 'Allowed characters',
  'paired-punctuation-checker': 'Paired punctuation',
  'punctuation-context-checker': 'Punctuation context',
  'verse-order': 'Verse order',
};

const SEVERITY_DOT: Record<number, string> = {
  [DiagnosticSeverity.Error]: 'bg-red-500',
  [DiagnosticSeverity.Warning]: 'bg-amber-500',
  [DiagnosticSeverity.Information]: 'bg-sky-500',
  [DiagnosticSeverity.Hint]: 'bg-sky-400',
};

function DiagnosticRow({
  item,
  onApplyFix,
  onDismiss,
  onUndismiss,
  onReveal,
}: {
  item: AnnotatedDiagnostic;
  onApplyFix: ChecksPanelProps['onApplyFix'];
  onDismiss: ChecksPanelProps['onDismiss'];
  onUndismiss: ChecksPanelProps['onUndismiss'];
  onReveal: ChecksPanelProps['onReveal'];
}) {
  return (
    <div className={`space-y-1.5 py-2 ${item.dismissed ? 'opacity-50' : ''}`}>
      <button
        className='flex w-full cursor-pointer items-start gap-2 text-left'
        type='button'
        onClick={() => onReveal(item)}
      >
        <span
          aria-hidden='true'
          className={`mt-1.5 size-2 shrink-0 rounded-full ${SEVERITY_DOT[item.diagnostic.severity]}`}
        />
        <span className='text-sm leading-snug'>{item.diagnostic.message}</span>
      </button>
      <div className='flex flex-wrap items-center gap-2 pl-4'>
        {item.verseRef != null && (
          <Badge className='font-mono text-[10px]' variant='outline'>
            {item.verseRef}
          </Badge>
        )}
        {item.dismissed ? (
          <>
            <span className='text-muted-foreground text-xs italic'>Ignored</span>
            <Button size='sm' variant='ghost' onClick={() => onUndismiss(item.key)}>
              Undo ignore
            </Button>
          </>
        ) : (
          <>
            {item.fixes.map((fix, fixIndex) => (
              <Button
                key={fix.title}
                size='sm'
                variant='outline'
                onClick={() => onApplyFix(item, fixIndex)}
              >
                {fix.title}
              </Button>
            ))}
            <Button size='sm' variant='ghost' onClick={() => onDismiss(item.key)}>
              Ignore
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Deliberately echoes the Checks panel proposed for the Repeated Word Check
 * (docs/proposals/repeated-word-check): one accordion section per check,
 * verse-grouped rows, ignore + undo, "Show ignored", and a bold zero state —
 * here fed by Lynx providers instead of a bespoke per-check hook.
 */
export function ChecksPanel({
  diagnostics,
  onApplyFix,
  onDismiss,
  onUndismiss,
  onReveal,
}: ChecksPanelProps) {
  const [showIgnored, setShowIgnored] = useState(false);

  const sections = Object.entries(PROVIDER_LABELS).map(([source, label]) => {
    const all = diagnostics.filter(d => d.diagnostic.source === source);
    const active = all.filter(d => !d.dismissed);
    const visible = showIgnored ? all : active;
    return { source, label, active, visible };
  });

  const totalActive = sections.reduce((sum, s) => sum + s.active.length, 0);

  return (
    <div className='space-y-3'>
      <Accordion className='w-full' defaultValue={sections.map(s => s.source)} type='multiple'>
        {sections.map(section => (
          <AccordionItem key={section.source} value={section.source}>
            <AccordionTrigger className='py-3 text-sm font-semibold'>
              <span className='flex items-center gap-2'>
                {section.label}
                <Badge variant={section.active.length > 0 ? 'destructive' : 'secondary'}>
                  {section.active.length}
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {section.visible.length === 0 ? (
                <p className='text-muted-foreground py-2 text-center text-sm font-semibold'>
                  No issues found
                </p>
              ) : (
                section.visible.map((item, index) => (
                  <div key={item.key}>
                    {index > 0 && <Separator />}
                    <DiagnosticRow
                      item={item}
                      onApplyFix={onApplyFix}
                      onDismiss={onDismiss}
                      onReveal={onReveal}
                      onUndismiss={onUndismiss}
                    />
                  </div>
                ))
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <div className='flex items-center justify-between'>
        <label className='text-muted-foreground flex items-center gap-2 text-sm'>
          <Checkbox
            checked={showIgnored}
            onCheckedChange={checked => setShowIgnored(checked === true)}
          />
          Show ignored
        </label>
        <span className='text-muted-foreground text-xs'>
          {totalActive} active issue{totalActive === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}
