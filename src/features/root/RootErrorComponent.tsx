import { useEffect } from 'react';

import { ErrorComponent, type ErrorComponentProps } from '@tanstack/react-router';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Logger } from '@/lib/services/logger';

export function RootErrorComponent({ error }: ErrorComponentProps): React.JSX.Element {
  useEffect(() => {
    Logger.logException(error instanceof Error ? error : new Error(String(error)), {
      source: 'RouterErrorBoundary',
    });
  }, [error]);

  return (
    <ErrorBoundary>
      <div className='flex h-screen items-center justify-center'>
        <div className='text-center'>
          <h1 className='mb-2 text-2xl font-bold text-red-600'>Something went wrong</h1>
          <p className='text-gray-600 dark:text-gray-400'>
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <ErrorComponent error={error} />
        </div>
      </div>
    </ErrorBoundary>
  );
}
