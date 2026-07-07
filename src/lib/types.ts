export type Category = "checklist" | "oa-cases" | "payments" | "custom";

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

export interface Payer {
  id: string;
  name: string;
  payerId: string;
}

export type CustomCategoryIcon = "folder" | "shield" | "book-open" | "landmark" | "help-circle";

export interface CustomCategory {
  id: string;
  title: string;
  icon: CustomCategoryIcon;
}

export interface CustomEntry {
  id: string;
  title: string;
  notes?: string;
  tags: string[];
}

export interface SearchDoc {
  id: string;
  category: Category;
  /** Only set when category is "custom" — the live folder name, since it has no static translation. */
  categoryTitle?: string;
  path: string;
  title: string;
  snippet: string;
  keywords: string[];
}

export interface TrashEntry {
  trashId: string;
  category: Category;
  /** "section" means a whole top-level group was deleted rather than one item — used for both checklist sections and whole custom categories. Defaults to "item". */
  entryType?: "item" | "section";
  itemId: string;
  /** Which checklist section / custom category an item-entry came from — only set for "checklist" and "custom" item entries. */
  sectionId?: string;
  /** Snapshot of the custom category's title at delete time — only set for category "custom" (both item and whole-category entries), since the live category may be renamed or gone by the time this is displayed. */
  categoryTitle?: string;
  /** Whether the item was user-added (its data lives only in this trash record) vs. built-in (just hidden). Always true for category "custom", since there's no seed data to hide. */
  wasCustom: boolean;
  deletedAt: number;
  title: string;
  snapshot: ChecklistItem | OACase | PaymentEntry | ChecklistSection | CustomEntry | { category: CustomCategory; entries: CustomEntry[] };
}
