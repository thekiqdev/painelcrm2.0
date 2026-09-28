-- Tags Kanban: cor opcional por tag

ALTER TABLE public.chat_kanban_tags
  ADD COLUMN IF NOT EXISTS color TEXT NULL;

COMMENT ON COLUMN public.chat_kanban_tags.color IS 'Cor hex opcional (#RGB ou #RRGGBB) para badge na UI; null = cor padrão no cliente';
