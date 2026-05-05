import React from 'react';

import { Logger } from '@/lib/services/logger';
import type { TipTapMark, TipTapNode } from '@/lib/types';

interface TipTapRendererProps {
  content: TipTapNode;
  direction?: 'LTR' | 'RTL';
  onResourceClick?: (resourceId: number, parentResourceId?: number) => void;
  parentResourceId?: number;
}

export const TipTapRenderer: React.FC<TipTapRendererProps> = ({
  content,
  direction = 'LTR',
  onResourceClick,
  parentResourceId,
}) => {
  const dirAttr = direction.toLowerCase() as 'ltr' | 'rtl';
  const alignClass = direction === 'RTL' ? 'text-right' : 'text-left';
  const marginClass = direction === 'RTL' ? 'mr' : 'ml';

  const renderNode = (node: TipTapNode | null | undefined, index: number): React.ReactNode => {
    if (!node) return null;

    switch (node.type) {
      case 'doc':
        return (
          <div key={index} className='space-y-4' dir={dirAttr}>
            {node.content?.map((child, i) => renderNode(child, i))}
          </div>
        );

      case 'heading': {
        const level = node.attrs?.level ?? 1;
        const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
        const headingClasses: Record<number, string> = {
          1: 'text-2xl font-bold  mb-3',
          2: 'text-xl font-semibold  mb-2 mt-4',
          3: 'text-lg font-semibold  mb-2',
          4: 'text-base font-semibold  mb-2',
          5: 'text-sm font-semibold  mb-2',
        };
        return (
          <HeadingTag
            key={index}
            className={`${headingClasses[level] ?? headingClasses[1]} ${alignClass}`}
            dir={dirAttr}
          >
            {node.content?.map((child, i) => renderNode(child, i))}
          </HeadingTag>
        );
      }

      case 'paragraph': {
        const indentClass = node.attrs?.indent ? `${marginClass}-${node.attrs.indent * 4}` : '';
        return (
          <p
            key={index}
            className={`mb-2 leading-relaxed ${alignClass} ${indentClass}`}
            dir={dirAttr}
          >
            {node.content?.map((child, i) => renderNode(child, i))}
          </p>
        );
      }

      case 'bulletList': {
        const bulletIndent = node.attrs?.indent
          ? `${marginClass}-${node.attrs.indent * 4}`
          : `${marginClass}-6`;
        const listStyleClass = direction === 'RTL' ? 'list-[arabic-indic]' : 'list-disc';
        return (
          <ul
            key={index}
            className={`${listStyleClass} ${bulletIndent} mb-3 space-y-1 ${alignClass}`}
            dir={dirAttr}
          >
            {node.content?.map((child, i) => renderNode(child, i))}
          </ul>
        );
      }

      case 'orderedList': {
        const orderedIndent = node.attrs?.indent
          ? `${marginClass}-${node.attrs.indent * 4}`
          : `${marginClass}-6`;
        const listStyleClass = direction === 'RTL' ? 'list-[arabic-indic]' : 'list-decimal';
        return (
          <ol
            key={index}
            className={`${listStyleClass} ${orderedIndent} mb-3 space-y-1 ${alignClass}`}
            dir={dirAttr}
            start={node.attrs?.start ?? 1}
          >
            {node.content?.map((child, i) => renderNode(child, i))}
          </ol>
        );
      }

      case 'listItem':
        return (
          <li key={index} className={` ${alignClass}`} dir={dirAttr}>
            {node.content?.map((child, i) => renderNode(child, i))}
          </li>
        );

      case 'blockquote': {
        const blockquoteIndent = node.attrs?.indent
          ? `${marginClass}-${node.attrs.indent * 4}`
          : '';
        const borderClass = direction === 'RTL' ? 'border-r-4 pr-4' : 'border-l-4 pl-4';
        return (
          <blockquote
            key={index}
            className={`my-3 ${borderClass} border-gray-300 italic ${blockquoteIndent} ${alignClass}`}
            dir={dirAttr}
          >
            {node.content?.map((child, i) => renderNode(child, i))}
          </blockquote>
        );
      }

      case 'image':
        return (
          <img
            key={index}
            alt={node.attrs?.alt ?? ''}
            className='my-4 h-auto max-w-full rounded'
            src={node.attrs?.src}
          />
        );

      case 'video':
        return (
          <video
            key={index}
            controls
            className='my-4 h-auto max-w-full rounded'
            src={node.attrs?.src}
          >
            Your browser does not support the video element.
          </video>
        );

      case 'OpenTranslatorsNotesSection':
      case 'OpenTranslatorsNotesParagraph':
      case 'OpenTranslatorsNotesGeneralComment': {
        const borderClass = direction === 'RTL' ? 'border-r-4 pr-4' : 'border-l-4 pl-4';
        return (
          <div
            key={index}
            className={`my-4 ${borderClass} border-blue-400 bg-blue-50 py-2 ${alignClass}`}
            dir={dirAttr}
          >
            {node.content?.map((child, i) => renderNode(child, i))}
          </div>
        );
      }

      case 'OpenTranslatorsNotesTranslationOptions':
        return (
          <div
            key={index}
            className={`my-4 rounded-lg border border-green-300 bg-green-50 p-4 ${alignClass}`}
            dir={dirAttr}
          >
            {node.content?.map((child, i) => renderNode(child, i))}
          </div>
        );

      case 'OpenTranslatorsNotesTranslationOptionsDefaultOption':
        return (
          <div key={index} className={`mb-3 ${alignClass}`} dir={dirAttr}>
            <div className='mb-1 text-xs font-semibold text-green-700'>Default Translation:</div>
            {node.content?.map((child, i) => renderNode(child, i))}
          </div>
        );

      case 'OpenTranslatorsNotesTranslationOptionsAdditionalTranslationOptions': {
        const listMargin = `${marginClass}-6`;
        return (
          <div key={index} className={alignClass} dir={dirAttr}>
            <div className='mb-1 text-xs font-semibold text-green-700'>
              Alternative Translations:
            </div>
            <ul className={`${listMargin} list-disc space-y-1`}>
              {node.content?.map((child, i) => renderNode(child, i))}
            </ul>
          </div>
        );
      }

      case 'text': {
        const text = node.text ?? '';

        if (node.marks && node.marks.length > 0) {
          let element: React.ReactNode = text;
          let resourceId: number | undefined;

          node.marks.forEach((mark: TipTapMark) => {
            if (mark.type === 'bold') {
              element = <strong className='font-semibold'>{element}</strong>;
            } else if (mark.type === 'italic') {
              element = <em className='italic'>{element}</em>;
            } else if (mark.type === 'underline') {
              element = <span className='underline'>{element}</span>;
            } else if (mark.type === 'implied') {
              element = <span className='italic'>[{element}]</span>;
            } else if (mark.type === 'bibleReference') {
              element = <span className=''>{element}</span>;
            } else if (mark.type === 'resourceReference') {
              resourceId = mark.attrs?.resourceId;
            }
          });

          if (resourceId !== undefined) {
            return (
              <span
                key={index}
                className='cursor-pointer text-blue-600'
                onClick={() => {
                  if (onResourceClick && resourceId !== undefined) {
                    onResourceClick(resourceId, parentResourceId);
                  }
                }}
              >
                {element}
              </span>
            );
          }

          return <React.Fragment key={index}>{element}</React.Fragment>;
        }

        return <React.Fragment key={index}>{text}</React.Fragment>;
      }

      default:
        Logger.warn('Unknown TipTap node type', {
          nodeType: node.type,
          parentResourceId,
        });
        return null;
    }
  };

  return <>{renderNode(content, 0)}</>;
};
