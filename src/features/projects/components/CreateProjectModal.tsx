import { useEffect, useState } from 'react';

import { Info, Loader2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { BibleBookMultiSelectPopover } from '@/components/BookSelector';
import { SearchableSelect } from '@/components/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePericopeSets } from '@/features/pericopes/hooks/usePericopeSets';
import { useBibleBooks, useBiblesByLanguage } from '@/features/projects/hooks/useBibleBooks';
import { useLanguages } from '@/features/projects/hooks/useLanguages';
import { config } from '@/lib/config';
import {
  CONNECTIVITY_PROFILE_NONE,
  CONNECTIVITY_PROFILE_OPTIONS,
  type ConnectivityProfile,
} from '@/lib/constants/connectivityProfiles';
import { Logger } from '@/lib/services/logger';

import { UsfmImportTab } from './UsfmImportTab';

export interface CreateProjectData {
  title: string;
  targetLanguage: number;
  sourceLanguage: number;
  sourceBible: number;
  books: number[];
  connectivityProfile: ConnectivityProfile | null;
  pericopeSetId: number;
}

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (projectData: CreateProjectData) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
}

interface FormData {
  title: string;
  targetLanguage: number | null;
  sourceLanguage: number | null;
  sourceBible: number | null;
  books: number[];
  connectivityProfile: ConnectivityProfile | null;
  pericopeSetId: number | null;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onSave,
  isLoading = false,
  error = null,
}) => {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    title: '',
    targetLanguage: null,
    sourceLanguage: null,
    sourceBible: null,
    books: [],
    connectivityProfile: null,
    pericopeSetId: null,
  });

  const { data: pericopeSets, isLoading: pericopeSetsLoading } = usePericopeSets();

  const { data: languages, isLoading: languagesLoading, error: languagesError } = useLanguages();
  const { data: sourceBibles, isLoading: sourceBiblesLoading } = useBiblesByLanguage(
    formData.sourceLanguage
  );
  const { data: availableBooks, isLoading: booksLoading } = useBibleBooks(formData.sourceBible);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        title: '',
        targetLanguage: null,
        sourceLanguage: null,
        sourceBible: null,
        books: [],
        connectivityProfile: null,
        pericopeSetId: null,
      });
    }
    setIsSubmitting(false);
  }, [isOpen]);

  useEffect(() => {
    if (formData.sourceLanguage) {
      setFormData(prev => ({
        ...prev,
        sourceBible: null,
        books: [],
      }));
    }
  }, [formData.sourceLanguage]);

  useEffect(() => {
    if (formData.sourceBible) {
      setFormData(prev => ({
        ...prev,
        books: [],
      }));
    }
  }, [formData.sourceBible]);

  const isFormValid = (): boolean => {
    return Boolean(
      formData.title.trim() &&
      formData.title.trim().length <= 100 &&
      formData.targetLanguage &&
      formData.sourceLanguage &&
      formData.sourceBible &&
      formData.books.length > 0 &&
      formData.pericopeSetId
    );
  };

  const handleSubmit = async (): Promise<void> => {
    if (isSubmitting) {
      return;
    }
    try {
      if (
        !formData.targetLanguage ||
        !formData.sourceLanguage ||
        !formData.sourceBible ||
        !formData.pericopeSetId
      ) {
        return;
      }
      setIsSubmitting(true);
      await onSave({
        title: formData.title,
        targetLanguage: formData.targetLanguage,
        sourceLanguage: formData.sourceLanguage,
        sourceBible: formData.sourceBible,
        books: formData.books,
        connectivityProfile: formData.connectivityProfile,
        pericopeSetId: formData.pericopeSetId,
      });
    } catch (error) {
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'create project submit',
      });
      setIsSubmitting(false);
    }
  };

  const updateFormData = (
    field: keyof FormData,
    value: string | number | number[] | null
  ): void => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    if (value.length <= 100) {
      updateFormData('title', value);
    }
  };

  const isButtonDisabled = isLoading || isSubmitting || !isFormValid();

  if (languagesError) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className='sm:max-w-[500px]'>
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
          </DialogHeader>
          <div className='py-6'>
            <p className='text-destructive'>Failed to load languages. Please try again.</p>
          </div>
          <div className='flex justify-end'>
            <Button onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className='max-h-[90vh] overflow-y-auto sm:max-w-[500px]'
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('createProject')}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue='new'>
          {config.features.usfmImport && (
            <TabsList>
              <TabsTrigger value='new'>{t('newTab')}</TabsTrigger>
              <TabsTrigger value='import'>{t('importTab')}</TabsTrigger>
            </TabsList>
          )}
          <TabsContent value='new'>
            <div className='space-y-6 py-6'>
              <div className='space-y-2'>
                <Label className='gap-1' htmlFor='title'>
                  <span className='text-destructive'>*</span>
                  {t('projectTitle')}
                </Label>
                <Input
                  id='title'
                  maxLength={100}
                  value={formData.title}
                  onChange={handleTitleChange}
                />
              </div>

              <div className='space-y-2'>
                <Label className='gap-1'>
                  <span className='text-destructive'>*</span>
                  {t('sourceLanguage')}
                </Label>
                <SearchableSelect
                  disabled={languagesLoading}
                  options={
                    languages?.map(lang => ({
                      value: lang.id.toString(),
                      label: `${lang.langName} (${lang.langCodeIso6393})`,
                    })) ?? []
                  }
                  placeholder={languagesLoading ? 'Loading languages...' : 'Select Source Language'}
                  value={formData.sourceLanguage?.toString() ?? ''}
                  onChange={value => updateFormData('sourceLanguage', parseInt(value, 10))}
                />
              </div>

              <div className='space-y-2'>
                <Label className='gap-1'>
                  <span className='text-destructive'>*</span>
                  {t('sourceBible')}
                </Label>
                <SearchableSelect
                  disabled={!formData.sourceLanguage || sourceBiblesLoading}
                  emptyText='No bibles for this language'
                  options={
                    sourceBibles?.map(bible => ({
                      value: bible.id.toString(),
                      label: `${bible.name} (${bible.abbreviation})`,
                    })) ?? []
                  }
                  placeholder={
                    !formData.sourceLanguage
                      ? 'Select Source Language First'
                      : sourceBiblesLoading
                        ? 'Loading bibles...'
                        : 'Select Source Bible'
                  }
                  value={formData.sourceBible?.toString() ?? ''}
                  onChange={value => updateFormData('sourceBible', parseInt(value, 10))}
                />
              </div>

              <div className='space-y-2'>
                <Label className='gap-1'>
                  <span className='text-destructive'>*</span>
                  {t('targetLanguage')}
                </Label>
                <SearchableSelect
                  disabled={languagesLoading}
                  options={
                    languages?.map(lang => ({
                      value: lang.id.toString(),
                      label: `${lang.langName} (${lang.langCodeIso6393})`,
                    })) ?? []
                  }
                  placeholder={languagesLoading ? 'Loading languages...' : 'Select Target Language'}
                  value={formData.targetLanguage?.toString() ?? ''}
                  onChange={value => updateFormData('targetLanguage', parseInt(value, 10))}
                />
              </div>

              <div className='space-y-2'>
                <Label className='gap-1'>
                  <span className='text-destructive'>*</span>
                  {t('books')}
                </Label>
                {booksLoading && formData.sourceBible ? (
                  <div className='flex items-center gap-2 rounded-md border p-3'>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    <span>Loading books...</span>
                  </div>
                ) : (
                  <BibleBookMultiSelectPopover
                    books={availableBooks ?? []}
                    disabled={!formData.sourceBible}
                    value={formData.books}
                    onChange={newBooks => setFormData(prev => ({ ...prev, books: newBooks }))}
                  />
                )}
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
                    updateFormData(
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
                  onValueChange={value => updateFormData('pericopeSetId', parseInt(value, 10))}
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

              <div className='flex items-center justify-end pt-4'>
                {error && (
                  <div className='mr-4 flex w-full items-center justify-center gap-2'>
                    <TriangleAlert className='text-destructive h-4 w-4' />
                    <p className='text-destructive text-sm font-medium'>
                      Error: Project not created.
                    </p>
                  </div>
                )}

                <Button
                  className='bg-primary hover:bg-primary/90 text-primary-foreground hover:cursor-pointer'
                  disabled={isButtonDisabled}
                  type='button'
                  onClick={handleSubmit}
                >
                  {isLoading ? (
                    <div className='flex items-center gap-2'>
                      <Loader2 className='h-4 w-4 animate-spin' />
                      <span>Creating...</span>
                    </div>
                  ) : (
                    t('createProject')
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
          {config.features.usfmImport && (
            <TabsContent value='import'>
              {/* No-op for now: #420 is what does something with the accepted files. */}
              <UsfmImportTab onFilesAccepted={() => {}} />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
