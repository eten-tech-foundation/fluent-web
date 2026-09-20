import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RecordedNoticeDialog } from './RecordedNoticeDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const notice = {
  textBibleKey: 'dbl-text',
  textBibleName: 'Berean Standard Bible text',
  recordingKey: 'aq-1',
  recordingName: 'Berean Standard Bible recording',
  recordingProvider: 'aquifer' as const,
  notice: 'This recording is in the public domain.',
};

describe('RecordedNoticeDialog', () => {
  it('names both actual sources, renders curated data, and closes from its one action', () => {
    const close = vi.fn();
    render(<RecordedNoticeDialog notice={notice} onClose={close} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Recording information');
    expect(screen.getByText('Berean Standard Bible text')).toBeInTheDocument();
    expect(screen.getByText('Aquifer: Berean Standard Bible recording')).toBeInTheDocument();
    expect(screen.getByText(notice.notice)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([null, { ...notice, notice: '' }])('renders nothing for absent/blank data', value => {
    const { container } = render(<RecordedNoticeDialog notice={value} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
