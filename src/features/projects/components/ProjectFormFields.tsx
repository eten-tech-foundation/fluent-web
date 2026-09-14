import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SearchableSelect } from '@/components/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePericopeSets } from '@/features/pericopes/hooks/usePericopeSets';
import { SourceBiblePicker } from '@/features/projects/components/SourceBiblePicker';
import { useLanguages } from '@/features/projects/hooks/useLanguages';
import {
  CONNECTIVITY_PROFILE_NONE,
  CONNECTIVITY_PROFILE_OPTIONS,
  type ConnectivityProfile,
} from '@/lib/constants/connectivityProfiles';

/** The fields both the New and the Import tab collect. */
export interface ProjectFormData {
  title: string;
  targetLanguage: number | null;
  sourceLanguage: number | null;
  sourceBible: number | null;
  connectivityProfile: ConnectivityProfile | null;
  pericopeSetId: number | null;
}

interface ProjectFormFieldsProps {
  formData: ProjectFormData;
  onFieldChange: <K extends keyof ProjectFormData>(field: K, value: ProjectFormData[K]) => void;
}

/**
 * The project fields, shared by both tabs so the Import tab cannot drift from the New one.
 *
 * The query hooks are called here rather than passed down: they are React Query hooks, so a
 * second caller reads the same cache instead of issuing a second request, and it keeps this
 * component from needing a dozen data props.
 */
export function ProjectFormFields({ formData, onFieldChange }: ProjectFormFieldsProps) {
  const { t } = useTranslation();
  const { data: languages, isLoading: languagesLoading } = useLanguages();

  const { data: pericopeSets, isLoading: pericopeSetsLoading } = usePericopeSets();

  const languageOptions =
    languages?.map(lang => ({
      value: lang.id.toString(),
      label: `${lang.langName} (${lang.langCodeIso6393})`,
    })) ?? [];

  return (
    <>
      <div className='space-y-2'>
        <Label className='gap-1' htmlFor='title'>
          <span className='text-destructive'>*</span>
          {t('projectTitle')}
        </Label>
        <Input
          id='title'
          maxLength={100}
          value={formData.title}
          onChange={event => onFieldChange('title', event.target.value)}
        />
      </div>

      <SourceBiblePicker
        value={{
          sourceBible: formData.sourceBible,
          sourceLanguage: formData.sourceLanguage,
        }}
        onChange={selection => {
          onFieldChange('sourceBible', selection?.sourceBible ?? null);
          onFieldChange('sourceLanguage', selection?.sourceLanguage ?? null);
        }}
      />

      <div className='space-y-2'>
        <Label className='gap-1'>
          <span className='text-destructive'>*</span>
          {t('targetLanguage')}
        </Label>
        <SearchableSelect
          disabled={languagesLoading}
          options={languageOptions}
          placeholder={languagesLoading ? 'Loading languages...' : 'Select Target Language'}
          value={formData.targetLanguage?.toString() ?? ''}
          onChange={value => onFieldChange('targetLanguage', parseInt(value, 10))}
        />
      </div>

      <div className='space-y-2'>
        <div className='flex items-center gap-1'>
          <Label htmlFor='connectivityProfile'>{t('connectivityProfile')}</Label>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t('connectivityProfileInfo')}
                  className='text-muted-foreground hover:text-foreground h-6 w-6 p-0'
                  size='sm'
                  type='button'
                  variant='ghost'
                >
                  <Info className='h-4 w-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent className='max-w-xs' side='top'>
                <ul className='space-y-1'>
                  {CONNECTIVITY_PROFILE_OPTIONS.map(option => (
                    <li key={option.value}>{t(option.descKey)}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select
          value={formData.connectivityProfile ?? ''}
          onValueChange={value =>
            onFieldChange(
              'connectivityProfile',
              value === CONNECTIVITY_PROFILE_NONE ? null : (value as ConnectivityProfile)
            )
          }
        >
          <SelectTrigger className='w-full' id='connectivityProfile'>
            <SelectValue placeholder={t('connectivityProfilePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CONNECTIVITY_PROFILE_NONE}>
              {t('connectivityProfileNone')}
            </SelectItem>
            {CONNECTIVITY_PROFILE_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-2'>
        <Label className='gap-1' htmlFor='pericopeSet'>
          <span className='text-destructive'>*</span>
          {t('pericopeSet', 'Pericope Set')}
        </Label>
        <Select
          disabled={pericopeSetsLoading}
          value={formData.pericopeSetId?.toString() ?? ''}
          onValueChange={value => onFieldChange('pericopeSetId', parseInt(value, 10))}
        >
          <SelectTrigger className='w-full' id='pericopeSet'>
            <SelectValue
              placeholder={
                pericopeSetsLoading
                  ? 'Loading pericope sets...'
                  : 'Select pericope set for the project'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {pericopeSets?.map(set => (
              <SelectItem key={set.id} value={set.id.toString()}>
                {set.description ?? set.name} ({set.name})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
