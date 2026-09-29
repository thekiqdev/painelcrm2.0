import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Package, Wrench, Eye, Edit, Trash2, Store, ExternalLink, Upload } from "lucide-react";
import { Product, StoreProfile } from "@/types/products";
import { productsService } from "@/services/products";
import { useToast } from "@/hooks/use-toast";
import { ProductImportDialog } from "@/components/products/ProductImportDialog";
import { resolveCanonicalStoreUrl } from "@/lib/tenantCanonicalUrls";

type StatusFilter = "all" | "active" | "inactive" | "draft";
type CategoryFilter = "all" | "__none__" | string;
type CatalogTab = "all" | "product" | "service";

function formatTablePrice(product: Product): string {
  const rawPrice = product.price != null ? Number(product.price) : null;
  const rawDisc = product.discount_price != null ? Number(product.discount_price) : null;
  let value: number | null = rawPrice;
  if (rawDisc != null && rawPrice != null && rawDisc < rawPrice) {
    value = rawDisc;
  } else if (rawDisc != null && rawPrice == null) {
    value = rawDisc;
  }
  if (value == null || Number.isNaN(value)) return "—";
  return `R$ ${value.toFixed(2)}`;
}

function statusLabel(status: Product["status"]): string {
  if (status === "active") return "Ativo";
  if (status === "inactive") return "Inativo";
  return "Rascunho";
}

const Products = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [activeTab, setActiveTab] = useState<CatalogTab>("all");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [filterCategory, setFilterCategory] = useState<CategoryFilter>("all");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [productsData, storeData] = await Promise.all([
        productsService.getProducts(),
        productsService.getStoreProfile(),
      ]);
      setProducts(productsData);
      setStoreProfile(storeData);
      setStoreUrl(await resolveCanonicalStoreUrl(storeData?.store_slug));
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const enableProducts = storeProfile?.enable_products !== false;
  const enableServices = storeProfile?.enable_services !== false;

  useEffect(() => {
    if (enableProducts && enableServices) return;
    if (enableProducts && !enableServices && activeTab === "service") {
      setActiveTab("product");
    } else if (!enableProducts && enableServices && (activeTab === "product" || activeTab === "all")) {
      setActiveTab("service");
    } else if (enableProducts && !enableServices && activeTab === "all") {
      setActiveTab("product");
    }
  }, [enableProducts, enableServices, activeTab]);

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of products) {
      const c = p.category?.trim();
      if (c) seen.add(c);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchName.trim().toLowerCase();
    return products.filter((p) => {
      if (p.type === "product" && !enableProducts) return false;
      if (p.type === "service" && !enableServices) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (activeTab !== "all" && p.type !== activeTab) return false;
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterCategory !== "all") {
        const trimmed = p.category?.trim() || "";
        if (filterCategory === "__none__") {
          if (trimmed) return false;
        } else if (trimmed !== filterCategory) {
          return false;
        }
      }
      return true;
    });
  }, [products, searchName, activeTab, filterStatus, filterCategory, enableProducts, enableServices]);

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;

    try {
      await productsService.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      toast({
        title: "Sucesso",
        description: "Produto excluído com sucesso",
      });
    } catch (error) {
      console.error("Erro ao excluir produto:", error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir o produto",
        variant: "destructive",
      });
    }
  };

  const getStoreUrl = () => storeUrl;

  const canOpenStorefront = (product: Product) =>
    Boolean(
      storeProfile?.store_slug &&
        storeProfile.is_active &&
        product.is_public &&
        product.status === "active"
    );

  const openStorefront = () => {
    const url = getStoreUrl();
    if (url) window.open(url, "_blank");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-32">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Catálogo</h1>
          <p className="text-muted-foreground">Gerencie os itens do seu catálogo</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Importar
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin/loja")}>
            <Store className="mr-2 h-4 w-4" />
            Configurar Loja
          </Button>
          <Button onClick={() => navigate("/admin/products/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Novo item
          </Button>
        </div>
      </div>

      <ProductImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => {
          void loadData();
        }}
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Store className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {storeProfile?.store_name ?? "Loja ainda não configurada"}
                </p>
                {getStoreUrl() ? (
                  <p className="text-sm text-muted-foreground truncate">{getStoreUrl()}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Defina sua loja em Configurar Loja
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/admin/loja")}>
                Gerenciar loja
              </Button>
              {getStoreUrl() && (
                <Button variant="outline" size="sm" onClick={() => openStorefront()}>
                  <Eye className="mr-2 h-4 w-4" />
                  Visualizar loja
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {products.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center p-10">
            <div className="text-center max-w-md">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-3">Nenhum produto cadastrado</h2>
              <p className="text-muted-foreground mb-6">
                Comece adicionando seus primeiros produtos ou serviços para sua loja virtual,
                ou importe de um CSV do WooCommerce.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar
                </Button>
                <Button onClick={() => navigate("/admin/products/new")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar primeiro item
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CatalogTab)}>
            <TabsList
              className={`grid w-full max-w-md ${
                enableProducts && enableServices ? "grid-cols-3" : "grid-cols-1"
              }`}
            >
              {enableProducts && enableServices ? (
                <TabsTrigger value="all">Todos</TabsTrigger>
              ) : null}
              {enableProducts ? <TabsTrigger value="product">Produtos</TabsTrigger> : null}
              {enableServices ? <TabsTrigger value="service">Serviços</TabsTrigger> : null}
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm text-muted-foreground mb-1 block">Buscar por nome</label>
              <Input
                placeholder="Nome do produto ou serviço..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="text-sm text-muted-foreground mb-1 block">Status</label>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <label className="text-sm text-muted-foreground mb-1 block">Categoria</label>
              <Select
                value={filterCategory}
                onValueChange={(v) => setFilterCategory(v as CategoryFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="__none__">Sem categoria</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Público</TableHead>
                  <TableHead className="text-right w-[140px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      Nenhum item corresponde aos filtros da aba selecionada.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium max-w-[220px]">
                        <span className="line-clamp-2">{product.name}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.type === "product" ? "default" : "secondary"}>
                          {product.type === "product" ? (
                            <>
                              <Package className="mr-1 h-3 w-3 inline" />
                              Produto
                            </>
                          ) : (
                            <>
                              <Wrench className="mr-1 h-3 w-3 inline" />
                              Serviço
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.status === "active" ? "default" : "secondary"}>
                          {statusLabel(product.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatTablePrice(product)}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[140px]">
                        {product.category?.trim() || "—"}
                      </TableCell>
                      <TableCell>{product.is_public ? "Sim" : "Não"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 flex-wrap">
                          {canOpenStorefront(product) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Abrir vitrine"
                              onClick={() => openStorefront()}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            title="Editar"
                            onClick={() => navigate(`/admin/products/${product.id}/edit`)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            title="Excluir"
                            onClick={() => handleDeleteProduct(product.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
