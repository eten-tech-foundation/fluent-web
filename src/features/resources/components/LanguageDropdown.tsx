import React, { useState, useMemo } from 'react';

import { Loader2, Check, ChevronsUpDown, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface LanguageOption {
  id: number;
  code: string;
  display: string;
  englishDisplay?: string;
  itemCount: number;
  scriptDirection: 'LTR' | 'RTL';
}

interface LanguageDropdownProps {
  availableLanguages: LanguageOption[];
  selectedLanguage: string;
  loading: boolean;
  onSelect: (languageCode: string) => void;
}

export const LanguageDropdown: React.FC<LanguageDropdownProps> = ({
  availableLanguages,
  selectedLanguage,
  loading,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedLang = availableLanguages.find(lang => lang.code === selectedLanguage);
  const hasSelectedLang = !!selectedLang;

  const getDisplayValue = () => {
    if (availableLanguages.length === 0) return 'No options available';
    if (!hasSelectedLang || !selectedLanguage) return 'Select a language';
    return selectedLang.display || (selectedLang.englishDisplay ?? selectedLanguage);
  };

  const filteredLanguages = useMemo(() => {
    if (!search.trim()) return availableLanguages.slice(0, 50);
    const lowerSearch = search.toLowerCase();
    return availableLanguages
      .filter(
        lang =>
          lang.display.toLowerCase().includes(lowerSearch) ||
          (lang.englishDisplay?.toLowerCase().includes(lowerSearch) ?? false) ||
          lang.code.toLowerCase().includes(lowerSearch)
      )
      .slice(0, 50);
  }, [availableLanguages, search]);

  if (loading) {
    return (
      <div className='mt-2 flex items-center justify-center py-2'>
        <Loader2 className='text-primary h-4 w-4 animate-spin' />
      </div>
    );
  }

  return (
    <div className='mt-2 w-full'>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            className='w-full justify-between font-semibold'
            disabled={availableLanguages.length === 0}
            role='combobox'
            variant='outline'
          >
            <span
              className={cn('truncate', availableLanguages.length === 0 && 'text-muted-foreground')}
            >
              {getDisplayValue()}
            </span>
            <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className='w-[var(--radix-popover-trigger-width)] p-0'>
          <div className='flex items-center border-b px-3'>
            <Search className='mr-2 h-4 w-4 shrink-0 opacity-50' />
            <Input
              className='flex h-11 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none focus-visible:ring-0 focus-visible:ring-offset-0'
              placeholder='Search language...'
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className='max-h-60 overflow-y-auto p-1'>
            {filteredLanguages.length === 0 ? (
              <div className='text-muted-foreground p-4 text-center text-sm'>
                No language found.
              </div>
            ) : (
              filteredLanguages.map(lang => (
                <div
                  key={lang.code}
                  className={cn(
                    'hover:bg-accent hover:text-accent-foreground relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none',
                    selectedLanguage === lang.code && 'bg-accent/50'
                  )}
                  onClick={() => {
                    onSelect(lang.code);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedLanguage === lang.code ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className='flex flex-col'>
                    <span className='font-medium'>
                      {lang.display || (lang.englishDisplay ?? lang.code)}
                    </span>
                    {lang.englishDisplay && lang.display !== lang.englishDisplay && (
                      <span className='text-muted-foreground text-xs'>{lang.englishDisplay}</span>
                    )}
                  </div>
                </div>
              ))
            )}
            {search.trim() === '' && availableLanguages.length > 50 && (
              <div className='text-muted-foreground p-2 text-center text-xs'>
                Type to search more languages...
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
