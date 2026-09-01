import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UsfmImportTab } from './UsfmImportTab';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/** jsdom's File has no usable `text()`, so the component's read path needs one supplied. */
const usfmFile = (name: string, text: string): File => {
  const file = new File([text], name, { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
};

const drop = (files: File[]) => {
  fireEvent.drop(screen.getByTestId('usfm-drop-area'), {
    dataTransfer: { files, types: ['Files'] },
  });
};

describe('UsfmImportTab (#418)', () => {
  it('accepts a valid file and reports its book code', async () => {
    const onFilesAccepted = vi.fn();
    render(<UsfmImportTab onFilesAccepted={onFilesAccepted} />);
    drop([usfmFile('gen.usfm', '\\id GEN Genesis\n\\c 1\n\\v 1 text')]);
    await waitFor(() =>
      expect(onFilesAccepted).toHaveBeenCalledWith([expect.objectContaining({ bookCode: 'GEN' })])
    );
    expect(screen.getByText('GEN')).toBeInTheDocument();
  });

  it('accepts several files, one per book', async () => {
    const onFilesAccepted = vi.fn();
    render(<UsfmImportTab onFilesAccepted={onFilesAccepted} />);
    drop([usfmFile('gen.usfm', '\\id GEN Genesis'), usfmFile('mat.usfm', '\\id MAT Matthew')]);
    await waitFor(() => expect(onFilesAccepted).toHaveBeenCalled());
    expect(onFilesAccepted.mock.calls[0][0]).toHaveLength(2);
  });

  // #418 rejects the whole import if any single file fails; there is no partial import.
  it('imports nothing when one file of several is not USFM', async () => {
    const onFilesAccepted = vi.fn();
    render(<UsfmImportTab onFilesAccepted={onFilesAccepted} />);
    drop([usfmFile('gen.usfm', '\\id GEN Genesis'), usfmFile('bad.usfm', 'no markers here')]);
    await waitFor(() => expect(screen.getByText('errorNotValidUsfm')).toBeInTheDocument());
    expect(onFilesAccepted).not.toHaveBeenCalled();
    expect(screen.queryByText('GEN')).not.toBeInTheDocument();
  });

  it('shows the missing-book message when a file has no usable book code', async () => {
    render(<UsfmImportTab onFilesAccepted={vi.fn()} />);
    drop([usfmFile('x.usfm', '\\c 1\n\\v 1 text')]);
    await waitFor(() => expect(screen.getByText('errorMissingBookData')).toBeInTheDocument());
  });

  it('rejects two files that resolve to the same book', async () => {
    const onFilesAccepted = vi.fn();
    render(<UsfmImportTab onFilesAccepted={onFilesAccepted} />);
    drop([usfmFile('a.usfm', '\\id GEN Genesis'), usfmFile('b.usfm', '\\id GEN Genesis again')]);
    await waitFor(() => expect(screen.getByText('errorDuplicateBook')).toBeInTheDocument());
    expect(onFilesAccepted).not.toHaveBeenCalled();
  });

  it('accepts files chosen through the file input too', async () => {
    const onFilesAccepted = vi.fn();
    render(<UsfmImportTab onFilesAccepted={onFilesAccepted} />);
    fireEvent.change(screen.getByTestId('usfm-file-input'), {
      target: { files: [usfmFile('mat.usfm', '\\id MAT Matthew')] },
    });
    await waitFor(() => expect(onFilesAccepted).toHaveBeenCalled());
  });

  it('clears a previous error once a good batch arrives', async () => {
    render(<UsfmImportTab onFilesAccepted={vi.fn()} />);
    drop([usfmFile('bad.usfm', 'nothing')]);
    await waitFor(() => expect(screen.getByText('errorNotValidUsfm')).toBeInTheDocument());
    drop([usfmFile('gen.usfm', '\\id GEN Genesis')]);
    await waitFor(() => expect(screen.queryByText('errorNotValidUsfm')).not.toBeInTheDocument());
  });
});
