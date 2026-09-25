import { useEffect, useState } from 'react';

import { Loader2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguages } from '@/features/projects/hooks/useLanguages';
import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import { type UsfmFilePayload } from '@/lib/types';

import { ProjectFormFields, type ProjectFormData } from './ProjectFormFields';
import { UsfmImportTab, type AcceptedUsfmFile } from './UsfmImportTab';

export interface CreateProjectData {
  title: string;
  targetLanguage: number;
  sourceLanguage: number;
  sourceBible: number;
  pericopeSetId: number;
  /**
   * Manually picked books (New tab). Omitted/empty when creating from USFM
   * import, since the server derives books from usfmFiles instead — sending
   * both would put two contradictory book sets in one request.
   */
  books?: number[];
  /** Optional; becomes the default connectivity profile for milestones created under this project. */
  connectivityProfile?: string;
  /** Present only when creating from existing data: the server derives the books from these. */
  usfmFiles?: UsfmFilePayload[];
}

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (projectData: CreateProjectData) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
}

const EMPTY_FORM_DATA: ProjectFormData = {
  title: '',
  targetLanguage: null,
  sourceLanguage: null,
  sourceBible: null,
  pericopeSetId: null,
};

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onSave,
  isLoading = false,
  error = null,
}) => {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<ProjectFormData>(EMPTY_FORM_DATA);

  // books/connectivityProfile live outside ProjectFormData on purpose: UsfmImportTab already
  // treats book selection as its own concern via onBooksChange rather than routing it through
  // onFieldChange, and connectivityProfile has no field in ProjectFormFields yet (see #410 — the
  // selector was removed there; restoring the picker itself is out of scope here, but the value
  // is threaded through so onSave gets it as soon as that control comes back).
  const [books, setBooks] = useState<number[]>([]);
  const [connectivityProfile, setConnectivityProfile] = useState<string | undefined>(undefined);

  // ProjectFormFields runs the field queries; this one stays because a languages failure
  // replaces the whole dialog with an error rather than rendering the form.
  const { error: languagesError } = useLanguages();

  useEffect(() => {
    if (isOpen) {
      setFormData(EMPTY_FORM_DATA);
      setBooks([]);
      setConnectivityProfile(undefined);
    }
    setIsSubmitting(false);
  }, [isOpen]);

  // onSave resolves whether the save succeeded or failed — the parent catches its own errors — so
  // a resolved promise is not proof of success. isSubmitting therefore stays set once a submit
  // resolves, and only a reported failure releases it for a retry; a success is released by the
  // effect above when the route closes the dialog. Without this the button comes back for the
  // moment between a successful save and `isOpen` flipping, and a second click there creates a
  // duplicate project.
  useEffect(() => {
    if (error && !isLoading) {
      setIsSubmitting(false);
    }
  }, [error, isLoading]);

  const isFormValid = (): boolean => {
    return Boolean(
      formData.title.trim() &&
      formData.title.trim().length <= 100 &&
      formData.targetLanguage &&
      formData.sourceLanguage &&
      formData.sourceBible &&
      formData.pericopeSetId
    );
  };

  const handleSubmit = async (files?: AcceptedUsfmFile[]): Promise<void> => {
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
        // Both tabs share formData, so a book list picked on the New tab outlives a switch to
        // Import. The files carry their own books and the server derives bookId from them, so
        // sending the manual list too would put two contradictory book sets in one request.
        books: files ? [] : books,
        connectivityProfile,
        pericopeSetId: formData.pericopeSetId,
        ...(files && {
          usfmFiles: files.map(item => ({
            fileName: item.file.name,
            bookCode: item.bookCode,
            usfm: item.usfm,
          })),
        }),
      });
    } catch (error) {
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'create project submit',
      });
      setIsSubmitting(false);
    }
  };

  const updateFormData = <K extends keyof ProjectFormData>(
    field: K,
    value: ProjectFormData[K]
  ): void => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
        className='max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-[500px]'
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
              <ProjectFormFields formData={formData} onFieldChange={updateFormData} />

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
                  onClick={() => void handleSubmit()}
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
              <UsfmImportTab
                formData={formData}
                isSubmitting={isLoading || isSubmitting}
                onBooksChange={setBooks}
                onFieldChange={updateFormData}
                onSubmit={files => void handleSubmit(files)}
              />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
