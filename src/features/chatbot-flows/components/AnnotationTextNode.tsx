import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  NodeResizer,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { textColorMeta } from '../lib/canvasAnnotations';
import { useMarkFlowDirty } from '../lib/flowEditorDirty';

export type AnnotationTextNodeData = {
  text?: string;
  color?: string;
  fontSize?: number;
  width?: number;
  height?: number;
  invalid?: boolean;
  /** Abre edição logo após criar */
  autoEdit?: boolean;
};

function AnnotationTextNodeInner({
  id,
  data,
  selected,
  width: nodeWidth,
  height: nodeHeight,
}: NodeProps<Node<AnnotationTextNodeData>>) {
  const { setNodes, deleteElements } = useReactFlow();
  const markDirty = useMarkFlowDirty();
  const color = textColorMeta(data.color);
  const width = Math.max(80, Number(nodeWidth ?? data.width) || 200);
  const height = Math.max(36, Number(nodeHeight ?? data.height) || 48);
  const fontSize = Math.max(12, Number(data.fontSize) || 20);
  const [editing, setEditing] = useState(Boolean(data.autoEdit));
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const text = String(data.text ?? '');

  useEffect(() => {
    if (editing) {
      areaRef.current?.focus();
      areaRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (data.autoEdit) {
      setEditing(true);
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, autoEdit: false } } : n
        )
      );
    }
  }, [data.autoEdit, id, setNodes]);

  const persistSize = useCallback(
    (w: number, h: number) => {
      const nextW = Math.max(80, Math.round(w));
      const nextH = Math.max(36, Math.round(h));
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
        'chatbot-annot-text relative h-full w-full',
        selected && 'ring-2 ring-offset-1 ring-sky-500/50'
      )}
      style={{ width, height, color: color.fill }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={80}
        minHeight={36}
        keepAspectRatio={false}
        color={color.fill}
        onResizeEnd={(_e, { width: w, height: h }) => persistSize(w, h)}
      />
      {selected ? (
        <button
          type="button"
          title="Excluir texto"
          aria-label="Excluir texto"
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
          className="nodrag nowheel h-full w-full resize-none bg-transparent px-1 py-0.5 font-semibold leading-snug outline-none cursor-text"
          style={{ fontSize, color: color.fill }}
          value={text}
          placeholder="Texto…"
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
          className="h-full w-full cursor-grab overflow-hidden whitespace-pre-wrap px-1 py-0.5 font-semibold leading-snug active:cursor-grabbing"
          style={{ fontSize }}
        >
          {text || 'Texto'}
        </div>
      )}
    </div>
  );
}

export const AnnotationTextNode = memo(AnnotationTextNodeInner);
