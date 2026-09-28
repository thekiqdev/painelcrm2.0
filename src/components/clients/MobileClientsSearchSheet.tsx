import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MessageCircle, Plus, Search, User } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { clientsService, type Client } from "@/services/clients";
import { useFloatingChat } from "@/features/floating-chat";
import { saveClientsListScrollPosition } from "@/lib/clientsListRestore";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

const DEBOUNCE_MS = 300;

export type MobileClientsSearchSheetRecent = {
  id: string;
  name: string;
  company?: string | null;
  phone?: string | null;
};

function recentsStorageKey(userId: string | undefined): string {
  return `painelcrm.clientsSearchRecents.v1:${userId ?? "anon"}`;
}

function loadRecents(userId: string | undefined): MobileClientsSearchSheetRecent[] {
  try {
    const raw = localStorage.getItem(recentsStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is MobileClientsSearchSheetRecent =>
          x != null &&
          typeof x === "object" &&
          typeof (x as MobileClientsSearchSheetRecent).id === "string" &&
          typeof (x as MobileClientsSearchSheetRecent).name === "string",
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}

function saveRecents(userId: string | undefined, next: MobileClientsSearchSheetRecent[]) {
  try {
    localStorage.setItem(recentsStorageKey(userId), JSON.stringify(next.slice(0, 8)));
  } catch {
    /* ignore */
  }
}

function pushRecent(userId: string | undefined, row: MobileClientsSearchSheetRecent) {
  const prev = loadRecents(userId).filter((r) => r.id !== row.id);
  saveRecents(userId, [row, ...prev]);
}

function mapClient(c: Client): MobileClientsSearchSheetRecent {
  return {
    id: c.id,
    name: c.name,
    company: c.company ?? null,
    phone: c.phone ?? null,
  };
}

export type MobileClientsSearchSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canCreateClient: boolean;
  canUseChat: boolean;
  onRequestCreateClient: () => void;
  /** Path atual da lista (para guardar scroll ao abrir ficha). */
  clientsListHref: string;
};

export function MobileClientsSearchSheet({
  open,
  onOpenChange,
  canCreateClient,
  canUseChat,
  onRequestCreateClient,
  clientsListHref,
}: MobileClientsSearchSheetProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  const floatingChat = useFloatingChat();

  const inputRef = useRef<HTMLInputElement>(null);
  const [localQuery, setLocalQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<MobileClientsSearchSheetRecent[]>([]);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<MobileClientsSearchSheetRecent[]>([]);
  const fetchSeq = useRef(0);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) return;
    setRecents(loadRecents(userId));
  }, [open, userId]);

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return undefined;
    }
    if (!wasOpen.current) {
      wasOpen.current = true;
      setLocalQuery("");
      setDebouncedQuery("");
      setResults([]);
      setLoading(false);
      fetchSeq.current += 1;
      const t = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setDebouncedQuery(localQuery), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [localQuery, open]);

  useEffect(() => {
    if (!open) return;
    const q = debouncedQuery.trim();
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }

    const seq = ++fetchSeq.current;
    setLoading(true);

    void clientsService
      .getClients({ q })
      .then((rows) => {
        if (seq !== fetchSeq.current) return;
        setResults((rows || []).map(mapClient));
      })
      .catch((e: unknown) => {
        if (seq !== fetchSeq.current) return;
        setResults([]);
        toast.error(e instanceof Error ? e.message : "Erro ao buscar clientes");
      })
      .finally(() => {
        if (seq !== fetchSeq.current) return;
        setLoading(false);
      });
  }, [debouncedQuery, open]);

  const handleView = useCallback(
    (row: MobileClientsSearchSheetRecent) => {
      pushRecent(userId, row);
      saveClientsListScrollPosition(clientsListHref);
      onOpenChange(false);
      navigate(`/clients/${row.id}`);
    },
    [clientsListHref, navigate, onOpenChange, userId],
  );

  const handleChat = useCallback(
    (row: MobileClientsSearchSheetRecent) => {
      pushRecent(userId, row);
      onOpenChange(false);
      void floatingChat.openChatForClient(row.id);
    },
    [floatingChat, onOpenChange, userId],
  );

  const pendingDebounce =
    open && localQuery.trim() !== debouncedQuery.trim() && localQuery.trim().length >= 1;
  const showResultsBlock = debouncedQuery.trim().length >= 1;
  const showEmpty =
    showResultsBlock && !loading && !pendingDebounce && results.length === 0 && debouncedQuery.trim().length >= 1;
  const showRecentsBlock = !showResultsBlock && !loading && recents.length > 0;
  const showRecentsEmpty = !showResultsBlock && !loading && recents.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "flex h-[min(92dvh,36rem)] max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-3xl border-border/60 p-0",
          "pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-0 md:hidden",
        )}
      >
        <SheetHeader className="shrink-0 space-y-0 border-b border-border/60 px-4 pb-3 pt-4 pr-14 text-left">
          <SheetTitle className="text-lg font-semibold tracking-tight">Buscar clientes</SheetTitle>
        </SheetHeader>

        <div className="shrink-0 px-4 pt-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              placeholder="Nome, empresa, e-mail ou telefone…"
              className="h-11 border-border/70 bg-background/80 pl-9 pr-10 shadow-sm"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              aria-label="Buscar clientes"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {pendingDebounce && localQuery.trim().length >= 1 && !showResultsBlock ? (
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 [-webkit-overflow-scrolling:touch]">
          {showRecentsBlock ? (
            <div className="pt-4">
              <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Buscas recentes
              </p>
              <ul className="flex flex-col gap-2">
                {recents.map((row) => (
                  <li key={`r-${row.id}`}>
                    <div
                      className={cn(
                        "rounded-2xl border border-border/60 bg-card/80 p-3 shadow-sm transition-colors",
                        "hover:border-border hover:bg-muted/25",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-foreground">{row.name}</p>
                        {row.phone ? (
                          <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">{row.phone}</p>
                        ) : null}
                        {row.company ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.company}</p>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        {canUseChat ? (
                          <Button
                            type="button"
                            size="default"
                            className="min-h-11 min-w-[6.5rem] touch-manipulation rounded-xl font-semibold shadow-sm"
                            onClick={() => handleChat(row)}
                          >
                            <MessageCircle className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                            Chat
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="default"
                          className="min-h-11 min-w-[5.5rem] touch-manipulation rounded-xl border-border/70"
                          onClick={() => handleView(row)}
                        >
                          Ver
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {showRecentsEmpty && !showResultsBlock ? (
            <div className="flex flex-col items-center justify-center gap-2 px-2 py-10 text-center">
              <User className="h-10 w-10 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">Comece a digitar para buscar na sua base.</p>
            </div>
          ) : null}

          {showResultsBlock ? (
            <div className="pt-4">
              {loading || pendingDebounce ? (
                <div className="flex flex-col items-center justify-center gap-2 py-14 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin opacity-70" aria-hidden />
                  <span className="text-xs font-medium">A procurar…</span>
                </div>
              ) : null}
              {!loading && !pendingDebounce && results.length > 0 ? (
                <ul className="flex flex-col gap-2.5 pb-2">
                  {results.map((row) => (
                    <li key={row.id}>
                      <div
                        className={cn(
                          "rounded-2xl border border-border/60 bg-card/90 p-3.5 shadow-sm transition-colors",
                          "hover:border-border/80 hover:bg-muted/20",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold leading-tight text-foreground">{row.name}</p>
                          {row.phone ? (
                            <p className="mt-1 truncate text-sm tabular-nums text-muted-foreground">{row.phone}</p>
                          ) : null}
                          {row.company ? (
                            <p className="mt-1 truncate text-sm text-muted-foreground">{row.company}</p>
                          ) : null}
                        </div>
                        <div className="mt-3.5 flex flex-wrap justify-end gap-2">
                          {canUseChat ? (
                            <Button
                              type="button"
                              size="default"
                              className="min-h-11 min-w-[6.75rem] touch-manipulation rounded-xl font-semibold shadow-sm"
                              onClick={() => handleChat(row)}
                            >
                              <MessageCircle className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                              Chat
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="default"
                            className="min-h-11 min-w-[5.5rem] touch-manipulation rounded-xl border-border/70"
                            onClick={() => handleView(row)}
                          >
                            Ver
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              {showEmpty ? (
                <div className="flex flex-col items-center gap-4 py-10 text-center">
                  <p className="text-sm font-medium text-foreground">Nenhum cliente encontrado</p>
                  {canCreateClient ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      className="min-h-12 touch-manipulation rounded-xl px-6 font-semibold shadow-sm"
                      onClick={() => {
                        onOpenChange(false);
                        onRequestCreateClient();
                      }}
                    >
                      <Plus className="mr-2 h-5 w-5 shrink-0" aria-hidden />
                      + Criar novo cliente
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

      </SheetContent>
    </Sheet>
  );
}
