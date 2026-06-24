import { useMutation } from '@tanstack/react-query';

import { config } from '@/lib/config';

interface ExportUsfmPayload {
  projectUnitId: number;
  bookIds: number[];
}

const DEFAULT_EXPORT_ERROR = 'Failed to export USFM';

// The export endpoint streams a ZIP on success and returns a JSON error body
// otherwise. Surface the server's message (supports both the `{ message }`
// envelope and the USFM route's `{ error }` shape) so the dialog can show
// something actionable instead of a generic failure.
const parseExportError = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    return data.message ?? data.error ?? DEFAULT_EXPORT_ERROR;
  } catch {
    return DEFAULT_EXPORT_ERROR;
  }
};

const exportUsfmRequest = async (payload: ExportUsfmPayload): Promise<Blob> => {
  const { projectUnitId, bookIds } = payload;

  const response = await fetch(`${config.api.url}/project-units/${projectUnitId}/usfm`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookIds }),
  });

  if (!response.ok) throw new Error(await parseExportError(response));

  return response.blob();
};

export const useExportUsfm = () => {
  return useMutation({
    mutationFn: exportUsfmRequest,
  });
};
