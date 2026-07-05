import type { PaymentSection } from "../lib/types";

// Placeholder content — fill in the clinic's actual portal names / login locations.
export const paymentSections: PaymentSection[] = [
  {
    id: "insurance-era",
    title: "保险公司电子付款 (ERA / EOB)",
    steps: [
      "登录 clearinghouse 平台（如 Office Ally / Availity）",
      "进入 Payments / ERA 页面，按日期筛选",
      "找到对应患者姓名或 claim number，核对付款金额与 EOB 是否一致",
    ],
    notes: "如果 ERA 上金额和实际到账不符，先查是否有 take-back / 之前多付的扣款。",
  },
  {
    id: "patient-copay",
    title: "患者现场支付 (Copay / Self-pay)",
    steps: [
      "在收款系统（如 Square / 诊所自带 POS）里按日期查当天交易记录",
      "核对收据本或电子收据是否与系统记录一致",
    ],
  },
  {
    id: "bank-deposit",
    title: "银行到账核对",
    steps: [
      "登录诊所银行账户，查看当日/当周存款明细",
      "与保险公司批次付款 (batch payment) 金额核对，确认是否有遗漏批次",
    ],
    notes: "保险公司的批次付款通常会晚 1-3 个工作日到账，与 ERA 生成日期不完全同步。",
  },
];
