import { useState } from 'react';

import { ChevronDown, LogOut, User } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { Logger } from '@/lib/services/logger';

export function UserProfile() {
  const { user, logout, isAuthenticated } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  if (!isAuthenticated || !user) {
    return null;
  }

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      Logger.logException(error, { context: 'Logout error' });
    }
  };

  return (
    <div className='relative'>
      <button
        className='flex items-center space-x-3 rounded-lg p-2 transition-colors duration-200 hover:bg-gray-100'
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
      >
        <div className='flex h-8 w-8 items-center justify-center rounded-full bg-blue-600'>
          {user.picture ? (
            <img alt={user.name ?? 'User'} className='h-8 w-8 rounded-full' src={user.picture} />
          ) : (
            <User className='h-4 w-4 text-white' />
          )}
        </div>
        <div className='hidden text-left md:block'>
          <div className='text-sm font-medium text-gray-900'>{user.name ?? user.email}</div>
          <div className='text-xs text-gray-500'>{user.email}</div>
        </div>
        <ChevronDown className='h-4 w-4 text-gray-400' />
      </button>

      {isDropdownOpen && (
        <div className='absolute right-0 z-50 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-2 shadow-lg'>
          <div className='border-b border-gray-100 px-4 py-3'>
            <div className='text-sm font-medium text-gray-900'>{user.name ?? 'User'}</div>
            <div className='text-sm text-gray-500'>{user.email}</div>
          </div>

          <div className='py-1'>
            <button
              className='flex w-full items-center px-4 py-2 text-sm text-red-600 transition-colors duration-200 hover:bg-red-50'
              onClick={handleLogout}
            >
              <LogOut className='mr-3 h-4 w-4' />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {isDropdownOpen && (
        <div className='fixed inset-0 z-40' onClick={() => setIsDropdownOpen(false)} />
      )}
    </div>
  );
}
