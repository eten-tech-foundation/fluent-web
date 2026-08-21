import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

import Header from './index';

// The header carries two distinct menus. They were both named "User menu", so a screen reader
// announced the main navigation as the account menu, and any name-based query (tests, automation)
// silently matched the wrong one.

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', state: {} }),
}));

// Both menus hide themselves when nobody is signed in, so the triggers only exist for an
// authenticated user.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 1, email: 't@fluent.local' } }),
}));

describe('Header menus', () => {
  it('gives each menu its own accessible name', () => {
    renderWithProviders(<Header />);

    expect(screen.getByRole('button', { name: 'Main menu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User menu' })).toBeInTheDocument();
  });

  it('leaves no two buttons sharing a name', () => {
    renderWithProviders(<Header />);

    const names = screen
      .getAllByRole('button')
      .map(button => button.getAttribute('aria-label') ?? button.textContent.trim())
      .filter(Boolean);

    expect(new Set(names).size).toBe(names.length);
  });
});
