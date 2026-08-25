import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { showAiSuggestionToast } from '@/features/ai-translation/components/AiSuggestionToast';
import { useAiSuggestionToast } from '@/features/ai-translation/hooks/useAiSuggestionToast';
import type { User } from '@/lib/types';
import { useAppStore } from '@/store/store';

vi.mock('@/features/ai-translation/components/AiSuggestionToast', () => ({
  showAiSuggestionToast: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/test' }),
}));

const mockUser1: User = {
  id: 1,
  email: 'u1@test.com',
  username: 'User 1',
  role: 'Project Translator',
  organization: 1,
};
const mockUser2: User = {
  id: 2,
  email: 'u2@test.com',
  username: 'User 2',
  role: 'Project Translator',
  organization: 1,
};

describe('useAiSuggestionToast', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('Toast dismissal key is per user', () => {
    // Setup for User 1
    useAppStore.setState({ userdetail: mockUser1 });
    const { result, rerender } = renderHook(() => useAiSuggestionToast());

    // Show toast for User 1
    act(() => {
      result.current('English');
    });

    expect(showAiSuggestionToast).toHaveBeenCalledTimes(1);

    // Simulate dismissing the toast by calling onDismiss
    const callArgs = vi.mocked(showAiSuggestionToast).mock.calls[0][0];
    act(() => {
      callArgs.onDismiss();
    });

    // Verify it doesn't show again for User 1
    act(() => {
      result.current('English');
    });
    expect(showAiSuggestionToast).toHaveBeenCalledTimes(1);

    // Now switch to User 2
    useAppStore.setState({ userdetail: mockUser2 });
    rerender();

    // User 2 should see the toast because their key is different
    act(() => {
      result.current('English');
    });
    expect(showAiSuggestionToast).toHaveBeenCalledTimes(2);
  });
});
