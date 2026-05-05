import { useEffect } from 'react';

import { Outlet, useLocation, useNavigate, useSearch } from '@tanstack/react-router';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SettingsModal } from '@/components/SettingsModal';
import Header from '@/features/header/components/index';
import { EditProfile } from '@/features/profile/components/EditProfile';
import { Logger } from '@/lib/services/logger';

export function RootComponent(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { modal } = useSearch({ from: '__root__' });

  const handleModalClose = (): void => {
    void navigate({
      to: location.pathname,
      search: { modal: undefined },
      replace: true,
    });
  };

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
      <div className='flex h-screen flex-col overflow-hidden'>
        <Header />
        <main className='flex-1 overflow-hidden p-4'>
          <Outlet />
          <SettingsModal isOpen={modal === 'settings'} onClose={handleModalClose} />
          <EditProfile isOpen={modal === 'profile'} onClose={handleModalClose} />
        </main>
      </div>
    </ErrorBoundary>
  );
}
