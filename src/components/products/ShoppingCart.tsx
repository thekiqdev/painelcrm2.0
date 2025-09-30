import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ShoppingCart as CartIcon, Trash2, Plus, Minus } from 'lucide-react';
import { CartItem } from '@/types/products';
import { cartService } from '@/services/cart';
import { useToast } from '@/hooks/use-toast';

interface ShoppingCartProps {
  items: CartItem[];
  onUpdate: () => void;
  onCheckout: () => void;
}

export const ShoppingCart: React.FC<ShoppingCartProps> = ({ items, onUpdate, onCheckout }) => {
  const { toast } = useToast();

  const updateQuantity = async (itemId: string, newQuantity: number) => {
    try {
      await cartService.updateCartItemQuantity(itemId, newQuantity);
      toast({ title: 'Quantidade atualizada' });
      onUpdate();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar a quantidade',
        variant: 'destructive'
      });
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      await cartService.removeFromCart(itemId);
      toast({ title: 'Item removido do carrinho' });
      onUpdate();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível remover o item',
        variant: 'destructive'
      });
    }
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => {
      const price = item.product?.discount_price || item.product?.price || 0;
      return sum + (price * item.quantity);
    }, 0);
  };

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CartIcon className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            Seu carrinho está vazio
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CartIcon className="h-5 w-5" />
          Carrinho de Compras
          <Badge variant="secondary">{items.length} {items.length === 1 ? 'item' : 'itens'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => {
          const product = item.product;
          if (!product) return null;

          const price = product.discount_price || product.price || 0;
          const itemTotal = price * item.quantity;

          return (
            <div key={item.id} className="flex gap-4 p-4 border rounded-lg">
              {product.images && product.images[0] && (
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="w-20 h-20 object-cover rounded"
                />
              )}
              
              <div className="flex-1">
                <h4 className="font-semibold">{product.name}</h4>
                {product.short_description && (
                  <p className="text-sm text-muted-foreground">{product.short_description}</p>
                )}
                
                {item.selected_variation && (
                  <div className="flex gap-2 mt-1">
                    {Object.entries(item.selected_variation).map(([key, value]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key}: {value as string}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="flex-1 text-right">
                    <p className="font-semibold">
                      R$ {itemTotal.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      R$ {price.toFixed(2)} cada
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        <Separator />

        <div className="space-y-2">
          <div className="flex justify-between text-lg font-semibold">
            <span>Total:</span>
            <span>R$ {calculateTotal().toFixed(2)}</span>
          </div>
          
          <Button 
            className="w-full" 
            size="lg"
            onClick={onCheckout}
          >
            Finalizar Compra
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
