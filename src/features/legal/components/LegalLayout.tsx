import React from 'react';

import { Outlet, useNavigate } from '@tanstack/react-router';

export const LegalLayout: React.FC = () => {
  const navigate = useNavigate();

  const onNavigateToDashboard = () => {
    void navigate({ to: '/' });
  };

  return (
    <div className='flex h-screen flex-col overflow-hidden'>
      <header className='bg-primary flex h-[56px] items-center'>
        <div className='my-4 flex w-full items-center pl-[32px]'>
          <div
            className='flex cursor-pointer items-center transition-opacity duration-150'
            role='button'
            tabIndex={0}
            onClick={onNavigateToDashboard}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                onNavigateToDashboard();
              }
            }}
          >
            <img alt='Logo' className='h-13 w-auto' src='/icons/fluent-logo.svg' />
          </div>
        </div>
      </header>
      <main className='flex-1 overflow-y-auto'>
        <Outlet />
      </main>
    </div>
  );
};
