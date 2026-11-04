import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { bookFile, PROJECT_ID, usfmCheckHandler } from '@/test/msw/usfm-milestone-import';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/render';

import { AddMilestoneDialog } from './AddMilestoneDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PROJECT = {
  name: 'Kachi Koli NT',
  sourceLanguageName: 'Gujarati',
  sourceName: 'IRV Gujarati',
  targetLanguageName: 'Kachi Koli',
};

const renderDialog = () =>
  renderWithProviders(
    <AddMilestoneDialog
      isOpen
      project={PROJECT}
      projectId={PROJECT_ID}
      sourceBible={7}
      onClose={vi.fn()}
    />
  );

beforeEach(() => {
  server.use(
    http.get(`${config.api.url}/bible-books/bible/7`, () => HttpResponse.json([])),
    http.get(`${config.api.url}/projects/${PROJECT_ID}/milestones`, () => HttpResponse.json([])),
    usfmCheckHandler()
  );
});

afterEach(() => {
  config.features.usfmImport = false;
});

describe('AddMilestoneDialog tabs (#418)', () => {
  it('keeps the plain Add Milestone form while the import flag is off', () => {
    config.features.usfmImport = false;
    renderDialog();

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('selectBooks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'save' })).toBeInTheDocument();
    expect(screen.queryByTestId('usfm-drop-area')).not.toBeInTheDocument();
  });

  it('opens on New, with the existing form, once the flag is on', () => {
    config.features.usfmImport = true;
    renderDialog();

    expect(screen.getByRole('tab', { name: 'newTab' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'importTab' })).toBeInTheDocument();
    expect(screen.getByText('selectBooks')).toBeVisible();
    expect(screen.getByRole('button', { name: 'save' })).toBeVisible();
    expect(screen.getByTestId('usfm-drop-area')).not.toBeVisible();
  });

  it('opens on New again after closing from the Import tab', async () => {
    config.features.usfmImport = true;
    const onClose = vi.fn();
    const { user, rerender } = renderWithProviders(
      <AddMilestoneDialog
        isOpen
        project={PROJECT}
        projectId={PROJECT_ID}
        sourceBible={7}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'importTab' }));
    await user.click(screen.getByRole('button', { name: 'cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    const props = { project: PROJECT, projectId: PROJECT_ID, sourceBible: 7, onClose };
    rerender(<AddMilestoneDialog isOpen={false} {...props} />);
    rerender(<AddMilestoneDialog isOpen {...props} />);

    expect(screen.getByRole('tab', { name: 'newTab' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the upload, its fields and Import on the Import tab, with no size warning', async () => {
    config.features.usfmImport = true;
    const { user } = renderDialog();

    await user.click(screen.getByRole('tab', { name: 'importTab' }));

    expect(screen.getByTestId('usfm-drop-area')).toBeVisible();
    expect(screen.getByRole('button', { name: 'importMilestone' })).toBeVisible();
    expect(screen.getByTestId('usfm-import-destination')).toHaveTextContent('Kachi Koli NT');
    expect(screen.queryByRole('button', { name: 'save' })).not.toBeInTheDocument();
    expect(screen.queryByText('largeMilestoneWarning')).not.toBeInTheDocument();
  });

  it('keeps the listed files when the user looks at New and comes back', async () => {
    config.features.usfmImport = true;
    const { user } = renderDialog();

    await user.click(screen.getByRole('tab', { name: 'importTab' }));
    fireEvent.drop(screen.getByTestId('usfm-drop-area'), {
      dataTransfer: { files: [bookFile('JUD')], types: ['Files'] },
    });
    await waitFor(() => expect(screen.getByText('Kachi-Koli-JUD.usfm')).toBeVisible());

    await user.click(screen.getByRole('tab', { name: 'newTab' }));
    await user.click(screen.getByRole('tab', { name: 'importTab' }));

    expect(screen.getByText('Kachi-Koli-JUD.usfm')).toBeVisible();
  });
});
