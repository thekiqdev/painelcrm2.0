
export interface SettingsMenuItemProps {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export interface SettingsSectionProps {
  handleSave?: (e: React.FormEvent) => void;
}
