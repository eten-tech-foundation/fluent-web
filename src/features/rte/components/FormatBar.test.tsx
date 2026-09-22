import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FormatBar } from './FormatBar';

describe('formatting tooltips', () => {
  it('explains unavailable headings on keyboard focus without formatting scripture', async () => {
    const user = userEvent.setup();
    const onFormat = vi.fn();
    render(<FormatBar blockMarker='p' canAddHeading={false} onFormat={onFormat} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Paragraph' })).toHaveFocus();
    await user.tab();
    const explanation = 'Select a verse with fewer than four headings.';
    expect(await screen.findByRole('tooltip')).toHaveTextContent(explanation);
    expect(document.activeElement).toHaveAccessibleDescription(explanation);
    expect(screen.getByRole('button', { name: 'Section Heading' })).toBeDisabled();
    await user.keyboard('{Enter} ');
    expect(onFormat).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('explains why body formatting is unavailable inside a heading on hover', async () => {
    const user = userEvent.setup();
    render(<FormatBar canAddHeading blockMarker='s1' onFormat={vi.fn()} />);

    const paragraph = screen.getByRole('button', { name: 'Paragraph' });
    expect(paragraph).toBeDisabled();
    await user.hover(paragraph.parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Headings keep their text separate from verses.'
    );
  });

  it('names enabled controls on focus and keeps heading insertion and levels available', async () => {
    const user = userEvent.setup();
    const onFormat = vi.fn();
    const { rerender } = render(<FormatBar canAddHeading blockMarker='p' onFormat={onFormat} />);
    await user.tab();
    await user.tab();
    const heading = screen.getByRole('button', { name: 'Section Heading' });
    expect(heading).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Section Heading');
    await user.keyboard('{Enter}');
    expect(onFormat).toHaveBeenLastCalledWith('s1');

    rerender(<FormatBar canAddHeading blockMarker='s1' onFormat={onFormat} />);
    await user.click(screen.getByRole('button', { name: 'Level 3' }));
    expect(onFormat).toHaveBeenLastCalledWith('s3');
  });
});
