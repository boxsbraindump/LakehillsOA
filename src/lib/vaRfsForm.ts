/**
 * Fills page 1 of VA Form 10-10172 (Community Care Provider — Medical Request for Service).
 *
 * VA patients who run out of authorised visits need a new RFS each time, and the form is a
 * flat PDF with no fillable fields, so it was being written out by hand. Twelve of its
 * twenty-two boxes never change — the clinic's own details, the NPI, "not within 48 hours",
 * "not a referral", "yes, a continuation of care" — which is most of the writing and all of
 * the tedium. Those are held once; only the handful that actually differ get typed.
 *
 * Values are drawn onto the real form rather than onto a lookalike, because the VA facility
 * receives the form it expects. Coordinates are in PDF points against the MAR 2025 revision,
 * origin bottom-left: if VA reissues the form these need checking, which is why
 * `FORM_REVISION` is stated here rather than left implicit.
 */
/** pdf-lib is only needed when a form is actually generated, so it loads on demand. */
async function loadPdfLib() {
  return import("pdf-lib");
}

export const FORM_REVISION = "MAR 2025";
export const FORM_ASSET = "va-form-10-10172.pdf";

/** The clinic's own boxes: typed once in Settings, identical on every request. */
export interface RfsClinicDefaults {
  providerOffice: string;
  providerOfficeLine2: string;
  phone: string;
  fax: string;
  email: string;
  providerName: string;
  npi: string;
  /** Box 3. Held as a default because it is the same VA facility nearly every time. */
  vaFacility: string;
  /** Box 16, effectively always "Acupuncture". */
  cptDescription: string;
  /** Box 15 — the codes the clinic usually bills. */
  cptCodes: string;
  /** Box 18. One sentence in practice, but editable per request. */
  reason: string;
}

export const EMPTY_RFS_DEFAULTS: RfsClinicDefaults = {
  providerOffice: "",
  providerOfficeLine2: "",
  phone: "",
  fax: "",
  email: "",
  providerName: "",
  npi: "",
  vaFacility: "",
  cptDescription: "Acupuncture",
  cptCodes: "",
  reason: "Patient would like to continue acupuncture treatment.",
};

/** The boxes that genuinely differ from one veteran to the next. */
export interface RfsPatientFields {
  veteranName: string;
  dateOfBirth: string;
  vaFacility: string;
  authorizationNumber: string;
  icd10: string;
  diagnosisDescription: string;
  cptCodes: string;
  cptDescription: string;
  reason: string;
  todaysDate: string;
}

interface Placement {
  x: number;
  y: number;
  size?: number;
  maxWidth?: number;
}

/**
 * Derived from the label positions in the blank form: a value sits just under its label,
 * inside the same box. Checkbox marks sit on the little square to the left of NO/YES.
 */
const PLACE = {
  veteranName: { x: 40, y: 645, maxWidth: 372 },
  dateOfBirth: { x: 424, y: 645, maxWidth: 168 },
  vaFacility: { x: 40, y: 622, maxWidth: 372 },
  authorizationNumber: { x: 424, y: 622, maxWidth: 168 },
  providerOffice: { x: 40, y: 597, maxWidth: 372 },
  providerOfficeLine2: { x: 40, y: 584, maxWidth: 372 },
  phone: { x: 40, y: 537, maxWidth: 150 },
  fax: { x: 202, y: 537, maxWidth: 140 },
  email: { x: 352, y: 545, maxWidth: 250, size: 8 },
  icd10: { x: 40, y: 430, maxWidth: 130 },
  diagnosisDescription: { x: 178, y: 430, maxWidth: 130 },
  cptCodes: { x: 316, y: 430, maxWidth: 130 },
  cptDescription: { x: 454, y: 430, maxWidth: 130 },
  reason: { x: 46, y: 340, maxWidth: 520 },
  providerName: { x: 40, y: 177, maxWidth: 372 },
  npi: { x: 424, y: 177, maxWidth: 168 },
  todaysDate: { x: 424, y: 153, maxWidth: 168 },
} satisfies Record<string, Placement>;

/** Squares next to the answers that are always the same: 6 NO, 10 NO, 11 YES, 12 NO. */
const CHECKS = {
  ihsNo: { x: 425.5, y: 585.5 },
  within48No: { x: 41.5, y: 501.5 },
  continuationYes: { x: 462, y: 495.5 },
  referralNo: { x: 41.5, y: 465.5 },
};

const DEFAULT_SIZE = 10;

/** Breaks a paragraph to the box width so box 18 cannot run off the edge of the form. */
function wrap(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface FillRfsInput {
  defaults: RfsClinicDefaults;
  patient: RfsPatientFields;
  /** The blank form's bytes, fetched from the app's own assets. */
  formBytes: ArrayBuffer | Uint8Array;
}

export async function fillRfsForm({ defaults, patient, formBytes }: FillRfsInput): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
  const pdf = await PDFDocument.load(formBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.getPages()[0];
  const ink = rgb(0.05, 0.08, 0.35);

  const draw = (value: string, place: Placement) => {
    const text = value.trim();
    if (!text) return;
    let size = place.size ?? DEFAULT_SIZE;
    // Shrink rather than overflow: a number running into the next box is worse than small type.
    if (place.maxWidth) {
      while (size > 6 && font.widthOfTextAtSize(text, size) > place.maxWidth) size -= 0.5;
    }
    page.drawText(text, { x: place.x, y: place.y, size, font, color: ink });
  };

  draw(patient.veteranName, PLACE.veteranName);
  draw(patient.dateOfBirth, PLACE.dateOfBirth);
  draw(patient.vaFacility || defaults.vaFacility, PLACE.vaFacility);
  draw(patient.authorizationNumber, PLACE.authorizationNumber);
  draw(defaults.providerOffice, PLACE.providerOffice);
  draw(defaults.providerOfficeLine2, PLACE.providerOfficeLine2);
  draw(defaults.phone, PLACE.phone);
  draw(defaults.fax, PLACE.fax);
  draw(defaults.email, PLACE.email);
  draw(patient.icd10, PLACE.icd10);
  draw(patient.diagnosisDescription, PLACE.diagnosisDescription);
  draw(patient.cptCodes || defaults.cptCodes, PLACE.cptCodes);
  draw(patient.cptDescription || defaults.cptDescription, PLACE.cptDescription);
  draw(defaults.providerName, PLACE.providerName);
  draw(defaults.npi, PLACE.npi);
  draw(patient.todaysDate, PLACE.todaysDate);

  // Box 18 is the only multi-line box on the page.
  const reason = (patient.reason || defaults.reason).trim();
  if (reason) {
    const size = 10;
    wrap(reason, font, size, PLACE.reason.maxWidth).forEach((line, index) => {
      page.drawText(line, {
        x: PLACE.reason.x,
        y: PLACE.reason.y - index * (size + 3),
        size,
        font,
        color: ink,
      });
    });
  }

  for (const box of Object.values(CHECKS)) {
    page.drawText("X", { x: box.x, y: box.y, size: 9, font, color: ink });
  }

  // 21 is left empty on purpose: the form wants a signature, so it gets printed and signed.
  return pdf.save();
}

/** A filename the front desk can find again without opening it. */
export function rfsFileName(veteranName: string, todaysDate: string): string {
  const surname = veteranName.includes(",")
    ? veteranName.split(",")[0]
    : veteranName.trim().split(/\s+/).slice(-1)[0] || "patient";
  const safe = surname.replace(/[^A-Za-z0-9-]/g, "").slice(0, 24) || "patient";
  const date = todaysDate.replace(/\//g, "-");
  return `RFS-${safe}-${date}.pdf`;
}
