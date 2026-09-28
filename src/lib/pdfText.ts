/**
 * Text out of a PDF, kept in lines.
 *
 * A medical EOB is a PDF, and not one you can usefully select and copy out of — the clinic
 * tried. So the remittance matcher is fed from the file itself instead of from the clipboard.
 *
 * Lines matter more than words here: {@link matchRemittance} asks "is this patient named on
 * this line, and what service date does that line state", so a name and its date have to come
 * back on the same line. pdf.js hands back positioned fragments in no particular order, so they
 * are grouped by their y coordinate and sorted left to right — reconstructing rows, not
 * columns. Nothing tries to understand the layout beyond that; the matcher searches the text.
 */

/** Fragments within this many PDF points of each other count as the same line. */
const LINE_TOLERANCE = 3;

export interface PdfText {
  text: string;
  pages: number;
  /** A PDF of scans has pages but no text layer — worth saying out loud rather than matching zero. */
  hasTextLayer: boolean;
}

export async function extractPdfText(file: File | ArrayBuffer): Promise<PdfText> {
  // Lazily imported so pdf.js is a separate chunk: most visits to this page never open an EOB.
  const pdfjs = await import("pdfjs-dist");
  // `?url` is how the bundler is asked for the worker's built path. A bare specifier inside
  // `new URL(...)` is NOT resolved — it silently becomes a path next to this module, and the
  // worker then 404s at the first EOB.
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;

  const pageTexts: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    const lines: { y: number; parts: { x: number; str: string }[] }[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const x = item.transform[4] as number;
      const y = item.transform[5] as number;
      const line = lines.find((l) => Math.abs(l.y - y) <= LINE_TOLERANCE);
      if (line) line.parts.push({ x, str: item.str });
      else lines.push({ y, parts: [{ x, str: item.str }] });
    }

    pageTexts.push(
      lines
        .sort((a, b) => b.y - a.y)
        .map((line) =>
          line.parts
            .sort((a, b) => a.x - b.x)
            .map((part) => part.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter((line) => line.length > 0)
        .join("\n"),
    );
  }

  const text = pageTexts.join("\n");
  return { text, pages: doc.numPages, hasTextLayer: text.trim().length > 0 };
}
