import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  NodeResizer,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stickyColorMeta } from '../lib/canvasAnnotations';
import { useMarkFlowDirty } from '../lib/flowEditorDirty';

export type StickyNoteNodeData = {
  text?: string;
  color?: string;
  width?: number;
  height?: number;
  invalid?: boolean;
};

function StickyNoteNodeInner({
  id,
  data,
  selected,
  width: nodeWidth,
  height: nodeHeight,
}: NodeProps<Node<StickyNoteNodeData>>) {
  const { setNodes, deleteElements } = useReactFlow();
  const markDirty = useMarkFlowDirty();
  const color = stickyColorMeta(data.color);
  const width = Math.max(80, Number(nodeWidth ?? data.width) || 220);
  const height = Math.max(60, Number(nodeHeight ?? data.height) || 140);
  const [editing, setEditing] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const text = String(data.text ?? '');

  useEffect(() => {
    if (editing) {
      areaRef.current?.focus();
      areaRef.current?.select();
    }
  }, [editing]);

  const persistSize = useCallback(
    (w: number, h: number) => {
      const nextW = Math.max(80, Math.round(w));
      const nextH = Math.max(60, Math.round(h));
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id
            ? {
                ...n,
                width: nextW,
                height: nextH,
                style: { ...n.style, width: nextW, height: nextH },
                data: { ...n.data, width: nextW, height: nextH },
                connectable: false,
              }
            : n
        )
      );
      markDirty();
    },
    [id, setNodes, markDirty]
  );

  const patchText = useCallback(
    (next: string) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, text: next }, connectable: false } : n
        )
      );
      markDirty();
    },
    [id, setNodes, markDirty]
  );

  return (
    <div
      className={cn(
        'chatbot-sticky-node relative h-full w-full shadow-md',
        selected && 'ring-2 ring-offset-1 ring-slate-900/35'
      )}
      style={{
        width,
        height,
        background: color.bg,
        color: color.text,
        border: `1px solid ${color.border}`,
        borderRadius: 6,
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={80}
        minHeight={60}
        keepAspectRatio={false}
        color={color.border}
        handleClassName="chatbot-sticky-resize-handle"
        lineClassName="chatbot-sticky-resize-line"
        onResizeEnd={(_e, { width: w, height: h }) => persistSize(w, h)}
      />
      {selected ? (
        <button
          type="button"
          title="Excluir sticky"
          aria-label="Excluir sticky"
          className="nodrag nopan absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={(e) => {
            e.stopPropagation();
            void deleteElements({ nodes: [{ id }] });
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      ) : null}

      {editing ? (
        <textarea
          ref={areaRef}
          className="nodrag nowheel h-full w-full resize-none bg-transparent px-3 py-2 text-sm font-medium leading-snug outline-none cursor-text"
          value={text}
          placeholder="Escreva aqui…"
          onChange={(e) => patchText(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setEditing(false);
            }
          }}
          spellCheck={false}
        />
      ) : (
        <div
          className={cn(
            'h-full w-full cursor-grab overflow-hidden whitespace-pre-wrap px-3 py-2 text-sm font-medium leading-snug active:cursor-grabbing',
            !text && 'text-black/40'
          )}
        >
          {text || 'Escreva aqui… (dois cliques)'}
        </div>
      )}
    </div>
  );
}

export const StickyNoteNode = memo(StickyNoteNodeInner);
