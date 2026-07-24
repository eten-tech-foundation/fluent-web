import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLynxDocument } from '@/features/lynx/hooks/useLynxDocument';
import { SAMPLE_USFM } from '@/features/lynx/lib/sample-usfm';
import { buildUsfmFromVerses } from '@/features/lynx/lib/usfm-assembly';
import { useChapterPericopes } from '@/features/pericopes/hooks/useChapterPericopes';
import type { PericopeGroup } from '@/lib/types';

import { fetchChapterSources, postTranslatedVerse } from '../lib/chapter-api';
import { diagnosticsToAnnotations } from '../lib/lynx-annotations';
import { mergePericope, slicePericope } from '../lib/pericope-slice';
import { usfmToUsj } from '../lib/usfm-to-usj';
import { usjToVerses } from '../lib/usj-verses';

import type { ChapterParams } from '../lib/chapter-api';
import type { Usj } from '@eten-tech-foundation/scripture-utilities';

export interface LoadChapterParams extends ChapterParams {
  bookCode: string;
  bookName: string;
}

export interface SaveSettings {
  projectUnitId: number;
  assignedUserId: number;
}

export interface SaveState {
  status: 'idle' | 'saving' | 'done' | 'error';
  detail?: string;
}

function verseKey(chapterNumber: number, verseNumber: number): string {
  return `${chapterNumber}:${verseNumber}`;
}

function verseTextMap(usj: Usj): ReadonlyMap<string, string> {
  return new Map(usjToVerses(usj).map(v => [verseKey(v.chapterNumber, v.verseNumber), v.text]));
}

function usjChapterNumbers(usj: Usj): number[] {
  return usj.content.flatMap(node =>
    typeof node !== 'string' && node.type === 'chapter'
      ? [Number.parseInt(node.number ?? '0', 10)]
      : []
  );
}

/**
 * Page state for the RTE PoC: chapter USJ (source of truth), pericope
 * selection + slicing, merge-on-edit, derived verse rows (save path), Lynx
 * checking over the assembled USFM, and the diagnostics→annotations bridge.
 */
export function useRtePoc() {
  const lynx = useLynxDocument();

  const [book, setBook] = useState({ code: 'RUT', name: 'Ruth' });
  const [chapterUsj, setChapterUsj] = useState<Usj>(() => usfmToUsj(SAMPLE_USFM));
  const [originalTexts, setOriginalTexts] = useState<ReadonlyMap<string, string>>(() =>
    verseTextMap(usfmToUsj(SAMPLE_USFM))
  );
  /** verseKey → Source.id, only populated when the chapter came from the API. */
  const [bibleTextIds, setBibleTextIds] = useState<ReadonlyMap<string, number>>(new Map());
  const [chapterNumber, setChapterNumber] = useState(1);
  const [pericopeIndex, setPericopeIndex] = useState(0);
  /** Bumped on every load so the editor reloads even for the same pericope. */
  const [generation, setGeneration] = useState(0);
  const [projectId, setProjectId] = useState('');
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });

  const chapterNumbers = useMemo(() => usjChapterNumbers(chapterUsj), [chapterUsj]);
  const derivedVerses = useMemo(() => usjToVerses(chapterUsj), [chapterUsj]);

  // Pericope boundaries: real ones when a project id is given, otherwise the
  // whole chapter behaves as one pericope (design.md fallback).
  const pericopeQuery = useChapterPericopes(
    projectId === '' ? undefined : Number(projectId),
    book.code,
    chapterNumber
  );
  const pericopes: PericopeGroup[] = useMemo(() => {
    if (pericopeQuery.data != null && pericopeQuery.data.length > 0) return pericopeQuery.data;
    return [
      {
        pericopeNumber: '—',
        pericopeTitle: `Chapter ${chapterNumber} (whole chapter)`,
        verses: derivedVerses
          .filter(v => v.chapterNumber === chapterNumber)
          .map(v => ({ chapterNumber, verseNumber: v.verseNumber })),
      },
    ];
  }, [pericopeQuery.data, chapterNumber, derivedVerses]);

  const activePericope = pericopes[Math.min(pericopeIndex, pericopes.length - 1)];
  const pericopeVerseNumbers = useMemo(
    () =>
      activePericope.verses.filter(v => v.chapterNumber === chapterNumber).map(v => v.verseNumber),
    [activePericope, chapterNumber]
  );

  const sliceUsj = useMemo(
    () => slicePericope(chapterUsj, chapterNumber, pericopeVerseNumbers),
    [chapterUsj, chapterNumber, pericopeVerseNumbers]
  );
  const editorKey = `${generation}:${chapterNumber}:${activePericope.pericopeNumber}`;

  const handleEditorChange = useCallback(
    (edited: Usj) => {
      setChapterUsj(previous =>
        mergePericope(previous, edited, chapterNumber, pericopeVerseNumbers)
      );
    },
    [chapterNumber, pericopeVerseNumbers]
  );

  // Lynx checks run over the same canonical assembly the export endpoint emits.
  const assembledUsfm = useMemo(
    () =>
      buildUsfmFromVerses(
        derivedVerses.map(v => ({
          bookCode: book.code,
          bookName: book.name,
          chapterNumber: v.chapterNumber,
          verseNumber: v.verseNumber,
          content: v.text,
        }))
      ),
    [derivedVerses, book]
  );

  const { status: lynxStatus, usfm: lynxUsfm, loadSource, changeUsfm } = lynx;
  const assembledRef = useRef(assembledUsfm);
  assembledRef.current = assembledUsfm;
  useEffect(() => {
    if (lynxStatus !== 'ready' || lynxUsfm === assembledUsfm) return;
    if (lynxUsfm === '') {
      void loadSource(assembledUsfm);
      return;
    }
    const timer = setTimeout(() => void changeUsfm(assembledRef.current), 400);
    return () => clearTimeout(timer);
  }, [lynxStatus, lynxUsfm, assembledUsfm, loadSource, changeUsfm]);

  const annotations = useMemo(
    () =>
      diagnosticsToAnnotations(
        lynx.diagnostics.filter(d => !d.dismissed).map(d => d.diagnostic),
        lynxUsfm,
        sliceUsj
      ),
    [lynx.diagnostics, lynxUsfm, sliceUsj]
  );

  const changedKeys = useMemo(() => {
    const changed = new Set<string>();
    for (const verse of derivedVerses) {
      const key = verseKey(verse.chapterNumber, verse.verseNumber);
      if (originalTexts.get(key) !== verse.text) changed.add(key);
    }
    return changed;
  }, [derivedVerses, originalTexts]);

  const sliceKeys = useMemo(
    () => new Set(pericopeVerseNumbers.map(v => verseKey(chapterNumber, v))),
    [pericopeVerseNumbers, chapterNumber]
  );

  const resetTo = useCallback(
    (usj: Usj, nextBook: { code: string; name: string }, ids: ReadonlyMap<string, number>) => {
      setBook(nextBook);
      setChapterUsj(usj);
      setOriginalTexts(verseTextMap(usj));
      setBibleTextIds(ids);
      setChapterNumber(usjChapterNumbers(usj)[0] ?? 1);
      setPericopeIndex(0);
      setSaveState({ status: 'idle' });
      setGeneration(previous => previous + 1);
    },
    []
  );

  const loadSample = useCallback(() => {
    resetTo(usfmToUsj(SAMPLE_USFM), { code: 'RUT', name: 'Ruth' }, new Map());
  }, [resetTo]);

  const loadChapter = useCallback(
    async (params: LoadChapterParams) => {
      const sources = await fetchChapterSources(params);
      if (sources.length === 0) throw new Error('The chapter has no verses.');
      const usfm = buildUsfmFromVerses(
        sources.map(source => ({
          bookCode: params.bookCode,
          bookName: params.bookName,
          chapterNumber: params.chapterNumber,
          verseNumber: source.verseNumber,
          content: source.text,
        }))
      );
      const ids = new Map(
        sources.map(source => [verseKey(params.chapterNumber, source.verseNumber), source.id])
      );
      resetTo(usfmToUsj(usfm), { code: params.bookCode, name: params.bookName }, ids);
    },
    [resetTo]
  );

  const selectChapter = useCallback((next: number) => {
    setChapterNumber(next);
    setPericopeIndex(0);
  }, []);

  const saveChanged = useCallback(
    async ({ projectUnitId, assignedUserId }: SaveSettings) => {
      const rows = derivedVerses.filter(v =>
        changedKeys.has(verseKey(v.chapterNumber, v.verseNumber))
      );
      if (rows.length === 0) {
        setSaveState({ status: 'done', detail: 'Nothing changed yet.' });
        return;
      }
      setSaveState({ status: 'saving' });
      let saved = 0;
      let skipped = 0;
      try {
        for (const row of rows) {
          const bibleTextId = bibleTextIds.get(verseKey(row.chapterNumber, row.verseNumber));
          if (bibleTextId == null) {
            skipped += 1;
            continue;
          }
          await postTranslatedVerse({
            projectUnitId,
            content: row.text,
            bibleTextId,
            assignedUserId,
          });
          saved += 1;
        }
        setSaveState({
          status: 'done',
          detail:
            `Saved ${saved} verse${saved === 1 ? '' : 's'}` +
            (skipped > 0 ? ` · ${skipped} skipped (no bibleTextId — load a chapter first)` : '.'),
        });
      } catch (error) {
        setSaveState({
          status: 'error',
          detail: error instanceof Error ? error.message : 'Save failed',
        });
      }
    },
    [derivedVerses, changedKeys, bibleTextIds]
  );

  return {
    lynx,
    book,
    chapterNumbers,
    chapterNumber,
    selectChapter,
    pericopes,
    pericopeIndex,
    setPericopeIndex,
    pericopesFromApi: pericopeQuery.data != null && pericopeQuery.data.length > 0,
    projectId,
    setProjectId,
    sliceUsj,
    editorKey,
    handleEditorChange,
    annotations,
    derivedVerses,
    changedKeys,
    sliceKeys,
    canPost: bibleTextIds.size > 0,
    loadSample,
    loadChapter,
    saveChanged,
    saveState,
  };
}
