import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '@/test/render';

import {
  ORG_NAME_CONFLICT_MESSAGE,
  useCreateOrganization,
  useOrganizations,
} from './useOrganizations';

const url = `${config.api.url}/organizations`;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
);

describe('useOrganizations', () => {
  it('returns the org summaries from GET /organizations', async () => {
    server.use(
      http.get(url, () =>
        HttpResponse.json([
          { id: 1, name: 'Alpha', createdAt: '2026-01-01T00:00:00.000Z', orgManagerCount: 2 },
        ])
      )
    );

    const { result } = renderHook(() => useOrganizations(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: 1, name: 'Alpha', createdAt: '2026-01-01T00:00:00.000Z', orgManagerCount: 2 },
    ]);
  });
});

describe('useCreateOrganization', () => {
  it('maps a 409 to the duplicate-name message', async () => {
    server.use(http.post(url, () => HttpResponse.json({ message: 'Conflict' }, { status: 409 })));

    const { result } = renderHook(() => useCreateOrganization(), { wrapper });

    await expect(result.current.mutateAsync({ name: 'Alpha' })).rejects.toThrow(
      ORG_NAME_CONFLICT_MESSAGE
    );
  });

  it('resolves with the created org on 201', async () => {
    server.use(
      http.post(url, async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({ id: 7, name: body.name, createdAt: null }, { status: 201 });
      })
    );

    const { result } = renderHook(() => useCreateOrganization(), { wrapper });

    await expect(result.current.mutateAsync({ name: 'Beta' })).resolves.toEqual({
      id: 7,
      name: 'Beta',
      createdAt: null,
    });
  });
});
