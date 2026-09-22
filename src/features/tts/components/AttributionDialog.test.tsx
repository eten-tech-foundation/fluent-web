import { useState } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AttributionDialog } from './AttributionDialog';

import type { RecordedNoticeAcknowledgment } from '../lib/ackStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const entries: RecordedNoticeAcknowledgment[] = [
  {
    acknowledgedAt: '2026-09-22T12:00:00.000Z',
    notice: {
      textBibleKey: 'text-1',
      textBibleName: 'First text',
      recordingKey: 'recording-1',
      recordingName: 'First recording',
      recordingProvider: 'aquifer',
      notice: 'First licence.',
    },
  },
  {
    acknowledgedAt: '2026-09-22T11:00:00.000Z',
    notice: {
      textBibleKey: 'text-2',
      textBibleName: 'Second text',
      recordingKey: 'recording-2',
      recordingName: 'Second recording',
      recordingProvider: 'dbl',
      notice: 'Second licence.',
    },
  },
];

function Harness({ entries: values }: { entries: RecordedNoticeAcknowledgment[] }) {
  const [open, setOpen] = useState(false);
  return (
    <AttributionDialog
      entries={values}
      open={open}
      trigger={<button type='button'>Audio sources & licences</button>}
      onOpenChange={setOpen}
    />
  );
}

describe('AttributionDialog', () => {
  it('shows the empty state and restores the launcher after closing', async () => {
    const user = userEvent.setup();
    render(<Harness entries={[]} />);
    const launcher = screen.getByRole('button', { name: 'Audio sources & licences' });
    await user.click(launcher);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Audio sources & licences');
    expect(
      screen.getByText('No audio sources have been played on this device yet.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(launcher).toHaveFocus();
  });

  it('lists every acknowledged text and recording pair', async () => {
    render(<Harness entries={entries} />);
    await userEvent.click(screen.getByRole('button', { name: 'Audio sources & licences' }));
    expect(screen.getByText('First text')).toBeInTheDocument();
    expect(screen.getByText('Aquifer: First recording')).toBeInTheDocument();
    expect(screen.getByText('First licence.')).toBeInTheDocument();
    expect(screen.getByText('Second text')).toBeInTheDocument();
    expect(screen.getByText('API.Bible: Second recording')).toBeInTheDocument();
    expect(screen.getByText('Second licence.')).toBeInTheDocument();
  });
});
