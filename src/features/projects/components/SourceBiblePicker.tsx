import React, { useEffect, useRef, useState } from 'react';

import { Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  type SourceSearchBible,
  type SourceSearchLanguage,
  useSourceBibleSearch,
} from '@/features/projects/hooks/useSourceBibleSearch';
import { cn } from '@/lib/utils';

export interface SelectedSourceBible {
  sourceBible: number;
  sourceLanguage: number;
  bibleName: string;
  bibleAbbreviation: string;
  languageName: string;
  languageCode: string | null;
  provider: string;
}

interface SourceBiblePickerProps {
  value: {
    sourceBible: number | null;
    sourceLanguage: number | null;
  };
  onChange: (selection: { sourceBible: number; sourceLanguage: number } | null) => void;
  disabled?: boolean;
  className?: string;
}

export const SourceBiblePicker: React.FC<SourceBiblePickerProps> = ({
  value,
  onChange,
  disabled = false,
  className,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedMeta, setSelectedMeta] = useState<SelectedSourceBible | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: searchResults, isLoading } = useSourceBibleSearch(search);

  // If value is cleared from outside, clear selectedMeta
  useEffect(() => {
    if (!value.sourceBible || !value.sourceLanguage) {
      setSelectedMeta(null);
    }
  }, [value.sourceBible, value.sourceLanguage]);

  // If value exists but meta is not set (e.g. initial edit state), auto-resolve from search results if available
  useEffect(() => {
    if (value.sourceBible && !selectedMeta && searchResults?.bibles) {
      const found = searchResults.bibles.find(b => b.id === value.sourceBible);
      if (found) {
        setSelectedMeta({
          sourceBible: found.id,
          sourceLanguage: found.languageId ?? value.sourceLanguage ?? 0,
          bibleName: found.name,
          bibleAbbreviation: found.abbreviation,
          languageName: found.languageName ?? '',
          languageCode: found.languageCode ?? null,
          provider: found.provider,
        });
      }
    }
  }, [value.sourceBible, value.sourceLanguage, selectedMeta, searchResults]);

  const handleSelectBible = (bible: SourceSearchBible) => {
    const meta: SelectedSourceBible = {
      sourceBible: bible.id,
      sourceLanguage: bible.languageId ?? 0,
      bibleName: bible.name,
      bibleAbbreviation: bible.abbreviation,
      languageName: bible.languageName ?? '',
      languageCode: bible.languageCode ?? null,
      provider: bible.provider,
    };
    setSelectedMeta(meta);
    onChange({
      sourceBible: bible.id,
      sourceLanguage: bible.languageId ?? 0,
    });
    setOpen(false);
    setSearch('');
  };

  const handleSelectLanguage = (lang: SourceSearchLanguage) => {
    if (lang.bibleCount === 1 && lang.bibles.length > 0) {
      const singleBible = lang.bibles[0];
      const meta: SelectedSourceBible = {
        sourceBible: singleBible.id,
        sourceLanguage: lang.id,
        bibleName: singleBible.name,
        bibleAbbreviation: singleBible.abbreviation,
        languageName: lang.langName,
        languageCode: lang.langCodeIso6393,
        provider: singleBible.provider,
      };
      setSelectedMeta(meta);
      onChange({
        sourceBible: singleBible.id,
        sourceLanguage: lang.id,
      });
      setOpen(false);
      setSearch('');
    } else {
      // Multiple Bibles available for this language: filter input search to language name
      setSearch(lang.langName);
    }
  };

  const handleClear = () => {
    setSelectedMeta(null);
    onChange(null);
    setSearch('');
  };

  const languagesList = searchResults?.languages ?? [];
  const biblesList = searchResults?.bibles ?? [];
  const hasResults = languagesList.length > 0 || biblesList.length > 0;

  return (
    <div className={cn('w-full min-w-0 space-y-2', className)}>
      <Label className='gap-1' htmlFor='source-bible-picker-input'>
        <span className='text-destructive'>*</span>
        {t('sourceLanguageBible', 'Source Language / Bible')}
      </Label>

      {selectedMeta ? (
        /* ─── Selected State: Summary Card (Whitish bg-background from index.css) ─── */
        <div className='border-input bg-background flex w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg border p-3.5 shadow-2xs'>
          <div className='w-0 min-w-0 flex-1 space-y-0.5 overflow-hidden'>
            <p className='text-foreground truncate text-sm font-bold'>
              {selectedMeta.languageName}
              {selectedMeta.languageCode ? ` (${selectedMeta.languageCode})` : ''}
            </p>
            <p className='text-muted-foreground truncate text-xs font-normal'>
              {selectedMeta.bibleName} ({selectedMeta.bibleAbbreviation}) ·{' '}
              {selectedMeta.provider.toUpperCase()}
            </p>
          </div>
          <button
            aria-label='Clear source bible selection'
            className='text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 cursor-pointer rounded-md p-1 transition-colors focus:outline-none'
            type='button'
            onClick={handleClear}
          >
            <X className='h-4 w-4' />
          </button>
        </div>
      ) : (
        /* ─── Search & Type-Ahead Input State ─── */
        <div className='space-y-2'>
          <Popover
            open={open}
            onOpenChange={nextOpen => {
              setOpen(nextOpen);
              if (!nextOpen) {
                setSearch('');
              }
            }}
          >
            <PopoverTrigger asChild>
              <div className='relative w-full'>
                <Input
                  className='bg-background border-input focus-visible:ring-primary w-full rounded-lg'
                  disabled={disabled}
                  id='source-bible-picker-input'
                  placeholder='Search by language or Bible (e.g. French, LSG, Reina Valera)'
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    if (!open) setOpen(true);
                  }}
                  onClick={e => {
                    if (open) {
                      e.stopPropagation();
                    }
                  }}
                  onFocus={() => {
                    if (!open) setOpen(true);
                  }}
                />
                {isLoading && (
                  <Loader2 className='text-muted-foreground absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin' />
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent
              align='start'
              className='bg-sidebar dark:bg-sidebar border-border z-50 w-(--radix-popover-trigger-width) rounded-lg p-2.5 shadow-xl'
              onOpenAutoFocus={e => e.preventDefault()}
            >
              <div
                ref={containerRef}
                className='max-h-[260px] space-y-3 overflow-y-auto pr-1'
                onWheel={e => {
                  e.stopPropagation();
                  if (containerRef.current) {
                    containerRef.current.scrollTop += e.deltaY;
                  }
                }}
              >
                {isLoading ? (
                  <div className='text-muted-foreground flex items-center justify-center p-4 text-sm'>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading...
                  </div>
                ) : !hasResults ? (
                  <div className='text-muted-foreground p-4 text-center text-sm'>
                    No languages or Bibles found matching &quot;{search}&quot;.
                  </div>
                ) : (
                  <div className='space-y-3'>
                    {/* LANGUAGES Section */}
                    {languagesList.length > 0 && (
                      <div className='space-y-1'>
                        <div className='text-muted-foreground px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase'>
                          LANGUAGES
                        </div>
                        <div className='space-y-0.5'>
                          {languagesList.map(lang => (
                            <div
                              key={`lang-${lang.id}`}
                              className='hover:bg-background/80 hover:text-foreground flex cursor-pointer flex-col rounded-md px-2.5 py-1.5 text-sm transition-colors'
                              onClick={() => handleSelectLanguage(lang)}
                            >
                              <span className='text-foreground truncate font-semibold'>
                                {lang.langName}
                                {lang.langCodeIso6393 ? ` (${lang.langCodeIso6393})` : ''}
                              </span>
                              <span className='text-muted-foreground truncate text-xs'>
                                {lang.bibleCount} {lang.bibleCount === 1 ? 'Bible' : 'Bibles'}{' '}
                                available
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* BIBLES Section - Whitish cards inside dropdown */}
                    {biblesList.length > 0 && (
                      <div className='space-y-1.5'>
                        <div className='text-muted-foreground px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase'>
                          BIBLES
                        </div>
                        <div className='space-y-1.5'>
                          {biblesList.map(bible => (
                            <div
                              key={`bible-${bible.id}`}
                              className='bg-background border-border/60 hover:border-primary/50 flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 transition-all hover:shadow-xs'
                              onClick={() => handleSelectBible(bible)}
                            >
                              <div className='w-0 min-w-0 flex-1 space-y-0.5 overflow-hidden'>
                                <span className='text-foreground block truncate text-sm font-semibold'>
                                  {bible.name} ({bible.abbreviation})
                                </span>
                                {bible.languageName && (
                                  <span className='text-muted-foreground block truncate text-xs'>
                                    {bible.languageName}
                                  </span>
                                )}
                              </div>
                              <Badge className='bg-primary/10 text-primary hover:bg-primary/15 shrink-0 border-0 px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase'>
                                {bible.provider.toUpperCase()}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
};
