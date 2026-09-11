import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';

export interface BookDetails {
  bookId: number;
  bookCode: string;
  bookName: string;
  runningHeader: string | null;
  bookTitle: string | null;
  tocLongName: string | null;
  tocShortName: string | null;
  tocAbbreviation: string | null;
}

/** The three table-of-contents fields the metadata dialog edits (USFM \toc1, \toc2, \toc3). */
export const TOC_FIELDS = ['tocLongName', 'tocShortName', 'tocAbbreviation'] as const;
export type TocField = (typeof TOC_FIELDS)[number];

/** Sparse PATCH body: only the named fields are written; null clears a field. */
export type BookDetailsPatch = Partial<Record<TocField, string | null>>;

export interface UpdateBookDetailsVariables {
  projectUnitId: number;
  bookId: number;
  fields: BookDetailsPatch;
}

export const bookDetailsQueryKey = (projectUnitId: number | null) =>
  ['book-details', projectUnitId] as const;

interface ApiErrorBody {
  message?: string;
  error?: { issues?: Array<{ message: string }> };
}

const readErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.message ?? body.error?.issues?.[0]?.message ?? fallback;
  } catch {
    return fallback;
  }
};

const fetchBookDetails = async (projectUnitId: number): Promise<BookDetails[]> => {
  const response = await fetch(`${config.api.url}/project-units/${projectUnitId}/book-details`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to load book details'));
  }
  return (await response.json()) as BookDetails[];
};

const patchBookDetails = async ({
  projectUnitId,
  bookId,
  fields,
}: UpdateBookDetailsVariables): Promise<BookDetails> => {
  const response = await fetch(
    `${config.api.url}/project-units/${projectUnitId}/book-details/${bookId}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    }
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to save book details'));
  }
  return (await response.json()) as BookDetails;
};

export const useBookDetails = (projectUnitId: number | null, enabled = true) => {
  return useQuery<BookDetails[]>({
    queryKey: bookDetailsQueryKey(projectUnitId),
    queryFn: () => {
      if (projectUnitId === null) throw new Error('projectUnitId is required');
      return fetchBookDetails(projectUnitId);
    },
    enabled: projectUnitId !== null && enabled,
  });
};

export const useUpdateBookDetails = () => {
  const queryClient = useQueryClient();

  return useMutation<BookDetails, Error, UpdateBookDetailsVariables>({
    mutationFn: patchBookDetails,
    onSuccess: (updated, { projectUnitId }) => {
      queryClient.setQueryData<BookDetails[]>(bookDetailsQueryKey(projectUnitId), previous =>
        previous?.map(book => (book.bookId === updated.bookId ? updated : book))
      );
    },
  });
};
