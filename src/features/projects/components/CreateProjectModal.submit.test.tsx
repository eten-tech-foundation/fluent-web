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
          onFieldChange('books', [1]);
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

describe('CreateProjectModal submission', () => {
  it.each(['new', 'import'] as const)(
    'allows retry in the %s tab when the parent handles a save failure',
    async tab => {
      config.features.usfmImport = true;
      let finish!: () => void;
      const onSave = vi.fn<(data: CreateProjectData) => Promise<void>>(
        () =>
          new Promise<void>(resolve => {
            finish = resolve;
          })
      );
      const { user } = renderWithProviders(
        <CreateProjectModal isOpen onClose={vi.fn()} onSave={onSave} />
      );
      if (tab === 'import') {
        await user.click(screen.getByRole('tab', { name: 'importTab' }));
        const usfm = '\\id GEN Genesis\n\\c 1\n\\v 1 text';
        const file = new File([usfm], 'gen.usfm');
        Object.defineProperty(file, 'text', { value: () => Promise.resolve(usfm) });
        fireEvent.drop(screen.getByTestId('usfm-drop-area'), { dataTransfer: { files: [file] } });
        await screen.findByText('Complete fields');
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
            usfmFiles: [
              {
                fileName: 'gen.usfm',
                bookCode: 'GEN',
                usfm: '\\id GEN Genesis\n\\c 1\n\\v 1 text',
              },
            ],
          })
        );
      } else {
        expect(onSave.mock.calls[0][0]).not.toHaveProperty('usfmFiles');
      }
      await act(async () => {
        finish();
      });
      await waitFor(() => expect(submit).toBeEnabled());
      await user.click(submit);
      expect(onSave).toHaveBeenCalledTimes(2);
      await act(async () => {
        finish();
      });
    }
  );
});
