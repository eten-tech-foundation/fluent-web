import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PericopeText } from '@/features/bible/components/PericopeText';

describe('pericope text states', () => {
  it('preserves loaded text while its request is loading or in error', () => {
    const content = '  Loaded scripture \t\n ';
    render(<PericopeText content={content} isError={true} isLoading={true} />);
    const text = screen.getByText('Loaded scripture');
    expect(text.textContent).toBe(content);
    expect(text).not.toHaveClass('text-muted-foreground', 'text-sm');
  });

  it.each([
    { isLoading: true, isError: true, expected: 'Loading...' },
    { isLoading: false, isError: true, expected: 'Unable to load Bible content.' },
    { isLoading: false, isError: false, expected: 'No content available' },
  ])('shows $expected for blank content', ({ isLoading, isError, expected }) => {
    render(<PericopeText content='   ' isError={isError} isLoading={isLoading} />);
    expect(screen.getByText(expected)).toHaveClass('text-muted-foreground', 'text-sm');
  });

  it('distinguishes an undrafted verse after a successful request', () => {
    const { rerender } = render(
      <PericopeText content='' emptyState='not-drafted' isError={true} />
    );
    expect(screen.getByText('Unable to load Bible content.')).toBeInTheDocument();
    expect(screen.queryByText('Not drafted')).not.toBeInTheDocument();
    rerender(<PericopeText content='' emptyState='not-drafted' />);
    expect(screen.getByText('Not drafted')).toHaveClass('text-muted-foreground', 'text-sm');
  });
});
