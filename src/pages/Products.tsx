
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Wrench, Eye, Edit, Trash2, Store } from "lucide-react";
import { StoreConfigDialog } from "@/components/products/StoreConfigDialog";
import { Product, StoreProfile } from "@/types/products";
import { productsService } from "@/services/products";
import { useToast } from "@/hooks/use-toast";

const Products = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [isStoreConfigOpen, setIsStoreConfigOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [productsData, storeData] = await Promise.all([
        productsService.getProducts(),
        productsService.getStoreProfile()
      ]);
      setProducts(productsData);
      setStoreProfile(storeData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    
    try {
      await productsService.deleteProduct(id);
      setProducts(products.filter(p => p.id !== id));
      toast({
        title: "Sucesso",
        description: "Produto excluído com sucesso"
      });
    } catch (error) {
      console.error('Erro ao excluir produto:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir o produto",
        variant: "destructive"
      });
    }
  };

  const getStoreUrl = () => {
    if (!storeProfile?.store_slug) return null;
    return `${window.location.origin}/${storeProfile.store_slug}/loja`;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-32">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Produtos / Serviços</h1>
          <p className="text-muted-foreground">Gerencie seus produtos e serviços</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsStoreConfigOpen(true)}
          >
            <Store className="mr-2 h-4 w-4" />
            Configurar Loja
          </Button>
          <Button onClick={() => navigate('/admin/products/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Produto
          </Button>
        </div>
      </div>

      {storeProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Sua Loja Virtual
            </CardTitle>
            <CardDescription>
              {storeProfile.store_description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{storeProfile.store_name}</p>
                {getStoreUrl() && (
                  <p className="text-sm text-muted-foreground">
                    Link: <a href={getStoreUrl()!} target="_blank" className="text-primary hover:underline">
                      {getStoreUrl()}
                    </a>
                  </p>
                )}
              </div>
              {getStoreUrl() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(getStoreUrl()!, '_blank')}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Visualizar Loja
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {products.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center p-10">
            <div className="text-center max-w-md">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-3">Nenhum produto cadastrado</h2>
              <p className="text-muted-foreground mb-6">
                Comece adicionando seus primeiros produtos ou serviços para sua loja virtual.
              </p>
              <Button onClick={() => navigate('/admin/products/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Primeiro Produto
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <Card key={product.id} className="relative">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant={product.type === 'product' ? 'default' : 'secondary'}>
                    {product.type === 'product' ? (
                      <>
                        <Package className="mr-1 h-3 w-3" />
                        Produto
                      </>
                    ) : (
                      <>
                        <Wrench className="mr-1 h-3 w-3" />
                        Serviço
                      </>
                    )}
                  </Badge>
                  <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                    {product.status === 'active' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <CardTitle className="line-clamp-2">{product.name}</CardTitle>
                <CardDescription className="line-clamp-3">
                  {product.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {product.price && (
                    <div>
                      <p className="text-2xl font-bold">
                        R$ {product.price.toFixed(2)}
                      </p>
                      {product.type === 'service' && product.duration_hours && (
                        <p className="text-sm text-muted-foreground">
                          Duração: {product.duration_hours}h
                        </p>
                      )}
                    </div>
                  )}
                  
                  {product.category && (
                    <Badge variant="outline">{product.category}</Badge>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/products/${product.id}/edit`)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteProduct(product.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <StoreConfigDialog
        open={isStoreConfigOpen}
        onOpenChange={setIsStoreConfigOpen}
        storeProfile={storeProfile}
        onSuccess={(profile) => {
          setStoreProfile(profile);
          loadData();
        }}
      />
    </div>
  );

};

export default Products;
