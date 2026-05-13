import { useState } from 'react';

import { Link, useSearch } from '@tanstack/react-router';
import { Eye, EyeOff, Mail } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { Logger } from '@/lib/services/logger';

// import './LoginPage.css'; // Removed in favor of Tailwind CSS

type ViewMode = 'login' | 'forgot' | 'sent';

export function LoginPage() {
  const [view, setView] = useState<ViewMode>('login');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginFieldErrors, setLoginFieldErrors] = useState<{ email?: string; password?: string }>(
    {}
  );
  const [globalLoginError, setGlobalLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Forgot password form state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotFieldError, setForgotFieldError] = useState('');
  const [globalForgotError, setGlobalForgotError] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);

  const search = useSearch({ strict: false });
  const returnTo = (search as { returnTo?: string }).returnTo ?? '/';

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear validation
    setLoginFieldErrors({});
    setGlobalLoginError('');

    let isValid = true;
    const errors: { email?: string; password?: string } = {};

    if (!loginEmail.trim()) {
      errors.email = 'Please enter an email address';
      isValid = false;
    } else if (!isValidEmail(loginEmail.trim())) {
      errors.email = 'Please enter a valid email address';
      isValid = false;
    }

    if (!loginPassword) {
      errors.password = 'Password is required';
      isValid = false;
    }

    if (!isValid) {
      setLoginFieldErrors(errors);
      return;
    }

    setIsLoggingIn(true);

    try {
      const { error: signInError } = await authClient.signIn.email({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (signInError) {
        setGlobalLoginError(signInError.message ?? 'Wrong email or password');
      } else {
        // Fix for redirect bug: perform a hard navigation to guarantee
        // the session cookie is correctly validated by the new page load
        window.location.href = returnTo;
      }
    } catch (err) {
      Logger.logException(err instanceof Error ? err : new Error(String(err)), {
        context: 'Authentication error - login',
      });
      setGlobalLoginError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear validation
    setForgotFieldError('');
    setGlobalForgotError('');

    const trimmedEmail = forgotEmail.trim();

    if (!trimmedEmail) {
      setForgotFieldError('Please enter an email address');
      return;
    } else if (!isValidEmail(trimmedEmail)) {
      setForgotFieldError('Please enter a valid email address');
      return;
    }

    setIsSendingReset(true);

    try {
      const { error: resetError } = await authClient.requestPasswordReset({
        email: trimmedEmail,
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setGlobalForgotError(resetError.message ?? 'Error sending email');
      } else {
        setView('sent');
      }
    } catch (err) {
      Logger.logException(err instanceof Error ? err : new Error(String(err)), {
        context: 'Authentication error - reset password',
      });
      setGlobalForgotError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const switchToForgot = () => {
    setView('forgot');
    if (loginEmail && !forgotEmail) {
      setForgotEmail(loginEmail);
    }
    setGlobalForgotError('');
    setForgotFieldError('');
  };

  const switchToLogin = () => {
    setView('login');
    setGlobalLoginError('');
    setLoginFieldErrors({});
  };

  const ErrorIcon = () => (
    <svg className='h-4 w-4 fill-[#de350b]' viewBox='0 0 24 24'>
      <path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z' />
    </svg>
  );

  return (
    <div className='bg-primary flex min-h-screen flex-col items-center justify-center font-sans text-[#172b4d]'>
      <div className='relative flex min-h-[500px] w-full max-w-[400px] flex-col justify-center rounded-[3px] bg-[#fffef9] px-[50px] py-[60px] text-center shadow-[0_4px_12px_rgba(0,0,0,0.15)]'>
        {/* --- VIEW: LOGIN --- */}
        <div
          className={`animate-in fade-in slide-in-from-bottom-1 duration-300 ${view === 'login' ? 'block' : 'hidden'}`}
        >
          <div className='mb-6'>
            <img
              alt='Logo'
              className='mx-auto block h-[60px] w-auto'
              src='https://i.postimg.cc/7h3XM3cb/Fluent-Blue-Icon-720.png'
            />
          </div>

          <h3 className='mt-0 mb-3 text-2xl font-normal text-[#172b4d]'>Welcome</h3>
          <p className='mt-0 mb-9 text-sm leading-relaxed text-[#5e6c84]'>
            Log in to continue to Fluent.
          </p>

          <form method='post' onSubmit={handleLogin}>
            <div className='relative mb-6 text-left'>
              <div
                className={`relative rounded ${loginFieldErrors.email || globalLoginError ? 'border-[#de350b]' : ''}`}
              >
                <input
                  autoFocus
                  className={`peer focus:border-primary h-12 w-full rounded border bg-[#fafbfc] p-3 pr-[45px] text-[15px] text-[#172b4d] transition-all outline-none placeholder:text-transparent focus:border-2 focus:bg-white focus:p-[11px] focus:pr-[44px] ${
                    loginFieldErrors.email || globalLoginError
                      ? 'border-2 border-[#de350b] bg-white'
                      : 'border-[#dfe1e6]'
                  }`}
                  id='email'
                  placeholder='Email address*'
                  type='email'
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                />
                <label
                  className={`pointer-events-none absolute top-[-9px] left-[10px] bg-[#fffef9] px-1 text-[13px] font-semibold transition-all peer-placeholder-shown:opacity-0 peer-focus:opacity-100 ${
                    loginFieldErrors.email || globalLoginError ? 'text-[#de350b]' : 'text-primary'
                  }`}
                  htmlFor='email'
                >
                  Email address*
                </label>
              </div>
              <div
                className={`mt-2 items-center gap-2 text-sm text-[#de350b] ${loginFieldErrors.email ? 'flex' : 'hidden'}`}
              >
                <ErrorIcon />
                <span>{loginFieldErrors.email}</span>
              </div>
            </div>

            <div className='relative mb-6 text-left'>
              <div
                className={`relative rounded ${loginFieldErrors.password || globalLoginError ? 'border-[#de350b]' : ''}`}
              >
                <input
                  className={`peer focus:border-primary h-12 w-full rounded border bg-[#fafbfc] p-3 pr-[45px] text-[15px] text-[#172b4d] transition-all outline-none placeholder:text-transparent focus:border-2 focus:bg-white focus:p-[11px] focus:pr-[44px] ${
                    loginFieldErrors.password || globalLoginError
                      ? 'border-2 border-[#de350b] bg-white'
                      : 'border-[#dfe1e6]'
                  }`}
                  id='password'
                  placeholder='Password*'
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                />
                <label
                  className={`pointer-events-none absolute top-[-9px] left-[10px] bg-[#fffef9] px-1 text-[13px] font-semibold transition-all peer-placeholder-shown:opacity-0 peer-focus:opacity-100 ${
                    loginFieldErrors.password || globalLoginError
                      ? 'text-[#de350b]'
                      : 'text-primary'
                  }`}
                  htmlFor='password'
                >
                  Password*
                </label>

                <button
                  className='absolute top-1/2 right-3 flex -translate-y-1/2 cursor-pointer items-center justify-center text-gray-400 transition-colors hover:text-gray-600'
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff size={20} strokeWidth={1.5} />
                  ) : (
                    <Eye size={20} strokeWidth={1.5} />
                  )}
                </button>
              </div>
              <div
                className={`mt-2 items-center gap-2 text-sm text-[#de350b] ${loginFieldErrors.password ? 'flex' : 'hidden'}`}
              >
                <ErrorIcon />
                <span>{loginFieldErrors.password}</span>
              </div>

              <div
                className={`mt-2 items-center gap-2 text-sm text-[#de350b] ${globalLoginError ? 'flex' : 'hidden'}`}
              >
                <ErrorIcon />
                <span>{globalLoginError}</span>
              </div>
            </div>

            <div className='mb-6 text-left'>
              <button
                className='text-primary cursor-pointer bg-none p-0 text-sm font-medium no-underline hover:underline'
                style={{ border: 'none' }}
                type='button'
                onClick={switchToForgot}
              >
                Forgot password?
              </button>
            </div>

            <button
              className='bg-primary hover:bg-primary-hover w-full cursor-pointer rounded p-3 text-[15px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-[#b3d4ff]'
              disabled={isLoggingIn}
              style={{ border: 'none' }}
              type='submit'
            >
              {isLoggingIn ? 'Loading...' : 'Continue'}
            </button>
          </form>
        </div>

        {/* --- VIEW: FORGOT PASSWORD --- */}
        <div
          className={`animate-in fade-in slide-in-from-bottom-1 duration-300 ${view === 'forgot' ? 'block' : 'hidden'}`}
        >
          <div className='mb-6'>
            <img
              alt='Logo'
              className='mx-auto block h-[60px] w-auto'
              src='https://i.postimg.cc/7h3XM3cb/Fluent-Blue-Icon-720.png'
            />
          </div>
          <h3 className='mt-0 mb-3 text-2xl font-normal text-[#172b4d]'>Forgot Your Password?</h3>
          <p className='mt-0 mb-9 text-sm leading-relaxed text-[#5e6c84]'>
            Enter your email address to reset your password.
          </p>

          <form method='post' onSubmit={handleForgotPassword}>
            <div className='relative mb-6 text-left'>
              <div
                className={`relative rounded ${forgotFieldError || globalForgotError ? 'border-[#de350b]' : ''}`}
              >
                <input
                  className={`peer focus:border-primary h-12 w-full rounded border bg-[#fafbfc] p-3 pr-[45px] text-[15px] text-[#172b4d] transition-all outline-none placeholder:text-transparent focus:border-2 focus:bg-white focus:p-[11px] focus:pr-[44px] ${
                    forgotFieldError || globalForgotError
                      ? 'border-2 border-[#de350b] bg-white'
                      : 'border-[#dfe1e6]'
                  }`}
                  id='forgot-email'
                  placeholder='Email address*'
                  type='email'
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                />
                <label
                  className={`pointer-events-none absolute top-[-9px] left-[10px] bg-[#fffef9] px-1 text-[13px] font-semibold transition-all peer-placeholder-shown:opacity-0 peer-focus:opacity-100 ${
                    forgotFieldError || globalForgotError ? 'text-[#de350b]' : 'text-primary'
                  }`}
                  htmlFor='forgot-email'
                >
                  Email address*
                </label>
              </div>
              <div
                className={`mt-2 items-center gap-2 text-sm text-[#de350b] ${forgotFieldError ? 'flex' : 'hidden'}`}
              >
                <ErrorIcon />
                <span>{forgotFieldError}</span>
              </div>
              <div
                className={`mt-2 items-center gap-2 text-sm text-[#de350b] ${globalForgotError ? 'flex' : 'hidden'}`}
              >
                <ErrorIcon />
                <span>{globalForgotError}</span>
              </div>
            </div>
            <button
              className='bg-primary hover:bg-primary-hover w-full cursor-pointer rounded p-3 text-[15px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-[#b3d4ff]'
              disabled={isSendingReset}
              style={{ border: 'none' }}
              type='submit'
            >
              {isSendingReset ? 'Sending...' : 'Continue'}
            </button>
          </form>
          <button
            className='text-primary mt-[15px] block w-full cursor-pointer bg-none p-0 text-sm font-medium no-underline hover:underline'
            style={{ border: 'none' }}
            type='button'
            onClick={switchToLogin}
          >
            Back to Fluent
          </button>
        </div>

        {/* --- VIEW: SENT --- */}
        <div
          className={`animate-in fade-in slide-in-from-bottom-1 duration-300 ${view === 'sent' ? 'block' : 'hidden'}`}
        >
          <div className='mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#00875a]'>
            <Mail className='h-10 w-10 text-[#00875a]' />
          </div>
          <h3 className='mt-0 mb-3 text-2xl font-normal text-[#172b4d]'>Check Your Email</h3>
          <p className='mt-0 mb-9 text-sm leading-relaxed text-[#5e6c84]'>
            Check <span className='font-semibold text-[#172b4d]'>{forgotEmail}</span> for
            instructions.
          </p>
          <button
            className='w-full cursor-pointer rounded border border-[#dfe1e6] bg-white p-3 text-[15px] font-semibold text-[#172b4d] transition-colors hover:bg-[#f4f5f7]'
            type='button'
            onClick={() => setView('forgot')}
          >
            Resend email
          </button>
          <button
            className='text-primary mt-[15px] block w-full cursor-pointer bg-none p-0 text-sm font-medium no-underline hover:underline'
            style={{ border: 'none' }}
            type='button'
            onClick={switchToLogin}
          >
            Back to login
          </button>
        </div>

        <div className='mt-[30px] border-t border-transparent'>
          <p className='mt-0 mb-9 text-xs leading-relaxed text-[#5e6c84]'>
            By continuing, you agree to the{' '}
            <Link className='text-primary no-underline' to='/legal/privacy'>
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link className='text-primary no-underline' to='/legal/terms'>
              Terms.
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
