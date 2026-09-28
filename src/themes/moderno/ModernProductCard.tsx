import { useState } from 'react';
import { Eye, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ModernProductCardProps {
  id?: string;
  image: string;
  name: string;
  price: number;
  originalPrice?: number;
  colors?: string[];
  isNew?: boolean;
  productHref?: string;
}

export function ModernProductCard({
  image,
  name,
  price,
  originalPrice,
  colors,
  isNew,
  productHref = '#',
}: ModernProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const formatPrice = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="group relative" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <Link to={productHref} className="relative mb-4 block aspect-[3/4] overflow-hidden rounded-sm bg-muted">
        <img src={image} alt={name} className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />
        {isNew ? (
          <span className="absolute left-3 top-3 rounded-sm bg-primary px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-primary-foreground">
            Novo
          </span>
        ) : null}
        <div className={`absolute inset-x-0 bottom-0 flex items-end justify-between p-4 transition-all duration-300 ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
          <button type="button" className="flex items-center gap-2 rounded-sm bg-card/95 px-6 py-3 text-xs font-light uppercase tracking-[0.1em] text-foreground backdrop-blur-sm transition-colors hover:bg-card">
            <Eye size={14} />
            Ver Detalhes
          </button>
        </div>
        <button
          type="button"
          onClick={() => setIsFavorite(!isFavorite)}
          className={`absolute right-3 top-3 rounded-full p-2 transition-all duration-300 ${isFavorite ? 'bg-rose text-rose-foreground' : 'bg-card/80 text-foreground/60 backdrop-blur-sm hover:text-foreground'} ${isHovered || isFavorite ? 'opacity-100' : 'opacity-0'}`}
          aria-label="Favoritar"
        >
          <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </Link>

      <div className="space-y-2">
        <Link to={productHref} className="line-clamp-2 block text-sm font-light leading-snug tracking-wide text-foreground transition-colors hover:text-caramel">{name}</Link>
        {colors?.length ? (
          <div className="flex gap-1.5">
            {colors.map((color, i) => (
              <span key={`${color}-${i}`} className="h-3.5 w-3.5 rounded-full border border-border/60" style={{ backgroundColor: color }} />
            ))}
          </div>
        ) : null}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{formatPrice(price)}</span>
          {originalPrice ? <span className="text-xs text-muted-foreground line-through">{formatPrice(originalPrice)}</span> : null}
        </div>
        {originalPrice ? <p className="text-[11px] text-muted-foreground">ou 3x de {formatPrice(price / 3)} sem juros</p> : null}
      </div>
    </div>
  );
}
