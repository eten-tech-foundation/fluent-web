export interface ApiErrorResponse {
  message?: string;
}

export const parseErrorMessage = async (res: Response, fallback: string): Promise<never> => {
  const error = (await res.json().catch(() => null)) as ApiErrorResponse | null;
  throw new Error(error?.message ?? fallback);
};

/**
 * A request that got no answer at all: offline, DNS, CORS or the server down. `fetch` reports
 * every one of these as a bare TypeError, so callers that show errors check for this instead.
 */
export class NetworkError extends Error {
  /** What `fetch` threw, kept for the logs. */
  readonly reason: unknown;

  constructor(reason: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
    this.reason = reason;
  }
}

/** `fetch`, except that a request which never got an answer rejects with a NetworkError. */
export const fetchOrNetworkError = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  try {
    return await fetch(input, init);
  } catch (error) {
    // An abort is the caller's own doing rather than the network's.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new NetworkError(error);
  }
};
