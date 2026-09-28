import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerSectionHeader } from './PartnerSectionHeader';

export default function PartnerBrandPage() {
  const {
    publicName,
    setPublicName,
    logoUrl,
    setLogoUrl,
    tagline,
    setTagline,
    saving,
    saveBrand,
  } = usePartnerPanel();

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title="Marca"
        description="Elementos visuais e texto de apresentação do seu canal."
      />
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Visual do canal</CardTitle>
          <CardDescription>
            Logo e tagline reforçam a confiança na jornada de cadastro e login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="partner-logo">URL do logo</Label>
            <Input
              id="partner-logo"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          {logoUrl.trim() ? (
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="mb-2 text-xs text-muted-foreground">Pré-visualização</p>
              <img
                src={logoUrl.trim()}
                alt="Logo do canal"
                className="h-12 max-w-[200px] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="partner-tagline">Tagline</Label>
            <Input
              id="partner-tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Ex.: O CRM da sua operação"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="partner-brand-public">Nome público</Label>
            <Input
              id="partner-brand-public"
              value={publicName}
              onChange={(e) => setPublicName(e.target.value)}
            />
          </div>
          <Button onClick={() => void saveBrand()} disabled={saving}>
            Salvar marca
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
