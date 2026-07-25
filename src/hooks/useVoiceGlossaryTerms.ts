import { useMemo } from "react";
import { useAuth } from "../components/AuthProvider";
import { useSyncedStorage } from "./useSyncedStorage";
import type {
  ChecklistItem,
  ChecklistSectionMeta,
  CustomCategory,
  CustomEntry,
  OACase,
  Payer,
  PaymentEntry,
  Platform,
} from "../lib/types";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "into",
  "note",
  "notes",
  "link",
  "links",
  "task",
  "tasks",
  "case",
  "cases",
  "card",
  "cards",
]);

function cleanTerm(value?: string) {
  return (value ?? "")
    .replace(/[|｜]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addTerm(terms: Set<string>, value?: string) {
  const term = cleanTerm(value);
  if (term.length < 2 || term.length > 60) return;
  if (/^\d+$/.test(term)) return;
  if (STOPWORDS.has(term.toLowerCase())) return;
  terms.add(term);
}

function addEnglishKeywords(terms: Set<string>, value?: string) {
  const text = value ?? "";
  const matches = text.match(/[A-Za-z][A-Za-z0-9&'’.-]*(?:\s+[A-Za-z][A-Za-z0-9&'’.-]*){0,3}/g) ?? [];
  for (const match of matches) {
    addTerm(terms, match);
  }
}

function addStructuredText(terms: Set<string>, value?: string) {
  const text = cleanTerm(value);
  if (!text) return;
  if (text.length <= 40 && !/[.!?。！？]/.test(text)) addTerm(terms, text);
  addEnglishKeywords(terms, text);
}

function addCustomEntryTerms(terms: Set<string>, entry: CustomEntry) {
  addStructuredText(terms, entry.title);
  addStructuredText(terms, entry.payer);
  addStructuredText(terms, entry.summary);
  for (const tag of entry.tags) addStructuredText(terms, tag);
  for (const portal of entry.portals ?? []) addStructuredText(terms, portal.name);
}

function addPaymentTerms(terms: Set<string>, entry: PaymentEntry) {
  addStructuredText(terms, entry.payer);
  for (const portal of entry.portals) addStructuredText(terms, portal.name);
}

function addOACaseTerms(terms: Set<string>, entry: OACase) {
  addStructuredText(terms, entry.title);
  addStructuredText(terms, entry.payer);
  for (const tag of entry.tags) addStructuredText(terms, tag);
}

export function useVoiceGlossaryTerms() {
  const { workspace } = useAuth();
  const [customCategories] = useSyncedStorage<CustomCategory[]>("lh-custom-categories", []);
  const [customEntries] = useSyncedStorage<Record<string, CustomEntry[]>>("lh-custom-entries", {});
  const [checklistSections] = useSyncedStorage<ChecklistSectionMeta[]>(
    "lh-checklist-custom-sections",
    [],
  );
  const [checklistItems] = useSyncedStorage<Record<string, ChecklistItem[]>>(
    "lh-checklist-custom-items",
    {},
  );
  const [oaCaseOverrides] = useSyncedStorage<Record<string, OACase>>(
    "lh-oacases-overrides",
    {},
  );
  const [customOACases] = useSyncedStorage<OACase[]>("lh-oacases-custom", []);
  const [paymentOverrides] = useSyncedStorage<Record<string, PaymentEntry>>(
    "lh-payments-overrides",
    {},
  );
  const [customPayments] = useSyncedStorage<PaymentEntry[]>("lh-payments-custom", []);
  const [payers] = useSyncedStorage<Payer[]>("lh-payers", []);
  const [platforms] = useSyncedStorage<Platform[]>("lh-platforms", []);

  return useMemo(() => {
    const terms = new Set<string>();
    addStructuredText(terms, workspace?.name);

    for (const category of customCategories) addStructuredText(terms, category.title);
    for (const entries of Object.values(customEntries)) {
      for (const entry of entries) addCustomEntryTerms(terms, entry);
    }

    for (const section of checklistSections) addStructuredText(terms, section.title);
    for (const items of Object.values(checklistItems)) {
      for (const item of items) {
        addStructuredText(terms, item.label);
        addEnglishKeywords(terms, item.detail);
      }
    }

    for (const entry of Object.values(oaCaseOverrides)) addOACaseTerms(terms, entry);
    for (const entry of customOACases) addOACaseTerms(terms, entry);
    for (const entry of Object.values(paymentOverrides)) addPaymentTerms(terms, entry);
    for (const entry of customPayments) addPaymentTerms(terms, entry);
    for (const payer of payers) addStructuredText(terms, payer.name);
    for (const platform of platforms) addStructuredText(terms, platform.name);

    return Array.from(terms).sort((a, b) => b.length - a.length).slice(0, 160);
  }, [
    checklistItems,
    checklistSections,
    customCategories,
    customEntries,
    customOACases,
    customPayments,
    oaCaseOverrides,
    payers,
    paymentOverrides,
    platforms,
    workspace?.name,
  ]);
}
