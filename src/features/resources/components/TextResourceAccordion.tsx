import { useMemo } from 'react';

import { Loader2 } from 'lucide-react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { TipTapRenderer } from '@/features/resources/components/TipTapRenderer';
import {
  type AudioContent,
  type AudioStep,
  type ContentItem,
  type GuideContent,
  type ProjectItem,
  type ResourceItem,
  type TipTapNode,
} from '@/lib/types';

import { useResourceAssociations } from '../hooks/hooks';

interface TextResourceAccordionProps {
  resources: ResourceItem[];
  guideContents: Record<number, GuideContent>;
  loadingGuides: Record<number, boolean>;
  relatedAudioIds: Record<number, number | null>;
  direction?: 'LTR' | 'RTL';
  onAccordionChange: (value: string[]) => void;
  onResourceClick: (resourceId: number, parentResourceId?: number | null) => void;
  openItem: string[];
  resourceId?: string;
  sourceData?: ProjectItem;
  selectedLanguage?: string;
}

const isAudioContent = (content: GuideContent['content']): content is AudioContent => {
  return (
    typeof content === 'object' &&
    !Array.isArray(content) &&
    ('mp3' in content || 'webm' in content)
  );
};

const isContentItemArray = (content: GuideContent['content']): content is ContentItem[] => {
  return Array.isArray(content);
};

const isTipTapNode = (value: unknown): value is TipTapNode => {
  return typeof value === 'object' && value !== null && 'type' in value;
};

interface TextResourceAccordionItemProps {
  sv: ResourceItem;
  relatedAudioIds: Record<number, number | null>;
  guideContents: Record<number, GuideContent>;
  loadingGuides: Record<number, boolean>;
  direction: 'LTR' | 'RTL';
  isTQ: boolean;
  resourceId?: string;
  sourceData?: ProjectItem;
  openItem: string[];
  selectedLanguage?: string;
  onResourceClick: (resourceId: number, parentResourceId?: number | null) => void;
}

const TextResourceAccordionItem: React.FC<TextResourceAccordionItemProps> = ({
  sv,
  relatedAudioIds,
  guideContents,
  loadingGuides,
  direction,
  isTQ,
  resourceId,
  sourceData,
  openItem,
  selectedLanguage,
  onResourceClick,
}) => {
  const alignClass = direction === 'RTL' ? 'text-right' : 'text-left';
  const dirAttr = direction.toLowerCase() as 'ltr' | 'rtl';

  const relatedAudioId = relatedAudioIds[sv.id];
  const audioContent = relatedAudioId ? guideContents[relatedAudioId] : null;
  const audioData =
    audioContent && isAudioContent(audioContent.content) ? audioContent.content : null;
  const guideContent = guideContents[sv.id];

  const isExpanded = openItem.includes(sv.id.toString());
  const isTW = resourceId === 'UWTranslationWords';
  const isEnglish = selectedLanguage === 'en' || selectedLanguage === 'eng';

  const { data: associationsData } = useResourceAssociations(
    sv.id,
    isTW && isExpanded && isEnglish
  );

  const tqQuestionNodes: TipTapNode[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (isTQ && guideContent && isContentItemArray(guideContent.content)) {
    for (const item of guideContent.content) {
      const { tiptap } = item;
      if (isTipTapNode(tiptap) && tiptap.type === 'doc' && tiptap.content?.[0] != null) {
        tqQuestionNodes.push(tiptap.content[0]);
      }
    }
  }

  const formattedVerses = useMemo(() => {
    if (!isTW || !isEnglish || !associationsData?.passageAssociations || !sourceData) return '';
    const bookCode = sourceData.bookCode;
    const chapterNumber = sourceData.chapterNumber;
    const bookName = sourceData.book;

    const versesSet = new Set<number>();
    for (const assoc of associationsData.passageAssociations) {
      if (assoc.startBookCode !== bookCode && assoc.endBookCode !== bookCode) {
        continue;
      }

      const isStartBefore =
        (assoc.startBookCode === bookCode && assoc.startChapter < chapterNumber) ||
        (assoc.startBookCode !== bookCode && assoc.endBookCode === bookCode);

      const isStartIn = assoc.startBookCode === bookCode && assoc.startChapter === chapterNumber;

      const isEndAfter =
        (assoc.endBookCode === bookCode && assoc.endChapter > chapterNumber) ||
        (assoc.endBookCode !== bookCode && assoc.startBookCode === bookCode);

      const isEndIn = assoc.endBookCode === bookCode && assoc.endChapter === chapterNumber;

      let startV = -1;
      let endV = -1;

      if (isStartIn && isEndIn) {
        startV = assoc.startVerse;
        endV = assoc.endVerse;
      } else if (isStartBefore && isEndIn) {
        startV = 1;
        endV = assoc.endVerse;
      } else if (isStartIn && isEndAfter) {
        startV = assoc.startVerse;
        endV = sourceData.totalVerses;
      } else if (isStartBefore && isEndAfter) {
        startV = 1;
        endV = sourceData.totalVerses;
      }

      if (startV !== -1 && endV !== -1) {
        for (let v = Math.min(startV, endV); v <= Math.max(startV, endV); v++) {
          versesSet.add(v);
        }
      }
    }

    const sortedVerses = Array.from(versesSet).sort((a, b) => a - b);
    if (sortedVerses.length === 0) return '';

    return `${bookName} ${chapterNumber}:${sortedVerses.join(`, ${chapterNumber}:`)}`;
  }, [isTW, isEnglish, associationsData, sourceData]);

  return (
    <AccordionItem key={sv.id} className='border-0' value={sv.id.toString()}>
      <AccordionTrigger
        className={`hover:bg-muted/50 px-4 data-[state=open]:font-bold ${alignClass}`}
        dir={dirAttr}
      >
        {isTQ ? (
          <div className={`flex w-full flex-col gap-1 ${alignClass}`} dir={dirAttr}>
            <span className='text-muted-foreground text-sm font-semibold'>{sv.localizedName}</span>
            {tqQuestionNodes.length === 0 ? (
              loadingGuides[sv.id] || !(sv.id in guideContents) ? (
                <span className='text-muted-foreground animate-pulse text-xs'>
                  Loading question...
                </span>
              ) : (
                <span className='text-muted-foreground text-xs'>No question available</span>
              )
            ) : (
              tqQuestionNodes.map((node, i) => (
                <TipTapRenderer
                  key={i}
                  content={node}
                  direction={direction}
                  parentResourceId={sv.id}
                  variant='compact'
                  onResourceClick={onResourceClick}
                />
              ))
            )}
          </div>
        ) : (
          sv.localizedName
        )}
      </AccordionTrigger>
      <AccordionContent className={`pb-4 ${direction === 'RTL' ? 'pr-8 pl-4' : 'pr-4 pl-8'}`}>
        {loadingGuides[sv.id] ? (
          <div className='flex items-center justify-center py-8'>
            <Loader2 className='h-6 w-6 animate-spin text-blue-600' />
          </div>
        ) : // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        guideContent ? (
          <div dir={dirAttr}>
            {isTW && isEnglish && formattedVerses && (
              <div className='mb-4' dir={dirAttr}>
                <div className={`text-foreground text-sm font-bold ${alignClass}`}>
                  Used in these verses
                </div>
                <div className={`text-foreground/90 mt-1 text-sm leading-normal ${alignClass}`}>
                  {formattedVerses}
                </div>
              </div>
            )}

            {isContentItemArray(guideContent.content) ? (
              <div className='space-y-6'>
                {guideContent.content.map((contentItem, idx) => {
                  if (!contentItem.tiptap) return null;

                  const stepNumber = contentItem.stepNumber;
                  const audioStep = audioData?.mp3?.steps?.find(
                    (s: AudioStep) => s.stepNumber === stepNumber
                  );
                  const webmStep = audioData?.webm?.steps?.find(
                    (s: AudioStep) => s.stepNumber === stepNumber
                  );

                  const tiptapContent =
                    isTQ && isTipTapNode(contentItem.tiptap) && contentItem.tiptap.type === 'doc'
                      ? {
                          ...contentItem.tiptap,
                          content: contentItem.tiptap.content?.slice(1) ?? [],
                        }
                      : contentItem.tiptap;

                  return (
                    <div key={idx} className='pb-4' dir={dirAttr}>
                      {stepNumber && (
                        <div className={`mb-2 text-sm font-semibold text-blue-600 ${alignClass}`}>
                          Step {stepNumber}
                        </div>
                      )}
                      {isTipTapNode(tiptapContent) ? (
                        <TipTapRenderer
                          content={tiptapContent}
                          direction={direction}
                          parentResourceId={sv.id}
                          variant='compact'
                          onResourceClick={onResourceClick}
                        />
                      ) : null}

                      {audioStep && (
                        <div className='mt-4 border-t border-gray-200 pt-3'>
                          <div className={`mb-2 text-xs ${alignClass}`}>
                            Audio for Step {stepNumber}
                          </div>
                          <audio controls className='w-full'>
                            {webmStep?.url && <source src={webmStep.url} type='audio/webm' />}
                            <source src={audioStep.url} type='audio/mpeg' />
                            Your browser does not support the audio element.
                          </audio>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : !isAudioContent(guideContent.content) ? (
              <p className={`text-sm ${alignClass}`}>No text content available</p>
            ) : null}
          </div>
        ) : (
          <p className={`text-sm ${alignClass}`}>Failed to load content</p>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};

export const TextResourceAccordion: React.FC<TextResourceAccordionProps> = ({
  resources,
  guideContents,
  loadingGuides,
  relatedAudioIds,
  direction = 'LTR',
  onAccordionChange,
  onResourceClick,
  openItem,
  resourceId,
  sourceData,
  selectedLanguage,
}) => {
  const dirAttr = direction.toLowerCase() as 'ltr' | 'rtl';

  return (
    <div className='h-full space-y-2' dir={dirAttr}>
      <Accordion type='multiple' value={openItem} onValueChange={onAccordionChange}>
        {resources.map(sv => (
          <TextResourceAccordionItem
            key={sv.id}
            direction={direction}
            guideContents={guideContents}
            isTQ={resourceId === 'UWTranslationQuestions'}
            loadingGuides={loadingGuides}
            openItem={openItem}
            relatedAudioIds={relatedAudioIds}
            resourceId={resourceId}
            selectedLanguage={selectedLanguage}
            sourceData={sourceData}
            sv={sv}
            onResourceClick={onResourceClick}
          />
        ))}
      </Accordion>
    </div>
  );
};
