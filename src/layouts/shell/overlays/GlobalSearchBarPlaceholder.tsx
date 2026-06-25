import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

/** Placeholder visual do campo de busca enquanto overlay lazy carrega. */
export function GlobalSearchBarPlaceholder() {
  return (
    <div className="relative hidden w-full md:block" aria-hidden>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Buscar clientes, contratos, produtos..."
        disabled
        className="pl-9 pr-16 opacity-70"
        tabIndex={-1}
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden h-5 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </div>
  );
}
