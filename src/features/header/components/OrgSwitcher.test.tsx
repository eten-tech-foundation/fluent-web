import React from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES } from '@/lib/types';
import { useAppStore } from '@/store/store';
import { createTestQueryClient } from '@/test/render';

import { OrgSwitcher } from './OrgSwitcher';

const { mockNavigate, mockMutateAsync, mockRefresh } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockMutateAsync: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/hooks/useUsers', () => ({
  useUpdateActiveOrg: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

vi.mock('@/hooks/useRefreshUserDetail', () => ({
  useRefreshUserDetail: () => ({
    refresh: mockRefresh,
    applyUser: vi.fn(),
  }),
}));

const renderComponent = () => {
  const queryClient = createTestQueryClient();
  return render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(OrgSwitcher)
    )
  );
};

describe('OrgSwitcher - Abort & Timeout handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    useAppStore.setState({
      userdetail: {
        id: 1,
        email: 'user@example.com',
        username: 'testuser',
        role: ROLES.PROJECT_MANAGER,
        lastActiveOrgId: 1,
        grants: [
          {
            orgId: 1,
            orgName: 'Org 1',
            roleId: 1,
            roleName: ROLES.PROJECT_MANAGER,
            permissions: [],
          },
          {
            orgId: 2,
            orgName: 'Org 2',
            roleId: 2,
            roleName: ROLES.PROJECT_TRANSLATOR,
            permissions: [],
          },
        ],
      },
      isOrgSwitching: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes AbortSignal to updateActiveOrg and triggers abort + refresh on timeout', async () => {
    mockMutateAsync.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
      return new Promise((_, reject) => {
        if (signal) {
          signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }
      });
    });

    renderComponent();

    const dropdownButton = screen.getByRole('button', { name: /Org 1/i });
    fireEvent.click(dropdownButton);

    const org2RoleButton = screen.getByRole('button', { name: /Translator/i });
    fireEvent.click(org2RoleButton);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);

    const callArg = mockMutateAsync.mock.calls[0][0] as { orgId: number; signal?: AbortSignal };
    expect(callArg.orgId).toBe(2);
    expect(callArg.signal).toBeInstanceOf(AbortSignal);

    expect(toast.error).toHaveBeenCalledWith(
      'Organization switch timed out. Reconciling user details...'
    );
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('handles immediate AbortError and triggers refreshUserDetail', async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new DOMException('The operation was aborted', 'AbortError')
    );

    renderComponent();

    const dropdownButton = screen.getByRole('button', { name: /Org 1/i });
    fireEvent.click(dropdownButton);

    const org2RoleButton = screen.getByRole('button', { name: /Translator/i });

    await act(async () => {
      fireEvent.click(org2RoleButton);
    });

    expect(toast.error).toHaveBeenCalledWith(
      'Organization switch timed out. Reconciling user details...'
    );
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
