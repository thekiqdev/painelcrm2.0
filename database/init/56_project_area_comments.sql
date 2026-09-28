-- Comentários por área do projeto (estilo rede social, soft delete)
CREATE TABLE IF NOT EXISTS public.project_area_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES public.project_areas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_project_area_comments_area_id ON public.project_area_comments(area_id);
CREATE INDEX IF NOT EXISTS idx_project_area_comments_created_at ON public.project_area_comments(created_at);

COMMENT ON TABLE public.project_area_comments IS 'Comentários nas áreas do projeto; deleted_at preenchido = comentário excluído (exibir "Comentário excluído")';
