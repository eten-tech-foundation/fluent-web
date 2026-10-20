import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FormatBar } from './FormatBar';

describe('formatting tooltips', () => {
  it('offers repeated insertion separately from the pressed Paragraph format', async () => {
    const user = userEvent.setup();
    const onFormat = vi.fn();
    const onInsertParagraph = vi.fn();
    render(
      <FormatBar
        canAddHeading
        blockMarker='p'
        onFormat={onFormat}
        onInsertParagraph={onInsertParagraph}
      />
    );
    const insert = screen.getByRole('button', { name: 'Insert paragraph' });
    expect(insert).not.toHaveAttribute('aria-pressed');
    await user.click(insert);
    await user.click(insert);
    expect(onInsertParagraph).toHaveBeenCalledTimes(2);
    expect(onFormat).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Paragraph' }));
    expect(onFormat).toHaveBeenCalledWith('p');
  });

  // #472 QA: a text button stood out in a bar of icons and pushed against the language name.
  it('shows Insert paragraph as an icon, named in its tooltip like the rest of the bar', async () => {
    const user = userEvent.setup();
    render(
      <FormatBar canAddHeading blockMarker='p' onFormat={vi.fn()} onInsertParagraph={vi.fn()} />
    );
    const insert = screen.getByRole('button', { name: 'Insert paragraph' });
    expect(insert).toHaveTextContent(/^$/);
    expect(insert.querySelector('svg')).toBeInTheDocument();
    await user.hover(insert);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Insert paragraph$/);
  });

  // #472 QA: the tooltip of a disabled icon names it, rather than explaining why it is disabled.
  it.each(['Paragraph', 'Poetry Line'])(
    'names disabled %s inside a heading instead of explaining it',
    async name => {
      const user = userEvent.setup();
      render(<FormatBar canAddHeading blockMarker='s1' onFormat={vi.fn()} />);

      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      await user.hover(button.parentElement!);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(new RegExp(`^${name}$`));
    }
  );

  it('names unavailable headings on keyboard focus without formatting scripture', async () => {
    const user = userEvent.setup();
    const onFormat = vi.fn();
    render(<FormatBar blockMarker='p' canAddHeading={false} onFormat={onFormat} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Paragraph' })).toHaveFocus();
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Section Heading$/);
    expect(document.activeElement).toHaveAccessibleDescription('Section Heading');
    expect(screen.getByRole('button', { name: 'Section Heading' })).toBeDisabled();
    await user.keyboard('{Enter} ');
    expect(onFormat).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('names enabled controls on focus and adds a heading from H outside one', async () => {
    const user = userEvent.setup();
    const onFormat = vi.fn();
    render(<FormatBar canAddHeading blockMarker='p' onFormat={onFormat} />);
    await user.tab();
    await user.tab();
    const heading = screen.getByRole('button', { name: 'Section Heading' });
    expect(heading).toHaveFocus();
    expect(heading).not.toHaveAttribute('aria-haspopup');
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Section Heading');
    await user.keyboard('{Enter}');
    expect(onFormat).toHaveBeenLastCalledWith('s1');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

// #472 QA: listing every level in the bar collided with the language name, so inside a heading
// H opens a menu of the levels instead.
describe('heading level menu', () => {
  it('keeps the levels out of the bar until H is opened', () => {
    render(<FormatBar canAddHeading blockMarker='s2' onFormat={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /^Level/ })).not.toBeInTheDocument();
    const heading = screen.getByRole('button', { name: 'Section Heading' });
    expect(heading).toHaveAttribute('aria-pressed', 'true');
    expect(heading).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('lists the four levels with the current one checked, and applies the one picked', async () => {
    const user = userEvent.setup();
    const onFormat = vi.fn();
    render(<FormatBar canAddHeading blockMarker='s2' onFormat={onFormat} />);

    await user.click(screen.getByRole('button', { name: 'Section Heading' }));
    const menu = await screen.findByRole('menu');
    const levels = within(menu).getAllByRole('menuitemradio');
    expect(levels.map(level => level.getAttribute('aria-label'))).toEqual([
      'Level 1',
      'Level 2',
      'Level 3',
      'Level 4',
    ]);
    expect(within(menu).getByRole('menuitemradio', { name: 'Level 2' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Level 3' }));

    expect(onFormat).toHaveBeenCalledWith('s3');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('hands the caret back to the text after a pick, and focus back to H after Escape', async () => {
    const user = userEvent.setup();
    const onFormat = vi.fn();
    const focusEditor = vi.fn();
    render(
      <FormatBar canAddHeading blockMarker='s1' focusEditor={focusEditor} onFormat={onFormat} />
    );
    const heading = screen.getByRole('button', { name: 'Section Heading' });

    heading.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(heading).toHaveFocus());
    expect(focusEditor).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onFormat).toHaveBeenLastCalledWith('s3');
    await waitFor(() => expect(focusEditor).toHaveBeenCalledTimes(1));
  });

  it('does not open while the bar is disabled', async () => {
    const user = userEvent.setup();
    render(<FormatBar canAddHeading disabled blockMarker='s1' onFormat={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Section Heading' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
