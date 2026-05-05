import { useMutation } from '@tanstack/react-query';

import { config } from '@/lib/config';

interface ExportUsfmPayload {
  projectUnitId: number;
  bookIds: number[];
}

const exportUsfmRequest = async (payload: ExportUsfmPayload): Promise<Blob> => {
  const { projectUnitId, bookIds } = payload;

  const response = await fetch(`${config.api.url}/project-units/${projectUnitId}/usfm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookIds }),
  });

  if (!response.ok) throw new Error('Failed to export USFM');

  return response.blob();
};

export const useExportUsfm = () => {
  return useMutation({
    mutationFn: exportUsfmRequest,
  });
};
