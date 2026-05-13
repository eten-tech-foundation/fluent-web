import { useEffect } from 'react';

import { Outlet } from '@tanstack/react-router';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Logger } from '@/lib/services/logger';

export function RootComponent(): React.JSX.Element {
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent): void => {
      Logger.logException(new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        source: 'GlobalErrorHandler',
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      Logger.logException(error, {
        source: 'UnhandledPromiseRejection',
        reason: String(event.reason),
      });
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <ErrorBoundary>
      <Outlet />
    </ErrorBoundary>
  );
}
