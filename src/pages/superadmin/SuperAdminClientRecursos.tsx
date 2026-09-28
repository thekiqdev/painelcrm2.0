import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Flag, Settings2, Check, X } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';
import { useTenantDetail } from '@/contexts/TenantDetailContext';

interface FeatureKeyItem {
  key: string;
  label: string;
}

interface TenantFeaturesPayload {
  tenant_id: string;
  plan_id: string;
  plan_name: string;
  plan_features: Record<string, boolean>;
  overrides: Record<string, boolean>;
  features: Record<string, boolean>;
}

export default function SuperAdminClientRecursos() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenantDetail();
  const [featureKeys, setFeatureKeys] = useState<FeatureKeyItem[]>([]);
  const [data, setData] = useState<TenantFeaturesPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const [keysRes, featuresRes] = await Promise.all([
        apiClient.get<FeatureKeyItem[]>('/api/superadmin/plans/feature-keys'),
        apiClient.get<TenantFeaturesPayload>(`/api/superadmin/tenants/${id}/features`),
      ]);
      if (keysRes.data) setFeatureKeys(keysRes.data);
      if (featuresRes.data) setData(featuresRes.data);
      if (keysRes.error || featuresRes.error) {
        toast.error(featuresRes.error || keysRes.error);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  if (!tenant) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Recursos e funcionalidades</h2>
          <p className="text-sm text-muted-foreground">
            Recursos incluídos no plano e overrides específicos desta empresa.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(`/superadmin/tenants/${id}/features`)}
          className="shrink-0"
        >
          <Settings2 className="mr-2 h-4 w-4" />
          Gerenciar features
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5" />
                Plano atual
              </CardTitle>
              <CardDescription>
                Recursos habilitados no plano <strong>{data.plan_name}</strong>. Overrides por empresa alteram o valor efetivo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">Recurso</th>
                      <th className="text-center py-2 font-medium w-24">No plano</th>
                      <th className="text-center py-2 font-medium w-24">Override</th>
                      <th className="text-center py-2 font-medium w-24">Efetivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {featureKeys.map(({ key: featureKey, label }) => {
                      const fromPlan = data.plan_features[featureKey] === true;
                      const hasOverride = featureKey in data.overrides;
                      const overrideValue = data.overrides[featureKey] === true;
                      const effective = data.features[featureKey] === true;
                      return (
                        <tr key={featureKey} className="border-b last:border-0">
                          <td className="py-2">{label}</td>
                          <td className="text-center py-2">
                            {fromPlan ? <Check className="h-4 w-4 text-green-600 inline" /> : <X className="h-4 w-4 text-muted-foreground inline" />}
                          </td>
                          <td className="text-center py-2">
                            {hasOverride ? (
                              overrideValue ? <Check className="h-4 w-4 text-green-600 inline" /> : <X className="h-4 w-4 text-muted-foreground inline" />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="text-center py-2">
                            {effective ? <Check className="h-4 w-4 text-green-600 inline" /> : <X className="h-4 w-4 text-muted-foreground inline" />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">Não foi possível carregar os recursos.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
