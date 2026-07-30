import { useEffect, useRef, useState } from 'react';

import { DiagnosticSeverity } from '@sillsdev/lynx';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useLynxDocument } from '../hooks/useLynxDocument';
import { fetchChapterVerses } from '../lib/chapter-source';
import { SAMPLE_USFM } from '../lib/sample-usfm';
import { buildUsfmFromVerses } from '../lib/usfm-assembly';

import { ChecksPanel } from './ChecksPanel';
import { StructurePanel } from './StructurePanel';
import { UsfmEditor } from './UsfmEditor';

import type { UsfmEditorHandle } from './UsfmEditor';
import type { AnnotatedDiagnostic } from '../hooks/useLynxDocument';

type RightTab = 'checks' | 'structure';

export function LynxUsfmPocPage() {
  const lynx = useLynxDocument();
  const editorRef = useRef<UsfmEditorHandle>(null);
  const [rightTab, setRightTab] = useState<RightTab>('checks');
  const [chapterForm, setChapterForm] = useState({
    bibleId: '1',
    bookId: '1',
    chapterNumber: '1',
    bookCode: 'GEN',
    bookName: 'Genesis',
  });
  const [loadError, setLoadError] = useState<string>();
  const [loadingChapter, setLoadingChapter] = useState(false);

  const { status, errorMessage, usfm, diagnostics, structure, lastCheckMs, loadSource } = lynx;

  // Load the seeded sample as soon as the workspace is ready.
  useEffect(() => {
    if (status === 'ready' && usfm === '') {
      void loadSource(SAMPLE_USFM, 'en');
    }
  }, [status, usfm, loadSource]);

  const activeDiagnostics = diagnostics.filter(d => !d.dismissed);
  const errorCount = activeDiagnostics.filter(
    d => d.diagnostic.severity === DiagnosticSeverity.Error
  ).length;
  const warningCount = activeDiagnostics.filter(
    d => d.diagnostic.severity === DiagnosticSeverity.Warning
  ).length;

  const handleLoadChapter = async () => {
    setLoadingChapter(true);
    setLoadError(undefined);
    try {
      const verses = await fetchChapterVerses({
        bibleId: Number(chapterForm.bibleId),
        bookId: Number(chapterForm.bookId),
        chapterNumber: Number(chapterForm.chapterNumber),
        bookCode: chapterForm.bookCode,
        bookName: chapterForm.bookName,
      });
      if (verses.length === 0) {
        setLoadError('The chapter has no verses.');
        return;
      }
      // The exact assembly the server-side USFM export performs — derived
      // client-side and checked before anything leaves the browser. Chapter
      // language is unknown here, so charset checking is off for it (#385).
      await loadSource(buildUsfmFromVerses(verses));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load chapter');
    } finally {
      setLoadingChapter(false);
    }
  };

  const handleReveal = (item: AnnotatedDiagnostic) => {
    editorRef.current?.select(item.startOffset, item.endOffset);
  };

  if (status === 'error') {
    return (
      <div className='mx-auto max-w-3xl py-10'>
        <Card>
          <CardHeader>
            <CardTitle>Lynx failed to start</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-destructive text-sm'>{errorMessage}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    // AuthenticatedLayout clips <main> at viewport height (overflow-hidden),
    // so the page owns its vertical scrolling.
    <div className='mx-auto h-full max-w-7xl space-y-4 overflow-y-auto pb-10'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-bold'>Lynx · USFM on the client</h2>
          <p className='text-muted-foreground max-w-2xl text-sm'>
            This page parses USFM into a typed scripture document and runs quality checks entirely
            in the browser using{' '}
            <a
              className='text-primary underline'
              href='https://github.com/sillsdev/lynx'
              rel='noreferrer'
              target='_blank'
            >
              sillsdev/lynx
            </a>
            . No server round-trips: edit the USFM and watch the checks, structure, and preview
            update.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Badge variant={errorCount > 0 ? 'destructive' : 'secondary'}>{errorCount} errors</Badge>
          <Badge variant='secondary'>{warningCount} warnings</Badge>
          {lastCheckMs != null && (
            <Badge variant='outline'>parsed + checked in {lastCheckMs.toFixed(1)} ms</Badge>
          )}
        </div>
      </div>

      <Card>
        <CardContent className='flex flex-wrap items-end gap-3 pt-6'>
          <Button size='sm' variant='secondary' onClick={() => void loadSource(SAMPLE_USFM, 'en')}>
            Load sample (seeded issues)
          </Button>
          <div className='bg-border h-8 w-px' />
          {(
            [
              ['bibleId', 'Bible'],
              ['bookId', 'Book'],
              ['chapterNumber', 'Chapter'],
              ['bookCode', 'Code'],
              ['bookName', 'Name'],
            ] as const
          ).map(([field, label]) => (
            <div key={field} className='space-y-1'>
              <Label className='text-xs' htmlFor={`lynx-${field}`}>
                {label}
              </Label>
              <Input
                className='h-8 w-24'
                id={`lynx-${field}`}
                value={chapterForm[field]}
                onChange={event =>
                  setChapterForm(previous => ({ ...previous, [field]: event.target.value }))
                }
              />
            </div>
          ))}
          <Button disabled={loadingChapter} size='sm' onClick={() => void handleLoadChapter()}>
            {loadingChapter ? 'Loading…' : 'Assemble chapter → USFM'}
          </Button>
          {loadError != null && <p className='text-destructive text-sm'>{loadError}</p>}
        </CardContent>
      </Card>

      <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]'>
        <div className='space-y-2'>
          <UsfmEditor
            ref={editorRef}
            diagnostics={diagnostics}
            value={usfm}
            onChangeValue={(next, typedChar, caretOffset) =>
              void lynx.changeUsfm(next, typedChar, caretOffset)
            }
          />
          <p className='text-muted-foreground text-xs'>
            Try it: type a straight quote (") inside a verse — Lynx autocorrects it to a curly quote
            on type. Remove a verse marker or break a quote pair and watch the checks react.
          </p>
        </div>

        <Card className='self-start'>
          <CardHeader className='pb-2'>
            <div className='flex gap-4 text-sm font-semibold'>
              {(
                [
                  ['checks', 'Checks'],
                  ['structure', 'Structure'],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  className={`cursor-pointer border-b-2 pb-1 transition-colors ${
                    rightTab === tab
                      ? 'border-primary text-foreground'
                      : 'text-muted-foreground hover:text-foreground border-transparent'
                  }`}
                  type='button'
                  onClick={() => setRightTab(tab)}
                >
                  {label}
                  {tab === 'checks' && activeDiagnostics.length > 0 && (
                    <span className='bg-primary ml-1.5 inline-block size-2 rounded-full align-middle' />
                  )}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {rightTab === 'checks' ? (
              <ChecksPanel
                diagnostics={diagnostics}
                onApplyFix={(item, fixIndex) => void lynx.applyFix(item.fixes[fixIndex])}
                onDismiss={lynx.dismiss}
                onReveal={handleReveal}
                onUndismiss={lynx.undismiss}
              />
            ) : (
              <StructurePanel structure={structure} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
