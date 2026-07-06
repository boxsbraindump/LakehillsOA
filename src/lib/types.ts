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

/** A user-added section holds only metadata — its items live in the customItems map, keyed by this id. */
export interface ChecklistSectionMeta {
  id: string;
  title: string;
}

export interface OACase {
  id: string;
  title: string;
  payer: string;
  tags: string[];
  summary: string;
  resolution: string;
}

export interface PaymentPortal {
  name: string;
  url: string;
}

export interface PaymentEntry {
  id: string;
  payer: string;
  portals: PaymentPortal[];
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

export interface TrashEntry {
  trashId: string;
  category: Category;
  /** "section" only applies to category "checklist" — deleting a whole section rather than one item. Defaults to "item". */
  entryType?: "item" | "section";
  itemId: string;
  /** Which checklist section an item-entry came from — only set for category "checklist" item entries. */
  sectionId?: string;
  /** Whether the item was user-added (its data lives only in this trash record) vs. built-in (just hidden). */
  wasCustom: boolean;
  deletedAt: number;
  title: string;
  snapshot: ChecklistItem | OACase | PaymentEntry | ChecklistSection;
}
