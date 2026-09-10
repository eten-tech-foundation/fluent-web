import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Route } from '@/routes/__root';

import { type PlaybackRegistry } from '../tts/registry/PlaybackRegistryStore';
import { usePlayableState } from '../tts/registry/usePlayableState';
import { usePlaybackRegistry } from '../tts/registry/usePlaybackRegistry';

let registry: PlaybackRegistry;

vi.mock('./RootComponent', () => ({
  RootComponent: () => {
    registry = usePlaybackRegistry();
    const state = usePlayableState('drafting-verse');
    return <div>{state.isLive ? 'Playback active' : 'Playback idle'}</div>;
  },
}));
vi.mock('./RootErrorComponent', () => ({ RootErrorComponent: () => null }));
vi.mock('./NotFoundComponent', () => ({ NotFoundComponent: () => null }));

describe('root route playback registry', () => {
  it('wraps the routed tree and preserves the same registry across root renders', () => {
    const Root = Route.options.component!;
    const view = render(<Root />);
    expect(screen.getByText('Playback idle')).toBeInTheDocument();
    const original = registry;
    act(() => registry.setLive('drafting-verse'));
    expect(screen.getByText('Playback active')).toBeInTheDocument();
    view.rerender(<Root />);
    expect(registry).toBe(original);
    expect(screen.getByText('Playback active')).toBeInTheDocument();
  });
});
