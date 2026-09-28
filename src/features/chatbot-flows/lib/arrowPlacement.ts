import type { XYPosition } from '@xyflow/react';

export type ArrowDraft =
  | { mode: 'armed' }
  | { mode: 'drawing'; start: XYPosition; current: XYPosition };
