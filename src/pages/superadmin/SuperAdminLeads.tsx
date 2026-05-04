import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { superadminLeadsService, type SuperadminLeadRow } from '@/services/superadminLeads';
import { toast } from '@/hooks/use-toast';
import { UsersRound, Upload, Trash2 } from 'lucide-react';

const kindLabel: Record<string, string> = {
  lead_csv: 'Planilha leads',
  client_csv: 'Planilha clientes',
};

export default function SuperAdminLeads() {
  const [rows, setRows] = useState<SuperadminLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [importKind, setImportKind] = useState<'leads' | 'clients'>('leads');
  const [importBusy, setImportBusy] = useState(false);
  const [lastImportSummary, setLastImportSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    superadminLeadsService
      .list()
      .then(setRows)
      .catch((e) => toast({ title: 'Erro', description: String(e.message), variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ''));
      r.onerror = () => reject(new Error('Falha ao ler ficheiro'));
      r.readAsText(file, 'UTF-8');
    });

  const runImport = async () => {
    const input = fileRef.current;
    const file = input?.files?.[0];
    if (!file) {
      toast({ title: 'Escolha um ficheiro CSV', variant: 'destructive' });
      return;
    }
    try {
      setImportBusy(true);
      const csv_text = await readFile(file);
      if (importKind === 'leads') {
        const r = await superadminLeadsService.importLeadsCsv(csv_text);
        setLastImportSummary(
          `Importados: ${r.inserted}. Ignorados: ${r.skipped_count}.` +
            (r.skipped_preview.length ? ` Ex.: linha ${r.skipped_preview[0].line} — ${r.skipped_preview[0].reason}` : ''),
        );
        toast({ title: 'Importação de leads concluída', description: `${r.inserted} linhas.` });
      } else {
        const r = await superadminLeadsService.importClientsCsv(csv_text);
        setLastImportSummary(
          `Importados: ${r.inserted}. Ignorados: ${r.skipped_count}.` +
            (r.skipped_preview.length ? ` Ex.: linha ${r.skipped_preview[0].line} — ${r.skipped_preview[0].reason}` : ''),
        );
        toast({ title: 'Importação de clientes concluída', description: `${r.inserted} linhas.` });
      }
      setImportOpen(false);
      if (input) input.value = '';
      load();
    } catch (e) {
      toast({ title: 'Erro na importação', description: String((e as Error).message), variant: 'destructive' });
    } finally {
      setImportBusy(false);
    }
  };

  const removeLead = async (id: string) => {
    try {
      await superadminLeadsService.remove(id);
      setRows((prev) => prev.filter((x) => x.id !== id));
      toast({ title: 'Lead removido' });
    } catch (e) {
      toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads (plataforma)</h1>
          <p className="text-sm text-muted-foreground">
            Contactos para segmentação e disparos WhatsApp (mesmo formato CSV que nas empresas).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/superadmin/leads/groups">
              <UsersRound className="mr-2 h-4 w-4" />
              Grupos
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/superadmin/announcements">Anúncios</Link>
          </Button>
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
        </div>
      </div>

      {lastImportSummary ? (
        <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">{lastImportSummary}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lista</CardTitle>
          <CardDescription>Últimos 800 registos · grupos aparecem como na importação de clientes ou coluna grupo nos leads</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem leads. Importe um CSV ou crie grupos e associe membros.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Grupos</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium max-w-[160px] truncate">{r.name}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{r.phone ?? '—'}</TableCell>
                      <TableCell className="text-sm max-w-[140px] truncate">{r.email ?? '—'}</TableCell>
                      <TableCell className="text-sm max-w-[120px] truncate">{r.company ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{r.source}</TableCell>
                      <TableCell className="text-xs">{kindLabel[r.import_kind] ?? r.import_kind}</TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate">{r.group_names || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeLead(r.id)}
                        >
                          <Trash2 className="h-4 w-4" />
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

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar CSV</DialogTitle>
            <DialogDescription>
              Use o mesmo modelo que nas empresas: exportação de leads ou planilha de clientes (colunas «Grupos» criam ou
              associam grupos de leads da plataforma).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Tipo de ficheiro</Label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="ik"
                    checked={importKind === 'leads'}
                    onChange={() => setImportKind('leads')}
                  />
                  Leads
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="ik"
                    checked={importKind === 'clients'}
                    onChange={() => setImportKind('clients')}
                  />
                  Clientes
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="csvfile">Ficheiro (.csv)</Label>
              <Input id="csvfile" ref={fileRef} type="file" accept=".csv,text/csv" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={runImport} disabled={importBusy}>
              {importBusy ? 'A importar…' : 'Importar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
