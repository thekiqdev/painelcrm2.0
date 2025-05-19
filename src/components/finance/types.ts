
export interface Invoice {
  id: string;
  clientName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: "draft" | "pending" | "paid" | "overdue";
  items: InvoiceItem[];
  total: number;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  isPaid: boolean;
  notes?: string;
}
