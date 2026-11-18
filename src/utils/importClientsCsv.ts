import type { ClientGroup } from "@/services/clients";
import type { ClientAddressInput } from "@/types/clientAddresses";
import { isValidCnpj, isValidCpf } from "@/utils/cpfCnpj";
import type { ClientData } from "@/utils/clients-helpers";

export type CsvImportPreparedRow = {
  lineNumber: number;
  payload: ClientData;
};

export type CsvImportSkip = {
  line: number;
  reason: string;
};

export type ClientImportField =
  | "ignore"
  | "external_code"
  | "name"
  | "company"
  | "email"
  | "phone"
  | "cpf"
  | "cnpj"
  | "cpf_cnpj"
  | "rg"
  | "razao_social"
  | "status"
  | "group"
  | "notes"
  | "observacao"
  | "address_label"
  | "postal_code"
  | "street"
  | "number"
  | "complement"
  | "neighborhood"
  | "city"
  | "state"
  | "contact_type"
  | "contact_name"
  | "contact_value";

export const CLIENT_IMPORT_FIELD_OPTIONS: { value: ClientImportField; label: string }[] = [
  { value: "ignore", label: "Ignorar" },
  { value: "external_code", label: "Código externo (juntar arquivos)" },
  { value: "name", label: "Nome" },
  { value: "company", label: "Nome fantasia" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "cpf_cnpj", label: "CPF ou CNPJ" },
  { value: "rg", label: "RG" },
  { value: "razao_social", label: "Razão social" },
  { value: "status", label: "Situação" },
  { value: "group", label: "Grupo" },
  { value: "notes", label: "Notas" },
  { value: "observacao", label: "Observação" },
  { value: "address_label", label: "Rótulo do endereço" },
  { value: "postal_code", label: "CEP" },
  { value: "street", label: "Logradouro" },
  { value: "number", label: "Número" },
  { value: "complement", label: "Complemento" },
  { value: "neighborhood", label: "Bairro" },
  { value: "city", label: "Cidade" },
  { value: "state", label: "UF" },
  { value: "contact_type", label: "Tipo de contato" },
  { value: "contact_name", label: "Nome do contato" },
  { value: "contact_value", label: "Contato" },
];

export type ClientImportSheet = {
  name: string;
  headers: string[];
  rows: string[][];
  truncated: boolean;
};

export type ClientImportFile = {
  id: string;
  fileName: string;
  sheets: ClientImportSheet[];
  activeSheet: string;
};

export type ClientImportColumnMapping = {
  fileId: string;
  fileName: string;
  sheetName: string;
  columnIndex: number;
  header: string;
  field: ClientImportField;
};

export type ClientImportBuiltRow = {
  lineNumber: number;
  sourceLabel: string;
  payload: ClientData;
  address?: ClientAddressInput;
  warnings: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DATA_ROWS = 5000;

const EXACT_FIELDS: Record<string, ClientImportField> = {
  "#": "ignore",
  nome: "name",
  name: "name",
  "contato principal": "name",
  empresa: "company",
  company: "company",
  "nome fantasia": "company",
  "razao social": "razao_social",
  email: "email",
  "e-mail": "email",
  "e mail": "email",
  "e-mail principal": "email",
  telefone: "phone",
  celular: "phone",
  phone: "phone",
  whatsapp: "phone",
  fone: "phone",
  cpf: "cpf",
  cnpj: "cnpj",
  "cpf/cnpj": "cpf_cnpj",
  "cpf cnpj": "cpf_cnpj",
  rg: "rg",
  ativo: "status",
  status: "status",
  situacao: "status",
  grupo: "group",
  grupos: "group",
  group: "group",
  observacao: "observacao",
  obs: "observacao",
  notas: "notes",
  notes: "notes",
  cep: "postal_code",
  logradouro: "street",
  endereco: "street",
  rua: "street",
  numero: "number",
  nro: "number",
  nr: "number",
  complemento: "complement",
  bairro: "neighborhood",
  cidade: "city",
  uf: "state",
  estado: "state",
  codigo: "external_code",
  "codigo externo": "external_code",
  "tipo de contato": "contact_type",
  "tipo contato": "contact_type",
  contato: "contact_value",
  cargo: "ignore",
  "tipo de pessoa": "ignore",
  "data de nascimento": "ignore",
  "nome social": "ignore",
  "inscricao estadual": "ignore",
  "inscricao municipal": "ignore",
  "cadastrado em": "ignore",
  "data criada": "ignore",
  "data de criacao": "ignore",
  criado_em: "ignore",
};

export function normalizeImportHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function suggestField(header: string, siblingKeys: string[]): ClientImportField {
  const key = normalizeImportHeader(header.replace(/^#+$/, "#"));
  if (!key || key.startsWith("coluna ")) return "ignore";
  if (key === "nome" && (siblingKeys.includes("tipo de contato") || siblingKeys.includes("contato"))) {
    return "contact_name";
  }
  if (
    key === "tipo" &&
    (siblingKeys.includes("cep") || siblingKeys.includes("logradouro") || siblingKeys.includes("cidade"))
  ) {
    return "address_label";
  }
  const exact = EXACT_FIELDS[key];
  if (exact) return exact;
  if (key.includes("e-mail") || key.includes("email")) return "email";
  if (key.includes("telefone") || key.includes("celular") || key.includes("whatsapp")) return "phone";
  if (key.includes("nome fantasia")) return "company";
  if (key.includes("razao social")) return "razao_social";
  if (key === "rg" || key.startsWith("rg ")) return "rg";
  if (key.includes("cnpj") && key.includes("cpf")) return "cpf_cnpj";
  if (key.includes("cnpj")) return "cnpj";
  if (key.includes("cpf")) return "cpf";
  if (key.includes("empresa")) return "company";
  if (key === "codigo" || key.startsWith("codigo ")) return "external_code";
  if (key.includes("logradouro")) return "street";
  if (key.includes("bairro")) return "neighborhood";
  if (key.includes("cep")) return "postal_code";
  return "ignore";
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = String(value.getDate()).padStart(2, "0");
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const y = value.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return String(value).replace(/^\uFEFF/, "").trim();
}

function matrixToSheet(name: string, matrix: unknown[][]): ClientImportSheet {
  const rowsRaw = matrix.map((row) => (Array.isArray(row) ? row : []).map(cellToString));
  const headerRow = rowsRaw[0] ?? [];
  let last = headerRow.length - 1;
  while (last >= 0 && !headerRow[last]) last -= 1;
  const width = Math.max(0, last + 1);
  const headers = Array.from({ length: width }, (_, index) => {
    const label = headerRow[index]?.replace(/^\uFEFF/, "").trim() ?? "";
    return label || `Coluna ${index + 1}`;
  });
  const data = rowsRaw
    .slice(1)
    .map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""))
    .filter((row) => row.some((cell) => cell.trim().length > 0));
  const truncated = data.length > MAX_DATA_ROWS;
  return {
    name,
    headers,
    rows: truncated ? data.slice(0, MAX_DATA_ROWS) : data,
    truncated,
  };
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      cur += c;
    } else if (!inQuotes && (c === "\n" || (c === "\r" && text[i + 1] === "\n"))) {
      if (c === "\r") i++;
      rows.push(cur);
      cur = "";
    } else if (!inQuotes && c === "\r") {
      rows.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.length > 0) rows.push(cur);
  return rows.filter((row) => row.trim().length > 0);
}

export function detectCsvDelimiter(text: string): "," | ";" | "\t" {
  const sample = text.replace(/^\uFEFF/, "").slice(0, 4000);
  let inQuotes = false;
  const counts: Record<"," | ";" | "\t", number> = { ",": 0, ";": 0, "\t": 0 };
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (c === "\n" || c === "\r")) break;
    if (!inQuotes && (c === "," || c === ";" || c === "\t")) counts[c] += 1;
  }
  let best: "," | ";" | "\t" = ",";
  let bestCount = counts[","];
  if (counts[";"] > bestCount) {
    best = ";";
    bestCount = counts[";"];
  }
  if (counts["\t"] > bestCount) best = "\t";
  return best;
}

export function parseClientImportCsvText(id: string, fileName: string, csvText: string): ClientImportFile {
  const text = csvText.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(text);
  const matrix = splitCsvRows(text).map((line) => parseCsvLine(line, delimiter));
  const sheet = matrixToSheet("CSV", matrix);
  return {
    id,
    fileName,
    sheets: [sheet],
    activeSheet: sheet.name,
  };
}

export function clientImportFileFromMatrices(
  id: string,
  fileName: string,
  sheets: { name: string; matrix: unknown[][] }[],
): ClientImportFile {
  const parsed = sheets
    .map((sheet) => matrixToSheet(sheet.name, sheet.matrix))
    .filter((sheet) => sheet.headers.length > 0);
  const ready = parsed.length > 0 ? parsed : [matrixToSheet("Planilha", [])];
  return {
    id,
    fileName,
    sheets: ready,
    activeSheet: ready[0].name,
  };
}

export async function parseClientImportFile(file: File, id: string): Promise<ClientImportFile> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv" || ext === "txt" || file.type.includes("csv") || file.type.startsWith("text/")) {
    const text = await file.text();
    return parseClientImportCsvText(id, file.name, text);
  }
  const buffer = await file.arrayBuffer();
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    matrix: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][],
  }));
  return clientImportFileFromMatrices(id, file.name, sheets);
}

export function activeImportSheet(file: ClientImportFile): ClientImportSheet | undefined {
  return file.sheets.find((sheet) => sheet.name === file.activeSheet) ?? file.sheets[0];
}

export function suggestColumns(file: ClientImportFile): ClientImportColumnMapping[] {
  const sheet = activeImportSheet(file);
  if (!sheet) return [];
  const siblingKeys = sheet.headers.map((header) => normalizeImportHeader(header));
  return sheet.headers.map((header, columnIndex) => ({
    fileId: file.id,
    fileName: file.fileName,
    sheetName: sheet.name,
    columnIndex,
    header,
    field: suggestField(header, siblingKeys),
  }));
}

type PhoneCandidate = { headerKey: string; value: string };

type AddressDraft = {
  label?: string;
  postal_code?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

type ContactDraft = { type: string; name: string; value: string };

type ImportBucket = {
  code: string | null;
  lineNumber: number;
  sourceLabel: string;
  name: string;
  company: string;
  email: string;
  phones: PhoneCandidate[];
  cpf: string;
  cnpj: string;
  rg: string;
  razaoSocial: string;
  documentIssues: string[];
  status: string;
  group: string;
  notes: string[];
  observacao: string[];
  address: AddressDraft;
  contact: ContactDraft;
  meaningful: boolean;
};

function emptyBucket(lineNumber: number, sourceLabel: string): ImportBucket {
  return {
    code: null,
    lineNumber,
    sourceLabel,
    name: "",
    company: "",
    email: "",
    phones: [],
    cpf: "",
    cnpj: "",
    rg: "",
    razaoSocial: "",
    documentIssues: [],
    status: "",
    group: "",
    notes: [],
    observacao: [],
    address: {},
    contact: { type: "", name: "", value: "" },
    meaningful: false,
  };
}

function fill(current: string, next: string): string {
  return current || next;
}

function readBucket(
  file: ClientImportFile,
  sheet: ClientImportSheet,
  rowIndex: number,
  row: string[],
  mappings: ClientImportColumnMapping[],
): ImportBucket | null {
  const columns = mappings.filter((mapping) => mapping.fileId === file.id && mapping.sheetName === sheet.name);
  const bucket = emptyBucket(rowIndex + 2, file.fileName);
  for (const column of columns) {
    const raw = (row[column.columnIndex] ?? "").trim();
    if (!raw || column.field === "ignore") continue;
    const headerKey = normalizeImportHeader(column.header);
    switch (column.field) {
      case "external_code":
        bucket.code = raw;
        break;
      case "name":
        bucket.name = fill(bucket.name, raw);
        bucket.meaningful = true;
        break;
      case "company":
        bucket.company = fill(bucket.company, raw);
        bucket.meaningful = true;
        break;
      case "email":
        bucket.email = fill(bucket.email, raw);
        bucket.meaningful = true;
        break;
      case "phone":
        bucket.phones.push({ headerKey, value: raw });
        bucket.meaningful = true;
        break;
      case "cpf":
        putCpf(bucket, raw);
        bucket.meaningful = true;
        break;
      case "cnpj":
        putCnpj(bucket, raw);
        bucket.meaningful = true;
        break;
      case "cpf_cnpj":
        putDocumentByLength(bucket, raw);
        bucket.meaningful = true;
        break;
      case "rg":
        putRg(bucket, raw);
        bucket.meaningful = true;
        break;
      case "razao_social":
        putRazaoSocial(bucket, raw);
        bucket.meaningful = true;
        break;
      case "status":
        bucket.status = fill(bucket.status, raw);
        bucket.meaningful = true;
        break;
      case "group":
        bucket.group = fill(bucket.group, raw);
        bucket.meaningful = true;
        break;
      case "notes":
        bucket.notes.push(raw);
        bucket.meaningful = true;
        break;
      case "observacao":
        bucket.observacao.push(raw);
        bucket.meaningful = true;
        break;
      case "address_label":
        bucket.address.label = fill(bucket.address.label ?? "", raw);
        bucket.meaningful = true;
        break;
      case "postal_code":
        bucket.address.postal_code = fill(bucket.address.postal_code ?? "", raw);
        bucket.meaningful = true;
        break;
      case "street":
        bucket.address.street = fill(bucket.address.street ?? "", raw);
        bucket.meaningful = true;
        break;
      case "number":
        bucket.address.number = fill(bucket.address.number ?? "", raw);
        bucket.meaningful = true;
        break;
      case "complement":
        bucket.address.complement = fill(bucket.address.complement ?? "", raw);
        bucket.meaningful = true;
        break;
      case "neighborhood":
        bucket.address.neighborhood = fill(bucket.address.neighborhood ?? "", raw);
        bucket.meaningful = true;
        break;
      case "city":
        bucket.address.city = fill(bucket.address.city ?? "", raw);
        bucket.meaningful = true;
        break;
      case "state":
        bucket.address.state = fill(bucket.address.state ?? "", raw);
        bucket.meaningful = true;
        break;
      case "contact_type":
        bucket.contact.type = fill(bucket.contact.type, raw);
        bucket.meaningful = true;
        break;
      case "contact_name":
        bucket.contact.name = fill(bucket.contact.name, raw);
        bucket.meaningful = true;
        break;
      case "contact_value":
        bucket.contact.value = fill(bucket.contact.value, raw);
        bucket.meaningful = true;
        break;
      default:
        break;
    }
  }
  if (!bucket.meaningful && !bucket.code) return null;
  if (!bucket.meaningful) return null;
  return bucket;
}

function identityScore(bucket: ImportBucket): number {
  let score = 0;
  if (bucket.name) score += 4;
  if (bucket.company) score += 2;
  if (bucket.cpf || bucket.cnpj) score += 2;
  if (bucket.email) score += 1;
  if (bucket.phones.length > 0) score += 1;
  if (bucket.status) score += 1;
  return score;
}

function parseActive(raw: string): string {
  const value = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s/g, "");
  if (!value) return "Ativo";
  if (["sim", "s", "yes", "y", "1", "ativo", "true"].includes(value)) return "Ativo";
  if (["nao", "n", "no", "0", "inativo", "false"].includes(value)) return "Inativo";
  return "Ativo";
}

function normalizePhone(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10) return digits;
  return trimmed.replace(/\s+/g, " ").trim() || undefined;
}

function pickPhone(phones: PhoneCandidate[]): string | undefined {
  const filled = phones.filter((phone) => phone.value.trim());
  const preferred = filled.find((phone) => /celular|whatsapp/.test(phone.headerKey));
  return normalizePhone((preferred ?? filled[0])?.value ?? "");
}

function onlyImportDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function noteDocument(bucket: ImportBucket, message: string) {
  if (!bucket.documentIssues.includes(message)) bucket.documentIssues.push(message);
}

function putCpf(bucket: ImportBucket, raw: string) {
  const digits = onlyImportDigits(raw);
  if (!digits) return;
  if (digits.length !== 11) {
    noteDocument(bucket, "CPF ignorado por tamanho inválido.");
    return;
  }
  if (!isValidCpf(digits)) {
    noteDocument(bucket, "CPF inválido ignorado.");
    return;
  }
  bucket.cpf = fill(bucket.cpf, digits);
}

function putCnpj(bucket: ImportBucket, raw: string) {
  const digits = onlyImportDigits(raw);
  if (!digits) return;
  if (digits.length !== 14) {
    noteDocument(bucket, "CNPJ ignorado por tamanho inválido.");
    return;
  }
  if (!isValidCnpj(digits)) {
    noteDocument(bucket, "CNPJ inválido ignorado.");
    return;
  }
  bucket.cnpj = fill(bucket.cnpj, digits);
}

function putDocumentByLength(bucket: ImportBucket, raw: string) {
  const digits = onlyImportDigits(raw);
  if (!digits) return;
  if (digits.length === 11) putCpf(bucket, digits);
  else if (digits.length === 14) putCnpj(bucket, digits);
  else noteDocument(bucket, "CPF/CNPJ ignorado por tamanho inválido.");
}

function putRg(bucket: ImportBucket, raw: string) {
  const value = raw.trim();
  if (!value) return;
  if (value.length > 20) {
    noteDocument(bucket, "RG ignorado. Use no máximo 20 caracteres.");
    return;
  }
  bucket.rg = fill(bucket.rg, value);
}

function putRazaoSocial(bucket: ImportBucket, raw: string) {
  const value = raw.trim();
  if (!value) return;
  if (value.length > 200) {
    noteDocument(bucket, "Razão social cortada em 200 caracteres.");
    bucket.razaoSocial = fill(bucket.razaoSocial, value.slice(0, 200));
    return;
  }
  bucket.razaoSocial = fill(bucket.razaoSocial, value);
}

function resolveGroupId(groupCell: string, groups: Pick<ClientGroup, "id" | "name">[]): string | undefined {
  const name = groupCell.trim();
  if (!name) return undefined;
  const lower = name.toLowerCase();
  return groups.find((group) => group.name.trim().toLowerCase() === lower)?.id;
}

function hasAddress(address: AddressDraft): boolean {
  return Boolean(address.postal_code || address.street || address.city || address.neighborhood);
}

function normalizeState(raw: string | undefined): string | undefined {
  const value = raw?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{2}$/.test(value)) return value;
  return undefined;
}

function isEmailContact(type: string, value: string): boolean {
  const normalized = normalizeImportHeader(type);
  if (normalized.includes("mail")) return true;
  return EMAIL_RE.test(value.trim());
}

function isPhoneContact(type: string, value: string): boolean {
  if (isEmailContact(type, value)) return false;
  const normalized = normalizeImportHeader(type);
  if (
    normalized.includes("tel") ||
    normalized.includes("cel") ||
    normalized.includes("whats") ||
    normalized.includes("fone")
  ) {
    return true;
  }
  return value.replace(/\D/g, "").length >= 8;
}

function contactNote(contact: ContactDraft): string {
  const who = contact.name.trim();
  const value = contact.value.trim();
  if (who && value) return `Contato (${who}): ${value}`;
  if (value) return `Contato: ${value}`;
  if (who) return `Contato: ${who}`;
  return "";
}

function mergeBuckets(buckets: ImportBucket[]): ImportBucket {
  const ordered = [...buckets].sort((a, b) => identityScore(b) - identityScore(a));
  const merged = emptyBucket(ordered[0].lineNumber, ordered[0].sourceLabel);
  merged.code = ordered.find((bucket) => bucket.code)?.code ?? null;
  for (const bucket of ordered) {
    merged.name = fill(merged.name, bucket.name);
    merged.company = fill(merged.company, bucket.company);
    merged.email = fill(merged.email, bucket.email);
    merged.phones.push(...bucket.phones);
    merged.cpf = fill(merged.cpf, bucket.cpf);
    merged.cnpj = fill(merged.cnpj, bucket.cnpj);
    merged.rg = fill(merged.rg, bucket.rg);
    merged.razaoSocial = fill(merged.razaoSocial, bucket.razaoSocial);
    for (const issue of bucket.documentIssues) noteDocument(merged, issue);
    merged.status = fill(merged.status, bucket.status);
    merged.group = fill(merged.group, bucket.group);
    merged.notes.push(...bucket.notes);
    merged.observacao.push(...bucket.observacao);
    merged.address.label = fill(merged.address.label ?? "", bucket.address.label ?? "");
    merged.address.postal_code = fill(merged.address.postal_code ?? "", bucket.address.postal_code ?? "");
    merged.address.street = fill(merged.address.street ?? "", bucket.address.street ?? "");
    merged.address.number = fill(merged.address.number ?? "", bucket.address.number ?? "");
    merged.address.complement = fill(merged.address.complement ?? "", bucket.address.complement ?? "");
    merged.address.neighborhood = fill(merged.address.neighborhood ?? "", bucket.address.neighborhood ?? "");
    merged.address.city = fill(merged.address.city ?? "", bucket.address.city ?? "");
    merged.address.state = fill(merged.address.state ?? "", bucket.address.state ?? "");
    merged.contact.type = fill(merged.contact.type, bucket.contact.type);
    merged.contact.name = fill(merged.contact.name, bucket.contact.name);
    merged.contact.value = fill(merged.contact.value, bucket.contact.value);
  }
  merged.meaningful = true;
  return merged;
}

function toBuiltRow(
  bucket: ImportBucket,
  groups: Pick<ClientGroup, "id" | "name">[],
): { row?: ClientImportBuiltRow; skip?: CsvImportSkip } {
  const warnings: string[] = [];
  let name = bucket.name.trim();
  const company = bucket.company.trim();
  if (!name && company) name = company;
  if (!name) {
    return {
      skip: {
        line: bucket.lineNumber,
        reason: `${bucket.sourceLabel}: sem nome ou empresa. Endereço e contato entram quando o arquivo de clientes traz o mesmo código.`,
      },
    };
  }

  let email = bucket.email.trim();
  if (email && !EMAIL_RE.test(email)) {
    warnings.push("E-mail inválido ignorado.");
    email = "";
  }

  const phoneFromColumns = pickPhone(bucket.phones);
  let phone = phoneFromColumns;
  const contactValue = bucket.contact.value.trim();
  if (contactValue || bucket.contact.name.trim()) {
    if (isPhoneContact(bucket.contact.type, contactValue) && contactValue) {
      const contactPhone = normalizePhone(contactValue);
      if (!phone && contactPhone) phone = contactPhone;
      else {
        const note = contactNote(bucket.contact);
        if (note) bucket.observacao.push(note);
      }
    } else if (isEmailContact(bucket.contact.type, contactValue) && contactValue) {
      if (!email && EMAIL_RE.test(contactValue)) email = contactValue.trim();
      else {
        const note = contactNote(bucket.contact);
        if (note) bucket.observacao.push(note);
      }
    } else {
      const note = contactNote(bucket.contact);
      if (note) bucket.observacao.push(note);
    }
  }

  warnings.push(...bucket.documentIssues);

  const payload: ClientData = {
    name,
    status: parseActive(bucket.status),
  };
  if (company) payload.company = company;
  if (email) payload.email = email;
  if (phone) payload.phone = phone;
  if (bucket.cpf) payload.cpf = bucket.cpf;
  if (bucket.cnpj) payload.cnpj = bucket.cnpj;
  if (bucket.rg) payload.rg = bucket.rg;
  if (bucket.razaoSocial) payload.razao_social = bucket.razaoSocial;
  if (bucket.cpf) payload.billing_document = "cpf";
  else if (bucket.cnpj) payload.billing_document = "cnpj";

  const notes = [...new Set(bucket.notes.map((item) => item.trim()).filter(Boolean))];
  const observacao = [...new Set(bucket.observacao.map((item) => item.trim()).filter(Boolean))];
  if (notes.length > 0) payload.notes = notes.join("\n");
  if (observacao.length > 0) payload.observacao = observacao.join("\n");

  const groupName = bucket.group.trim();
  if (groupName) {
    const groupId = resolveGroupId(groupName, groups);
    if (groupId) payload.group_id = groupId;
    else warnings.push(`Grupo «${groupName}» não encontrado.`);
  }

  let address: ClientAddressInput | undefined;
  if (hasAddress(bucket.address)) {
    address = { label: bucket.address.label?.trim() || "Principal", is_default: true };
    if (bucket.address.postal_code) address.postal_code = bucket.address.postal_code;
    if (bucket.address.street) address.street = bucket.address.street;
    if (bucket.address.number) address.number = bucket.address.number;
    if (bucket.address.complement) address.complement = bucket.address.complement;
    if (bucket.address.neighborhood) address.neighborhood = bucket.address.neighborhood;
    if (bucket.address.city) address.city = bucket.address.city;
    const state = normalizeState(bucket.address.state);
    if (state) address.state = state;
    else if (bucket.address.state?.trim()) warnings.push("UF ignorada. Use a sigla com 2 letras.");
  }

  return {
    row: {
      lineNumber: bucket.lineNumber,
      sourceLabel: bucket.sourceLabel,
      payload,
      address,
      warnings,
    },
  };
}

export function buildClientImportPlan(
  files: ClientImportFile[],
  mappings: ClientImportColumnMapping[],
  groups: Pick<ClientGroup, "id" | "name">[],
): { prepared: ClientImportBuiltRow[]; skipped: CsvImportSkip[] } {
  const skipped: CsvImportSkip[] = [];
  const buckets: ImportBucket[] = [];

  const usable = files.filter((file) => (activeImportSheet(file)?.headers.length ?? 0) > 0);
  if (usable.length === 0) {
    return {
      prepared: [],
      skipped: [{ line: 1, reason: "Arquivo vazio ou sem cabeçalho." }],
    };
  }

  for (const file of usable) {
    const sheet = activeImportSheet(file);
    if (!sheet) continue;
    if (sheet.truncated) {
      skipped.push({
        line: MAX_DATA_ROWS + 2,
        reason: `${file.fileName}: importação limitada às primeiras ${MAX_DATA_ROWS} linhas.`,
      });
    }
    sheet.rows.forEach((row, index) => {
      const bucket = readBucket(file, sheet, index, row, mappings);
      if (bucket) buckets.push(bucket);
    });
  }

  const groupsByCode = new Map<string, ImportBucket[]>();
  const singles: ImportBucket[] = [];
  for (const bucket of buckets) {
    const code = bucket.code?.trim();
    if (!code) {
      singles.push(bucket);
      continue;
    }
    const key = normalizeImportHeader(code);
    const list = groupsByCode.get(key) ?? [];
    list.push(bucket);
    groupsByCode.set(key, list);
  }

  const prepared: ClientImportBuiltRow[] = [];
  const merged = [...singles, ...groupsByCode.values()].map((entry) =>
    Array.isArray(entry) ? mergeBuckets(entry) : entry,
  );

  for (const bucket of merged) {
    const result = toBuiltRow(bucket, groups);
    if (result.skip) skipped.push(result.skip);
    else if (result.row) prepared.push(result.row);
  }

  if (prepared.length === 0 && skipped.length === 0) {
    skipped.push({ line: 1, reason: "Arquivo vazio ou sem linhas de dados." });
  }

  return { prepared, skipped };
}

export function prepareClientsFromCsv(
  csvText: string,
  groups: Pick<ClientGroup, "id" | "name">[],
): { prepared: CsvImportPreparedRow[]; skipped: CsvImportSkip[] } {
  const file = parseClientImportCsvText("csv", "arquivo.csv", csvText);
  const mappings = suggestColumns(file);
  const { prepared, skipped } = buildClientImportPlan([file], mappings, groups);
  return {
    prepared: prepared.map((row) => ({ lineNumber: row.lineNumber, payload: row.payload })),
    skipped,
  };
}
