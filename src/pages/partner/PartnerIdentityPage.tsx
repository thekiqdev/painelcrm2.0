import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerSectionHeader } from './PartnerSectionHeader';

export default function PartnerIdentityPage() {
  const {
    publicName,
    setPublicName,
    productName,
    setProductName,
    saving,
    saveBrand,
  } = usePartnerPanel();

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title="Identidade"
        description="Como sua agência e produto aparecem para os clientes do canal."
      />
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Informações da empresa</CardTitle>
          <CardDescription>
            Nome público da agência e do produto white-label oferecido aos clientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="partner-public-name">Nome público</Label>
            <Input
              id="partner-public-name"
              value={publicName}
              onChange={(e) => setPublicName(e.target.value)}
              placeholder="Ex.: Agência Norte"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="partner-product-name">Nome do produto</Label>
            <Input
              id="partner-product-name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Ex.: CRM Norte"
            />
            <p className="text-xs text-muted-foreground">
              É o nome que seus clientes verão no login e nas páginas de cadastro.
            </p>
          </div>
          <Button onClick={() => void saveBrand()} disabled={saving}>
            Salvar identidade
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
