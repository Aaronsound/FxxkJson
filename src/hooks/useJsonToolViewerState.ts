import { useState } from 'react';
import type { LargeJsonSearchMatch } from '../types/jsonTool';

export function useJsonToolViewerState() {
  const [leftReplaceText, setLeftReplaceText] = useState('');
  const [largeViewerMatchCount, setLargeViewerMatchCount] = useState(0);
  const [largeViewerMatches, setLargeViewerMatches] = useState<LargeJsonSearchMatch[]>([]);

  return {
    largeViewerMatchCount,
    largeViewerMatches,
    leftReplaceText,
    setLargeViewerMatchCount,
    setLargeViewerMatches,
    setLeftReplaceText,
  };
}
