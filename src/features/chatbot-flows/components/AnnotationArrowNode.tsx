import { memo, useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useReactFlow, useStore, type Node, type NodeProps } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { arrowColorMeta } from '../lib/canvasAnnotations';
import { useMarkFlowDirty } from '../lib/flowEditorDirty';

export type AnnotationArrowNodeData = {
  text?: string;
  color?: string;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  /** Legado */
  endX?: number;
  endY?: number;
  invalid?: boolean;
};

const HANDLE = 10;

function normalizeLocal(data: AnnotationArrowNodeData) {
  // Compat com setas antigas (endX/endY a partir da origem 0,0)
  if (
    data.x1 == null &&
    data.y1 == null &&
    (data.endX != null || data.endY != null)
  ) {
    const endX = Number(data.endX) || 160;
    const endY = Number(data.endY) || 40;
    const PAD = 14;
    const minX = Math.min(0, endX) - PAD;
    const minY = Math.min(0, endY) - PAD;
    return {
      x1: 0 - minX,
      y1: 0 - minY,
      x2: endX - minX,
      y2: endY - minY,
      width: Math.max(24, Math.max(0, endX) - Math.min(0, endX) + PAD * 2),
      height: Math.max(24, Math.max(0, endY) - Math.min(0, endY) + PAD * 2),
    };
  }
  return {
    x1: Number(data.x1) || 14,
    y1: Number(data.y1) || 14,
    x2: Number(data.x2) || 174,
    y2: Number(data.y2) || 54,
    width: Math.max(24, Number(data.width) || 188),
    height: Math.max(24, Number(data.height) || 68),
  };
}

function AnnotationArrowNodeInner({
  id,
  data,
  selected,
  width: nodeWidth,
  height: nodeHeight,
}: NodeProps<Node<AnnotationArrowNodeData>>) {
  const { setNodes, deleteElements } = useReactFlow();
  const markDirty = useMarkFlowDirty();
  const zoom = useStore((s) => s.transform[2] || 1);
  const dragging = useRef<'start' | 'end' | null>(null);
  const color = arrowColorMeta(data.color);
  const local = normalizeLocal(data);
  const width = Math.max(24, Number(nodeWidth ?? local.width) || local.width);
  const height = Math.max(24, Number(nodeHeight ?? local.height) || local.height);
  const x1 = local.x1;
  const y1 = local.y1;
  const x2 = local.x2;
  const y2 = local.y2;

  const mid = useMemo(
    () => ({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 }),
    [x1, y1, x2, y2]
  );

  const patch = useCallback(
    (partial: Partial<AnnotationArrowNodeData>) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== id) return n;
          const next = { ...n.data, ...partial };
          const w = Math.max(24, Number(next.width) || width);
          const h = Math.max(24, Number(next.height) || height);
          return {
            ...n,
            data: { ...next, width: w, height: h },
            width: w,
            height: h,
            style: { ...n.style, width: w, height: h },
            connectable: false,
          };
        })
      );
      markDirty();
    },
    [id, setNodes, markDirty, width, height]
  );

  const moveEndpoint = (
    which: 'start' | 'end',
    dx: number,
    dy: number
  ) => {
    if (which === 'start') {
      patch({
        x1: Math.round(x1 + dx),
        y1: Math.round(y1 + dy),
      });
    } else {
      patch({
        x2: Math.round(x2 + dx),
        y2: Math.round(y2 + dy),
      });
    }
  };

  const onHandleDown = (which: 'start' | 'end') => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragging.current = which;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onHandleMove = (e: ReactPointerEvent) => {
    if (!dragging.current) return;
    e.stopPropagation();
    moveEndpoint(dragging.current, e.movementX / zoom, e.movementY / zoom);
  };

  const onHandleUp = (e: ReactPointerEvent) => {
    dragging.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const markerId = `arrow-head-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <div
      className={cn('relative', selected && 'z-10')}
      style={{ width, height }}
    >
      {selected ? (
        <button
          type="button"
          title="Excluir seta"
          aria-label="Excluir seta"
          className="nodrag nopan absolute z-20 flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
          style={{ left: mid.x - 12, top: Math.min(y1, y2) - 28 }}
          onClick={(e) => {
            e.stopPropagation();
            void deleteElements({ nodes: [{ id }] });
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      ) : null}

      <svg width={width} height={height} className="block overflow-visible">
        <defs>
          <marker
            id={markerId}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill={color.stroke} />
          </marker>
        </defs>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="transparent"
          strokeWidth={18}
        />
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color.stroke}
          strokeWidth={selected ? 3 : 2.5}
          strokeLinecap="round"
          markerEnd={`url(#${markerId})`}
        />
        {data.text ? (
          <text
            x={mid.x}
            y={mid.y - 10}
            textAnchor="middle"
            fill={color.stroke}
            fontSize={12}
            fontWeight={600}
            className="select-none"
          >
            {String(data.text).slice(0, 48)}
          </text>
        ) : null}
      </svg>

      {(['start', 'end'] as const).map((which) => {
        const cx = which === 'start' ? x1 : x2;
        const cy = which === 'start' ? y1 : y2;
        return (
          <div
            key={which}
            className={cn(
              'nodrag nopan absolute z-10 cursor-crosshair rounded-full border-2 border-white shadow',
              selected ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
            style={{
              width: HANDLE,
              height: HANDLE,
              left: cx - HANDLE / 2,
              top: cy - HANDLE / 2,
              background: color.stroke,
            }}
            onPointerDown={onHandleDown(which)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          />
        );
      })}
    </div>
  );
}

export const AnnotationArrowNode = memo(AnnotationArrowNodeInner);
