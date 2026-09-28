import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil } from 'lucide-react';
import type { CatalogEvent } from './platformNotificationsUtils';

export type PlatformNotificationsCatalogTabProps = {
  events: CatalogEvent[];
  catalogLoading: boolean;
  togglingKey: string | null;
  onToggleEventActive: (eventKey: string, isActive: boolean) => void;
  onEditEvent: (eventKey: string) => void;
  moduleLabel: (m: string) => string;
  eventTitle: (key: string) => string;
  channelLabel: (ch: string) => string;
};

export function PlatformNotificationsCatalogTab({
  events,
  catalogLoading,
  togglingKey,
  onToggleEventActive,
  onEditEvent,
  moduleLabel,
  eventTitle,
  channelLabel,
}: PlatformNotificationsCatalogTabProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">Notificações transacionais (MVP)</CardTitle>
        <CardDescription>
          Conta, plano e cobrança SaaS. Canal atual: <strong>WhatsApp</strong>. Ative ou desative por evento; edite
          apenas <em>override</em> — o template padrão do sistema é imutável neste painel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {catalogLoading ? (
          <p className="text-sm text-muted-foreground">A carregar catálogo…</p>
        ) : (
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Módulo</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => (
                  <TableRow key={ev.event_key}>
                    <TableCell className="text-sm text-foreground">{moduleLabel(ev.module)}</TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{eventTitle(ev.event_key)}</div>
                      <div className="text-xs text-muted-foreground font-mono">{ev.event_key}</div>
                      {ev.description ? (
                        <div className="text-xs text-muted-foreground mt-0.5">{ev.description}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{channelLabel(ev.default_channel)}</TableCell>
                    <TableCell>
                      {ev.has_override ? (
                        <Badge variant="secondary">Override</Badge>
                      ) : (
                        <Badge variant="outline">Padrão da plataforma</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={ev.is_active}
                        disabled={togglingKey === ev.event_key}
                        onCheckedChange={(v) => void onToggleEventActive(ev.event_key, v)}
                        aria-label={`Ativar ${ev.event_key}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => void onEditEvent(ev.event_key)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
