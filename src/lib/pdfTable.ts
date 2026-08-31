/**
 * Turns a printed report back into a table.
 *
 * The clinic's practice software has no CSV export, so the only way out is the browser's
 * print-to-PDF. That PDF does carry a real text layer, but dragging the file onto the page
 * just makes the browser navigate to it, and asking someone to open a viewer, select the
 * table by hand and copy is a step that fails quietly. Reading the file here removes all of
 * that: pick the PDF, get the table.
 *
 * Nothing leaves the machine — pdf.js runs in the browser, which matters when the rows are
 * patient balances.
 */

interface PdfTextItem {
  str: string;
  /** [a, b, c, d, x, y] — only the translation and vertical scale are needed here. */
  transform: number[];
  width?: number;
  height?: number;
}

/** pdf.js is well over a megabyte, and most imports are a paste. Fetch it only on demand. */
async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

interface PlacedCell {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

/**
 * A PDF has no rows or columns, only glyphs at coordinates. Everything sharing a baseline is
 * one row; within it, a gap wide relative to the type size is a column break and a narrow one
 * is just letter spacing inside a single cell.
 */
function rowsFromCells(cells: PlacedCell[]): string[] {
  const rows: { y: number; cells: PlacedCell[] }[] = [];
  for (const cell of cells) {
    const tolerance = Math.max(2, cell.height * 0.4);
    const row = rows.find((candidate) => Math.abs(candidate.y - cell.y) <= tolerance);
    if (row) row.cells.push(cell);
    else rows.push({ y: cell.y, cells: [cell] });
  }

  // PDF y grows upward, so the top of the page is the largest value.
  rows.sort((a, b) => b.y - a.y);

  return rows.map((row) => {
    row.cells.sort((a, b) => a.x - b.x);
    let line = "";
    let previous: PlacedCell | null = null;
    for (const cell of row.cells) {
      if (previous) {
        const gap = cell.x - (previous.x + previous.width);
        const columnBreak = Math.max(3, previous.height * 0.6);
        line += gap > columnBreak ? "\t" : gap > 0.4 ? " " : "";
      }
      line += cell.text;
      previous = cell;
    }
    return line.replace(/[ \t]+$/, "");
  });
}

export interface PdfTableResult {
  /** Tab-delimited text, ready for the same parser a pasted table goes through. */
  text: string;
  pageCount: number;
}

export async function pdfToTable(file: File): Promise<PdfTableResult> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  // destroy() lives on the loading task, not the document, and it is what shuts the worker down.
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  // Read before the task is destroyed below; afterwards the document is gone.
  const pageCount = doc.numPages;
  const lines: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const cells: PlacedCell[] = [];
      for (const raw of content.items as PdfTextItem[]) {
        if (typeof raw.str !== "string" || !raw.str.trim()) continue;
        if (!Array.isArray(raw.transform)) continue;
        cells.push({
          x: raw.transform[4],
          y: raw.transform[5],
          width: raw.width ?? 0,
          height: raw.height || Math.abs(raw.transform[3]) || 10,
          text: raw.str,
        });
      }
      lines.push(...rowsFromCells(cells));
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }

  return { text: lines.join("\n"), pageCount };
}
