import { useLayoutEffect, useRef, useState } from 'react';

interface UseTruncationResult<T extends HTMLElement> {
  ref: React.RefObject<T>;
  isTruncated: boolean;
}

export function useTruncation<T extends HTMLElement = HTMLDivElement>(
  text: string
): UseTruncationResult<T> {
  const ref = useRef<T>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const checkTruncation = (): void => {
      if (ref.current) {
        setIsTruncated(ref.current.scrollWidth > ref.current.clientWidth);
      }
    };

    checkTruncation();
    let timeoutId: NodeJS.Timeout;
    const debouncedCheck = (): void => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkTruncation, 150);
    };
    window.addEventListener('resize', debouncedCheck);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', debouncedCheck);
    };
  }, [text]);

  return { ref, isTruncated };
}
