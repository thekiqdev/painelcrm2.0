import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Store } from "lucide-react";
import { StoreProfile } from "@/types/products";
import { productsService } from "@/services/products";
import { useToast } from "@/hooks/use-toast";
import { StoreSettingsForm } from "@/components/products/StoreSettingsForm";

const StoreSettings = () => {
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await productsService.getStoreProfile();
        if (!cancelled) setStoreProfile(data);
      } catch (error) {
        console.error("Erro ao carregar loja:", error);
        if (!cancelled) {
          toast({
            title: "Erro",
            description: "Não foi possível carregar os dados da loja",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getStoreUrl = () => {
    if (!storeProfile?.store_slug) return null;
    return `${window.location.origin}/${storeProfile.store_slug}/loja`;
  };

  const handleSuccess = (profile: StoreProfile) => {
    setStoreProfile(profile);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-32">Carregando...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Store className="h-7 w-7" />
          Configuração da loja
        </h1>
        <p className="text-muted-foreground">
          Identidade visual, tema da vitrine, URL pública e contatos
        </p>
      </div>

      {getStoreUrl() && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={getStoreUrl()!} target="_blank" rel="noreferrer">
              Visualizar loja pública
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/products">Voltar para produtos</Link>
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Loja virtual</CardTitle>
          <CardDescription>
            Logo, banner, tema, dados cadastrais e publicação
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StoreSettingsForm storeProfile={storeProfile} onSuccess={handleSuccess} />
        </CardContent>
      </Card>
    </div>
  );
};

export default StoreSettings;
