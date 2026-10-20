import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ASSISTANT_OUTPUT_CONTRACT_VERSION } from '../assistant.types';

import { AssistantMarkdown, MAX_SUGGESTED_QUESTION_LENGTH } from './AssistantMarkdown';

const macro = (question: string) => `{{fluent:v1:suggested_question|${question}}}`;
const renderMarkdown = (
  source: string,
  version: string | null = ASSISTANT_OUTPUT_CONTRACT_VERSION
) => render(<AssistantMarkdown outputContractVersion={version} source={source} />);

describe('AssistantMarkdown', () => {
  it('activates a suggested question only after every possible delimiter split is complete', () => {
    const source = macro('What does this phrase mean?');
    for (let split = 0; split < source.length; split += 1) {
      const view = renderMarkdown(source.slice(0, split));
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      view.rerender(
        <AssistantMarkdown
          outputContractVersion={ASSISTANT_OUTPUT_CONTRACT_VERSION}
          source={source.slice(0, split) + source.slice(split)}
        />
      );
      expect(screen.getByRole('button', { name: 'What does this phrase mean?' })).toBeVisible();
      cleanup();
    }
  });

  it('renders multiple macros in paragraphs, lists, table cells, and alone', () => {
    renderMarkdown(`${macro('Paragraph question?')} in a paragraph.

- List item ${macro('List question?')}

| Topic | Research |
| --- | --- |
| Words | ${macro('Table question?')} |

${macro('Standalone question?')}`);

    expect(screen.getAllByTestId('suggested-question')).toHaveLength(4);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('keeps malformed, incomplete, unknown, escaped, and oversized macros readable and inert', () => {
    const oversized = 'q'.repeat(MAX_SUGGESTED_QUESTION_LENGTH + 1);
    const source = [
      '{{fluent:v1:suggested_question|unfinished',
      '{{fluent:v2:suggested_question|Unknown version?}}',
      '{{fluent:v1:unknown|Unknown widget?}}',
      '{{fluent:v1:suggested_question|}}',
      '{{fluent:v1:suggested_question|   }}',
      `{{fluent:v1:suggested_question|${oversized}}}`,
      `\\${macro('Escaped question?')}`,
    ].join('\n\n');
    renderMarkdown(source);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/Unknown version/)).toBeInTheDocument();
    expect(screen.getByText(/Escaped question/)).toBeInTheDocument();
  });

  it('leaves a known macro inert under an unknown output-contract version', () => {
    renderMarkdown(
      `| Topic | Research |
| --- | --- |
| Words | ${macro('Still readable?')} |`,
      'future-contract'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/Still readable/)).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent(macro('Still readable?'));
  });

  it('keeps unknown and truncated directives literal inside GFM tables and code', () => {
    const unknown = '{{fluent:v2:future_widget|Unknown | data}}';
    const truncated = '{{fluent:v1:suggested_question|Incomplete | data';
    renderMarkdown(`| Topic | Research |
| --- | --- |
| Unknown | ${unknown} |
| Truncated | ${truncated}

\`${macro('Code question?')}\``);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent(unknown);
    expect(screen.getByRole('table')).toHaveTextContent(truncated);
    expect(screen.getByText(macro('Code question?'))).toHaveProperty('tagName', 'CODE');
  });

  it('does not render raw HTML, execute scripts, navigate unsafe links, or load images', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    renderMarkdown(`<script>window.alert('bad')</script>

<b>raw bold</b>

[unsafe](javascript:window.alert('bad')) [relative](/account) [safe](https://example.com/path)

![remote alt](https://example.com/tracker.png)`);

    expect(document.querySelector('script')).not.toBeInTheDocument();
    expect(document.querySelector('b')).not.toBeInTheDocument();
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText('unsafe').closest('a')).toBeNull();
    expect(screen.getByText('relative').closest('a')).toBeNull();
    expect(screen.getByRole('link', { name: 'safe' })).toHaveAttribute(
      'href',
      'https://example.com/path'
    );
    expect(screen.getByRole('link', { name: 'safe' })).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
    expect(document.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('blocked-assistant-image')).toHaveTextContent('remote alt');
  });

  it('renders question text as text rather than generated markup', () => {
    renderMarkdown(macro('<img src=x onerror=alert(1)> & **not bold**'));
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('<img src=x onerror=alert(1)> & **not bold**');
    expect(button.querySelector('img')).toBeNull();
    expect(button.querySelector('strong')).toBeNull();
  });

  it('keeps exactly three deeper-research controls in both bounded pane-fit variants', () => {
    const questions = [macro('Language?'), macro('Culture?'), macro('Verse detail?')].join('\n\n');
    for (const paragraphs of [
      ['Central movement.', 'Translation observation.'],
      ['Central movement.', 'Translation observation.', 'One more short observation.'],
    ]) {
      renderMarkdown(`${paragraphs.join('\n\n')}\n\n${questions}`);
      expect(screen.getAllByTestId('suggested-question')).toHaveLength(3);
      cleanup();
    }
  });
});
