import { useEffect, useState } from 'react';

import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TipTapRenderer } from '@/features/resources/components/TipTapRenderer';
import {
  type ContentItem,
  type GuideContent,
  type ItemWithUrl,
  type ProjectItem,
  type TipTapNode,
} from '@/lib/types';
import { getPublisherName } from '@/lib/utils';

export const ImageGrid = ({
  items,
  sourceData,
  activeVerseId,
  onImageClick,
}: {
  items: ItemWithUrl[];
  sourceData: ProjectItem;
  activeVerseId: number;
  onImageClick: (item: ItemWithUrl) => void;
}) => {
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    target.style.display = 'none';
    if (target.parentElement) {
      target.parentElement.innerHTML = '<div class=" text-sm">No preview</div>';
    }
  };

  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

  const sortedItems = [...items].sort((a, b) => collator.compare(a.localizedName, b.localizedName));

  return (
    <>
      <span className='px-1 text-xl font-semibold'>
        {sourceData.book} {sourceData.chapterNumber}:{activeVerseId}
      </span>
      <div className='grid grid-cols-1 gap-3 py-4 lg:grid-cols-2'>
        {sortedItems.map(item => (
          <div
            key={item.id}
            className='cursor-pointer overflow-hidden rounded-lg border border-gray-200 hover:shadow-lg'
            onClick={() => onImageClick(item)}
          >
            <div className='flex aspect-video items-center justify-center'>
              <img
                alt={item.localizedName}
                className='h-full w-full object-contain'
                src={item.thumbnailUrl}
                onError={handleImageError}
              />
            </div>
            <div className='p-2'>
              <h4 className='text-xs font-semibold text-blue-600 hover:text-blue-800'>
                {item.localizedName} ({getPublisherName(item.grouping)})
              </h4>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

export const ImageDialog = ({
  image,
  onClose,
}: {
  image: ItemWithUrl | null;
  onClose: () => void;
}) => {
  const [error, setError] = useState(false);

  useEffect(() => {
    // Reset error whenever a new image is opened
    if (image) {
      setError(false);
    }
  }, [image]);

  const handleImageError = () => {
    setError(true);
  };

  return (
    <Dialog open={!!image} onOpenChange={onClose}>
      <DialogContent
        className='flex items-center justify-center border-none bg-transparent p-0 shadow-none'
        style={{
          width: 'auto',
          height: 'auto',
          maxWidth: '90vw',
          maxHeight: '90vh',
        }}
      >
        <VisuallyHidden>
          <DialogTitle>{image?.localizedName ?? 'Image preview'}</DialogTitle>
        </VisuallyHidden>

        {error ? (
          <div className='bg-background flex h-[50vh] w-[70vw] items-center justify-center rounded-lg text-center text-lg font-medium text-gray-700'>
            An error occurred. Please try again.
          </div>
        ) : (
          image && (
            <img
              alt={image.localizedName || 'Image preview'}
              className='object-contain'
              src={image.url}
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                width: 'auto',
                height: 'auto',
              }}
              onError={handleImageError}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
};

interface ResourceDialogProps {
  resource: GuideContent | null;
  loading: boolean;
  direction?: 'LTR' | 'RTL';
  error?: boolean;

  onClose: () => void;
  onResourceClick: (resourceId: number, parentResourceId?: number | null) => void;
}

const isContentItemArray = (content: GuideContent['content']): content is ContentItem[] =>
  Array.isArray(content);

const isTipTapNode = (tiptap: ContentItem['tiptap']): tiptap is TipTapNode => {
  return typeof tiptap === 'object' && 'type' in tiptap;
};

export const ResourceDialog: React.FC<ResourceDialogProps> = ({
  resource,
  loading,
  direction = 'LTR',
  error = false,

  onClose,
  onResourceClick,
}) => {
  if (!resource && !loading) return null;

  const dirAttr = direction.toLowerCase() as 'ltr' | 'rtl';
  const isRTL = direction === 'RTL';
  const alignClass = isRTL ? 'text-right' : 'text-left';

  return (
    <Dialog open={!!resource || loading} onOpenChange={onClose}>
      <DialogContent
        className='bg-background w-full" flex max-h-[80vh] !max-w-5xl flex-col p-0'
        dir={dirAttr}
        showCloseButton={false}
      >
        <DialogHeader
          className={`sticky top-0 z-20 flex items-center justify-between px-6 py-2 ${
            isRTL ? 'flex-row-reverse' : 'flex-row'
          }`}
          style={{
            display: 'flex',
            alignItems: 'center',
            flexDirection: isRTL ? 'row-reverse' : 'row',
          }}
        >
          {isRTL && (
            <DialogClose asChild>
              <button aria-label='Close' className='text-xl text-gray-500 hover:text-gray-800'>
                ✕
              </button>
            </DialogClose>
          )}

          <DialogTitle className={`flex-1 text-xl font-semibold ${alignClass}`} dir='ltr'>
            {resource?.localizedName ?? 'Loading...'}
          </DialogTitle>

          {!isRTL && (
            <DialogClose asChild>
              <button aria-label='Close' className='text-lg text-gray-500 hover:text-gray-800'>
                ✕
              </button>
            </DialogClose>
          )}
        </DialogHeader>

        <div className='mb-2 flex-1 overflow-y-auto px-6 py-2' dir={dirAttr}>
          {loading ? (
            <div className='flex items-center justify-center py-8'>
              <Loader2 className='h-8 w-8 animate-spin text-blue-600' />
            </div>
          ) : error ? (
            <div className='flex h-[70vh] items-center justify-center py-8'>
              <p className={`text-center text-base`}>An error occurred. Please try again</p>
            </div>
          ) : resource?.content && isContentItemArray(resource.content) ? (
            <div className='space-y-6'>
              {resource.content.map((contentItem, idx) => {
                if (!contentItem.tiptap || !isTipTapNode(contentItem.tiptap)) return null;
                const stepNumber = contentItem.stepNumber;

                return (
                  <div
                    key={idx}
                    className='border-b border-gray-100 pb-4 last:border-b-0'
                    dir={dirAttr}
                  >
                    {stepNumber && (
                      <div className={`mb-2 text-sm font-semibold text-blue-600 ${alignClass}`}>
                        Step {stepNumber}
                      </div>
                    )}
                    <TipTapRenderer
                      content={contentItem.tiptap}
                      direction={direction}
                      parentResourceId={resource.id}
                      onResourceClick={onResourceClick}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={`text-sm text-gray-500 ${alignClass}`}>No content available</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
