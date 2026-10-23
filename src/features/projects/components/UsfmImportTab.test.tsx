import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkError } from '@/lib/api-utils';
import { server } from '@/test/msw/server';
import { USFM_CHECK_URL, usfmCheckHandler } from '@/test/msw/usfm-check';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/render';

import { type ProjectFormData } from './ProjectFormFields';
import { UsfmImportTab } from './UsfmImportTab';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

vi.mock('@/lib/services/logger', () => ({ Logger: { logException: vi.fn() } }));

const EMPTY_FORM: ProjectFormData = {
  title: '',
  targetLanguage: null,
  sourceLanguage: null,
  sourceBible: null,
  pericopeSetId: null,
  connectivityProfile: null,
};

const COMPLETE_FORM: ProjectFormData = {
  ...EMPTY_FORM,
  title: 'Genesis project',
  sourceLanguage: 1,
  sourceBible: 10,
  targetLanguage: 2,
  pericopeSetId: 1,
  connectivityProfile: 'usually_connected',
};

const GEN = '\\id GEN Genesis\n\\c 1\n\\v 1 text';
const MAT = '\\id MAT Matthew\n\\c 1\n\\v 1 text';

/** jsdom's File has no usable `text()`, so the component's read path needs one supplied. */
const usfmFile = (name: string, text: string): File => {
  const file = new File([text], name, { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
};

const renderTab = (overrides: Partial<Parameters<typeof UsfmImportTab>[0]> = {}) =>
  renderWithProviders(
    <UsfmImportTab
      formData={EMPTY_FORM}
      onBooksChange={vi.fn()}
      onFieldChange={vi.fn()}
      onSubmit={vi.fn()}
      {...overrides}
    />
  );

const drop = (files: File[]) => {
  fireEvent.drop(screen.getByTestId('usfm-drop-area'), {
    dataTransfer: { files, types: ['Files'] },
  });
};

/** Drop Genesis and Matthew and wait for the fields to replace the upload area. */
async function acceptGenesisAndMatthew() {
  drop([usfmFile('gen.usfm', GEN), usfmFile('mat.usfm', MAT)]);
  await screen.findByTestId('accepted-files');
}

/**
 * jsdom leaves a file input's `value` empty throughout and fires a change event whether or not
 * it changed, so neither half of the browser behaviour shows up on its own. The value is stood
 * up by hand here to make the reset observable, since that reset is the whole mechanism.
 */
const trackInputValue = (input: HTMLInputElement, initial: string) => {
  const state = { value: initial };
  Object.defineProperty(input, 'value', {
    configurable: true,
    get: () => state.value,
    set: (next: string) => {
      state.value = next;
    },
  });
  return state;
};

beforeEach(() => {
  server.use(usfmCheckHandler());
});

describe('UsfmImportTab upload area (#418)', () => {
  it('shows the upload area the mockup describes', () => {
    renderTab();
    const area = screen.getByTestId('usfm-drop-area');
    expect(area).toHaveTextContent('uploadUsfmFiles');
    expect(area).toHaveTextContent('dropUsfmFiles');
    expect(area).toHaveTextContent('usfmOnlyFormat');
    expect(screen.getByRole('button', { name: 'selectFiles' })).toBeInTheDocument();
  });

  it('opens the file picker from anywhere on the upload area', () => {
    renderTab();
    const input: HTMLInputElement = screen.getByTestId('usfm-file-input');
    const click = vi.spyOn(input, 'click');

    fireEvent.click(screen.getByTestId('usfm-drop-area'));
    fireEvent.click(screen.getByRole('button', { name: 'selectFiles' }));

    expect(click).toHaveBeenCalledTimes(2);
  });

  it('accepts dropped files the API accepts', async () => {
    renderTab();
    await acceptGenesisAndMatthew();

    expect(screen.getByTestId('accepted-files')).toHaveTextContent('gen.usfmmat.usfm');
    expect(screen.queryByTestId('usfm-drop-area')).not.toBeInTheDocument();
  });

  it('accepts files chosen through the file input too', async () => {
    renderTab();
    fireEvent.change(screen.getByTestId('usfm-file-input'), {
      target: { files: [usfmFile('mat.usfm', MAT)] },
    });

    expect(await screen.findByTestId('accepted-files')).toHaveTextContent('mat.usfm');
  });

  // A browser fires no change event when the input's value has not changed, so holding on to
  // the last filename strands the user: correcting that file and picking it again does nothing.
  it('clears the file input so the same file can be picked again after a failure', async () => {
    renderTab();
    const input: HTMLInputElement = screen.getByTestId('usfm-file-input');
    const tracked = trackInputValue(input, 'C:\\fakepath\\bad.usfm');

    fireEvent.change(input, { target: { files: [usfmFile('bad.usfm', 'no markers here')] } });
    await screen.findByTestId('usfm-file-errors');

    expect(tracked.value).toBe('');
  });

  it('names a single picked file under the upload area', async () => {
    renderTab();
    drop([usfmFile('bad.usfm', 'no markers here')]);

    expect(await screen.findByTestId('selected-files')).toHaveTextContent('bad.usfm');
  });

  it('counts the files when several are picked, as the mockup does', async () => {
    renderTab();
    drop([usfmFile('a.usfm', 'no markers'), usfmFile('b.usfm', GEN), usfmFile('c.usfm', MAT)]);

    expect(await screen.findByTestId('selected-files')).toHaveTextContent('usfmFilesSelected:3');
  });

  it('says the files are being checked while the API answers', async () => {
    server.use(
      http.post(USFM_CHECK_URL, async () => {
        await delay('infinite');
        return HttpResponse.json({ files: [] });
      })
    );
    renderTab();
    drop([usfmFile('gen.usfm', GEN)]);

    expect(await screen.findByText('checkingUsfmFiles')).toBeInTheDocument();
  });

  // #418 rejects the whole import if any single file fails; there is no partial import.
  it('names every rejected file with its reason and keeps the upload area', async () => {
    renderTab();
    drop([
      usfmFile('gen.usfm', GEN),
      usfmFile('bad.usfm', 'no markers here'),
      usfmFile('x.usfm', '\\c 1\n\\v 1 text'),
      usfmFile('gen2.usfm', `${GEN} again`),
    ]);

    const errors = await screen.findByTestId('usfm-file-errors');
    expect(errors).toHaveTextContent('bad.usfm: errorNotValidUsfm');
    expect(errors).toHaveTextContent('x.usfm: errorMissingBookData');
    expect(errors).toHaveTextContent('gen2.usfm: errorDuplicateBook');
    expect(errors).not.toHaveTextContent('gen.usfm:');
    expect(screen.getByTestId('usfm-drop-area')).toBeInTheDocument();
    expect(screen.queryByTestId('accepted-files')).not.toBeInTheDocument();
  });

  it('says when the check could not reach the server', async () => {
    server.use(http.post(USFM_CHECK_URL, () => HttpResponse.error()));
    renderTab();
    drop([usfmFile('gen.usfm', GEN)]);

    expect(await screen.findByTestId('usfm-file-errors')).toHaveTextContent(
      'errorUsfmCheckNetwork'
    );
  });

  it('says when the check itself failed', async () => {
    server.use(
      http.post(USFM_CHECK_URL, () => HttpResponse.json({ message: 'boom' }, { status: 500 }))
    );
    renderTab();
    drop([usfmFile('gen.usfm', GEN)]);

    expect(await screen.findByTestId('usfm-file-errors')).toHaveTextContent('errorUsfmCheckFailed');
  });
});

describe('UsfmImportTab fields after validation (#420)', () => {
  it('replaces the upload area with the project fields', async () => {
    renderTab();
    await acceptGenesisAndMatthew();

    expect(screen.getByText('projectTitle')).toBeInTheDocument();
  });

  // #419: the book comes from the file's \id, so the Books field shows a misnamed file's real book.
  it('lists the books found in the files, by name and in file order', async () => {
    renderTab();
    drop([usfmFile('1CH.usfm', GEN), usfmFile('mat.usfm', MAT)]);

    expect(await screen.findByTestId('import-books')).toHaveTextContent('Genesis, Matthew');
    expect(screen.getByText('importBooks')).toBeInTheDocument();
  });

  it('keeps the validation success message with the fields', async () => {
    renderTab();
    await acceptGenesisAndMatthew();

    expect(screen.getByText('usfmFilesValidated')).toBeInTheDocument();
  });

  it('leaves Create Project disabled until the manual fields are filled', async () => {
    renderTab();
    await acceptGenesisAndMatthew();

    expect(screen.getByRole('button', { name: 'createProject' })).toBeDisabled();
  });

  // The source picker sets the Bible and its language together. Assert this incomplete state
  // anyway because the modal's submit guard checks it too.
  it('keeps Create Project disabled without a source language', async () => {
    renderTab({ formData: { ...COMPLETE_FORM, sourceLanguage: null } });
    await acceptGenesisAndMatthew();

    expect(screen.getByRole('button', { name: 'createProject' })).toBeDisabled();
  });

  it('keeps Create Project disabled without a pericope set, since the modal would refuse it', async () => {
    renderTab({ formData: { ...COMPLETE_FORM, pericopeSetId: null } });
    await acceptGenesisAndMatthew();

    expect(screen.getByRole('button', { name: 'createProject' })).toBeDisabled();
  });

  it('enables Create Project once every required field is set', async () => {
    renderTab({ formData: COMPLETE_FORM });
    await acceptGenesisAndMatthew();

    expect(screen.getByRole('button', { name: 'createProject' })).toBeEnabled();
  });

  it('does not fetch the book picker data for detected import books', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      renderTab({ formData: COMPLETE_FORM });
      await acceptGenesisAndMatthew();
      await waitFor(() =>
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining('/bibles/search?q='),
          expect.anything()
        )
      );
      expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/bible-books/bible/'))).toBe(
        false
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('submits through the parent when Create Project is clicked', async () => {
    const onSubmit = vi.fn();
    renderTab({ formData: COMPLETE_FORM, onSubmit });
    await acceptGenesisAndMatthew();

    fireEvent.click(screen.getByRole('button', { name: 'createProject' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    // The files go with the submit, text included, so nothing has to be read again (#419).
    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ bookCode: 'GEN', usfm: GEN }),
      expect.objectContaining({ bookCode: 'MAT', usfm: MAT }),
    ]);
  });

  // #419, #420: a failed create used to bring the button back with nothing on screen.
  it("shows why Create Project failed, in the API's words", async () => {
    renderTab({
      formData: COMPLETE_FORM,
      createError: new Error('One or more requested books do not belong to the specified Bible'),
    });
    await acceptGenesisAndMatthew();

    const alert = screen.getByTestId('create-project-error');
    expect(alert).toHaveTextContent('errorProjectNotCreated');
    expect(alert).toHaveTextContent(
      'One or more requested books do not belong to the specified Bible'
    );
    // The success message stays where #420 puts it.
    expect(screen.getByText('usfmFilesValidated')).toBeInTheDocument();
  });

  it('says the server could not be reached when Create Project gets no answer', async () => {
    renderTab({
      formData: COMPLETE_FORM,
      createError: new NetworkError(new TypeError('Failed to fetch')),
    });
    await acceptGenesisAndMatthew();

    expect(screen.getByTestId('create-project-error')).toHaveTextContent(
      'errorCreateProjectNetwork'
    );
  });

  it('hides the last failure while a retry is running', async () => {
    renderTab({
      formData: COMPLETE_FORM,
      createError: new Error('File is not valid USFM'),
      isSubmitting: true,
    });
    await acceptGenesisAndMatthew();

    expect(screen.queryByTestId('create-project-error')).not.toBeInTheDocument();
  });
});
