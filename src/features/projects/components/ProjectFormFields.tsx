import { useTranslation } from 'react-i18next';

import { SearchableSelect } from '@/components/SearchableSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePericopeSets } from '@/features/pericopes/hooks/usePericopeSets';
import { SourceBiblePicker } from '@/features/projects/components/SourceBiblePicker';
import { useLanguages } from '@/features/projects/hooks/useLanguages';

/** The fields both the New and the Import tab collect. */
export interface ProjectFormData {
  title: string;
  targetLanguage: number | null;
  sourceLanguage: number | null;
  sourceBible: number | null;
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
  const { data: availableBooks, isLoading: booksLoading } = useBibleBooks(
    detectedBookCodes ? null : formData.sourceBible
  );
  const { data: pericopeSets, isLoading: pericopeSetsLoading } = usePericopeSets();

  const languageOptions =
    languages
      ?.slice()
      .sort((a, b) => a.langName.localeCompare(b.langName))
      .map(lang => ({
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
          placeholder={
            languagesLoading ? 'Loading languages...' : 'Search by language name or code'
          }
          value={formData.targetLanguage?.toString() ?? ''}
          onChange={value => onFieldChange('targetLanguage', parseInt(value, 10))}
          onClear={() => onFieldChange('targetLanguage', null)}
        />
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
