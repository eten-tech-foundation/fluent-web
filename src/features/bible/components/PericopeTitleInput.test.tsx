import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PericopeTitleInput } from '@/features/bible/components/PericopeTitleInput';

describe('PericopeTitleInput', () => {
  it('explains the heading limit and prevents adding a fifth heading', async () => {
    const onChange = vi.fn();
    render(
      <PericopeTitleInput
        maxHeadingsReached
        readOnly={false}
        value=''
        verseNumber={1}
        onChange={onChange}
        onFocus={vi.fn()}
      />
    );
    const input = screen.getByRole('textbox', { name: 'Section title' });
    expect(input).toHaveAccessibleDescription(
      'Keep at most four headings before a verse to save your changes.'
    );
    await userEvent.setup().type(input, 'New title');
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });
});
