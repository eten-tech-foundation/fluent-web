import { useState, useEffect } from 'react';

import { useNavigate, useSearch } from '@tanstack/react-router';
import { AlertCircle, CheckCircle2, Loader2, Eye, EyeOff, XCircle } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const token = (search as { token?: string }).token;
  const urlError = (search as { error?: string }).error;

  const [isValidatingToken, setIsValidatingToken] = useState(!!token);
  const [tokenValidationError, setTokenValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setIsValidatingToken(false);
      return;
    }

    const validateToken = async () => {
      try {
        const response = await fetch(`${config.api.auth_url}/validate-token?token=${token}`);
        if (!response.ok) {
          setTokenValidationError('This password reset link is invalid or has already been used.');
        } else {
          const data = (await response.json()) as { isValid: boolean; message?: string };
          if (!data.isValid) {
            setTokenValidationError(
              data.message ?? 'This password reset link is invalid or has already been used.'
            );
          }
        }
      } catch (err) {
        Logger.logException(err instanceof Error ? err : new Error(String(err)), {
          context: 'Validate password reset token error',
        });
      } finally {
        setIsValidatingToken(false);
      }
    };

    void validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Invalid or missing password reset token.');
      return;
    }

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
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token: token,
      });

      if (resetError) {
        setError(resetError.message ?? 'Failed to reset password. The link may have expired.');
        return;
      }

      setIsSuccess(true);
      // Redirect to login after a short delay
      setTimeout(() => {
        void navigate({ to: '/login' });
      }, 3000);
    } catch {
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
          <h2 className='mt-6 text-2xl font-bold text-gray-900'>Success!</h2>
          <p className='mt-2 text-gray-600'>
            Your password has been reset. Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  if (isValidatingToken) {
    return (
      <div className='fixed inset-0 flex items-center justify-center bg-[#0052cc] px-4'>
        <div className='w-full max-w-[440px] rounded-lg bg-white p-10 text-center shadow-2xl'>
          <Loader2 className='mx-auto h-16 w-16 animate-spin text-[#0052cc]' />
          <p className='mt-4 font-medium text-gray-600'>Validating your reset link...</p>
        </div>
      </div>
    );
  }

  // Handle expired/invalid links
  if (urlError === 'ATTEMPTS_EXCEEDED' || (!token && !error) || tokenValidationError) {
    return (
      <div className='fixed inset-0 flex items-center justify-center bg-[#0052cc] px-4'>
        <div className='w-full max-w-[440px] rounded-lg bg-white p-10 text-center shadow-2xl'>
          <XCircle className='mx-auto h-16 w-16 text-red-500' />
          <h2 className='mt-6 text-2xl font-bold text-gray-900'>Link Expired</h2>
          <p className='mt-2 text-gray-600'>
            {tokenValidationError ??
              'This password reset link is no longer valid. Please request a new one.'}
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
          <h2 className='text-2xl font-bold text-gray-800'>Reset Your Password</h2>
          <p className='mt-2 text-center text-sm text-gray-500'>
            Enter a new password below to regain access to your account.
          </p>
        </div>

        <form className='mt-8 space-y-6' onSubmit={handleSubmit}>
          {error && (
            <div className='rounded-md border border-red-200 bg-red-50 p-4'>
              <div className='flex'>
                <AlertCircle className='h-5 w-5 shrink-0 text-red-400' />
                <p className='ml-3 text-sm font-medium text-red-800'>{error}</p>
              </div>
            </div>
          )}

          <div className='space-y-4'>
            <div>
              <label
                className='mb-1 block text-xs font-bold tracking-wider text-gray-600 uppercase'
                htmlFor='password'
              >
                New password*
              </label>
              <div className='relative'>
                <input
                  required
                  className='focus:ring-opacity-20 block w-full rounded-md border border-gray-300 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[#0052cc] focus:ring-2 focus:ring-[#0052cc] sm:text-sm'
                  id='password'
                  name='password'
                  placeholder='Minimum 8 characters'
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  className='absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600'
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label
                className='mb-1 block text-xs font-bold tracking-wider text-gray-600 uppercase'
                htmlFor='confirm-password'
              >
                Re-enter new password*
              </label>
              <div className='relative'>
                <input
                  required
                  className='focus:ring-opacity-20 block w-full rounded-md border border-gray-300 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[#0052cc] focus:ring-2 focus:ring-[#0052cc] sm:text-sm'
                  id='confirm-password'
                  name='confirm-password'
                  placeholder='Verify password'
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
                <button
                  className='absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600'
                  type='button'
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </div>

          <button
            className='flex w-full justify-center rounded-md bg-[#0052cc] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0047b3] focus:ring-2 focus:ring-[#0052cc] focus:ring-offset-2 focus:outline-none disabled:opacity-70'
            disabled={isSubmitting}
            type='submit'
          >
            {isSubmitting ? <Loader2 className='h-5 w-5 animate-spin' /> : 'Reset password'}
          </button>
        </form>
      </div>

      <p className='mt-4 text-sm text-white/80'>
        &copy; {new Date().getFullYear()} Fluent. All rights reserved.
      </p>
    </div>
  );
}
