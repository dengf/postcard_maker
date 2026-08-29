import { useEffect, useState } from 'react';

// Mirrors the mobile breakpoint main.css already uses everywhere else
// (.editor-preview-col, .postcard-frame, .share-sticky-bar) -- kept in
// one place so components that need to know "am I on the phone layout"
// in JS (not just CSS) all agree on the same cutoff.
const QUERY = '(max-width: 719px)';

export function useIsNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return narrow;
}
