import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { renderWithProviders, screen } from '@/test/render';

import { CreateProjectModal } from './CreateProjectModal';

// i18n is not part of the shared test providers, so keys come through unchanged.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const props = {
  isOpen: true,
  onClose: vi.fn(),
  onSave: vi.fn(async () => {}),
};

describe('CreateProjectModal (#418)', () => {
  afterEach(() => {
    config.features.usfmImport = false;
  });

  // USFM import moved to Add Milestone, so Create Project has no tabs even with the flag on.
  it.each([false, true])('shows no tab strip with the import flag %s', flag => {
    config.features.usfmImport = flag;
    renderWithProviders(<CreateProjectModal {...props} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'importTab' })).not.toBeInTheDocument();
  });

  it('shows the blank-project form directly', () => {
    config.features.usfmImport = true;
    renderWithProviders(<CreateProjectModal {...props} />);
    expect(screen.getByText('projectTitle')).toBeInTheDocument();
    expect(screen.getByText('sourceLanguageBible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'createProject' })).toBeInTheDocument();
  });
});
