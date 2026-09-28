import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Minus,
  Plus,
  RotateCcw,
  Shield,
  ShoppingBag,
  Truck,
} from 'lucide-react';

interface ColorOption {
  name: string;
  hex: string;
}

interface ModernProductGalleryProps {
  images: string[];
  productName: string;
}

export function ModernProductGallery({ images, productName }: ModernProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const goTo = (index: number) => setSelectedIndex((index + images.length) % images.length);

  return (
    <div className="flex flex-col-reverse gap-4 md:flex-row">
      <div className="flex gap-2 overflow-x-auto pb-2 md:max-h-[600px] md:flex-col md:overflow-y-auto md:pb-0 md:pr-2">
        {images.map((img, i) => (
          <button
            key={i}
            onClick={() => setSelectedIndex(i)}
            className={`h-20 w-16 flex-shrink-0 overflow-hidden rounded-sm border-2 transition-all duration-200 md:h-24 md:w-20 ${
              i === selectedIndex ? 'border-caramel' : 'border-transparent hover:border-border'
            }`}
          >
            <img src={img} alt={`${productName} - foto ${i + 1}`} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      <div className="group relative aspect-[3/4] flex-1 overflow-hidden rounded-sm bg-muted md:h-[600px] md:aspect-auto">
        <img src={images[selectedIndex]} alt={`${productName} - imagem principal`} className="h-full w-full object-cover transition-transform duration-500" />
        <button
          onClick={() => goTo(selectedIndex - 1)}
          className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/80 text-foreground opacity-0 transition-opacity hover:bg-card group-hover:opacity-100"
          aria-label="Foto anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => goTo(selectedIndex + 1)}
          className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/80 text-foreground opacity-0 transition-opacity hover:bg-card group-hover:opacity-100"
          aria-label="Próxima foto"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

interface ModernProductInfoProps {
  name: string;
  price: number;
  originalPrice?: number;
  description: string;
  details: string[];
  colors: ColorOption[];
  sizes: string[];
  sku: string;
}

export function ModernProductInfo({
  name,
  price,
  originalPrice,
  description,
  details,
  colors,
  sizes,
  sku,
}: ModernProductInfoProps) {
  const [selectedColor, setSelectedColor] = useState(0);
  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const formatPrice = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const discount = originalPrice ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <a href="#" className="transition-colors hover:text-foreground">Início</a>
        <span>/</span>
        <a href="#novidades" className="transition-colors hover:text-foreground">Blusas</a>
        <span>/</span>
        <span className="text-foreground">{name}</span>
      </nav>

      <div>
        <h1 className="heading-section mb-1 text-2xl text-foreground md:text-3xl">{name}</h1>
        <p className="text-xs text-muted-foreground">REF: {sku}</p>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-light text-foreground">{formatPrice(price)}</span>
          {originalPrice ? (
            <>
              <span className="text-sm text-muted-foreground line-through">{formatPrice(originalPrice)}</span>
              <span className="rounded-sm bg-rose/10 px-2 py-0.5 text-xs font-medium text-rose">-{discount}%</span>
            </>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">ou 3x de {formatPrice(price / 3)} sem juros</p>
        <p className="text-xs font-medium text-caramel">{formatPrice(price * 0.9)} no PIX (10% de desconto)</p>
      </div>

      <div className="h-px w-full bg-border" />

      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-foreground">Cor:</span>
          <span className="text-xs text-muted-foreground">{colors[selectedColor]?.name}</span>
        </div>
        <div className="flex gap-2">
          {colors.map((color, i) => (
            <button
              key={i}
              onClick={() => setSelectedColor(i)}
              className={`h-8 w-8 rounded-full border-2 transition-all ${i === selectedColor ? 'scale-110 border-caramel' : 'border-border hover:border-muted-foreground'}`}
              style={{ backgroundColor: color.hex }}
              title={color.name}
              aria-label={color.name}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-foreground">Tamanho</span>
          <button className="text-xs text-caramel hover:underline">Guia de tamanhos</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {sizes.map((size, i) => (
            <button
              key={size}
              onClick={() => setSelectedSize(i)}
              className={`h-10 min-w-[3rem] rounded-sm border px-4 text-xs tracking-wide transition-all duration-200 ${
                i === selectedSize ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-foreground'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-3 block text-xs font-medium uppercase tracking-[0.1em] text-foreground">Quantidade</span>
        <div className="flex w-fit items-center rounded-sm border border-border">
          <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="flex h-10 w-10 items-center justify-center text-foreground hover:bg-muted">
            <Minus size={14} />
          </button>
          <span className="flex h-10 w-12 items-center justify-center border-x border-border text-sm font-medium text-foreground">{quantity}</span>
          <button onClick={() => setQuantity(quantity + 1)} className="flex h-10 w-10 items-center justify-center text-foreground hover:bg-muted">
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button className="btn-premium flex flex-1 items-center justify-center gap-2 rounded-sm">
          <ShoppingBag size={16} />
          Adicionar ao Carrinho
        </button>
        <button
          onClick={() => setIsFavorite(!isFavorite)}
          className={`flex h-12 w-12 items-center justify-center rounded-sm border transition-all ${isFavorite ? 'border-rose bg-rose/10 text-rose' : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}
          aria-label="Favoritar"
        >
          <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <button className="btn-outline-premium w-full rounded-sm">Comprar Agora</button>
      <div className="h-px w-full bg-border" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[{ icon: Truck, label: 'Frete grátis', sub: 'acima de R$ 299' }, { icon: RotateCcw, label: 'Troca grátis', sub: 'em até 30 dias' }, { icon: Shield, label: 'Compra segura', sub: 'dados protegidos' }].map((item) => (
          <div key={item.label} className="flex items-center gap-3 py-2">
            <item.icon size={18} className="flex-shrink-0 text-caramel" strokeWidth={1.5} />
            <div>
              <p className="text-xs font-medium text-foreground">{item.label}</p>
              <p className="text-[11px] text-muted-foreground">{item.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="h-px w-full bg-border" />

      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.1em] text-foreground">Descrição</h3>
        <p className="text-sm font-light leading-relaxed text-muted-foreground">{description}</p>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.1em] text-foreground">Detalhes do Produto</h3>
        <ul className="space-y-2">
          {details.map((detail, i) => (
            <li key={i} className="flex items-start gap-2 text-sm font-light text-muted-foreground">
              <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-caramel" />
              {detail}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
