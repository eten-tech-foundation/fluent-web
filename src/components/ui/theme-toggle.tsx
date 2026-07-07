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
      className='border-primary bg-background hover:bg-primary/10 text-foreground flex h-auto w-full items-center justify-start gap-3 rounded-[12px] border p-4 font-semibold shadow-sm transition-colors hover:cursor-pointer'
      variant='ghost'
      onClick={toggleTheme}
    >
      {theme === 'light' ? (
        <>
          <Moon className='text-primary h-5 w-5' /> Dark Mode
        </>
      ) : (
        <>
          <Sun className='text-primary h-5 w-5' /> Light Mode
        </>
      )}
    </Button>
  );
}
