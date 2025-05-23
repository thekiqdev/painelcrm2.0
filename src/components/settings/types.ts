
export interface SettingsMenuItemProps {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export interface SettingsSectionProps {
  handleSave?: (e: React.FormEvent) => void;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export type ConnectionType = "evolution";

export interface Connection {
  id: string;
  name: string;
  type: ConnectionType;
  status: ConnectionStatus;
  configData?: any;
}
