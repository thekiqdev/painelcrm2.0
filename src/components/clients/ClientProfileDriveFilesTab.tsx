import React from 'react';
import { ClientDriveFileManager } from '@/components/clients/client-drive/ClientDriveFileManager';

type Props = {
  clientId: string;
  clientDisplayName: string;
  canUpload: boolean;
};

export function ClientProfileDriveFilesTab({ clientId, clientDisplayName, canUpload }: Props) {
  return <ClientDriveFileManager clientId={clientId} clientDisplayName={clientDisplayName} canUpload={canUpload} />;
}
