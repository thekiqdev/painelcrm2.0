
// Tipos para as configurações
export type ConnectionType = "evolution" | "webjs" | "direct";
export type ConnectionStatus = "disconnected" | "connecting" | "connected";

// Interface para props das seções de configurações
export interface SettingsSectionProps {
  handleSave?: (e: React.FormEvent) => void;
}

// Interface para conexão
export interface Connection {
  id: string;
  name: string;
  type: ConnectionType;
  status: ConnectionStatus;
  apiKey?: string;
  baseUrl?: string;
  instanceName?: string;
  webhookUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}
