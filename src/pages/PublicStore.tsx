import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Package, Wrench, Phone, Mail, MessageSquare, Clock, ShoppingCart } from "lucide-react";
import { PublicCatalogProduct, StoreProfile } from "@/types/products";
import { productsService } from "@/services/products";

export const PublicStore = () => {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [products, setProducts] = useState<PublicCatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadStoreData();
  }, [storeSlug]);

  const loadStoreData = async () => {
    if (!storeSlug) return;

    try {
      setLoading(true);
      
      const store = await productsService.getPublicStoreBySlug(storeSlug);
      if (!store) {
        setNotFound(true);
        return;
      }

      const storeProducts = await productsService.getPublicProducts(store.user_id);
      
      setStoreProfile(store);
      setProducts(storeProducts);
    } catch (error) {
      console.error('Erro ao carregar loja:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsAppContact = (product?: PublicCatalogProduct) => {
    if (!storeProfile?.contact_whatsapp) return;
    
    const phone = storeProfile.contact_whatsapp.replace(/\D/g, '');
    let message = `Olá! Gostaria de saber mais sobre`;
    
    if (product) {
      message += ` o ${product.type === 'product' ? 'produto' : 'serviço'} "${product.name}"`;
    } else {
      message += ` os produtos/serviços da ${storeProfile.store_name}`;
    }
    
    message += `. Pode me ajudar?`;
    
    const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Carregando loja...</p>
        </div>
      </div>
    );
  }

  if (notFound || !storeProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Loja não encontrada</h1>
          <p className="text-muted-foreground">
            A loja que você procura não existe ou não está mais disponível.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header da Loja */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-4">{storeProfile.store_name}</h1>
            {storeProfile.store_description && (
              <p className="text-lg text-muted-foreground mb-6">
                {storeProfile.store_description}
              </p>
            )}
            
            {/* Informações de Contato */}
            <div className="flex flex-wrap justify-center gap-4">
              {storeProfile.contact_phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4" />
                  <span>{storeProfile.contact_phone}</span>
                </div>
              )}
              {storeProfile.contact_email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4" />
                  <span>{storeProfile.contact_email}</span>
                </div>
              )}
              {storeProfile.contact_whatsapp && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleWhatsAppContact()}
                  className="flex items-center gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  WhatsApp
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Produtos */}
      <div className="container mx-auto px-4 py-8">
        {products.length === 0 ? (
          <div className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Nenhum produto disponível</h2>
            <p className="text-muted-foreground">
              Esta loja ainda não possui produtos ou serviços cadastrados.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Nossos Produtos e Serviços</h2>
              <p className="text-muted-foreground">
                Confira nossa seleção de {products.length} {products.length === 1 ? 'item' : 'itens'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => (
                <Card key={product.id} className="group hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
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
                      {product.category && (
                        <Badge variant="outline">{product.category}</Badge>
                      )}
                    </div>
                    <CardTitle className="line-clamp-2">{product.name}</CardTitle>
                    <CardDescription className="line-clamp-3">
                      {product.description}
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    {product.price && (
                      <div>
                        <p className="text-2xl font-bold text-primary">
                          R$ {product.price.toFixed(2)}
                        </p>
                        {product.type === 'service' && product.duration_hours && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>Duração: {product.duration_hours}h</span>
                          </div>
                        )}
                      </div>
                    )}

                    {product.features.length > 0 && (
                      <div>
                        <Separator className="mb-3" />
                        <div className="space-y-1">
                          {product.features.slice(0, 3).map((feature, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm">
                              <div className="w-1 h-1 bg-primary rounded-full" />
                              <span>{feature}</span>
                            </div>
                          ))}
                          {product.features.length > 3 && (
                            <p className="text-xs text-muted-foreground">
                              +{product.features.length - 3} características
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {storeProfile.contact_whatsapp && (
                      <Button
                        className="w-full"
                        onClick={() => handleWhatsAppContact(product)}
                      >
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Solicitar Orçamento
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t bg-muted/30 mt-16">
        <div className="container mx-auto px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {storeProfile.store_name} - Todos os direitos reservados
          </p>
        </div>
      </div>
    </div>
  );
};