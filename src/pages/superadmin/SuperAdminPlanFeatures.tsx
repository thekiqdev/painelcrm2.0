import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/integrations/api/client';

interface FeatureKeyItem {
  key: string;
  label: string;
}

export default function SuperAdminPlanFeatures() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [planName, setPlanName] = useState<string>('');
  const [featureKeys, setFeatureKeys] = useState<FeatureKeyItem[]>([]);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const [planRes, keysRes, featuresRes] = await Promise.all([
        apiClient.get<{ name: string }>(`/api/superadmin/plans/${id}`),
        apiClient.get<FeatureKeyItem[]>('/api/superadmin/plans/feature-keys'),
        apiClient.get<{ features: Record<string, boolean> }>(`/api/superadmin/plans/${id}/features`),
      ]);
      if (planRes.data) setPlanName(planRes.data.name);
      if (keysRes.data) setFeatureKeys(keysRes.data);
      if (featuresRes.data?.features) setFeatures(featuresRes.data.features);
      if (planRes.error || keysRes.error || featuresRes.error) {
        toast.error(planRes.error || keysRes.error || featuresRes.error);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const toggleFeature = (key: string, enabled: boolean) => {
    setFeatures((prev) => ({ ...prev, [key]: enabled }));
  };

  const save = async () => {
    if (!id) return;
    setSaving(true);
    const res = await apiClient.put<{ features: Record<string, boolean> }>(
      `/api/superadmin/plans/${id}/features`,
      { features }
    );
    if (res.error) {
      toast.error(res.error);
      setSaving(false);
      return;
    }
    if (res.data?.features) setFeatures(res.data.features);
    toast.success('Features salvas');
    setSaving(false);
  };

  if (!id) {
    return (
      <div>
        <p className="text-muted-foreground">ID do plano não informado.</p>
        <Button variant="link" onClick={() => navigate('/superadmin/plans')}>
          Voltar para Planos
        </Button>
      </div>
    );
  }

  if (loading) {
    return <p className="text-muted-foreground">Carregando...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/superadmin/plans')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Features do plano: {planName || id}</h1>
          <p className="text-muted-foreground">Marque os recursos que este plano pode usar.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recursos habilitados</CardTitle>
          <CardDescription>Ative ou desative cada recurso para este plano.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {featureKeys.map(({ key: featureKey, label }) => (
              <div
                key={featureKey}
                className="flex items-center space-x-2 rounded-lg border p-4"
              >
                <Checkbox
                  id={featureKey}
                  checked={features[featureKey] === true}
                  onCheckedChange={(checked) => toggleFeature(featureKey, checked === true)}
                />
                <label
                  htmlFor={featureKey}
                  className="flex-1 cursor-pointer text-sm font-medium leading-none"
                >
                  {label}
                </label>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
