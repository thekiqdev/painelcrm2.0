import { useCallback, useEffect, useState } from 'react';
import { FolderTree, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { ClientDriveFileManager } from '@/components/clients/client-drive/ClientDriveFileManager';
import { ensureProjectGoogleDriveFolders } from '@/services/projectGoogleDrive';
import type { ProjectVersion } from '@/services/projects';

type ProjectDriveWorkspaceProps = {
  projectId: string;
  clientId: string;
  projectName: string;
  selectedVersion: ProjectVersion | null;
  canUpload: boolean;
};

export function ProjectDriveWorkspace({
  projectId,
  clientId,
  projectName,
  selectedVersion,
  canUpload,
}: ProjectDriveWorkspaceProps) {
  const [creatingStructure, setCreatingStructure] = useState(false);
  const [browseFolderId, setBrowseFolderId] = useState<string | null>(null);
  const [structureReady, setStructureReady] = useState(false);

  const versionName = selectedVersion?.name ?? null;

  const prepareStructure = useCallback(
    async (showToast: boolean) => {
      setCreatingStructure(true);
      try {
        const result = await ensureProjectGoogleDriveFolders(projectId, {
          version_name: versionName,
        });
        setBrowseFolderId(result.browse_folder_id);
        setStructureReady(true);
        if (showToast) {
          toast.success(
            result.created
              ? 'Estrutura do projeto criada no Google Drive.'
              : 'Pastas do projeto atualizadas.',
          );
        }
      } catch (error) {
        console.error(error);
        setStructureReady(false);
        if (showToast) {
          toast.error('Não foi possível preparar as pastas do projeto.');
        }
      } finally {
        setCreatingStructure(false);
      }
    },
    [projectId, versionName],
  );

  useEffect(() => {
    setBrowseFolderId(null);
    setStructureReady(false);
    void prepareStructure(false);
  }, [prepareStructure]);

  const versionLabel = selectedVersion?.name ?? 'Release';

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/60 p-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold">Central de documentos</p>
          <p className="text-xs text-muted-foreground">
            Cliente → Projetos → {projectName} → Releases → {versionLabel}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => void prepareStructure(true)}
          disabled={!canUpload || creatingStructure}
        >
          {creatingStructure ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FolderTree className="mr-2 h-3.5 w-3.5" />
          )}
          Preparar pastas
        </Button>
      </div>

      {structureReady && browseFolderId ? (
        <ClientDriveFileManager
          key={`${projectId}-${browseFolderId}`}
          clientId={clientId}
          clientDisplayName={projectName}
          projectId={projectId}
          initialFolderId={browseFolderId}
          canUpload={canUpload}
          compact
          title="Documentos do projeto"
          description={
            <>
              Arquivos da release ativa. A pasta «Arquivos» do cliente continua separada (documentos do
              perfil).
            </>
          }
        />
      ) : (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-12 text-sm text-muted-foreground">
          {creatingStructure ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              A preparar estrutura no Google Drive…
            </>
          ) : (
            'Não foi possível abrir as pastas do projeto. Tente «Preparar pastas».'
          )}
        </div>
      )}
    </div>
  );
}