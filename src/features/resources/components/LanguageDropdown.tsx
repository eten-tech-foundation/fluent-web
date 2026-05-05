/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import React from 'react';

import { Loader2 } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  if (loading) {
    return (
      <div className='mt-2 flex items-center justify-center py-2'>
        <Loader2 className='h-4 w-4 animate-spin text-blue-600' />
      </div>
    );
  }

  const selectedLang = availableLanguages.find(lang => lang.code === selectedLanguage);
  const hasSelectedLang = !!selectedLang;

  // Get display value for the select trigger
  const getDisplayValue = () => {
    if (availableLanguages.length === 0) {
      return 'No options available';
    }
    if (!hasSelectedLang || !selectedLanguage) {
      return 'Select a language';
    }
    return selectedLang.display || selectedLang.englishDisplay || selectedLanguage;
  };

  return (
    <div className='mt-2 w-full'>
      <Select
        disabled={availableLanguages.length === 0}
        value={hasSelectedLang ? selectedLanguage : ''}
        onValueChange={onSelect}
      >
        <SelectTrigger className='[&>svg]:text-foreground w-full font-semibold [&>svg]:opacity-100'>
          <SelectValue placeholder='Select a language'>
            <span className={availableLanguages.length === 0 ? 'text-gray-400' : ''}>
              {getDisplayValue()}
            </span>
          </SelectValue>
        </SelectTrigger>

        <SelectContent className='bg-background max-h-60 overflow-auto'>
          {availableLanguages.length === 0 ? (
            <div className='px-3 py-2 text-center text-sm text-gray-500'>No options available</div>
          ) : (
            availableLanguages.map(lang => (
              <SelectItem key={lang.code} value={lang.code}>
                <div className='flex flex-col'>
                  <span className='font-medium text-gray-900 dark:text-gray-100'>
                    {lang.display || lang.englishDisplay || lang.code}
                  </span>
                  {lang.englishDisplay && lang.display !== lang.englishDisplay && (
                    <span className='text-xs text-gray-500'>{lang.englishDisplay}</span>
                  )}
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
};
