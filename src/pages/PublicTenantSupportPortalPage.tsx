import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { publicApiGet, publicApiPost } from "@/integrations/api/client";
import { isPlatformSupportTicketPathSegment } from "@/lib/supportPortalRouting";
import { portalAccent } from "@/components/public-support/supportBranding";
import { PublicSupportNotFound } from "@/components/public-support/PublicSupportNotFound";
import { PublicSupportSidebar } from "@/components/public-support/PublicSupportSidebar";
import { PublicSupportForm } from "@/components/public-support/PublicSupportForm";
import { PublicSupportSuccess } from "@/components/public-support/PublicSupportSuccess";
import type { PublicPortalPayload, TicketPostOk } from "@/components/public-support/types";
import type { TicketPriority } from "@/types/tickets";

export default function PublicTenantSupportPortalPage() {
  const { id: slugParam } = useParams<{ id: string }>();
  const slug = (slugParam ?? "").trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [portal, setPortal] = useState<PublicPortalPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<TicketPostOk | null>(null);

  const invalidSegment = slug.length > 0 && isPlatformSupportTicketPathSegment(slug);

  useEffect(() => {
    if (!slug || invalidSegment) {
      setLoading(false);
      setLoadError("Portal não encontrado.");
      setPortal(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const res = await publicApiGet<PublicPortalPayload>(`/api/public/support/${encodeURIComponent(slug)}`);
      if (cancelled) return;
      if (res.error || !res.data) {
        setPortal(null);
        setLoadError("Este portal de suporte não está disponível.");
        setLoading(false);
        return;
      }
      setPortal(res.data);
      setPriority(res.data.default_priority ?? "normal");
      if (res.data.categories.length === 1) {
        setCategoryId(res.data.categories[0].id);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, invalidSegment]);

  const accent = portal ? portalAccent(portal.primary_color) : "#5b4cdb";
  const companyLabel = portal?.company_name?.trim() || "";

  const pageStyle = useMemo(
    () =>
      ({
        ["--support-accent" as string]: accent,
      }) as React.CSSProperties,
    [accent],
  );

  useEffect(() => {
    if (portal?.title) {
      document.title = portal.title;
    } else if (portal?.company_name) {
      document.title = `Suporte — ${portal.company_name}`;
    } else {
      document.title = "Suporte";
    }
  }, [portal]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !portal) return;
    if (portal.categories.length > 0 && !categoryId) {
      setSubmitError("Selecione uma categoria.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const res = await publicApiPost<TicketPostOk>(`/api/public/support/${encodeURIComponent(slug)}/tickets`, {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      subject: subject.trim(),
      category_id: portal.categories.length > 0 ? categoryId || null : null,
      priority,
      message: message.trim(),
      company_website: honeypot,
    });
    setSubmitting(false);
    if (res.error) {
      setSubmitError(res.error);
      return;
    }
    if (res.data?.ok) {
      setDone(res.data);
    }
  };

  const resetToNewTicket = useCallback(() => {
    setDone(null);
    setSubject("");
    setMessage("");
    setSubmitError(null);
  }, []);

  const backToStart = useCallback(() => {
    setDone(null);
    setSubmitError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (invalidSegment) {
    return <PublicSupportNotFound variant="invalid" />;
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-muted/30">
        <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">A carregar o portal…</span>
        <span className="sr-only">A carregar</span>
      </div>
    );
  }

  if (!portal || loadError) {
    return <PublicSupportNotFound variant="portal" />;
  }

  if (done?.ok) {
    return (
      <PublicSupportSuccess
        portal={portal}
        accent={accent}
        done={done}
        onNewTicket={resetToNewTicket}
        onBackToStart={backToStart}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/40" style={pageStyle}>
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/90">
        <div className="mx-auto flex h-[52px] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-col leading-tight sm:flex-row sm:items-baseline sm:gap-2">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              Central de suporte
            </span>
            {companyLabel ? (
              <span className="truncate text-xs text-muted-foreground sm:text-sm">{companyLabel}</span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
        <PublicSupportSidebar portal={portal} accent={accent} />

        <main className="min-w-0 flex-1 bg-muted/25 px-4 py-6 sm:px-6 sm:py-8 lg:bg-muted/20 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-5xl">
            <PublicSupportForm
              portal={portal}
              accent={accent}
              name={name}
              setName={setName}
              email={email}
              setEmail={setEmail}
              phone={phone}
              setPhone={setPhone}
              subject={subject}
              setSubject={setSubject}
              categoryId={categoryId}
              setCategoryId={setCategoryId}
              priority={priority}
              setPriority={setPriority}
              message={message}
              setMessage={setMessage}
              honeypot={honeypot}
              setHoneypot={setHoneypot}
              submitting={submitting}
              submitError={submitError}
              onSubmit={onSubmit}
              stickySubmit
            />
          </div>
        </main>
      </div>
    </div>
  );
}
