import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowEdgeHover } from '../lib/flowEdgeHover';

function FlowDeletableEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
  className,
}: EdgeProps<Edge>) {
  const { deleteElements } = useReactFlow();
  const { hoveredEdgeId, armEdgeHover, clearEdgeHoverSoon } = useFlowEdgeHover();
  const showDelete = selected || hoveredEdgeId === id;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} className={className} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute chatbot-flow-edge-del-hit"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
          onMouseEnter={() => armEdgeHover(id)}
          onMouseLeave={() => clearEdgeHoverSoon()}
        >
          <button
            type="button"
            title="Desligar conexão"
            aria-label="Desligar conexão"
            className={cn(
              'chatbot-flow-edge-delete flex h-6 w-6 items-center justify-center rounded-full border bg-background',
              'text-muted-foreground shadow-md transition-opacity',
              'hover:border-destructive hover:bg-destructive hover:text-destructive-foreground',
              showDelete ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              void deleteElements({ edges: [{ id }] });
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const FlowDeletableEdge = memo(FlowDeletableEdgeInner);
