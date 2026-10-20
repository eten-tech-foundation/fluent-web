import { useCallback, useLayoutEffect, useState } from 'react';

interface UseTruncationResult<T extends HTMLElement> {
  ref: (node: T | null) => void;
  isTruncated: boolean;
}

export function useTruncation<T extends HTMLElement = HTMLDivElement>(
  text: string
): UseTruncationResult<T> {
  const [element, setElement] = useState<T | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const ref = useCallback((node: T | null) => {
    setElement(node);
  }, []);

  useLayoutEffect(() => {
    if (!element) return;

    const checkTruncation = (): void => {
      setIsTruncated(element.scrollWidth > element.clientWidth);
    };

    checkTruncation();
    let timeoutId: NodeJS.Timeout;
    const debouncedCheck = (): void => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkTruncation, 150);
    };
    window.addEventListener('resize', debouncedCheck);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(debouncedCheck);
      observer.observe(element);
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', debouncedCheck);
      observer?.disconnect();
    };
  }, [element, text]);

  return { ref, isTruncated };
}
