import { Navigate } from 'react-router-dom';

/** Chat operacional unificado com o inbox principal — mesmo layout, filtro Oficial. */
export default function WhatsappOfficialChatFull() {
  return <Navigate to="/chat?channel=official" replace />;
}
