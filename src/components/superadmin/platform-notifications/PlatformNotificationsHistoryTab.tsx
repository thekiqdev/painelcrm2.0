import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History, RefreshCw } from 'lucide-react';
import type { DeliveryRow } from './platformNotificationsUtils';

export type PlatformNotificationsHistoryTabProps = {
  historyLoading: boolean;
  deliveries: DeliveryRow[];
  histStatus: string;
  histEvent: string;
  histHours: string;
  setHistStatus: (v: string) => void;
  setHistEvent: (v: string) => void;
  setHistHours: (v: string) => void;
  eventOptions: string[];
  onRefresh: () => void;
  eventTitle: (key: string) => string;
  channelLabel: (ch: string) => string;
};

export function PlatformNotificationsHistoryTab({
  historyLoading,
  deliveries,
  histStatus,
  histEvent,
  histHours,
  setHistStatus,
  setHistEvent,
  setHistHours,
  eventOptions,
  onRefresh,
  eventTitle,
  channelLabel,
}: PlatformNotificationsHistoryTabProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <History className="h-5 w-5" />
          Histórico de entregas (plataforma)
        </CardTitle>
        <CardDescription>
          Registos em <code className="text-xs">platform_notification_deliveries</code> — útil para ver envios e falhas
          recentes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label>Estado</Label>
            <Select value={histStatus} onValueChange={setHistStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="sent">sent</SelectItem>
                <SelectItem value="queued">queued</SelectItem>
                <SelectItem value="failed">failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Evento</Label>
            <Select value={histEvent} onValueChange={setHistEvent}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {eventOptions.map((k) => (
                  <SelectItem key={k} value={k}>
                    {eventTitle(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Período</Label>
            <Select value={histHours} onValueChange={setHistHours}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">Últimas 24 h</SelectItem>
                <SelectItem value="72">Últimas 72 h</SelectItem>
                <SelectItem value="168">Últimos 7 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="secondary" onClick={() => void onRefresh()} disabled={historyLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${historyLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Data</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">
                    {historyLoading ? 'A carregar…' : 'Sem registos no período.'}
                  </TableCell>
                </TableRow>
              ) : (
                deliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(d.created_at).toLocaleString('pt-PT')}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{eventTitle(d.event_key)}</div>
                      <div className="text-xs text-muted-foreground font-mono">{d.event_key}</div>
                    </TableCell>
                    <TableCell className="text-sm">{channelLabel(d.channel)}</TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate" title={d.recipient_address ?? ''}>
                      {d.recipient_address ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={d.status === 'failed' ? 'destructive' : 'secondary'}>{d.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[140px] truncate">
                      {d.entity_type ? (
                        <span title={`${d.entity_type} ${d.entity_id ?? ''}`}>
                          {d.entity_type}
                          {d.entity_id ? ` · ${d.entity_id.slice(0, 8)}…` : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate" title={d.error_message ?? ''}>
                      {d.error_message ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
