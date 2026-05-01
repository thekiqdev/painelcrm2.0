import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CHANNEL, LOCALE, channelLabel, type EventDetail } from './platformNotificationsUtils';

export type PlatformNotificationTemplateOverrideDialogProps = {
  editorOpen: boolean;
  editorKey: string | null;
  detailLoading: boolean;
  detail: EventDetail | null;
  draftBody: string;
  draftSubject: string;
  draftSendPix: boolean;
  setDraftBody: (v: string) => void;
  setDraftSubject: (v: string) => void;
  setDraftSendPix: (v: boolean) => void;
  previewLoading: boolean;
  previewBody: string | null;
  previewSubject: string | null;
  previewError: string | null;
  previewInvalid: string[] | null;
  overrideSaving: boolean;
  eventTitle: (key: string) => string;
  onClose: () => void;
  onSave: () => void;
  onRestoreDefault: () => void;
  onPreview: () => void;
};

export function PlatformNotificationTemplateOverrideDialog({
  editorOpen,
  editorKey,
  detailLoading,
  detail,
  draftBody,
  draftSubject,
  draftSendPix,
  setDraftBody,
  setDraftSubject,
  setDraftSendPix,
  previewLoading,
  previewBody,
  previewSubject,
  previewError,
  previewInvalid,
  overrideSaving,
  eventTitle,
  onClose,
  onSave,
  onRestoreDefault,
  onPreview,
}: PlatformNotificationTemplateOverrideDialogProps) {
  return (
    <Dialog open={editorOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Editar override — {editorKey ? eventTitle(editorKey) : ''}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Template padrão do sistema é apenas leitura implícita; aqui grava-se só o override operacional. Canal{' '}
            {channelLabel(CHANNEL)} · locale {LOCALE}.
          </DialogDescription>
        </DialogHeader>

        {detailLoading ? (
          <p className="text-sm text-muted-foreground">A carregar modelo…</p>
        ) : detail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground">Fonte efetiva:</span>
              {detail.effective_source === 'override' ? (
                <Badge>Override do Super Admin</Badge>
              ) : (
                <Badge variant="outline">Template padrão da plataforma</Badge>
              )}
            </div>

            <div>
              <Label className="text-sm">Merge fields permitidos (política strict)</Label>
              <div className="flex flex-wrap gap-1 mt-2">
                {(detail.event.merge_field_list ?? []).length ? (
                  detail.event.merge_field_list.map((f) => (
                    <Badge key={f} variant="secondary" className="font-mono text-xs">
                      {`{{${f}}}`}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">Nenhum campo listado para este evento.</span>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="pn-override-subj">Assunto (opcional)</Label>
              <Textarea
                id="pn-override-subj"
                className="mt-1 min-h-[64px] font-mono text-sm"
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
                placeholder="Vazio se o canal não usar assunto"
              />
            </div>
            <div>
              <Label htmlFor="pn-override-body">Corpo da mensagem</Label>
              <Textarea
                id="pn-override-body"
                className="mt-1 min-h-[160px] font-mono text-sm"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
              />
            </div>

            {editorKey === 'platform.billing.charge.created' ? (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="pn-send-pix" className="text-base">
                      Enviar botão PIX copia e cola
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      O texto do modelo continua a ser enviado como hoje. Se ativar, o WhatsApp recebe também o botão
                      nativo com o código PIX da cobrança (quando existir na fatura). O link da fatura na plataforma
                      mantém-se no texto do template.
                    </p>
                  </div>
                  <Switch id="pn-send-pix" checked={draftSendPix} onCheckedChange={setDraftSendPix} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Se não houver PIX disponível no gateway, apenas o texto é enviado — a notificação não falha por causa
                  do botão.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void onPreview()} disabled={previewLoading}>
                {previewLoading ? 'A gerar…' : 'Pré-visualizar (dados de exemplo)'}
              </Button>
              <span className="text-xs text-muted-foreground self-center">
                Não envia mensagem real; apenas renderização strict no servidor.
              </span>
            </div>

            {previewError ? (
              <Alert variant="destructive">
                <AlertTitle>Preview inválido</AlertTitle>
                <AlertDescription>{previewError}</AlertDescription>
                {previewInvalid?.length ? (
                  <ul className="list-disc text-sm mt-2 ml-4">
                    {previewInvalid.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : null}
              </Alert>
            ) : null}

            {previewBody != null ? (
              <div className="rounded-md border border-border p-3 space-y-2 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground">Resultado do preview</p>
                {previewSubject ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Assunto:</span> {previewSubject}
                  </p>
                ) : null}
                <p className="text-sm whitespace-pre-wrap text-foreground">{previewBody}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          {detail?.effective_source === 'override' ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onRestoreDefault()}
              disabled={overrideSaving || detailLoading}
            >
              Restaurar padrão
            </Button>
          ) : null}
          <Button type="button" onClick={() => void onSave()} disabled={overrideSaving || detailLoading}>
            {overrideSaving ? 'A guardar…' : 'Guardar override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
