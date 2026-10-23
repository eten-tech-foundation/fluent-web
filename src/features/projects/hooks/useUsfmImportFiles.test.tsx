import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';
import { USFM_CHECK_URL, usfmCheckHandler } from '@/test/msw/usfm-check';
import { act, renderHook, waitFor } from '@/test/render';

import { useUsfmImportFiles } from './useUsfmImportFiles';

vi.mock('@/lib/services/logger', () => ({ Logger: { logException: vi.fn() } }));

/** jsdom's File has no usable `text()`, so the read path needs one supplied. */
const usfmFile = (name: string, text: string): File => {
  const file = new File([text], name, { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
};

/** A file whose read only finishes when the returned handle is called. */
const pendingUsfmFile = (name: string) => {
  let finish!: (text: string) => void;
  const file = new File([''], name, { type: 'text/plain' });
  Object.defineProperty(file, 'text', {
    value: () =>
      new Promise<string>(resolve => {
        finish = resolve;
      }),
  });
  return { file, finish: (text: string) => finish(text) };
};

const GEN = '\\id GEN Genesis\n\\c 1\n\\v 1 text';
const MAT = '\\id MAT Matthew\n\\c 1\n\\v 1 text';

/** The file names each check request carried. */
let checked: string[][] = [];
beforeEach(() => {
  checked = [];
  server.use(usfmCheckHandler());
  server.events.on('request:start', async ({ request }) => {
    if (request.url !== USFM_CHECK_URL) return;
    const { files } = (await request.clone().json()) as { files: Array<{ fileName: string }> };
    checked.push(files.map(file => file.fileName));
  });
  return () => server.events.removeAllListeners();
});

describe('useUsfmImportFiles (#418, #419)', () => {
  it('accepts a batch the API accepts, with the book it found in each file', async () => {
    const { result } = renderHook(() => useUsfmImportFiles());

    await act(() =>
      result.current.selectFiles([usfmFile('gen.usfm', GEN), usfmFile('mat.usfm', MAT)])
    );

    expect(result.current.state).toEqual({
      status: 'accepted',
      files: [
        expect.objectContaining({ bookCode: 'GEN', bookName: 'Genesis', usfm: GEN }),
        expect.objectContaining({ bookCode: 'MAT', bookName: 'Matthew', usfm: MAT }),
      ],
    });
  });

  it('shows the batch as checking while the API answers', async () => {
    const { result } = renderHook(() => useUsfmImportFiles());

    act(() => {
      void result.current.selectFiles([usfmFile('gen.usfm', GEN)]);
    });

    expect(result.current.state).toEqual({ status: 'checking', fileNames: ['gen.usfm'] });
    await waitFor(() => expect(result.current.state.status).toBe('accepted'));
  });

  // #418 rejects the whole import if any single file fails; there is no partial import.
  it('turns the whole batch away when the API rejects one file', async () => {
    const { result } = renderHook(() => useUsfmImportFiles());

    await act(() =>
      result.current.selectFiles([usfmFile('gen.usfm', GEN), usfmFile('x.usfm', '\\c 1\n\\v 1 a')])
    );

    expect(result.current.state).toEqual({
      status: 'rejected',
      fileNames: ['gen.usfm', 'x.usfm'],
      problems: [{ fileName: 'x.usfm', problem: 'USFM_BOOK_MISSING' }],
    });
  });

  it('reports a second file of the same book', async () => {
    const { result } = renderHook(() => useUsfmImportFiles());

    await act(() =>
      result.current.selectFiles([usfmFile('a.usfm', GEN), usfmFile('b.usfm', `${GEN} again`)])
    );

    expect(result.current.state).toMatchObject({
      status: 'rejected',
      problems: [{ fileName: 'b.usfm', problem: 'USFM_BOOK_DUPLICATE' }],
    });
  });

  it('turns away a file with no USFM markers without sending it to the API', async () => {
    const { result } = renderHook(() => useUsfmImportFiles());

    await act(() =>
      result.current.selectFiles([usfmFile('gen.usfm', GEN), usfmFile('notes.txt', 'no markers')])
    );

    expect(result.current.state).toEqual({
      status: 'rejected',
      fileNames: ['gen.usfm', 'notes.txt'],
      problems: [{ fileName: 'notes.txt', problem: 'USFM_INVALID' }],
    });
    expect(checked).toEqual([['gen.usfm']]);
  });

  it('reports every problem in the batch at once, in upload order', async () => {
    const { result } = renderHook(() => useUsfmImportFiles());

    await act(() =>
      result.current.selectFiles([
        usfmFile('notes.txt', 'no markers'),
        usfmFile('x.usfm', '\\c 1\n\\v 1 a'),
        usfmFile('gen.usfm', GEN),
      ])
    );

    expect(result.current.state).toMatchObject({
      status: 'rejected',
      problems: [
        { fileName: 'notes.txt', problem: 'USFM_INVALID' },
        { fileName: 'x.usfm', problem: 'USFM_BOOK_MISSING' },
      ],
    });
  });

  it('does not call the API when no file has a marker', async () => {
    const { result } = renderHook(() => useUsfmImportFiles());

    await act(() => result.current.selectFiles([usfmFile('notes.txt', 'no markers')]));

    expect(result.current.state).toMatchObject({ status: 'rejected' });
    expect(checked).toEqual([]);
  });

  it('says the check could not reach the server when the request fails', async () => {
    server.use(http.post(USFM_CHECK_URL, () => HttpResponse.error()));
    const { result } = renderHook(() => useUsfmImportFiles());

    await act(() => result.current.selectFiles([usfmFile('gen.usfm', GEN)]));

    expect(result.current.state).toEqual({
      status: 'failed',
      fileNames: ['gen.usfm'],
      reason: 'network',
    });
  });

  it('says the check failed when the API errors', async () => {
    server.use(
      http.post(USFM_CHECK_URL, () => HttpResponse.json({ message: 'boom' }, { status: 500 }))
    );
    const { result } = renderHook(() => useUsfmImportFiles());

    await act(() => result.current.selectFiles([usfmFile('gen.usfm', GEN)]));

    expect(result.current.state).toMatchObject({ status: 'failed', reason: 'server' });
  });

  // Reading and checking are async, so two quick selections can finish out of order. The newer
  // one is what the user is looking at, so a slow older batch must not overwrite it.
  it('ignores a batch a newer selection has superseded', async () => {
    const { result } = renderHook(() => useUsfmImportFiles());
    const slow = pendingUsfmFile('bad.usfm');

    act(() => {
      void result.current.selectFiles([slow.file]);
    });
    await act(() => result.current.selectFiles([usfmFile('gen.usfm', GEN)]));
    expect(result.current.state).toMatchObject({ status: 'accepted' });

    await act(async () => {
      slow.finish('no markers here');
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.state).toMatchObject({
      status: 'accepted',
      files: [expect.objectContaining({ bookCode: 'GEN' })],
    });
  });

  it('does nothing for an empty selection', async () => {
    const { result } = renderHook(() => useUsfmImportFiles());

    await act(() => result.current.selectFiles([]));

    expect(result.current.state).toEqual({ status: 'idle' });
  });
});
