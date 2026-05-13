import { useState, useEffect } from 'react';

import { useNavigate, useSearch } from '@tanstack/react-router';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, XCircle } from 'lucide-react';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';

export function AcceptInvitationPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const search = useSearch({ strict: false });
  const urlError = (search as { error?: string }).error;
  const navigate = useNavigate();

  useEffect(() => {
    if (urlError) {
      if (urlError === 'ATTEMPTS_EXCEEDED') {
        setError('This invitation link has already been used or has expired.');
      } else {
        setError('There was a problem with your invitation link.');
      }
    }
  }, [urlError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setIsSubmitting(true);

    try {
      // Use our custom server-side endpoint to set the password
      const response = await fetch(`${config.api.auth_url}/password/set`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPassword: password }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        setError(errorData.message ?? 'Failed to set password.');
        return;
      }

      setIsSuccess(true);
      setTimeout(() => {
        void navigate({ to: '/' });
      }, 2000);
    } catch (err) {
      Logger.logException(err instanceof Error ? err : new Error(String(err)), {
        context: 'Set invitation password error',
      });
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className='fixed inset-0 flex items-center justify-center bg-[#0052cc] px-4'>
        <div className='w-full max-w-[440px] rounded-lg bg-white p-10 text-center shadow-2xl'>
          <CheckCircle2 className='mx-auto h-16 w-16 text-green-500' />
          <h2 className='mt-6 text-2xl font-bold text-gray-900'>Account Ready!</h2>
          <p className='mt-2 text-gray-600'>
            Your password has been set. Redirecting to your dashboard...
          </p>
        </div>
      </div>
    );
  }

  // If the link is expired or invalid from the start
  if (urlError === 'ATTEMPTS_EXCEEDED') {
    return (
      <div className='fixed inset-0 flex items-center justify-center bg-[#0052cc] px-4'>
        <div className='w-full max-w-[440px] rounded-lg bg-white p-10 text-center shadow-2xl'>
          <XCircle className='mx-auto h-16 w-16 text-red-500' />
          <h2 className='mt-6 text-2xl font-bold text-gray-900'>Link Expired</h2>
          <p className='mt-2 text-gray-600'>
            This invitation link has already been used or is no longer valid for security reasons.
          </p>
          <button
            className='mt-8 w-full rounded-md bg-[#0052cc] py-3 font-semibold text-white hover:bg-[#0047b3]'
            onClick={() => navigate({ to: '/login' })}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='fixed inset-0 flex flex-col items-center justify-center overflow-y-auto bg-[#0052cc] px-4'>
      <div className='my-8 w-full max-w-[440px] space-y-8 rounded-lg bg-white p-10 shadow-2xl'>
        <div className='flex flex-col items-center'>
          <div className='mb-6'>
            <img alt='Fluent Logo' className='h-20 w-auto' src='/icons/Fluent-Blue-Icon.svg' />
          </div>
          <h2 className='text-2xl font-bold text-gray-800'>Change Your Password</h2>
          <p className='mt-2 text-center text-sm text-gray-500'>
            Enter a new password below to change your password.
          </p>
        </div>

        <form className='mt-8 space-y-6' onSubmit={handleSubmit}>
          {error && (
            <div className='rounded-md border border-red-200 bg-red-50 p-4'>
              <div className='flex items-center'>
                <AlertCircle className='h-5 w-5 text-red-500' />
                <p className='ml-3 text-sm font-medium text-red-800'>{error}</p>
              </div>
            </div>
          )}

          <div className='space-y-5'>
            <div className='group relative'>
              <label className='mb-1 block text-sm font-medium text-gray-700' htmlFor='password'>
                New password*
              </label>
              <div className='relative'>
                <input
                  required
                  autoComplete='new-password'
                  className='block w-full rounded-md border border-gray-300 px-4 py-3 pr-12 text-gray-900 transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-[#0052cc]'
                  id='password'
                  name='password'
                  placeholder='Enter new password'
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  className='absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none'
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className='group relative'>
              <label
                className='mb-1 block text-sm font-medium text-gray-700'
                htmlFor='confirm-password'
              >
                Re-enter new password*
              </label>
              <div className='relative'>
                <input
                  required
                  autoComplete='new-password'
                  className='block w-full rounded-md border border-gray-300 px-4 py-3 pr-12 text-gray-900 transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-[#0052cc]'
                  id='confirm-password'
                  name='confirm-password'
                  placeholder='Confirm new password'
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
                <button
                  className='absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none'
                  type='button'
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </div>

          <button
            className='flex w-full items-center justify-center rounded-md bg-[#0052cc] py-3.5 text-base font-semibold text-white shadow-md transition-all hover:bg-[#0047b3] active:bg-[#003d99] disabled:opacity-70'
            disabled={isSubmitting}
            type='submit'
          >
            {isSubmitting ? <Loader2 className='h-5 w-5 animate-spin' /> : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  );
}
