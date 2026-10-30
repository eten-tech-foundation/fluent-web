import { describe, expect, it, vi } from 'vitest';

import { act, renderWithProviders, screen, waitFor } from '@/test/render';

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

describe('CreateProjectModal submission', () => {
  it('allows retry once the parent reports a save failure', async () => {
    let finish!: () => void;
    const onSave = vi.fn<(data: CreateProjectData) => Promise<void>>(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    const props = { isOpen: true, onClose: vi.fn(), onSave };
    const { user, rerender } = renderWithProviders(<CreateProjectModal {...props} />);
    await user.click(screen.getByText('Choose language'));
    await user.click(screen.getByText('Choose bible'));
    await user.click(screen.getByText('Complete fields'));
    const submit = screen.getByRole('button', { name: 'createProject' });
    await user.click(submit);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    expect(onSave).toHaveBeenCalledWith({
      title: 'Genesis',
      targetLanguage: 2,
      sourceLanguage: 1,
      sourceBible: 10,
      connectivityProfile: null,
      pericopeSetId: 1,
    });
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
  });

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
});
