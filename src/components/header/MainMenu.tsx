import React from 'react';

import { useLocation } from '@tanstack/react-router';
import { Home, Kanban, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { canViewUsers, getActiveGrants, isOrgMemberOnly } from '@/lib/grant-utils';
import { useAppStore } from '@/store/store';

import MenuItem from './MenuItem';

interface MainMenuProps {
  children: React.ReactNode;
  onDashboardClick: () => void;
  onUsersClick: () => void;
  onProjectsClick: () => void;
}

const MainMenu: React.FC<MainMenuProps> = ({
  children,
  onDashboardClick,
  onUsersClick,
  onProjectsClick,
}) => {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { userdetail } = useAppStore();
  const [open, setOpen] = React.useState(false);
  const location = useLocation();

  const activeGrants = getActiveGrants(userdetail?.grants, userdetail?.lastActiveOrgId);
  // Show users menu item for any role with USER_VIEW permission
  const showUsers = canViewUsers(activeGrants);
  const orgMemberOnly = isOrgMemberOnly(activeGrants);

  if (!isAuthenticated || !user) {
    return null;
  }

  const isDashboardActive = location.pathname === '/';
  const isUsersActive = location.pathname === '/users';
  const isProjectsActive = location.pathname === '/projects';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        hideWhenDetached
        align='start'
        className='w-56 border p-2'
        side='bottom'
        sideOffset={5}
      >
        <div className='space-y-1'>
          <>
            <MenuItem
              icon={<Home size={18} />}
              isActive={isDashboardActive}
              text={t('dashboard')}
              onClick={onDashboardClick}
              onClosePopover={() => setOpen(false)}
            />
            {!orgMemberOnly && (
              <MenuItem
                icon={<Kanban size={18} />}
                isActive={isProjectsActive}
                text={t('projects')}
                onClick={onProjectsClick}
                onClosePopover={() => setOpen(false)}
              />
            )}
          </>
          {showUsers && (
            <>
              <MenuItem
                icon={<Users size={18} />}
                isActive={isUsersActive}
                text={t('users')}
                onClick={onUsersClick}
                onClosePopover={() => setOpen(false)}
              />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MainMenu;
