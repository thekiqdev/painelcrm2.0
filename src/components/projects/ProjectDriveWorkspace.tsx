import { useState } from 'react';
import { FolderTree, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { ClientDriveFileManager } from '@/components/clients/client-drive/ClientDriveFileManager';
import {
  createClientGoogleDriveUserFolder,
  getClientGoogleDriveBrowser,
  type ClientGoogleDriveBrowserItem,
} from '@/services/clientGoogleDriveBrowser';
import type { ProjectVersion } from '@/services/projects';

type ProjectDriveWorkspaceProps = {
  clientId: string;
  projectName: string;
  selectedVersion: ProjectVersion | null;
  canUpload: boolean;
};

function findFolder(items: ClientGoogleDriveBrowserItem[], name: string): ClientGoogleDriveBrowserItem | null {
  return items.find((item) => item.type === 'folder' && item.name.toLowerCase() === name.toLowerCase()) ?? null;
}

async function ensureFolder(clientId: string, parentFolderId: string | null, name: string): Promise<string> {
  const browser = await getClientGoogleDriveBrowser(clientId, parentFolderId);
  const existing = findFolder(browser.items, name);
  if (existing) return existing.id;

  const created = await createClientGoogleDriveUserFolder(clientId, {
    name,
    parent_folder_id: browser.current_folder_id,
  });
  return created.drive_folder_id;
}

export function ProjectDriveWorkspace({
  clientId,
  projectName,
  selectedVersion,
  canUpload,
}: ProjectDriveWorkspaceProps) {
  const [creatingStructure, setCreatingStructure] = useState(false);

  const handleEnsureStructure = async () => {
    setCreatingStructure(true);
    try {
      const projectFolderId = await ensureFolder(clientId, null, projectName);
      const releasesFolderId = await ensureFolder(clientId, projectFolderId, 'Releases');
      await Promise.all([
        ensureFolder(clientId, projectFolderId, 'Arquivos'),
        ensureFolder(clientId, projectFolderId, 'Contratos'),
        ensureFolder(clientId, projectFolderId, 'Financeiro'),
        selectedVersion ? ensureFolder(clientId, releasesFolderId, selectedVersion.name) : Promise.resolve(null),
      ]);
      toast.success('Estrutura do projeto preparada no Google Drive.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível preparar as pastas do projeto.');
    } finally {
      setCreatingStructure(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/60 p-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold">Central de documentos</p>
          <p className="text-xs text-muted-foreground">
            Estrutura sugerida: Projeto / {projectName} / Releases / {selectedVersion?.name ?? 'Release'}.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={handleEnsureStructure} disabled={!canUpload || creatingStructure}>
          {creatingStructure ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FolderTree className="mr-2 h-3.5 w-3.5" />}
          Preparar pastas
        </Button>
      </div>

      <ClientDriveFileManager
        clientId={clientId}
        clientDisplayName={projectName}
        canUpload={canUpload}
        compact
        title="Documentos do projeto"
        description={
          <>
            Reutiliza a integração Google Drive do CRM. Arraste arquivos para enviar, organize pastas e abra itens no Drive.
          </>
        }
      />
    </div>
  );
}
