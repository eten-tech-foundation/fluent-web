import { createContext, useContext, type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { useTranslation } from 'react-i18next';
import ReactMarkdown, { type Components, type UrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  parseAssistantAction,
  assistantActionAvailable,
  executeAssistantAction,
  type AssistantAction,
} from '../assistant.actions';
import { ASSISTANT_OUTPUT_CONTRACT_VERSION } from '../assistant.types';

const FLUENT_DIRECTIVE_PATTERN = /\{\{fluent:[^\r\n]*?(?:\}\}|(?=\r?$))/gm;

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  alt?: string | null;
  identifier?: string;
  label?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hName?: string; hProperties?: Record<string, string> };
}

interface PreparedSource {
  markdown: string;
  prefix: string;
  directives: Array<{ source: string; action: AssistantAction | null }>;
}

function prepareSource(source: string, supportsWidgets: boolean): PreparedSource {
  let prefix = 'FLUENTASSISTANTWIDGETTOKEN';
  while (source.includes(prefix)) prefix += 'X';
  const directives: PreparedSource['directives'] = [];
  const markdown = source.replace(FLUENT_DIRECTIVE_PATTERN, (complete: string, offset: number) => {
    let slashCount = 0;
    for (let cursor = offset - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1)
      slashCount += 1;
    const action = supportsWidgets && slashCount % 2 === 0 ? parseAssistantAction(complete) : null;
    // Repeated source must retain the same token so Markdown reference definitions
    // still match their uses before the AST restoration pass.
    let index = directives.findIndex(
      item => item.source === complete && !!item.action === !!action
    );
    if (index < 0) {
      index = directives.length;
      directives.push({ source: complete, action });
    }
    const token = `${prefix}${String(index)}END`;
    return token;
  });
  return { markdown, prefix, directives };
}

function macroNodes(
  value: string,
  prepared: PreparedSource,
  allowActivation: boolean
): MarkdownNode[] | null {
  const nodes: MarkdownNode[] = [];
  const tokenPattern = new RegExp(`${prepared.prefix}(\\d+)END`, 'g');
  let cursor = 0;
  let matches = 0;
  for (const match of value.matchAll(tokenPattern)) {
    const directive = prepared.directives[Number(match[1])];
    const index = match.index;
    if (index > cursor) nodes.push({ type: 'text', value: value.slice(cursor, index) });
    if (allowActivation && directive.action !== null) {
      nodes.push({
        type: 'suggestedQuestion',
        data: {
          hName: 'button',
          hProperties: {
            'data-fluent-action': directive.action.type,
            'data-fluent-payload': directive.action.payload,
          },
        },
        children: [{ type: 'text', value: directive.action.label }],
      });
    } else {
      nodes.push({ type: 'text', value: directive.source });
    }
    cursor = index + match[0].length;
    matches += 1;
  }
  if (matches === 0) return null;
  if (cursor < value.length) nodes.push({ type: 'text', value: value.slice(cursor) });
  return nodes;
}

/** Only text nodes can activate a widget; code, raw HTML, and wire metadata never can. */
function createSuggestedQuestionsPlugin(prepared: PreparedSource) {
  return () => (tree: MarkdownNode) => {
    const visit = (parent: MarkdownNode, blocked: boolean) => {
      // Metadata is never an activation surface. Restore before URL safety filtering and
      // restore reference identifiers consistently on definitions and references.
      for (const field of ['url', 'title', 'alt', 'identifier', 'label'] as const) {
        const value = parent[field];
        if (typeof value !== 'string') continue;
        parent[field] = value.replace(
          new RegExp(`${prepared.prefix}(\\d+)END`, 'gi'),
          (token, index: string) => prepared.directives[Number(index)]?.source ?? token
        );
      }
      const nextChildren: MarkdownNode[] = [];
      // Inline HTML is split across siblings; keep its entire paragraph inert.
      const containsInlineHtml =
        parent.type !== 'root' && parent.children?.some(child => child.type === 'html');
      for (const child of parent.children ?? []) {
        const childBlocked =
          blocked ||
          !!containsInlineHtml ||
          child.type === 'link' ||
          child.type === 'linkReference' ||
          child.type === 'image' ||
          child.type === 'imageReference';
        if (child.type === 'text' && child.value) {
          const replacement = macroNodes(child.value, prepared, !childBlocked);
          if (replacement) {
            nextChildren.push(...replacement);
            continue;
          }
        } else if (child.type === 'html' && child.value) {
          const replacement = macroNodes(child.value, prepared, false);
          child.type = 'text';
          if (replacement) child.value = replacement.map(node => node.value ?? '').join('');
        } else if ((child.type === 'code' || child.type === 'inlineCode') && child.value) {
          const replacement = macroNodes(child.value, prepared, false);
          if (replacement) child.value = replacement.map(node => node.value ?? '').join('');
        }
        visit(child, childBlocked);
        nextChildren.push(child);
      }
      if (parent.children) parent.children = nextChildren;
    };
    visit(tree, false);
  };
}

const safeUrlTransform: UrlTransform = url => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
};

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  node?: unknown;
  'data-fluent-action'?: string;
  'data-fluent-payload'?: string;
};

const SuggestedQuestionContext = createContext<
  ((question: string, event: object) => void) | undefined
>(undefined);

function SuggestedQuestionButton({ node: _node, children, ...props }: ButtonProps) {
  const onSuggestedQuestion = useContext(SuggestedQuestionContext);
  const handlers = { suggestedQuestion: onSuggestedQuestion };
  const type = props['data-fluent-action'] ?? '';
  const payload = props['data-fluent-payload'] ?? '';
  return (
    <button
      {...props}
      className='border-border text-primary hover:bg-muted my-1 block w-full rounded-md border bg-white px-3 py-2 text-left text-sm font-normal disabled:opacity-50'
      data-testid='suggested-question'
      disabled={!assistantActionAvailable(type, handlers)}
      type='button'
      onClick={event => {
        executeAssistantAction(type, payload, event.nativeEvent, handlers);
      }}
    >
      {children}
    </button>
  );
}

function AssistantImage({ alt }: ComponentPropsWithoutRef<'img'>) {
  const { t } = useTranslation();
  return (
    <span className='text-muted-foreground' data-testid='blocked-assistant-image'>
      {alt ?? t('assistant.image', '[image]')}
    </span>
  );
}

const markdownComponents: Components = {
  button: SuggestedQuestionButton,
  a: ({ node: _node, href, children, ...props }) =>
    href ? (
      <a {...props} href={href} rel='noopener noreferrer' target='_blank'>
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: AssistantImage,
  table: ({ node: _node, children, ...props }) => (
    <div className='my-3 overflow-x-auto'>
      <table {...props} className='w-full border-collapse text-sm'>
        {children}
      </table>
    </div>
  ),
  th: ({ node: _node, ...props }) => <th {...props} className='border px-2 py-1 text-left' />,
  td: ({ node: _node, ...props }) => <td {...props} className='border px-2 py-1 align-top' />,
};

const ALLOWED_ELEMENTS = [
  'a',
  'blockquote',
  'br',
  'button',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
] as const;

export function AssistantMarkdown({
  source,
  outputContractVersion,
  onSuggestedQuestion,
}: {
  source: string;
  outputContractVersion: string | null;
  onSuggestedQuestion?: (question: string, event: object) => void;
}): ReactNode {
  const supportsWidgets = outputContractVersion === ASSISTANT_OUTPUT_CONTRACT_VERSION;
  const prepared = prepareSource(source, supportsWidgets);
  return (
    <SuggestedQuestionContext.Provider value={onSuggestedQuestion}>
      <div className='assistant-markdown text-foreground space-y-3 text-sm leading-relaxed'>
        <ReactMarkdown
          skipHtml
          unwrapDisallowed
          allowedElements={[...ALLOWED_ELEMENTS]}
          components={markdownComponents}
          remarkPlugins={[remarkGfm, createSuggestedQuestionsPlugin(prepared)]}
          urlTransform={safeUrlTransform}
        >
          {prepared.markdown}
        </ReactMarkdown>
      </div>
    </SuggestedQuestionContext.Provider>
  );
}
