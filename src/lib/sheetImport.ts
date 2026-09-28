/**
 * Reading a spreadsheet file the clinic actually has.
 *
 * The other clinic keeps its bookings in Excel, and the first attempt at import only accepted
 * text pasted out of one. That failed twice over: there was nowhere to put an .xlsx at all, and
 * a Chinese-locale Excel writes its dates as "2026/10/2", which the date reader did not know.
 * Retyping is the data-entry step this tool exists to remove, so the file itself is read.
 *
 * No dependency: an .xlsx is a ZIP of XML, and the browser can already inflate (and so can
 * Node). The output is tab-separated text, which is exactly what pasting cells produces — so
 * both routes end up in the same parser and there is only one thing to get right.
 */

const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;

/** Excel's own epoch, offset for the 1900 leap-year bug it has never fixed. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/** The built-in number formats that mean "this is a date". */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

function readZipEntries(view: DataView): ZipEntry[] {
  // The end-of-central-directory record lives in the last 64KB, after a variable-length
  // comment, so it is found by scanning backwards for its signature.
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= 0 && i > view.byteLength - 65558; i -= 1) {
    if (view.getUint32(i, true) === ZIP_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip");

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(at, true) !== ZIP_CENTRAL) break;
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    entries.push({
      name: decoder.decode(new Uint8Array(view.buffer, view.byteOffset + at + 46, nameLength)),
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      localOffset: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readEntry(view: DataView, entry: ZipEntry): Promise<string> {
  // The central directory's name/extra lengths are not always the local header's, so the data
  // offset has to be read from the local header itself.
  const local = entry.localOffset;
  const nameLength = view.getUint16(local + 26, true);
  const extraLength = view.getUint16(local + 28, true);
  const start = local + 30 + nameLength + extraLength;
  const raw = new Uint8Array(view.buffer, view.byteOffset + start, entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method !== 8) throw new Error(`unsupported zip method ${entry.method}`);

  // Copied out of the file's buffer: a Blob part must own its bytes, and `raw` is a view.
  const bytes = raw.slice().buffer as ArrayBuffer;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

/** `<t>` runs inside one shared string, concatenated — Excel splits styled text across several. */
function sharedStringsFrom(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(([, body]) =>
    [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(([, text]) => unescapeXml(text)).join(""),
  );
}

/**
 * Which cell styles mean a date.
 *
 * A date in a sheet is just a number; only its number format says otherwise. Without this a
 * visit date imports as 46296.
 */
function dateStylesFrom(xml: string): Set<number> {
  const custom = new Map<number, string>();
  for (const [, id, code] of xml.matchAll(
    /<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g,
  )) {
    custom.set(Number(id), code);
  }

  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const dateStyles = new Set<number>();
  let index = 0;
  for (const [, attrs] of cellXfs.matchAll(/<xf\b([^>]*)\/?>/g)) {
    const id = Number(/numFmtId="(\d+)"/.exec(attrs)?.[1] ?? "0");
    const code = custom.get(id);
    // A custom format is a date when it places days or years; "h:mm" alone is not one.
    const looksLikeDate = code !== undefined && /[dy]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, ""));
    if (BUILTIN_DATE_FORMATS.has(id) || looksLikeDate) dateStyles.add(index);
    index += 1;
  }
  return dateStyles;
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function serialToDateKey(serial: number): string {
  const date = new Date(EXCEL_EPOCH_UTC + Math.round(serial) * 86400000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sheetToTsv(xml: string, shared: string[], dateStyles: Set<number>): string {
  const rows: string[] = [];
  for (const [, rowBody] of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const [, attrs, body] of rowBody.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const type = /\bt="([^"]*)"/.exec(attrs)?.[1] ?? "n";
      const style = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? "-1");
      const inner = body ?? "";
      const value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];

      if (type === "s") {
        cells.push(shared[Number(value)] ?? "");
      } else if (type === "inlineStr") {
        cells.push(
          [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(([, t]) => unescapeXml(t)).join(""),
        );
      } else if (value === undefined) {
        cells.push("");
      } else if (dateStyles.has(style) && value !== "" && Number.isFinite(Number(value))) {
        cells.push(serialToDateKey(Number(value)));
      } else {
        cells.push(unescapeXml(value));
      }
    }
    if (cells.some((cell) => cell.trim())) rows.push(cells.join("\t"));
  }
  return rows.join("\n");
}

export interface SheetImport {
  /** Tab-separated, exactly like pasting the cells. */
  text: string;
  kind: "xlsx" | "text";
  rows: number;
}

export async function readSheetFile(file: File): Promise<SheetImport> {
  const name = file.name.toLowerCase();

  if (!name.endsWith(".xlsx") && !name.endsWith(".xlsm")) {
    // .csv, .tsv, .txt — already text. Commas are left alone; the row parser handles them.
    const text = await file.text();
    return { text, kind: "text", rows: text.split(/\r?\n/).filter((l) => l.trim()).length };
  }

  const view = new DataView(await file.arrayBuffer());
  const entries = readZipEntries(view);

  const sheetEntry =
    entries.find((e) => /^xl\/worksheets\/sheet1\.xml$/i.test(e.name)) ??
    entries.find((e) => /^xl\/worksheets\/.*\.xml$/i.test(e.name));
  if (!sheetEntry) throw new Error("no worksheet in this file");

  const stringsEntry = entries.find((e) => /^xl\/sharedStrings\.xml$/i.test(e.name));
  const stylesEntry = entries.find((e) => /^xl\/styles\.xml$/i.test(e.name));

  const [sheetXml, stringsXml, stylesXml] = await Promise.all([
    readEntry(view, sheetEntry),
    stringsEntry ? readEntry(view, stringsEntry) : Promise.resolve(""),
    stylesEntry ? readEntry(view, stylesEntry) : Promise.resolve(""),
  ]);

  const text = sheetToTsv(sheetXml, sharedStringsFrom(stringsXml), dateStylesFrom(stylesXml));
  return { text, kind: "xlsx", rows: text.split("\n").filter((l) => l.trim()).length };
}
