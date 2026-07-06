import type { PaymentEntry } from "../lib/types";

// Placeholder content — replace payer names / portal links with the clinic's actual list.
export const paymentEntries: PaymentEntry[] = [
  {
    id: "kaiser-permanente",
    payer: "Kaiser Permanente",
    portals: [{ name: "Availity", url: "https://apps.availity.com" }],
  },
  {
    id: "blue-shield",
    payer: "Blue Shield",
    portals: [{ name: "Availity", url: "https://apps.availity.com" }],
  },
  {
    id: "aetna",
    payer: "Aetna",
    portals: [{ name: "Availity", url: "https://apps.availity.com" }],
  },
  {
    id: "medicare",
    payer: "Medicare",
    portals: [{ name: "Noridian Medicare Portal", url: "https://med.noridianmedicare.com" }],
    notes: "批次付款通常会晚 1-3 个工作日到账，与 ERA 生成日期不完全同步。",
  },
];
