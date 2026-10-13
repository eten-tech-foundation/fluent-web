import { type ReactNode, useState } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WORKFLOW_STEPS,
  useProjectWorkflow,
} from '@/features/projects/hooks/useProjectWorkflow';
import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '@/test/render';

function Wrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createTestQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const mockApiStages = [
  { id: 'not_started', label: 'Not Started', stageId: 1, position: 0, isFixed: true },
  { id: 'draft', label: 'Drafting', stageId: 2, position: 1, isFixed: true },
  { id: 'peer_check', label: 'Peer Check', stageId: 3, position: 2, isFixed: true },
  { id: 'community_review', label: 'Community Review', stageId: 4, position: 3, isFixed: false },
  { id: 'complete', label: 'Complete', stageId: 5, position: 4, isFixed: true },
];

describe('useProjectWorkflow', () => {
  it('returns DEFAULT_WORKFLOW_STEPS when projectId is not provided', async () => {
    const { result } = renderHook(() => useProjectWorkflow(null), { wrapper: Wrapper });
    expect(result.current.workflowConfig).toEqual(DEFAULT_WORKFLOW_STEPS);
  });

  it('fetches stages from /projects/:projectId/workflow-stages endpoint', async () => {
    server.use(
      http.get(`${config.api.url}/projects/123/workflow-stages`, () =>
        HttpResponse.json(mockApiStages)
      )
    );

    const { result } = renderHook(() => useProjectWorkflow(123), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.workflowConfig).toHaveLength(5);
    expect(result.current.workflowConfig[1].label).toBe('Drafting');
    expect(result.current.workflowConfig[1].stageId).toBe(2);
  });

  it('falls back to DEFAULT_WORKFLOW_STEPS when API endpoint fails', async () => {
    server.use(
      http.get(
        `${config.api.url}/projects/456/workflow-stages`,
        () => new HttpResponse(null, { status: 500 })
      ),
      http.get(`${config.api.url}/projects/456`, () => new HttpResponse(null, { status: 500 }))
    );

    const { result } = renderHook(() => useProjectWorkflow(456), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.workflowConfig).toEqual(DEFAULT_WORKFLOW_STEPS));
  });

  it('provides getStageLabel and getRoleLabel helper functions', async () => {
    server.use(
      http.get(`${config.api.url}/projects/789/workflow-stages`, () =>
        HttpResponse.json(mockApiStages)
      )
    );

    const { result } = renderHook(() => useProjectWorkflow(789), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.getStageLabel('draft')).toBe('Drafting');
    expect(result.current.getStageLabel('unknown', 'Fallback Label')).toBe('Fallback Label');
    expect(result.current.getRoleLabel('draft')).toBe('Drafting');
  });

  it('provides addStage, renameStage, deleteStage, and reorderStages mutations', async () => {
    let deleteCalledWith: string | null = null;
    let postBody: { displayName?: string } | null = null;
    let patchBody: { displayName?: string } | null = null;
    let reorderBody: { stageIds?: number[] } | null = null;

    server.use(
      http.get(`${config.api.url}/projects/100/workflow-stages`, () =>
        HttpResponse.json(mockApiStages)
      ),
      http.delete(`${config.api.url}/projects/100/workflow-stages/:stageId`, ({ params }) => {
        deleteCalledWith = params.stageId as string;
        return HttpResponse.json({ success: true });
      }),
      http.post(`${config.api.url}/projects/100/workflow-stages`, async ({ request }) => {
        postBody = (await request.json()) as { displayName?: string };
        return HttpResponse.json({ stageId: 99, label: postBody.displayName, id: 'custom_99' });
      }),
      http.patch(`${config.api.url}/projects/100/workflow-stages/:stageId`, async ({ request }) => {
        patchBody = (await request.json()) as { displayName?: string };
        return HttpResponse.json({ success: true });
      }),
      http.put(`${config.api.url}/projects/100/workflow-stages/reorder`, async ({ request }) => {
        reorderBody = (await request.json()) as { stageIds?: number[] };
        return HttpResponse.json(mockApiStages);
      })
    );

    const { result } = renderHook(() => useProjectWorkflow(100), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Test addStage
    const added = await result.current.addStage('Field Testing');
    expect(postBody).toEqual({ displayName: 'Field Testing' });
    expect(added).toEqual({ stageId: 99, label: 'Field Testing', id: 'custom_99' });

    // Test renameStage
    await result.current.renameStage({ stageId: 2, displayName: 'Initial Drafting' });
    expect(patchBody).toEqual({ displayName: 'Initial Drafting' });

    // Test deleteStage
    await result.current.deleteStage(4);
    expect(deleteCalledWith).toBe('4');

    // Test reorderStages
    await result.current.reorderStages([1, 2, 3, 99, 5]);
    expect(reorderBody).toEqual({ stageIds: [1, 2, 3, 99, 5] });
  });

  it('throws and surfaces backend error message when a mutation request fails', async () => {
    server.use(
      http.get(`${config.api.url}/projects/101/workflow-stages`, () =>
        HttpResponse.json(mockApiStages)
      ),
      http.post(`${config.api.url}/projects/101/workflow-stages`, () =>
        HttpResponse.json(
          { message: 'Maximum of 10 configurable workflow stages reached' },
          { status: 409 }
        )
      )
    );

    const { result } = renderHook(() => useProjectWorkflow(101), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await expect(result.current.addStage('Extra Stage')).rejects.toThrow(
      'Maximum of 10 configurable workflow stages reached'
    );
  });
});
