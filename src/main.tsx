import React from 'react';

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReactDOM from 'react-dom/client';

import { Logger } from '@/lib/services/logger';

import { AppRouter } from './features/root/AppRouter';
import './i18n';
import './index.css';

Logger.logEvent('AppStarted', {
  startTime: new Date().toISOString(),
  userAgent: navigator.userAgent,
  timestamp: new Date().toISOString(),
});

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: error => {
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'QueryCache',
      });
    },
  }),
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  </React.StrictMode>
);
