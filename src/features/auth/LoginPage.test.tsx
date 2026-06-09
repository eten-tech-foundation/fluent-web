import { type ReactNode } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from '@/features/auth/LoginPage';

import type * as ReactRouter from '@tanstack/react-router';

const { mockSignInEmail, mockRequestPasswordReset } = vi.hoisted(() => ({
  mockSignInEmail: vi.fn(),
  mockRequestPasswordReset: vi.fn(),
}));

// Decouple from the real router so LoginPage renders without a RouterProvider.
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof ReactRouter>();
  return {
    ...actual,
    useSearch: () => ({}),
    Link: ({ children, to }: { children: ReactNode; to?: string }) => (
      <a href={to ?? '#'}>{children}</a>
    ),
  };
});

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: mockSignInEmail },
    requestPasswordReset: mockRequestPasswordReset,
  },
}));

// LoginPage keeps all three views in the DOM (toggled via CSS), so scope
// queries to the first <form> — the login view — to stay unambiguous.
function loginForm(container: HTMLElement) {
  return within(container.querySelectorAll('form')[0] as HTMLElement);
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows field errors and skips the API when the form is empty', async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);

    await user.click(loginForm(container).getByRole('button', { name: /continue/i }));

    expect(screen.getByText('Please enter an email address')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(mockSignInEmail).not.toHaveBeenCalled();
  });

  it('does not call the API when the email format is invalid', async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);
    const form = loginForm(container);

    await user.type(form.getByPlaceholderText('Email address*'), 'not-an-email');
    await user.type(form.getByPlaceholderText('Password*'), 'secret');
    await user.click(form.getByRole('button', { name: /continue/i }));

    // type="email" constraint validation blocks the submit before sign-in runs.
    expect(mockSignInEmail).not.toHaveBeenCalled();
  });

  it('submits trimmed credentials to authClient.signIn.email', async () => {
    mockSignInEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);
    const form = loginForm(container);

    await user.type(form.getByPlaceholderText('Email address*'), '  pm@fluent.local  ');
    await user.type(form.getByPlaceholderText('Password*'), 'pm@123456');
    await user.click(form.getByRole('button', { name: /continue/i }));

    await waitFor(() =>
      expect(mockSignInEmail).toHaveBeenCalledWith({
        email: 'pm@fluent.local',
        password: 'pm@123456',
      })
    );
  });

  it('shows the server error message when sign-in fails', async () => {
    mockSignInEmail.mockResolvedValue({ error: { message: 'Wrong email or password' } });
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);
    const form = loginForm(container);

    await user.type(form.getByPlaceholderText('Email address*'), 'pm@fluent.local');
    await user.type(form.getByPlaceholderText('Password*'), 'wrong');
    await user.click(form.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText('Wrong email or password')).toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);
    const password = loginForm(container).getByPlaceholderText('Password*');

    expect(password).toHaveAttribute('type', 'password');

    const toggle = password.parentElement?.querySelector('button');
    if (!toggle) throw new Error('password visibility toggle not found');
    await user.click(toggle);

    expect(password).toHaveAttribute('type', 'text');
  });
});
