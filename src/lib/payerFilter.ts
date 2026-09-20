/**
 * "Show me everything about Kaiser."
 *
 * Records carry an insurer two different ways. OA cases and payment entries have a real
 * `payer` field, but the folder entries where most knowledge actually lives do not — measured
 * on the live workspace: every OA case had a payer set, and not one of thirty folder entries
 * did, while thirteen of them named an insurer in their text. A filter that only honoured the
 * field would have come back nearly empty and left a tagging chore behind it, which is the
 * reason jobs like this never get done.
 *
 * So both count, and they are kept apart on screen: tagged records are certain, mentions are
 * a read of the text. Tagging a mention promotes it, so the list sharpens with use rather
 * than demanding a day's work up front.
 */
import { compactForSearch } from "./searchIndex";
import type { SearchDoc } from "./types";

/**
 * Words that carry no insurer identity on their own. Without this, "Community Health Plan of
 * WA" would claim every record containing the word "health".
 */
const GENERIC_TOKENS = new Set([
  "health",
  "healthcare",
  "plan",
  "plans",
  "care",
  "medical",
  "insurance",
  "group",
  "inc",
  "llc",
  "the",
  "and",
  "of",
  "wa",
  "washington",
  "state",
  "first",
  "choice",
  "united",
  "national",
  "american",
  "life",
  "mutual",
  "company",
]);

/**
 * The strings worth looking for when hunting mentions of a payer. "Kaiser Permanente" has to
 * find text that only says "Kaiser"; "Ambetter-Coordinated Care" has to find "Ambetter".
 */
export function payerAliases(payer: string): string[] {
  const full = payer.trim();
  if (!full) return [];
  // A parenthesised qualifier annotates the entry rather than naming the insurer. Left in,
  // "Medicare Advantage (various)" would claim every record containing the word "various".
  const identity = full.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const aliases = new Set<string>([full]);
  if (identity) aliases.add(identity);
  for (const token of identity.split(/[\s/,&-]+/)) {
    const clean = token.replace(/[^A-Za-z0-9]/g, "");
    if (clean.length < 4) continue;
    if (GENERIC_TOKENS.has(clean.toLowerCase())) continue;
    aliases.add(clean);
  }
  return [...aliases];
}

/** Same normalisation the search box uses, so spacing and case never decide a match. */
function contains(haystack: string, needle: string): boolean {
  const h = compactForSearch(haystack);
  const n = compactForSearch(needle);
  return n.length > 0 && h.includes(n);
}

export function docMentionsPayer(doc: SearchDoc, payer: string): boolean {
  const text = [doc.title, doc.snippet, doc.body ?? "", doc.keywords.join(" ")].join(" ");
  return payerAliases(payer).some((alias) => contains(text, alias));
}

export function docTaggedWithPayer(doc: SearchDoc, payer: string): boolean {
  if (!doc.payer) return false;
  return compactForSearch(doc.payer) === compactForSearch(payer);
}

export interface PayerMatches {
  tagged: SearchDoc[];
  mentioned: SearchDoc[];
}

export function matchDocsForPayer(docs: SearchDoc[], payer: string): PayerMatches {
  const tagged: SearchDoc[] = [];
  const mentioned: SearchDoc[] = [];
  for (const doc of docs) {
    if (docTaggedWithPayer(doc, payer)) tagged.push(doc);
    // A record already listed above must not appear twice.
    else if (docMentionsPayer(doc, payer)) mentioned.push(doc);
  }
  return { tagged, mentioned };
}

export interface PayerSummary {
  name: string;
  tagged: number;
  mentioned: number;
  /** True when nothing carries this payer as a field — it exists only in the directory. */
  fromDirectoryOnly: boolean;
}

/**
 * The list of insurers to offer. Built from whatever the records already say plus the Payer
 * directory, so it is useful before anyone has set anything up — the directory was empty on
 * the live workspace, and waiting for it to be filled would have meant an empty page.
 */
export function collectPayers(docs: SearchDoc[], directoryNames: string[] = []): PayerSummary[] {
  const seen: string[] = [];
  for (const name of [...docs.map((d) => d.payer ?? ""), ...directoryNames]) {
    const trimmed = name.trim();
    if (trimmed && !seen.includes(trimmed)) seen.push(trimmed);
  }

  // "Kaiser" from the directory and "Kaiser Permanente" on the records are one insurer, and
  // offering both would recreate the fragmentation this page exists to remove. When one
  // spelling starts with another, they are folded together under the fuller name.
  const byKey = new Map<string, string>();
  for (const name of [...seen].sort((a, b) => b.length - a.length)) {
    const key = compactForSearch(name);
    const merged = [...byKey.keys()].find((kept) => kept.startsWith(key) || key.startsWith(kept));
    if (merged) {
      if (key.length > merged.length) {
        byKey.delete(merged);
        byKey.set(key, name);
      }
      continue;
    }
    byKey.set(key, name);
  }

  const taggedKeys = new Set(docs.filter((d) => d.payer).map((d) => compactForSearch(d.payer!)));

  return [...byKey.values()]
    .map((name) => {
      const { tagged, mentioned } = matchDocsForPayer(docs, name);
      return {
        name,
        tagged: tagged.length,
        mentioned: mentioned.length,
        fromDirectoryOnly: !taggedKeys.has(compactForSearch(name)),
      };
    })
    .sort((a, b) => b.tagged + b.mentioned - (a.tagged + a.mentioned) || a.name.localeCompare(b.name));
}
