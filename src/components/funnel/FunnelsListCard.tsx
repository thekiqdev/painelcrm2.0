
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FunnelItemProps {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  createdAt: string;
  stagesCount: number;
  dealsCount: number;
  isActive: boolean;
  onClick: () => void;
}

const FunnelsListCard: React.FC<FunnelItemProps> = ({
  id,
  name,
  description,
  isDefault,
  createdAt,
  stagesCount,
  dealsCount,
  isActive,
  onClick
}) => {
  return (
    <Card 
      key={id} 
      className={`cursor-pointer transition-all ${isActive ? 'border-primary shadow-md' : 'hover:shadow-md'}`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-md">{name}</CardTitle>
            {isDefault && <Badge className="mt-1">Padrão</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Estágios: {stagesCount}</span>
            <span>Negócios: {dealsCount}</span>
          </div>
        </div>
        <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
          <span>Criado em {createdAt}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default FunnelsListCard;
