import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/integrations/api/client';
import { Bell } from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  created_at: string;
  data?: Record<string, unknown>;
}

export default function SuperAdminNotifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await apiClient.get<{ notifications: Notification[] }>('/api/notifications?limit=100');
    const data = res.data as { notifications?: Notification[] } | undefined;
    const list = data?.notifications ?? [];
    setItems(list.filter((n) => n.type?.startsWith('superadmin_')));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const checkTrials = async () => {
    setChecking(true);
    await apiClient.post('/api/superadmin/notifications/check-trials');
    setChecking(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notificações Super Admin</h1>
          <p className="text-muted-foreground">Novas empresas e trials terminando em breve.</p>
        </div>
        <Button variant="outline" onClick={checkTrials} disabled={checking}>
          {checking ? 'Verificando...' : 'Verificar trials (7 dias)'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alertas
          </CardTitle>
          <CardDescription>Notificações de novos cadastros e trial próximo.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma notificação de Super Admin.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`rounded-lg border p-4 ${n.read ? 'opacity-75' : ''}`}
                >
                  <p className="font-medium">{n.title}</p>
                  {n.message && <p className="text-sm text-muted-foreground mt-1">{n.message}</p>}
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(n.created_at).toLocaleString('pt-BR')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
