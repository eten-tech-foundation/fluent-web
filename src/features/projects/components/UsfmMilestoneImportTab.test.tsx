import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';
import {
  bookFile,
  PROJECT_ID,
  USFM_CHECK_URL,
  USFM_IMPORT_URL,
  usfmCheckHandler,
  usfmFile,
  usfmImportHandler,
  verdictsFor,
} from '@/test/msw/usfm-milestone-import';
import { fireEvent, renderWithProviders, screen, waitFor, within } from '@/test/render';

import { type UsfmFileUpload } from '../lib/usfm-import';

import { UsfmMilestoneImportTab } from './UsfmMilestoneImportTab';

// Keys come through unchanged, with any interpolated values after them, so a test can tell
// "Matthew already exists in Gospels" from "Matthew already exists in this project".
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key} ${Object.values(values).join('|')}` : key,
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/logger', () => ({ Logger: { logException: vi.fn() } }));

const PROJECT = {
  name: 'Kachi Koli NT',
  sourceLanguageName: 'Gujarati',
  sourceName: 'IRV Gujarati',
  targetLanguageName: 'Kachi Koli',
};

const renderTab = () => {
  const onCancel = vi.fn();
  const onImported = vi.fn();
  const view = renderWithProviders(
    <UsfmMilestoneImportTab
      project={PROJECT}
      projectId={PROJECT_ID}
      onCancel={onCancel}
      onImported={onImported}
    />
  );
  return { ...view, onCancel, onImported };
};

const drop = (files: File[]) => {
  fireEvent.drop(screen.getByTestId('usfm-drop-area'), {
    dataTransfer: { files, types: ['Files'] },
  });
};

const pick = (files: File[]) => {
  fireEvent.change(screen.getByTestId('usfm-file-input'), { target: { files } });
};

const listedFiles = () =>
  within(screen.queryByTestId('usfm-listed-files') ?? document.createElement('ul'))
    .queryAllByRole('listitem')
    .map(item => item.textContent);

const errorBoxes = () => screen.queryAllByRole('alert').map(box => box.textContent);

const booksField = () => screen.getByLabelText<HTMLInputElement>('importBooks');

const importButton = () => screen.getByRole('button', { name: 'importMilestone' });

/** Waits until no file is still being checked. */
const settled = () =>
  waitFor(() => expect(screen.queryByText('checkingUsfmFiles')).not.toBeInTheDocument());

beforeEach(() => {
  vi.clearAllMocks();
  server.use(usfmCheckHandler(), usfmImportHandler());
});

describe('UsfmMilestoneImportTab (#418, #420)', () => {
  it('shows the name, Book(s) and the project from the moment the tab opens', () => {
    renderTab();

    expect(screen.getByRole('button', { name: 'selectFile' })).toBeInTheDocument();
    expect(screen.getByLabelText('*milestoneName')).toHaveValue('');
    expect(booksField()).toHaveValue('');
    expect(booksField()).toHaveAttribute('readonly');
    expect(screen.getByTestId('usfm-import-destination')).toHaveTextContent(
      'projectKachi Koli NTsourceLanguageGujaratisourceBibleIRV GujaratitargetLanguageKachi Koli'
    );
    expect(importButton()).toBeDisabled();
  });

  it('lists files added several times and names their books in Bible order', async () => {
    renderTab();

    drop([bookFile('1PE'), bookFile('2PE')]);
    await settled();
    pick([bookFile('JUD'), bookFile('JAS')]);
    await settled();

    expect(listedFiles()).toEqual([
      'Kachi-Koli-1PE.usfm',
      'Kachi-Koli-2PE.usfm',
      'Kachi-Koli-JUD.usfm',
      'Kachi-Koli-JAS.usfm',
    ]);
    expect(booksField()).toHaveValue('James, 1 Peter, 2 Peter, Jude');
    expect(errorBoxes()).toEqual([]);
  });

  it('refuses each bad file in its own box and keeps the good ones', async () => {
    renderTab();

    drop([
      usfmFile('notes.txt', 'just a note'),
      usfmFile('nobook.usfm', '\\c 1\n\\p\n\\v 1 text'),
      bookFile('MAT'),
      bookFile('ACT'),
      bookFile('PHM'),
      bookFile('GEN'),
      usfmFile('GEN-copy.usfm', '\\id GEN\n\\c 1\n\\p\n\\v 1 again'),
    ]);
    await settled();

    expect(errorBoxes()).toEqual([
      'notes.txt: errorNotValidUsfm',
      'nobook.usfm: errorMissingBookData',
      'Kachi-Koli-MAT.usfm: errorBookInMilestone Matthew|Gospels',
      'Kachi-Koli-ACT.usfm: errorBookInProject Acts',
      'Kachi-Koli-PHM.usfm: errorBookNotInSourceBible Philemon|IRV Gujarati',
      'GEN-copy.usfm: errorBookAlreadyAdded Genesis',
    ]);
    expect(listedFiles()).toEqual(['Kachi-Koli-GEN.usfm']);
    expect(booksField()).toHaveValue('Genesis');
  });

  it('keeps an error when more files are added, until its X is clicked', async () => {
    const { user } = renderTab();

    drop([bookFile('MAT')]);
    await settled();
    drop([bookFile('GEN')]);
    await settled();

    expect(errorBoxes()).toEqual(['Kachi-Koli-MAT.usfm: errorBookInMilestone Matthew|Gospels']);
    await user.click(screen.getByRole('button', { name: 'dismissUsfmError Kachi-Koli-MAT.usfm' }));
    expect(errorBoxes()).toEqual([]);
    expect(listedFiles()).toEqual(['Kachi-Koli-GEN.usfm']);
  });

  it('tells the API which books are listed, so a second file for one is refused', async () => {
    const listed: string[][] = [];
    server.use(
      http.post(USFM_CHECK_URL, async ({ request }) => {
        const body = (await request.json()) as {
          files: UsfmFileUpload[];
          listedBookCodes: string[];
        };
        listed.push(body.listedBookCodes);
        return HttpResponse.json({ files: verdictsFor(body.files, body.listedBookCodes) });
      })
    );
    renderTab();

    drop([bookFile('GEN')]);
    await settled();
    drop([usfmFile('genesis-2.usfm', '\\id GEN\n\\c 1\n\\p\n\\v 1 again')]);
    await settled();

    expect(listed).toEqual([[], ['GEN']]);
    expect(errorBoxes()).toEqual(['genesis-2.usfm: errorBookAlreadyAdded Genesis']);
  });

  it('refuses the later of two files for one book added at the same time', async () => {
    renderTab();

    // Both checks go out before either answers, so neither knows about the other's book.
    drop([bookFile('GEN')]);
    drop([usfmFile('genesis-2.usfm', '\\id GEN\n\\c 1\n\\p\n\\v 1 again')]);
    await settled();

    expect(listedFiles()).toEqual(['Kachi-Koli-GEN.usfm']);
    expect(errorBoxes()).toEqual(['genesis-2.usfm: errorBookAlreadyAdded Genesis']);
  });

  it('takes a removed file and its book off, and lets the book be added again', async () => {
    const { user } = renderTab();

    drop([bookFile('JAS'), bookFile('JUD')]);
    await settled();
    await user.click(screen.getByRole('button', { name: 'removeUsfmFile Kachi-Koli-JAS.usfm' }));

    expect(listedFiles()).toEqual(['Kachi-Koli-JUD.usfm']);
    expect(booksField()).toHaveValue('Jude');

    drop([bookFile('JAS')]);
    await settled();
    expect(booksField()).toHaveValue('James, Jude');
    expect(errorBoxes()).toEqual([]);
  });

  it('enables Import only with a name, a listed file and nothing being checked', async () => {
    let answer!: () => void;
    const { user } = renderTab();

    await user.type(screen.getByLabelText('*milestoneName'), 'Short Letters');
    expect(importButton()).toBeDisabled();

    drop([bookFile('JUD')]);
    await settled();
    expect(importButton()).toBeEnabled();

    server.use(
      http.post(USFM_CHECK_URL, async ({ request }) => {
        const { files } = (await request.json()) as { files: UsfmFileUpload[] };
        await new Promise<void>(resolve => {
          answer = resolve;
        });
        return HttpResponse.json({ files: verdictsFor(files, ['JUD']) });
      })
    );
    drop([bookFile('JAS')]);
    await screen.findByText('checkingUsfmFiles');
    expect(importButton()).toBeDisabled();

    answer();
    await settled();
    expect(importButton()).toBeEnabled();

    await user.clear(screen.getByLabelText('*milestoneName'));
    await user.type(screen.getByLabelText('*milestoneName'), '   ');
    expect(importButton()).toBeDisabled();
  });

  it('imports the listed files as one named milestone and closes', async () => {
    let sent: unknown;
    server.use(
      http.post(USFM_IMPORT_URL, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ id: 500, name: 'Short Letters' }, { status: 201 });
      })
    );
    const { user, onImported } = renderTab();

    drop([bookFile('JAS'), bookFile('JUD')]);
    await settled();
    await user.type(screen.getByLabelText('*milestoneName'), '  Short Letters ');
    await user.click(importButton());

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(sent).toEqual({
      name: 'Short Letters',
      files: [
        { fileName: 'Kachi-Koli-JAS.usfm', usfm: '\\id JAS\n\\c 1\n\\p\n\\v 1 text' },
        { fileName: 'Kachi-Koli-JUD.usfm', usfm: '\\id JUD\n\\c 1\n\\p\n\\v 1 text' },
      ],
    });
    expect(toast.success).toHaveBeenCalledWith('milestoneCreated');
  });

  it('takes the files the import refused off the list, each with its error', async () => {
    server.use(
      http.post(USFM_IMPORT_URL, async ({ request }) => {
        const { files } = (await request.json()) as { files: UsfmFileUpload[] };
        // Jude reached the project between the check and the import.
        const verdicts = verdictsFor(files).map(verdict =>
          verdict.ok && verdict.bookCode === 'JUD'
            ? {
                ...verdict,
                ok: false,
                error: 'USFM_BOOK_EXISTS',
                message: '',
                milestoneName: 'Letters',
              }
            : verdict
        );
        return HttpResponse.json(
          { message: 'One or more files cannot be imported', files: verdicts },
          { status: 400 }
        );
      })
    );
    const { user, onImported } = renderTab();

    drop([bookFile('JAS'), bookFile('JUD')]);
    await settled();
    await user.type(screen.getByLabelText('*milestoneName'), 'Short Letters');
    await user.click(importButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kachi-Koli-JUD.usfm: errorBookInMilestone Jude|Letters'
    );
    expect(listedFiles()).toEqual(['Kachi-Koli-JAS.usfm']);
    expect(onImported).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('checks the files again when the project gained a book during the import (409)', async () => {
    const { user, onImported } = renderTab();

    drop([bookFile('JAS'), bookFile('JUD')]);
    await settled();
    server.use(
      http.post(USFM_IMPORT_URL, () =>
        HttpResponse.json(
          { message: 'A book in this import already exists in the project' },
          { status: 409 }
        )
      ),
      http.post(USFM_CHECK_URL, async ({ request }) => {
        const { files } = (await request.json()) as { files: UsfmFileUpload[] };
        return HttpResponse.json({
          files: files.map(({ fileName }) =>
            fileName.includes('JAS')
              ? {
                  fileName,
                  ok: false,
                  error: 'USFM_BOOK_EXISTS',
                  message: '',
                  bookCode: 'JAS',
                  bookName: 'James',
                  milestoneName: null,
                }
              : { fileName, ok: true, bookCode: 'JUD', bookName: 'Jude' }
          ),
        });
      })
    );
    await user.type(screen.getByLabelText('*milestoneName'), 'Short Letters');
    await user.click(importButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kachi-Koli-JAS.usfm: errorBookInProject James'
    );
    expect(listedFiles()).toEqual(['Kachi-Koli-JUD.usfm']);
    expect(onImported).not.toHaveBeenCalled();
  });

  it('says the import failed when the server errors, and keeps the files', async () => {
    server.use(
      http.post(USFM_IMPORT_URL, () =>
        HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
      )
    );
    const { user, onImported } = renderTab();

    drop([bookFile('JUD')]);
    await settled();
    await user.type(screen.getByLabelText('*milestoneName'), 'Jude');
    await user.click(importButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('milestoneImportFailed'));
    expect(listedFiles()).toEqual(['Kachi-Koli-JUD.usfm']);
    expect(onImported).not.toHaveBeenCalled();
    expect(importButton()).toBeEnabled();
  });

  it('shows a no-connection error for each file whose check got no answer', async () => {
    server.use(http.post(USFM_CHECK_URL, () => HttpResponse.error()));
    renderTab();

    drop([bookFile('JAS'), bookFile('JUD')]);
    await settled();

    expect(errorBoxes()).toEqual([
      'Kachi-Koli-JAS.usfm: errorUsfmCheckNetwork',
      'Kachi-Koli-JUD.usfm: errorUsfmCheckNetwork',
    ]);
    expect(listedFiles()).toEqual([]);
  });

  it('cancels without importing', async () => {
    const { user, onCancel } = renderTab();

    await user.click(screen.getByRole('button', { name: 'cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
