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
  type ResourceItem,
  type TipTapNode,
} from '@/lib/types';

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
}) => {
  const dirAttr = direction.toLowerCase() as 'ltr' | 'rtl';
  const alignClass = direction === 'RTL' ? 'text-right' : 'text-left';
  const isTQ = resourceId === 'UWTranslationQuestions';

  return (
    <div className='h-full space-y-2' dir={dirAttr}>
      <Accordion type='multiple' value={openItem} onValueChange={onAccordionChange}>
        {resources.map(sv => {
          const relatedAudioId = relatedAudioIds[sv.id];
          const audioContent = relatedAudioId ? guideContents[relatedAudioId] : null;
          const audioData =
            audioContent && isAudioContent(audioContent.content) ? audioContent.content : null;
          const guideContent = guideContents[sv.id];

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

          return (
            <AccordionItem key={sv.id} className='border-0' value={sv.id.toString()}>
              <AccordionTrigger className={`hover:bg-muted/50 px-4 ${alignClass}`} dir={dirAttr}>
                {isTQ ? (
                  <div className={`flex w-full flex-col gap-1 ${alignClass}`} dir={dirAttr}>
                    <span className='text-muted-foreground text-sm font-semibold'>
                      {sv.localizedName}
                    </span>
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
                          onResourceClick={onResourceClick}
                        />
                      ))
                    )}
                  </div>
                ) : (
                  sv.localizedName
                )}
              </AccordionTrigger>
              <AccordionContent className='px-4 pb-4'>
                {loadingGuides[sv.id] ? (
                  <div className='flex items-center justify-center py-8'>
                    <Loader2 className='h-6 w-6 animate-spin text-blue-600' />
                  </div>
                ) : // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                guideContent ? (
                  <div dir={dirAttr}>
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
                            isTQ &&
                            isTipTapNode(contentItem.tiptap) &&
                            contentItem.tiptap.type === 'doc'
                              ? {
                                  ...contentItem.tiptap,
                                  content: contentItem.tiptap.content?.slice(1) ?? [],
                                }
                              : contentItem.tiptap;

                          return (
                            <div key={idx} className='pb-4' dir={dirAttr}>
                              {stepNumber && (
                                <div
                                  className={`mb-2 text-sm font-semibold text-blue-600 ${alignClass}`}
                                >
                                  Step {stepNumber}
                                </div>
                              )}
                              {isTipTapNode(tiptapContent) ? (
                                <TipTapRenderer
                                  content={tiptapContent}
                                  direction={direction}
                                  parentResourceId={sv.id}
                                  onResourceClick={onResourceClick}
                                />
                              ) : null}

                              {audioStep && (
                                <div className='mt-4 border-t border-gray-200 pt-3'>
                                  <div className={`mb-2 text-xs ${alignClass}`}>
                                    Audio for Step {stepNumber}
                                  </div>
                                  <audio controls className='w-full'>
                                    {webmStep?.url && (
                                      <source src={webmStep.url} type='audio/webm' />
                                    )}
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
        })}
      </Accordion>
    </div>
  );
};
