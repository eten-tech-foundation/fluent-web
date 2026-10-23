import { type ReactNode, useState } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { useCreateProject } from '@/features/projects/hooks/useProjects';
import { buildProjectMetadata } from '@/features/projects/lib/projectMetadata';
import { NetworkError } from '@/lib/api-utils';
import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '@/test/render';

vi.mock('@/lib/services/logger', () => ({ Logger: { logException: vi.fn() } }));

function Wrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createTestQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const projectData = {
  name: 'Obadiah',
  targetLanguage: 2,
  sourceLanguage: 1,
  sourceBibleId: 10,
  bookId: [],
  organization: 1,
  createdBy: 1,
  metadata: buildProjectMetadata(null),
  pericopeSetId: 1,
  usfmFiles: [{ fileName: 'OBA.usfm', bookCode: 'OBA', usfm: '\\id OBA\n\\c 1\n\\v 1 text' }],
};

async function createAndFail() {
  const { result } = renderHook(() => useCreateProject(), { wrapper: Wrapper });
  await act(async () => {
    await result.current.mutateAsync({ projectData }).catch(() => undefined);
  });
  await waitFor(() => expect(result.current.isError).toBe(true));
  return result.current.error;
}

// #419, #420: the dialog shows why a create failed, so the reason has to survive the hook.
describe('useCreateProject failures', () => {
  it("keeps the API's reason for refusing", async () => {
    server.use(
      http.post(`${config.api.url}/projects`, () =>
        HttpResponse.json(
          { message: 'One or more requested books do not belong to the specified Bible' },
          { status: 400 }
        )
      )
    );

    const error = await createAndFail();

    expect(error?.message).toBe('One or more requested books do not belong to the specified Bible');
  });

  it('falls back to a generic message when the API gives none', async () => {
    server.use(
      http.post(`${config.api.url}/projects`, () => new HttpResponse(null, { status: 502 }))
    );

    expect((await createAndFail())?.message).toBe('Failed to create project');
  });

  it('fails with a NetworkError when the request gets no answer', async () => {
    server.use(http.post(`${config.api.url}/projects`, () => HttpResponse.error()));

    expect(await createAndFail()).toBeInstanceOf(NetworkError);
  });
});
