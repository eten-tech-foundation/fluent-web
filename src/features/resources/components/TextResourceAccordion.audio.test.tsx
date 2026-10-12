import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GuideContent, ResourceItem } from '@/lib/types';

import { TextResourceAccordion } from './TextResourceAccordion';

let audioEnabled = true;

vi.mock('@/features/tts/settings/useAudioEnabled', () => ({
  useAudioEnabled: () => audioEnabled,
}));
vi.mock('../hooks/useAquiferResources', () => ({
  useResourceAssociations: () => ({ data: undefined }),
}));

const resources: ResourceItem[] = [
  { id: 1, localizedName: 'A resource', mediaType: 'text', grouping: {} },
];
const guideContents: Record<number, GuideContent> = {
  1: {
    id: 1,
    name: 'resource',
    localizedName: 'A resource',
    grouping: {},
    content: [
      {
        stepNumber: 1,
        tiptap: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Step' }] }],
        },
      },
    ],
  },
  2: {
    id: 2,
    name: 'resource-audio',
    localizedName: 'A resource audio',
    grouping: {},
    content: {
      mp3: { steps: [{ stepNumber: 1, url: 'https://audio.test/step.mp3' }] },
      webm: { steps: [{ stepNumber: 1, url: 'https://audio.test/step.webm' }] },
    },
  },
};

const props = {
  resources,
  guideContents,
  loadingGuides: {},
  relatedAudioIds: { 1: 2 },
  onAccordionChange: vi.fn(),
  onResourceClick: vi.fn(),
  openItem: ['1'],
};

describe('TextResourceAccordion native audio', () => {
  let paused: Set<HTMLMediaElement>;

  beforeEach(() => {
    audioEnabled = true;
    paused = new Set();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement
    ) {
      paused.add(this);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the aggregate gate and silences the real media element before removal and cleanup', () => {
    const view = render(<TextResourceAccordion {...props} />);
    const first = view.container.querySelector('audio')!;
    expect(first).toBeInTheDocument();
    expect(first.autoplay).toBe(false);
    expect(first.querySelector('source[type="audio/mpeg"]')).toHaveAttribute(
      'src',
      'https://audio.test/step.mp3'
    );
    first.currentTime = 7;

    audioEnabled = false;
    view.rerender(<TextResourceAccordion {...props} />);
    expect(paused).toContain(first);
    expect(first.currentTime).toBe(0);
    expect(view.container.querySelector('audio')).toBeNull();

    audioEnabled = true;
    view.rerender(<TextResourceAccordion {...props} />);
    const second = view.container.querySelector('audio')!;
    expect(second).not.toBe(first);
    expect(second.autoplay).toBe(false);
    expect(second.paused).toBe(true);
    second.currentTime = 4;

    view.unmount();
    expect(paused).toContain(second);
    expect(second.currentTime).toBe(0);
  });

  it('keeps the dormant native control absent when the rollout flag is dark', () => {
    audioEnabled = false;
    const view = render(<TextResourceAccordion {...props} />);
    expect(view.container.querySelector('audio')).toBeNull();
    expect(paused).toHaveLength(0);
  });
});
