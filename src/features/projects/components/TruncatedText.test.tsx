import { afterEach, describe, expect, it, vi } from 'vitest';

import * as useTruncationModule from '@/features/projects/hooks/useTruncation';
import { renderWithProviders, screen } from '@/test/render';

import {
  TruncatedCardText,
  TruncatedMilestoneText,
  TruncatedTableText,
  wrapMilestoneName,
} from './TruncatedText';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TruncatedTableText', () => {
  it('renders text with truncate and min-w-0 classes when not truncated', () => {
    vi.spyOn(useTruncationModule, 'useTruncation').mockReturnValue({
      ref: vi.fn(),
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
      ref: vi.fn(),
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
      ref: vi.fn(),
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
      ref: vi.fn(),
      isTruncated: false,
    });

    renderWithProviders(<TruncatedCardText text='Card Title' />);

    const element = screen.getByText('Card Title');
    expect(element).toBeInTheDocument();
    expect(element).toHaveClass('truncate', 'min-w-0', 'max-w-full');
  });

  it('renders with tooltip when truncated', async () => {
    vi.spyOn(useTruncationModule, 'useTruncation').mockReturnValue({
      ref: vi.fn(),
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

describe('wrapMilestoneName', () => {
  it('returns empty array for empty or whitespace-only string', () => {
    expect(wrapMilestoneName('')).toEqual([]);
    expect(wrapMilestoneName('   ')).toEqual([]);
  });

  it('wraps text when it exceeds maxChars', () => {
    const text = 'This is a milestone name that should be wrapped into multiple lines';
    const lines = wrapMilestoneName(text, 25);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(25);
    }
  });

  it('chunks words longer than maxChars', () => {
    const text = 'SupercalifragilisticexpialidociousAndEvenLongerThanExpected';
    const lines = wrapMilestoneName(text, 20);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
  });
});

describe('TruncatedMilestoneText', () => {
  it('renders milestone text with default classes', () => {
    renderWithProviders(<TruncatedMilestoneText text='Short Milestone' />);
    const el = screen.getByText('Short Milestone');
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass('truncate', 'max-w-[200px]');
  });

  it('shows tooltip on hover when text is longer than 25 characters', async () => {
    const longMilestone = 'Milestone With Very Long Name That Exceeds Threshold';
    const { user } = renderWithProviders(<TruncatedMilestoneText text={longMilestone} />);

    const trigger = screen.getByText(longMilestone);
    await user.hover(trigger);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    const lines = wrapMilestoneName(longMilestone);
    for (const line of lines) {
      expect(tooltip).toHaveTextContent(line);
    }
  });
});
