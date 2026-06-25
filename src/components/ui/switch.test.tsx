import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from './switch';

describe('Switch', () => {
  it('renders without crashing', () => {
    render(<Switch />);
    expect(document.querySelector('[data-slot="switch"]')).toBeInTheDocument();
  });

  it('renders the thumb element', () => {
    render(<Switch />);
    expect(document.querySelector('[data-slot="switch-thumb"]')).toBeInTheDocument();
  });

  it('is unchecked by default', () => {
    render(<Switch />);
    const switchEl = document.querySelector('[data-slot="switch"]');
    expect(switchEl).toHaveAttribute('data-state', 'unchecked');
  });

  it('renders checked when the checked prop is true', () => {
    render(<Switch checked onCheckedChange={() => {}} />);
    const switchEl = document.querySelector('[data-slot="switch"]');
    expect(switchEl).toHaveAttribute('data-state', 'checked');
  });

  it('renders unchecked when the checked prop is false', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} />);
    const switchEl = document.querySelector('[data-slot="switch"]');
    expect(switchEl).toHaveAttribute('data-state', 'unchecked');
  });

  it('calls onCheckedChange when clicked', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} />);
    const switchEl = document.querySelector('[data-slot="switch"]') as HTMLElement;
    fireEvent.click(switchEl);
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('calls onCheckedChange with false when toggled off', () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked onCheckedChange={onCheckedChange} />);
    const switchEl = document.querySelector('[data-slot="switch"]') as HTMLElement;
    fireEvent.click(switchEl);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it('is accessible as a switch role', () => {
    render(<Switch aria-label='Toggle feature' />);
    expect(screen.getByRole('switch', { name: 'Toggle feature' })).toBeInTheDocument();
  });

  it('merges extra className into the root element', () => {
    render(<Switch className='custom-class' />);
    const switchEl = document.querySelector('[data-slot="switch"]');
    expect(switchEl).toHaveClass('custom-class');
  });

  it('is disabled when the disabled prop is set', () => {
    render(<Switch disabled />);
    const switchEl = document.querySelector('[data-slot="switch"]') as HTMLButtonElement;
    expect(switchEl).toBeDisabled();
  });

  it('does not call onCheckedChange when disabled', () => {
    const onCheckedChange = vi.fn();
    render(<Switch disabled checked={false} onCheckedChange={onCheckedChange} />);
    const switchEl = document.querySelector('[data-slot="switch"]') as HTMLElement;
    fireEvent.click(switchEl);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('forwards a ref or any other native prop (aria-label) to the underlying element', () => {
    render(<Switch aria-label='Dark mode' />);
    const switchEl = document.querySelector('[data-slot="switch"]');
    expect(switchEl).toHaveAttribute('aria-label', 'Dark mode');
  });

  it('can be identified by an id linked from a label', () => {
    render(
      <>
        <label htmlFor='my-switch'>My Switch</label>
        <Switch id='my-switch' />
      </>
    );
    expect(screen.getByRole('switch', { name: 'My Switch' })).toBeInTheDocument();
  });
});