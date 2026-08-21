import React from 'react';

import { LogOut, Settings, UserPen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { OrgSwitcher } from '@/features/header/components/OrgSwitcher';
import { useAuth } from '@/hooks/useAuth';
import { Logger } from '@/lib/services/logger';
import { useAppStore } from '@/store/store';

import MenuItem from './MenuItem';

interface UserMenuProps {
  children: React.ReactNode;
  onEditProfile: () => void;
  onToggleSettings: () => void;
}

const UserMenu: React.FC<UserMenuProps> = ({ children, onEditProfile, onToggleSettings }) => {
  const { user, logout, isAuthenticated } = useAuth();
  const { userdetail } = useAppStore();
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);

  if (!isAuthenticated || !user) {
    return null;
  }

  const handleLogout = async () => {
    try {
      await logout();
      setOpen(false);
    } catch (error) {
      Logger.logException(error, { context: 'Logout error' });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        hideWhenDetached
        align='end'
        className='w-64 border p-2'
        side='bottom'
        sideOffset={5}
      >
        <div className='space-y-1'>
          <MenuItem
            icon={<Settings size={18} />}
            text={t('Settings')}
            onClick={onToggleSettings}
            onClosePopover={() => setOpen(false)}
          />
          <MenuItem
            icon={<UserPen size={18} />}
            text={t('editProfile')}
            onClick={onEditProfile}
            onClosePopover={() => setOpen(false)}
          />
          <Separator className='bg my-2' />
          <div className='px-2 py-1'>
            <p className='text-sm font-medium'>{userdetail?.username}</p>
          </div>
          <OrgSwitcher onAfterSelect={() => setOpen(false)} /> <Separator className='bg my-2' />
          <MenuItem
            icon={<LogOut size={18} />}
            text={t('logout')}
            onClick={handleLogout}
            onClosePopover={() => setOpen(false)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default UserMenu;
