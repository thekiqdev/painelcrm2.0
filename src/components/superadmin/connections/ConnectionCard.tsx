import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

type Props = {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
  /** Texto curto de estado (ex.: Conectado, 2 instâncias) */
  statusLine?: string;
  variant?: 'default' | 'destructive' | 'secondary' | 'outline';
};

export default function ConnectionCard({
  title,
  description,
  to,
  icon: Icon,
  statusLine,
  variant = 'secondary',
}: Props) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-muted p-2">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
          </div>
          {statusLine ? (
            <Badge variant={variant} className="shrink-0">
              {statusLine}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="mt-auto pt-0">
        <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
          <Link to={to}>
            Gerir conexão
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
