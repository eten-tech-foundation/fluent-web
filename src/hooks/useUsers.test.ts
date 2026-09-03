import React from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '@/test/render';

import { useUpdateActiveOrg } from './useUsers';

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useUpdateActiveOrg', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('passes orgId and AbortSignal to the fetch request', async () => {
    let capturedOrgId: number | null = null;
    let requestCaptured = false;

    server.use(
      http.patch(`${config.api.url}/users/me/active-org`, async ({ request }) => {
        const body = (await request.json()) as { orgId: number };
        capturedOrgId = body.orgId;
        requestCaptured = true;
        return new HttpResponse(null, { status: 200 });
      })
    );

    const controller = new AbortController();
    const { result } = renderHook(() => useUpdateActiveOrg(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ orgId: 42, signal: controller.signal });
    });

    await waitFor(() => {
      expect(requestCaptured).toBe(true);
    });

    expect(capturedOrgId).toBe(42);
  });
});
