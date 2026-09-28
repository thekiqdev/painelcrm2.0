import { Link } from 'react-router-dom';
import WhatsappOfficialTemplatesPage from '@/pages/superadmin/whatsapp-official/WhatsappOfficialTemplatesPage';

/** Rota dedicada: `/superadmin/conexoes/whatsapp-oficial/modelos` */
export default function WhatsappOfficialModelosPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Link
          to="/superadmin/conexoes/whatsapp-oficial"
          className="text-sm text-muted-foreground hover:text-foreground w-fit"
        >
          ← Voltar à conexão WhatsApp Oficial
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp Oficial — Modelos</h1>
          <p className="text-sm text-muted-foreground">
            Criação, envio para aprovação na Meta e sincronização de estados.
          </p>
        </div>
      </div>
      <WhatsappOfficialTemplatesPage variant="full" />
    </div>
  );
}
