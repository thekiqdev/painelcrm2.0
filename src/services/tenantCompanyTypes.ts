/** Tipos compartilhados — evita ciclo runtime entre tenantCompany e http cache. */
export interface TenantCompanyPayload {
  id: string;
  name: string;
  cpf_cnpj: string | null;
  billing_phone: string | null;
  company_whatsapp: string | null;
  company_address_line: string | null;
  company_city: string | null;
  company_state: string | null;
  company_postal_code: string | null;
  logo_url: string | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
}
