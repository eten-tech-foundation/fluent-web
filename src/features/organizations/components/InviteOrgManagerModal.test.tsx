import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InviteOrgManagerModal } from './InviteOrgManagerModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const setup = (overrides: Partial<React.ComponentProps<typeof InviteOrgManagerModal>> = {}) => {
  const onInvite = vi.fn<(d: { email: string; username: string }) => Promise<void>>(() =>
    Promise.resolve()
  );
  render(
    <InviteOrgManagerModal
      isOpen
      existingEmails={new Set(['taken@example.com'])}
      onClose={vi.fn()}
      onInvite={onInvite}
      {...overrides}
    />
  );
  return { onInvite, user: userEvent.setup() };
};

describe('InviteOrgManagerModal', () => {
  it('blocks submit and shows the duplicate message for an existing member email', async () => {
    const { user } = setup();

    await user.type(screen.getByLabelText(/email/), 'Taken@Example.com');
    await user.type(screen.getByLabelText(/username/), 'Someone');

    expect(screen.getByRole('alert')).toHaveTextContent('personAlreadyInOrganization');
    expect(screen.getByRole('button', { name: 'sendInvite' })).toBeDisabled();
  });

  it('submits a normalised email with the username and the Org Manager role fixed', async () => {
    const { user, onInvite } = setup();

    await user.type(screen.getByLabelText(/email/), 'New@Example.com ');
    await user.type(screen.getByLabelText(/username/), ' New Person ');
    await user.click(screen.getByRole('button', { name: 'sendInvite' }));

    expect(onInvite).toHaveBeenCalledWith({ email: 'new@example.com', username: 'New Person' });
    expect(screen.getByLabelText('role')).toHaveValue('Org Manager');
  });

  it('keeps the dialog open with its values when the invite rejects', async () => {
    const { user } = setup({
      onInvite: vi.fn(() => Promise.reject(new Error('boom'))),
      error: 'Something failed',
    });

    await user.type(screen.getByLabelText(/email/), 'new@example.com');
    await user.type(screen.getByLabelText(/username/), 'New Person');
    await user.click(screen.getByRole('button', { name: 'sendInvite' }));

    expect(screen.getByLabelText(/email/)).toHaveValue('new@example.com');
    expect(screen.getByLabelText(/username/)).toHaveValue('New Person');
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });
});
