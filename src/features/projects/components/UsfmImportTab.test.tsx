import { describe, expect, it, vi } from 'vitest';

import { act, fireEvent, renderWithProviders, screen, waitFor } from '@/test/render';

import { type ProjectFormData } from './ProjectFormFields';
import { UsfmImportTab } from './UsfmImportTab';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const EMPTY_FORM: ProjectFormData = {
  title: '',
  targetLanguage: null,
  sourceLanguage: null,
  sourceBible: null,
  books: [],
  connectivityProfile: null,
  pericopeSetId: null,
};

const COMPLETE_FORM: ProjectFormData = {
  ...EMPTY_FORM,
  title: 'Genesis project',
  sourceLanguage: 1,
  sourceBible: 10,
  targetLanguage: 2,
  pericopeSetId: 1,
};

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

const GEN = '\\id GEN Genesis\n\\c 1\n\\v 1 text';
const MAT = '\\id MAT Matthew\n\\c 1\n\\v 1 text';

describe('UsfmImportTab upload and validation (#418)', () => {
  it('accepts a valid file and reports its book code', async () => {
    const onFilesAccepted = vi.fn();
    renderTab({ onFilesAccepted });
    drop([usfmFile('gen.usfm', GEN)]);
    await waitFor(() =>
      expect(onFilesAccepted).toHaveBeenCalledWith([expect.objectContaining({ bookCode: 'GEN' })])
    );
  });

  it('accepts several files, one per book', async () => {
    const onFilesAccepted = vi.fn();
    renderTab({ onFilesAccepted });
    drop([usfmFile('gen.usfm', GEN), usfmFile('mat.usfm', MAT)]);
    await waitFor(() => expect(onFilesAccepted).toHaveBeenCalled());
    expect(onFilesAccepted.mock.calls[0][0]).toHaveLength(2);
  });

  // #418 rejects the whole import if any single file fails; there is no partial import.
  it('imports nothing when one file of several is not USFM', async () => {
    const onFilesAccepted = vi.fn();
    renderTab({ onFilesAccepted });
    drop([usfmFile('gen.usfm', GEN), usfmFile('bad.usfm', 'no markers here')]);
    await waitFor(() => expect(screen.getByText('errorNotValidUsfm')).toBeInTheDocument());
    expect(onFilesAccepted).not.toHaveBeenCalled();
    expect(screen.getByTestId('usfm-drop-area')).toBeInTheDocument();
  });

  it('shows the missing-book message when a file has no usable book code', async () => {
    renderTab();
    drop([usfmFile('x.usfm', '\\c 1\n\\v 1 text')]);
    await waitFor(() => expect(screen.getByText('errorMissingBookData')).toBeInTheDocument());
  });

  it('rejects two files that resolve to the same book', async () => {
    const onFilesAccepted = vi.fn();
    renderTab({ onFilesAccepted });
    drop([usfmFile('a.usfm', GEN), usfmFile('b.usfm', '\\id GEN Genesis again')]);
    await waitFor(() => expect(screen.getByText('errorDuplicateBook')).toBeInTheDocument());
    expect(onFilesAccepted).not.toHaveBeenCalled();
  });

  it('accepts files chosen through the file input too', async () => {
    const onFilesAccepted = vi.fn();
    renderTab({ onFilesAccepted });
    fireEvent.change(screen.getByTestId('usfm-file-input'), {
      target: { files: [usfmFile('mat.usfm', MAT)] },
    });
    await waitFor(() => expect(onFilesAccepted).toHaveBeenCalled());
  });

  // A browser fires no change event when the input's value has not changed, so holding on to
  // the last filename strands the user: correcting that file and picking it again does nothing.
  it('clears the file input so the same file can be picked again after a failure', async () => {
    renderTab();
    const input: HTMLInputElement = screen.getByTestId('usfm-file-input');
    const tracked = trackInputValue(input, 'C:\\fakepath\\bad.usfm');

    fireEvent.change(input, { target: { files: [usfmFile('bad.usfm', 'no markers here')] } });
    await waitFor(() => expect(screen.getByText('errorNotValidUsfm')).toBeInTheDocument());

    expect(tracked.value).toBe('');
  });

  // Reading a file is async, so two quick selections can finish out of order. The newer one is
  // what the user is looking at, so a slow older batch must not overwrite it.
  it('ignores a batch a newer selection has superseded', async () => {
    const onFilesAccepted = vi.fn();
    renderTab({ onFilesAccepted });

    const slow = pendingUsfmFile('bad.usfm');
    drop([slow.file]);
    drop([usfmFile('gen.usfm', '\\id GEN Genesis')]);
    await waitFor(() => expect(screen.getByTestId('detected-books')).toHaveTextContent('GEN'));

    slow.finish('no markers here');
    // Let the superseded batch resume, so it gets its chance to clobber the newer result.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(screen.queryByText('errorNotValidUsfm')).not.toBeInTheDocument();
    expect(screen.getByTestId('detected-books')).toHaveTextContent('GEN');
    expect(onFilesAccepted).toHaveBeenCalledTimes(1);
  });
});

describe('UsfmImportTab fields after validation (#420)', () => {
  it('replaces the upload area with the project fields', async () => {
    renderTab();
    drop([usfmFile('gen.usfm', GEN)]);
    await waitFor(() => expect(screen.getByText('projectTitle')).toBeInTheDocument());
    expect(screen.queryByTestId('usfm-drop-area')).not.toBeInTheDocument();
  });

  it('keeps the uploaded file names on screen as a reference', async () => {
    renderTab();
    drop([usfmFile('gen.usfm', GEN), usfmFile('mat.usfm', MAT)]);
    await waitFor(() => expect(screen.getByTestId('accepted-files')).toBeInTheDocument());
    expect(screen.getByText('gen.usfm')).toBeInTheDocument();
    expect(screen.getByText('mat.usfm')).toBeInTheDocument();
  });

  it('shows the detected books read-only rather than as a picker', async () => {
    renderTab();
    drop([usfmFile('gen.usfm', GEN), usfmFile('mat.usfm', MAT)]);
    await waitFor(() => expect(screen.getByTestId('detected-books')).toHaveTextContent('GEN, MAT'));
  });

  it('keeps the validation success message with the fields', async () => {
    renderTab();
    drop([usfmFile('gen.usfm', GEN)]);
    await waitFor(() => expect(screen.getByText('usfmFilesValidated')).toBeInTheDocument());
  });

  it('leaves Create Project disabled until the manual fields are filled', async () => {
    renderTab();
    drop([usfmFile('gen.usfm', GEN)]);
    await waitFor(() => expect(screen.getByText('createProject')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'createProject' })).toBeDisabled();
  });

  it('keeps Create Project disabled without a pericope set, since the modal would refuse it', async () => {
    renderTab({ formData: { ...COMPLETE_FORM, pericopeSetId: null } });
    drop([usfmFile('gen.usfm', GEN)]);
    await waitFor(() => expect(screen.getByText('createProject')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'createProject' })).toBeDisabled();
  });

  it('enables Create Project once title, source bible, target language and pericope set are set', async () => {
    renderTab({ formData: COMPLETE_FORM });
    drop([usfmFile('gen.usfm', GEN)]);
    await waitFor(() => expect(screen.getByText('createProject')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'createProject' })).toBeEnabled();
  });

  it('submits through the parent when Create Project is clicked', async () => {
    const onSubmit = vi.fn();
    renderTab({ formData: COMPLETE_FORM, onSubmit });
    drop([usfmFile('gen.usfm', GEN)]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'createProject' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'createProject' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
