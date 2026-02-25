import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { teamsService, type Team } from "@/services/teams";

interface UserTeamsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  userDisplayName?: string;
  onSaved?: () => void;
}

export const UserTeamsDialog: React.FC<UserTeamsDialogProps> = ({
  open,
  onOpenChange,
  userId,
  userDisplayName = "Usuário",
  onSaved,
}) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      teamsService.getTeams(),
      userId ? teamsService.getUserTeams(userId) : Promise.resolve([]),
    ])
      .then(([allTeams, userTeams]) => {
        setTeams(allTeams);
        setSelectedIds(new Set(userTeams.map((t) => t.id)));
      })
      .catch((err) => {
        console.error(err);
        toast.error("Erro ao carregar equipes");
      })
      .finally(() => setLoading(false));
  }, [open, userId]);

  const toggleTeam = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await teamsService.setUserTeams(userId, Array.from(selectedIds));
      toast.success("Equipes atualizadas");
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao salvar equipes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Equipes — {userDisplayName}</DialogTitle>
          <DialogDescription>
            Selecione as equipes às quais este usuário pertence.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground" role="status">Carregando equipes...</p>
        ) : (
          <div className="grid gap-3 py-2 max-h-64 overflow-y-auto">
            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma equipe cadastrada.</p>
            ) : (
              teams.map((team) => (
                <div key={team.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`team-${team.id}`}
                    checked={selectedIds.has(team.id)}
                    onCheckedChange={() => toggleTeam(team.id)}
                  />
                  <Label
                    htmlFor={`team-${team.id}`}
                    className="text-sm font-normal cursor-pointer flex-1"
                  >
                    {team.name}
                  </Label>
                </div>
              ))
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} aria-label="Cancelar">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || saving} aria-label="Salvar equipes">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
