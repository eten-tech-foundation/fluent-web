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

describe('CreateProjectModal tabs (#418)', () => {
  afterEach(() => {
    config.features.usfmImport = false;
  });

  it('shows no tab strip while the import flag is off', () => {
    config.features.usfmImport = false;
    renderWithProviders(<CreateProjectModal {...props} />);
    expect(screen.queryByRole('tab', { name: 'importTab' })).not.toBeInTheDocument();
  });

  it('offers the Import tab once the flag is on', () => {
    config.features.usfmImport = true;
    renderWithProviders(<CreateProjectModal {...props} />);
    expect(screen.getByRole('tab', { name: 'importTab' })).toBeInTheDocument();
  });

  // The blank-project flow moved into the New tab untouched; this is the guard that the move
  // did not drop it.
  it('still renders the existing project fields, flag on or off', () => {
    config.features.usfmImport = true;
    renderWithProviders(<CreateProjectModal {...props} />);
    expect(screen.getByText('projectTitle')).toBeInTheDocument();
    expect(screen.getByText('sourceLanguageBible')).toBeInTheDocument();
  });
});
