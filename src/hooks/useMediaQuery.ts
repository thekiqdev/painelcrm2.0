import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const listener = () => setMatches(mq.matches);
    listener();
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
