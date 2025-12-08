import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ticketsService } from '@/services/tickets';
import { clientsService } from '@/services/clients';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { TicketCategory, TicketPriority, ticketPriorityLabels } from '@/types/tickets';

export default function NewTicket() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [clients, setClients] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    category_id: '',
    priority: 'normal' as TicketPriority,
    client_id: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    tags: [] as string[],
  });

  useEffect(() => {
    if (user) {
      loadCategories();
      loadClients();
    }
  }, [user]);

  const loadCategories = async () => {
    try {
      const data = await ticketsService.getTicketCategories();
      setCategories(data);
    } catch (error: any) {
      console.error('Error loading categories:', error);
    }
  };

  const loadClients = async () => {
    try {
      const data = await clientsService.getClients();
      setClients(data);
    } catch (error: any) {
      console.error('Error loading clients:', error);
    }
  };

  const handleClientChange = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setFormData({
        ...formData,
        client_id: clientId,
        contact_name: client.name,
        contact_email: client.email || '',
        contact_phone: client.phone || '',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await ticketsService.createTicket({
          contact_name: formData.contact_name,
          contact_email: formData.contact_email,
        contact_phone: formData.contact_phone || undefined,
          subject: formData.subject,
          description: formData.description,
        category_id: formData.category_id || undefined,
          priority: formData.priority,
        client_id: formData.client_id || undefined,
          tags: formData.tags,
          channel: 'internal',
          status: 'new',
      });

      toast({
        title: 'Ticket criado com sucesso!',
        description: `Ticket ${data.ticket_number} foi criado.`,
      });

      navigate(`/support/tickets/${data.id}`);
    } catch (error: any) {
      toast({
        title: 'Erro ao criar ticket',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate('/support/tickets')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>

      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-6">Novo Ticket</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Cliente */}
          <div className="space-y-2">
            <Label htmlFor="client">Cliente</Label>
            <Select
              value={formData.client_id}
              onValueChange={handleClientChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contato Manual */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_name">Nome do Contato *</Label>
              <Input
                id="contact_name"
                value={formData.contact_name}
                onChange={(e) =>
                  setFormData({ ...formData, contact_name: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_email">E-mail *</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) =>
                  setFormData({ ...formData, contact_email: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Telefone</Label>
              <Input
                id="contact_phone"
                value={formData.contact_phone}
                onChange={(e) =>
                  setFormData({ ...formData, contact_phone: e.target.value })
                }
              />
            </div>
          </div>

          {/* Assunto */}
          <div className="space-y-2">
            <Label htmlFor="subject">Assunto *</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) =>
                setFormData({ ...formData, subject: e.target.value })
              }
              required
            />
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={6}
              required
            />
          </div>

          {/* Categoria e Prioridade */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, category_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Prioridade *</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) =>
                  setFormData({ ...formData, priority: value as TicketPriority })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ticketPriorityLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/support/tickets')}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Criando...' : 'Criar Ticket'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
