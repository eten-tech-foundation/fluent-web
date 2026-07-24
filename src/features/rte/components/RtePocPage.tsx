import { useCallback, useState } from 'react';

import { DiagnosticSeverity } from '@sillsdev/lynx';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useRtePoc } from '../hooks/useRtePoc';

import { DerivedVersesPanel } from './DerivedVersesPanel';
import { RteEditor } from './RteEditor';

export function RtePocPage() {
  const poc = useRtePoc();
  const [chapterForm, setChapterForm] = useState({
    bibleId: '1',
    bookId: '1',
    chapterNumber: '1',
    bookCode: 'GEN',
    bookName: 'Genesis',
  });
  const [loadError, setLoadError] = useState<string>();
  const [loadingChapter, setLoadingChapter] = useState(false);
  const [scrRef, setScrRef] = useState<string>();
  const [annotationStats, setAnnotationStats] = useState<{ ms: number; count: number }>();

  const { lynx } = poc;
  const activeDiagnostics = lynx.diagnostics.filter(d => !d.dismissed);
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
      await poc.loadChapter({
        bibleId: Number(chapterForm.bibleId),
        bookId: Number(chapterForm.bookId),
        chapterNumber: Number(chapterForm.chapterNumber),
        bookCode: chapterForm.bookCode,
        bookName: chapterForm.bookName,
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load chapter');
    } finally {
      setLoadingChapter(false);
    }
  };

  const handleAnnotationsApplied = useCallback((ms: number, count: number) => {
    setAnnotationStats({ ms, count });
  }, []);

  return (
    // AuthenticatedLayout clips <main> at viewport height, so the page owns
    // its vertical scrolling (same pattern as the Lynx PoC page).
    <div className='mx-auto h-full max-w-7xl space-y-4 overflow-y-auto pb-10'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-bold'>RTE PoC · SharedEditor (Editorial)</h2>
          <p className='text-muted-foreground max-w-2xl text-sm'>
            Pericope-scoped rich text editing on USJ with the{' '}
            <a
              className='text-primary underline'
              href='https://github.com/eten-tech-foundation/scripture-editors'
              rel='noreferrer'
              target='_blank'
            >
              platform-editor
            </a>{' '}
            Editorial component. Edits merge back into the chapter USJ, verse rows derive live (the
            save path), and Lynx checks highlight inside the editor.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {scrRef != null && <Badge variant='outline'>{scrRef}</Badge>}
          <Badge variant={errorCount > 0 ? 'destructive' : 'secondary'}>{errorCount} errors</Badge>
          <Badge variant='secondary'>{warningCount} warnings</Badge>
          {lynx.lastCheckMs != null && (
            <Badge variant='outline'>checked in {lynx.lastCheckMs.toFixed(1)} ms</Badge>
          )}
          {annotationStats != null && (
            <Badge variant='outline'>
              {annotationStats.count} highlights in {annotationStats.ms.toFixed(1)} ms
            </Badge>
          )}
        </div>
      </div>

      <Card>
        <CardContent className='flex flex-wrap items-end gap-3 pt-6'>
          <Button size='sm' variant='secondary' onClick={poc.loadSample}>
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
              <Label className='text-xs' htmlFor={`rte-${field}`}>
                {label}
              </Label>
              <Input
                className='h-8 w-24'
                id={`rte-${field}`}
                value={chapterForm[field]}
                onChange={event =>
                  setChapterForm(previous => ({ ...previous, [field]: event.target.value }))
                }
              />
            </div>
          ))}
          <Button disabled={loadingChapter} size='sm' onClick={() => void handleLoadChapter()}>
            {loadingChapter ? 'Loading…' : 'Load chapter → editor'}
          </Button>
          <div className='bg-border h-8 w-px' />
          <div className='space-y-1'>
            <Label className='text-xs' htmlFor='rte-projectId'>
              Project (pericopes)
            </Label>
            <Input
              className='h-8 w-24'
              id='rte-projectId'
              placeholder='optional'
              value={poc.projectId}
              onChange={event => poc.setProjectId(event.target.value)}
            />
          </div>
          {loadError != null && <p className='text-destructive text-sm'>{loadError}</p>}
        </CardContent>
      </Card>

      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-muted-foreground text-sm'>Chapter</span>
        {poc.chapterNumbers.map(n => (
          <Button
            key={n}
            size='sm'
            variant={n === poc.chapterNumber ? 'default' : 'outline'}
            onClick={() => poc.selectChapter(n)}
          >
            {n}
          </Button>
        ))}
        <span className='text-muted-foreground ml-3 text-sm'>Pericope</span>
        {poc.pericopes.map((pericope, index) => (
          <Button
            key={`${pericope.pericopeNumber}-${index}`}
            size='sm'
            variant={index === poc.pericopeIndex ? 'default' : 'outline'}
            onClick={() => poc.setPericopeIndex(index)}
          >
            {pericope.pericopeTitle ?? `Pericope ${pericope.pericopeNumber}`}
          </Button>
        ))}
        {!poc.pericopesFromApi && (
          <span className='text-muted-foreground text-xs'>
            (no pericope data — set a project id to fetch real boundaries)
          </span>
        )}
      </div>

      <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]'>
        <RteEditor
          annotations={poc.annotations}
          usj={poc.sliceUsj}
          usjKey={poc.editorKey}
          onAnnotationsApplied={handleAnnotationsApplied}
          onScrRefChange={setScrRef}
          onUsjChange={poc.handleEditorChange}
        />

        <div className='space-y-4 self-start'>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-base'>Derived verse rows</CardTitle>
            </CardHeader>
            <CardContent>
              <DerivedVersesPanel
                canPost={poc.canPost}
                changedKeys={poc.changedKeys}
                saveState={poc.saveState}
                sliceKeys={poc.sliceKeys}
                verses={poc.derivedVerses}
                onSave={settings => void poc.saveChanged(settings)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-base'>Lynx checks (whole chapter)</CardTitle>
            </CardHeader>
            <CardContent>
              {activeDiagnostics.length === 0 ? (
                <p className='text-muted-foreground text-sm'>No issues found.</p>
              ) : (
                <ul className='max-h-64 space-y-1.5 overflow-y-auto pr-1'>
                  {activeDiagnostics.map(item => (
                    <li key={item.key} className='flex items-start gap-2 text-sm'>
                      <Badge
                        className='mt-0.5'
                        variant={
                          item.diagnostic.severity === DiagnosticSeverity.Error
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {item.verseRef ?? '—'}
                      </Badge>
                      <span className='min-w-0 flex-1'>{item.diagnostic.message}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className='text-muted-foreground mt-2 text-xs'>
                Issues inside the open pericope are underlined in the editor; the list covers the
                whole chapter.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
