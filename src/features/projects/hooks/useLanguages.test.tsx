import { type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { type Language, useLanguages } from '@/features/projects/hooks/useLanguages';
import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '@/test/render';

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const sampleLanguages: Language[] = [
  {
    id: 1,
    langName: 'English',
    langNameLocalized: 'English',
    langCodeIso6393: 'eng',
    scriptDirection: 'LTR',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
];

describe('useLanguages', () => {
  it('fetches the language list from the API (through MSW)', async () => {
    server.use(http.get(`${config.api.url}/languages`, () => HttpResponse.json(sampleLanguages)));

    const { result } = renderHook(() => useLanguages(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(sampleLanguages);
  });

  it('surfaces an error when the API responds with a failure', async () => {
    server.use(
      http.get(`${config.api.url}/languages`, () => new HttpResponse(null, { status: 500 }))
    );

    const { result } = renderHook(() => useLanguages(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
