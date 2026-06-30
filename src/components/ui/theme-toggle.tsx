import { useEffect, useState } from 'react';

import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    typeof window !== 'undefined'
      ? document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light'
      : 'light'
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <Button
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      // className='rounded-full'
      // size='icon'
      variant='ghost'
      onClick={toggleTheme}
    >
      {theme === 'light' ? (
        <>
          <Moon className='h-5 w-5' /> Dark Mode
        </>
      ) : (
        <>
          <Sun className='h-5 w-5' /> Light Mode
        </>
      )}
    </Button>
  );
}
