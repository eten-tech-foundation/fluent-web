import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAudioEnabled } from './useAudioEnabled';

const { mockFeatureFlag, mockHidden, mockSetHidden } = vi.hoisted(() => ({
  mockFeatureFlag: vi.fn<(name: string) => boolean>(),
  mockHidden: vi.fn<() => boolean>(),
  mockSetHidden: vi.fn<(hidden: boolean) => void>(),
}));

vi.mock('@/features/flags', () => ({ useFeatureFlag: mockFeatureFlag }));
vi.mock('./useHideAudio', () => ({
  useHideAudio: (): [boolean, (hidden: boolean) => void] => [mockHidden(), mockSetHidden],
}));

beforeEach(() => {
  mockFeatureFlag.mockReset();
  mockHidden.mockReset();
});

describe('useAudioEnabled', () => {
  it.each([
    { flag: false, hidden: false, enabled: false },
    { flag: false, hidden: true, enabled: false },
    { flag: true, hidden: false, enabled: true },
    { flag: true, hidden: true, enabled: false },
  ])('combines layer 1 flag=$flag with hidden=$hidden', ({ flag, hidden, enabled }) => {
    mockFeatureFlag.mockReturnValue(flag);
    mockHidden.mockReturnValue(hidden);
    const { result } = renderHook(useAudioEnabled);
    expect(result.current).toBe(enabled);
    expect(mockFeatureFlag).toHaveBeenCalledWith('sourceAudio');
  });
});
