import { useEffect, useState } from 'react';

import { Loader2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { BibleBookMultiSelectPopover } from '@/components/BookSelector';
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
import { useBibleBooks, useBiblesByLanguage } from '@/features/projects/hooks/useBibleBooks';
import { useLanguages } from '@/features/projects/hooks/useLanguages';
import { Logger } from '@/lib/services/logger';

export interface CreateProjectData {
  title: string;
  targetLanguage: number;
  sourceLanguage: number;
  sourceBible: number;
  books: number[];
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
  });

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
      formData.books.length > 0
    );
  };

  const handleSubmit = async (): Promise<void> => {
    if (isSubmitting) {
      return;
    }
    try {
      if (!formData.targetLanguage || !formData.sourceLanguage || !formData.sourceBible) {
        return;
      }
      setIsSubmitting(true);
      await onSave({
        title: formData.title,
        targetLanguage: formData.targetLanguage,
        sourceLanguage: formData.sourceLanguage,
        sourceBible: formData.sourceBible,
        books: formData.books,
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
            <p className='text-red-600'>Failed to load languages. Please try again.</p>
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
      <DialogContent className='sm:max-w-[500px]' onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('createProject')}</DialogTitle>
        </DialogHeader>
        <div className='space-y-6 py-6'>
          <div className='space-y-2'>
            <Label className='gap-1' htmlFor='title'>
              <span style={{ color: 'red' }}>*</span>
              {t('projectTitle')}
            </Label>
            <Input id='title' maxLength={100} value={formData.title} onChange={handleTitleChange} />
          </div>

          <div className='space-y-2'>
            <Label className='gap-1'>
              <span style={{ color: 'red' }}>*</span>
              {t('sourceLanguage')}
            </Label>
            <Select
              disabled={languagesLoading}
              value={formData.sourceLanguage?.toString() ?? ''}
              onValueChange={value => updateFormData('sourceLanguage', parseInt(value))}
            >
              <SelectTrigger className='w-full bg-white'>
                <SelectValue
                  placeholder={languagesLoading ? 'Loading languages...' : 'Select Source Language'}
                />
              </SelectTrigger>
              <SelectContent>
                {languages?.map(language => (
                  <SelectItem key={language.id} value={language.id.toString()}>
                    {language.langName} ({language.langCodeIso6393})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label className='gap-1'>
              <span style={{ color: 'red' }}>*</span>
              {t('sourceBible')}
            </Label>
            <Select
              disabled={!formData.sourceLanguage || sourceBiblesLoading}
              value={formData.sourceBible?.toString() ?? ''}
              onValueChange={value => updateFormData('sourceBible', parseInt(value))}
            >
              <SelectTrigger className='w-full bg-white'>
                <SelectValue
                  placeholder={
                    !formData.sourceLanguage
                      ? 'Select Source Language First'
                      : sourceBiblesLoading
                        ? 'Loading bibles...'
                        : 'Select Source Bible'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {!sourceBibles || sourceBibles.length === 0 ? (
                  <div className='p-1 text-center text-sm text-gray-500'>
                    No bibles for this language
                  </div>
                ) : (
                  sourceBibles.map(bible => (
                    <SelectItem key={bible.id} value={bible.id.toString()}>
                      {bible.name} ({bible.abbreviation})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label className='gap-1'>
              <span style={{ color: 'red' }}>*</span>
              {t('targetLanguage')}
            </Label>
            <Select
              disabled={languagesLoading}
              value={formData.targetLanguage?.toString() ?? ''}
              onValueChange={value => updateFormData('targetLanguage', parseInt(value))}
            >
              <SelectTrigger className='w-full'>
                <SelectValue
                  placeholder={languagesLoading ? 'Loading languages...' : 'Select Target Language'}
                />
              </SelectTrigger>
              <SelectContent>
                {languages?.map(language => (
                  <SelectItem key={language.id} value={language.id.toString()}>
                    {language.langName} ({language.langCodeIso6393})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label className='gap-1'>
              <span style={{ color: 'red' }}>*</span>
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

          <div className='flex items-center justify-end pt-4'>
            {error && (
              <div className='mr-4 flex w-full items-center justify-center gap-2'>
                <TriangleAlert className='h-4 w-4 text-red-500' />
                <p className='text-sm font-medium text-red-600'>Error: Project not created.</p>
              </div>
            )}

            <Button
              className='bg-primary hover:bg-primary/90 text-white hover:cursor-pointer'
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
      </DialogContent>
    </Dialog>
  );
};
