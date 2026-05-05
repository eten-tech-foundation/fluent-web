import React from 'react';

import { useLocation, useNavigate } from '@tanstack/react-router';
import { Menu, SquareUserRound, TriangleAlert } from 'lucide-react';

import MainMenu from '@/components/header/MainMenu';
import UserMenu from '@/components/header/UserMenu';
import { useAppStore } from '@/store/store';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const presenceWarning = useAppStore(state => state.presenceWarning);
  const isOnTranslationPage = location.pathname.startsWith('/translation/');

  const onNavigateToDashboard = () => {
    void navigate({ to: '/' });
  };

  const onNavigateToUsers = () => {
    void navigate({ to: '/users' });
  };

  const onNavigateToProjects = () => {
    void navigate({ to: '/projects' });
  };
  const handleEditProfile = () => {
    void navigate({
      to: location.pathname,
      search: { modal: 'profile' as const },
    });
  };

  const onNavigateToSettings = () => {
    void navigate({
      to: location.pathname,
      search: { modal: 'settings' as const },
    });
  };

  return (
    <>
      <header className='bg-primary flex h-[56px] items-center'>
        <div className='my-4 flex w-full items-center'>
          <div className='flex shrink-0 items-center'>
            <div className='relative flex items-center pl-[18px]'>
              <MainMenu
                onDashboardClick={onNavigateToDashboard}
                onProjectsClick={onNavigateToProjects}
                onUsersClick={onNavigateToUsers}
              >
                <button
                  aria-label='User menu'
                  className='hover:bg-hover bg-background flex h-[40px] w-[40px] cursor-pointer items-center justify-center rounded-md p-1.5 transition-colors duration-150'
                >
                  <Menu className='text-foreground' size={35} strokeWidth={2.5} />
                </button>
              </MainMenu>
            </div>
            <div className='pl-[32px]'>
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
          </div>

          <div className='flex min-w-0 flex-1 justify-center px-4'>
            {isOnTranslationPage && presenceWarning && (
              <div className='flex max-w-md min-w-0 items-center gap-2 rounded-lg bg-yellow-300 px-4 py-1.5 text-sm font-medium text-black'>
                <TriangleAlert className='h-4 w-4 shrink-0' />
                <span className='max-w-[150px] truncate'>{presenceWarning}</span>
                <span className='shrink-0 whitespace-nowrap'>is editing this resource.</span>
              </div>
            )}
          </div>

          <div className='shrink-0 pr-[18px]'>
            <UserMenu onEditProfile={handleEditProfile} onToggleSettings={onNavigateToSettings}>
              <button
                aria-label='User menu'
                className='hover:bg-hover bg-background flex h-[40px] w-[40px] cursor-pointer items-center justify-center rounded-md p-1.5 transition-colors duration-150'
              >
                <SquareUserRound className='text-foreground' size={35} strokeWidth={2.5} />
              </button>
            </UserMenu>
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;
