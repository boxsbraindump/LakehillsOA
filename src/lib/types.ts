export type Category = "checklist" | "oa-cases" | "payments";

export interface ChecklistItem {
  id: string;
  label: string;
  detail?: string;
}

export interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface OACase {
  id: string;
  title: string;
  payer: string;
  tags: string[];
  summary: string;
  resolution: string;
}

export interface PaymentSection {
  id: string;
  title: string;
  steps: string[];
  notes?: string;
}

export interface SearchDoc {
  id: string;
  category: Category;
  path: string;
  title: string;
  snippet: string;
  keywords: string[];
}
