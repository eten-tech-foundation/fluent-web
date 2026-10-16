import { describe, expect, it, vi } from 'vitest';

import * as useTruncationModule from '@/features/projects/hooks/useTruncation';
import { renderWithProviders, screen } from '@/test/render';

import { TruncatedCardText, TruncatedTableText } from './TruncatedText';

describe('TruncatedTableText', () => {
  it('renders text with truncate and min-w-0 classes when not truncated', () => {
    vi.spyOn(useTruncationModule, 'useTruncation').mockReturnValue({
      ref: { current: null },
      isTruncated: false,
    });

    renderWithProviders(<TruncatedTableText text='Short text' />);

    const element = screen.getByText('Short text');
    expect(element).toBeInTheDocument();
    expect(element).toHaveClass('truncate', 'min-w-0', 'max-w-full');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('renders with custom className passed as prop', () => {
    vi.spyOn(useTruncationModule, 'useTruncation').mockReturnValue({
      ref: { current: null },
      isTruncated: false,
    });

    renderWithProviders(
      <TruncatedTableText className='cursor-pointer text-blue-500' text='Clickable' />
    );

    const element = screen.getByText('Clickable');
    expect(element).toHaveClass('cursor-pointer', 'text-blue-500', 'min-w-0');
  });

  it('renders with tooltip trigger when isTruncated is true', async () => {
    vi.spyOn(useTruncationModule, 'useTruncation').mockReturnValue({
      ref: { current: null },
      isTruncated: true,
    });

    const { user } = renderWithProviders(
      <TruncatedTableText text='Very Long Header That Needs Truncation' />
    );

    const trigger = screen.getByText('Very Long Header That Needs Truncation');
    expect(trigger).toHaveClass('truncate', 'min-w-0', 'max-w-full');

    await user.hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Very Long Header That Needs Truncation'
    );
  });
});

describe('TruncatedCardText', () => {
  it('renders text with truncate and min-w-0 classes', () => {
    vi.spyOn(useTruncationModule, 'useTruncation').mockReturnValue({
      ref: { current: null },
      isTruncated: false,
    });

    renderWithProviders(<TruncatedCardText text='Card Title' />);

    const element = screen.getByText('Card Title');
    expect(element).toBeInTheDocument();
    expect(element).toHaveClass('truncate', 'min-w-0', 'max-w-full');
  });

  it('renders with tooltip when truncated', async () => {
    vi.spyOn(useTruncationModule, 'useTruncation').mockReturnValue({
      ref: { current: null },
      isTruncated: true,
    });

    const { user } = renderWithProviders(
      <TruncatedCardText text='Very Long Card Title That Needs Truncation' />
    );

    const trigger = screen.getByText('Very Long Card Title That Needs Truncation');
    expect(trigger).toHaveClass('truncate', 'min-w-0');

    await user.hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Very Long Card Title That Needs Truncation'
    );
  });
});
