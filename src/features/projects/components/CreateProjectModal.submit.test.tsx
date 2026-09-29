import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { act, fireEvent, renderWithProviders, screen, waitFor } from '@/test/render';

import { CreateProjectModal, type CreateProjectData } from './CreateProjectModal';
import { type ProjectFormData } from './ProjectFormFields';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/features/projects/hooks/useLanguages', () => ({
  useLanguages: () => ({ data: [], error: null }),
}));

vi.mock('./ProjectFormFields', () => ({
  ProjectFormFields: ({
    onFieldChange,
  }: {
    onFieldChange: <K extends keyof ProjectFormData>(field: K, value: ProjectFormData[K]) => void;
  }) => (
    <>
      <button onClick={() => onFieldChange('sourceLanguage', 1)}>Choose language</button>
      <button onClick={() => onFieldChange('sourceBible', 10)}>Choose bible</button>
      <button
        onClick={() => {
          onFieldChange('title', 'Genesis');
          onFieldChange('targetLanguage', 2);
          onFieldChange('pericopeSetId', 1);
        }}
      >
        Complete fields
      </button>
    </>
  ),
}));

vi.mock('@/lib/services/logger', () => ({ Logger: { logException: vi.fn() } }));

afterEach(() => {
  config.features.usfmImport = false;
});

const GEN_USFM = '\\id GEN Genesis\n\\c 1\n\\v 1 text';

/** Drop a one-book file on the Import tab and wait for the fields to replace the drop area. */
async function dropGenesis(): Promise<void> {
  const file = new File([GEN_USFM], 'gen.usfm');
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(GEN_USFM) });
  fireEvent.drop(screen.getByTestId('usfm-drop-area'), { dataTransfer: { files: [file] } });
  await screen.findByText('Complete fields');
}

describe('CreateProjectModal submission', () => {
  it.each(['new', 'import'] as const)(
    'allows retry in the %s tab once the parent reports a save failure',
    async tab => {
      config.features.usfmImport = true;
      let finish!: () => void;
      const onSave = vi.fn<(data: CreateProjectData) => Promise<void>>(
        () =>
          new Promise<void>(resolve => {
            finish = resolve;
          })
      );
      const props = { isOpen: true, onClose: vi.fn(), onSave };
      const { user, rerender } = renderWithProviders(<CreateProjectModal {...props} />);
      if (tab === 'import') {
        await user.click(screen.getByRole('tab', { name: 'importTab' }));
        await dropGenesis();
      }
      await user.click(screen.getByText('Choose language'));
      await user.click(screen.getByText('Choose bible'));
      await user.click(screen.getByText('Complete fields'));
      const submit = screen.getByRole('button', { name: 'createProject' });
      await user.click(submit);
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(submit).toBeDisabled();
      if (tab === 'import') {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            usfmFiles: [{ fileName: 'gen.usfm', bookCode: 'GEN', usfm: GEN_USFM }],
          })
        );
      } else {
        expect(onSave.mock.calls[0][0]).not.toHaveProperty('usfmFiles');
        // ProjectFormFields has no book picker (books moved to per-milestone selection), so the
        // New tab always submits an empty list — this just confirms the field is present as [].
        expect(onSave.mock.calls[0][0].books).toEqual([]);
      }
      await act(async () => {
        finish();
      });
      // The parent catches its own save errors, so onSave resolving proves nothing. The button
      // only comes back once the failure actually reaches the dialog through `error`.
      expect(submit).toBeDisabled();
      rerender(<CreateProjectModal {...props} error='Project not created' />);
      await waitFor(() => expect(submit).toBeEnabled());
      await user.click(submit);
      expect(onSave).toHaveBeenCalledTimes(2);
      await act(async () => {
        finish();
      });
    }
  );

  it('keeps the button disabled after a successful save and frees it on reopen', async () => {
    const onSave = vi.fn<(data: CreateProjectData) => Promise<void>>(() => Promise.resolve());
    const props = { isOpen: true, onClose: vi.fn(), onSave };
    const { user, rerender } = renderWithProviders(<CreateProjectModal {...props} />);
    await user.click(screen.getByText('Choose language'));
    await user.click(screen.getByText('Choose bible'));
    await user.click(screen.getByText('Complete fields'));
    const submit = screen.getByRole('button', { name: 'createProject' });
    await user.click(submit);
    expect(onSave).toHaveBeenCalledTimes(1);
    // isOpen follows the route's `modal` search param, so the dialog is still on screen with the
    // same valid form. Re-enabling here is what would let a second click duplicate the project.
    expect(submit).toBeDisabled();

    rerender(<CreateProjectModal {...props} isOpen={false} />);
    rerender(<CreateProjectModal {...props} />);
    await user.click(screen.getByText('Choose language'));
    await user.click(screen.getByText('Choose bible'));
    await user.click(screen.getByText('Complete fields'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'createProject' })).toBeEnabled()
    );
  });

  it('drops a manual book selection when the submit carries usfm files', async () => {
    config.features.usfmImport = true;
    const onSave = vi.fn<(data: CreateProjectData) => Promise<void>>(() => Promise.resolve());
    const { user } = renderWithProviders(
      <CreateProjectModal isOpen onClose={vi.fn()} onSave={onSave} />
    );
    // ProjectFormFields has no book picker anymore (see the earlier comment), so there is no
    // manual selection to drop here in the first place — this now just guards that books stays
    // empty end-to-end when submitting through the Import tab.
    await user.click(screen.getByText('Complete fields'));
    await user.click(screen.getByRole('tab', { name: 'importTab' }));
    await dropGenesis();
    await user.click(screen.getByText('Choose language'));
    await user.click(screen.getByText('Choose bible'));
    await user.click(screen.getByText('Complete fields'));
    await user.click(screen.getByRole('button', { name: 'createProject' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.usfmFiles).toHaveLength(1);
    expect(payload.books).toEqual([]);
  });
});
