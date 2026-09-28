import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAmount } from "./subscriptionsListUtils";

export type GrowthChartPoint = { name: string; novas: number; canceladas: number };
export type IntervalChartPoint = { name: string; assinaturas: number; mrr: number };
export type TopClientChartPoint = { name: string; mrr: number };
export type ProjectionChartPoint = { name: string; prevista: number };

type Props = {
  growthChartData: GrowthChartPoint[];
  intervalChartData: IntervalChartPoint[];
  topClientsChartData: TopClientChartPoint[];
  projection12ChartData: ProjectionChartPoint[];
  layout: "grid" | "carousel";
};

function ChartSlide({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("h-full", className)}>{children}</div>;
}

function GrowthChart({ data }: { data: GrowthChartPoint[] }) {
  return (
    <Card className="border shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Evolução das assinaturas</CardTitle>
        <CardDescription>Novas vs canceladas no período</CardDescription>
      </CardHeader>
      <CardContent className="h-[240px] md:h-[260px]">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
              <RechartsTooltip />
              <Legend />
              <Bar dataKey="novas" name="Novas" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="canceladas" name="Canceladas" fill="hsl(0 72% 51%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function IntervalChart({ data }: { data: IntervalChartPoint[] }) {
  return (
    <Card className="border shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Distribuição por periodicidade</CardTitle>
        <CardDescription>Semanal, mensal, trimestral, semestral e anual (ativas)</CardDescription>
      </CardHeader>
      <CardContent className="h-[240px] md:h-[260px]">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem assinaturas ativas.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11 }} />
              <RechartsTooltip />
              <Bar dataKey="assinaturas" name="Assinaturas" fill="hsl(262 83% 58%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function TopClientsChart({ data }: { data: TopClientChartPoint[] }) {
  return (
    <Card className="border shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Top clientes</CardTitle>
        <CardDescription>Top 10 por MRR recorrente</CardDescription>
      </CardHeader>
      <CardContent className="h-[250px] md:h-[280px]">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem clientes com MRR.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
              <RechartsTooltip formatter={(v: number) => formatAmount(Math.round(v * 100))} />
              <Bar dataKey="mrr" name="MRR" fill="hsl(199 89% 48%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function Projection12Chart({ data }: { data: ProjectionChartPoint[] }) {
  return (
    <Card className="border shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Receita prevista — próximos 12 meses</CardTitle>
        <CardDescription>Pendente + ciclos projetados</CardDescription>
      </CardHeader>
      <CardContent className="h-[250px] md:h-[280px]">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem projeção disponível.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v) => `${v}`} />
              <RechartsTooltip formatter={(v: number) => formatAmount(Math.round(v * 100))} />
              <Bar dataKey="prevista" name="Receita prevista" fill="hsl(271 81% 56%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function SubscriptionsChartsPanel({
  growthChartData,
  intervalChartData,
  topClientsChartData,
  projection12ChartData,
  layout,
}: Props) {
  const slides = [
    { key: "growth", node: <GrowthChart data={growthChartData} /> },
    { key: "interval", node: <IntervalChart data={intervalChartData} /> },
    { key: "top", node: <TopClientsChart data={topClientsChartData} /> },
    { key: "projection", node: <Projection12Chart data={projection12ChartData} /> },
  ];

  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!api) return;
    setActiveIndex(api.selectedScrollSnap());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, onSelect]);

  if (layout === "carousel") {
    return (
      <div className="space-y-3">
        <Carousel setApi={setApi} opts={{ align: "start", loop: false }} className="w-full">
          <CarouselContent className="-ml-2">
            {slides.map((slide) => (
              <CarouselItem key={slide.key} className="pl-2 basis-[92%] sm:basis-[88%]">
                <ChartSlide>{slide.node}</ChartSlide>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        <div className="flex justify-center gap-1.5" aria-hidden>
          {slides.map((slide, i) => (
            <span
              key={slide.key}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === activeIndex ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
              )}
            />
          ))}
        </div>
        <p className="text-center text-[11px] text-muted-foreground">Deslize para ver mais gráficos</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GrowthChart data={growthChartData} />
      <IntervalChart data={intervalChartData} />
      <TopClientsChart data={topClientsChartData} />
      <Projection12Chart data={projection12ChartData} />
    </div>
  );
}
