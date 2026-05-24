export type ContractPdfExtraPage = {
  id: string;
  page_order: number;
  virtual_page: number;
  html_snapshot: string;
  editor_json?: Record<string, unknown>;
};

export type ContractPdfEditorState = {
  source_pdf_page_count: number;
  pdf_page_count: number;
  extra_pages: ContractPdfExtraPage[];
  fields: import('@/types/contracts').ContractSignatureField[];
  document_kind: string;
};
