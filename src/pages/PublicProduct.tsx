import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Package, Wrench, Phone, Mail, MessageSquare, Clock, ShoppingCart, ArrowLeft, CheckCircle } from "lucide-react";
import { Product, StoreProfile } from "@/types/products";
import { productsService } from "@/services/products";

export const PublicProduct = () => {
  const { storeSlug, productId } = useParams<{ storeSlug: string; productId: string }>();
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadProductData();
  }, [storeSlug, productId]);

  const loadProductData = async () => {
    if (!storeSlug || !productId) return;

    try {
      setLoading(true);
      
      const store = await productsService.getPublicStoreBySlug(storeSlug);
      if (!store) {
        setNotFound(true);
        return;
      }

      const productData = await productsService.getProductById(productId);
      if (!productData || productData.user_id !== store.user_id || !productData.is_public || productData.status !== 'active') {
        setNotFound(true);
        return;
      }
      
      setStoreProfile(store);
      setProduct(productData);
    } catch (error) {
      console.error('Erro ao carregar produto:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsAppContact = () => {
    if (!storeProfile?.contact_whatsapp || !product) return;
    
    const phone = storeProfile.contact_whatsapp.replace(/\D/g, '');
    const message = `Olá! Gostaria de solicitar um orçamento para o ${product.type === 'product' ? 'produto' : 'serviço'} "${product.name}". Pode me ajudar?`;
    
    const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Carregando produto...</p>
        </div>
      </div>
    );
  }

  if (notFound || !storeProfile || !product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Produto não encontrado</h1>
          <p className="text-muted-foreground mb-6">
            O produto que você procura não existe ou não está mais disponível.
          </p>
          {storeSlug && (
            <Link to={`/${storeSlug}/loja`}>
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para a loja
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header da Loja */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link 
              to={`/${storeSlug}/loja`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para {storeProfile.store_name}
            </Link>
            
            {storeProfile.contact_whatsapp && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const phone = storeProfile.contact_whatsapp!.replace(/\D/g, '');
                  const message = `Olá! Gostaria de saber mais sobre a ${storeProfile.store_name}. Pode me ajudar?`;
                  const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
                  window.open(whatsappUrl, '_blank');
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Contato
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo do Produto */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Informações do Produto */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
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
                
                <h1 className="text-3xl font-bold mb-4">{product.name}</h1>
                
                {product.description && (
                  <p className="text-lg text-muted-foreground leading-relaxed">
                    {product.description}
                  </p>
                )}
              </div>

              {product.features.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Características</h2>
                  <div className="space-y-2">
                    {product.features.map((feature, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Card de Compra/Orçamento */}
            <div className="lg:sticky lg:top-8">
              <Card>
                <CardHeader>
                  <CardTitle className="text-center">
                    Solicitar {product.type === 'product' ? 'Orçamento' : 'Cotação'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {product.price && (
                    <div className="text-center">
                      <p className="text-3xl font-bold text-primary">
                        R$ {product.price.toFixed(2)}
                      </p>
                      {product.type === 'service' && product.duration_hours && (
                        <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mt-2">
                          <Clock className="h-3 w-3" />
                          <span>Duração estimada: {product.duration_hours}h</span>
                        </div>
                      )}
                    </div>
                  )}

                  <Separator />

                  {storeProfile.contact_whatsapp && (
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleWhatsAppContact}
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Solicitar via WhatsApp
                    </Button>
                  )}

                  <div className="space-y-2 text-sm text-center">
                    <p className="font-medium">Outras formas de contato:</p>
                    <div className="space-y-1 text-muted-foreground">
                      {storeProfile.contact_phone && (
                        <div className="flex items-center justify-center gap-2">
                          <Phone className="h-3 w-3" />
                          <span>{storeProfile.contact_phone}</span>
                        </div>
                      )}
                      {storeProfile.contact_email && (
                        <div className="flex items-center justify-center gap-2">
                          <Mail className="h-3 w-3" />
                          <a href={`mailto:${storeProfile.contact_email}`} className="hover:underline">
                            {storeProfile.contact_email}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Informações da Loja */}
              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Sobre {storeProfile.store_name}</CardTitle>
                </CardHeader>
                <CardContent>
                  {storeProfile.store_description && (
                    <p className="text-sm text-muted-foreground">
                      {storeProfile.store_description}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};