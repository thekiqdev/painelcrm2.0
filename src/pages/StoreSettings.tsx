import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutTemplate, Store } from "lucide-react";
import { StoreProfile } from "@/types/products";
import { productsService } from "@/services/products";
import { useToast } from "@/hooks/use-toast";
import { StoreSettingsForm } from "@/components/products/StoreSettingsForm";
import { StoreTemplateTab } from "@/components/products/StoreTemplateTab";

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
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Store className="h-7 w-7" />
          Configuração da loja
        </h1>
        <p className="text-muted-foreground">
          Dados da vitrine, identidade visual e template público
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
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <LayoutTemplate className="h-5 w-5" />
            Loja virtual
          </CardTitle>
          <CardDescription>
            Ajuste contatos, mídia e o layout público. Todos os templates são carregados do próprio app
            (sem código remoto).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="dados" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="dados">Dados da loja</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
            </TabsList>
            <TabsContent value="dados" className="mt-6 focus-visible:outline-none">
              <StoreSettingsForm storeProfile={storeProfile} onSuccess={handleSuccess} />
            </TabsContent>
            <TabsContent value="templates" className="mt-6 focus-visible:outline-none">
              <StoreTemplateTab storeProfile={storeProfile} onSuccess={handleSuccess} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default StoreSettings;
