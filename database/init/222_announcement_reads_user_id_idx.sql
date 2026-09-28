-- Anti-join / NOT EXISTS em contagens de atualizações não lidas por utilizador
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON public.announcement_reads(user_id);
