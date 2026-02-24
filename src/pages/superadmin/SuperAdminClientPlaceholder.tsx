import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  title: string;
  description?: string;
}

export default function SuperAdminClientPlaceholder({ title, description }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Em breve</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Esta seção será implementada nas próximas fases.</p>
        </CardContent>
      </Card>
    </div>
  );
}
