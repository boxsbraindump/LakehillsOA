import type { OACase } from "../lib/types";

// Placeholder content — replace with real historical claim cases as they come up.
export const oaCases: OACase[] = [
  {
    id: "case-secondary-denial",
    title: "有二次保险但 claim 仍被 deny",
    payer: "Blue Shield (secondary)",
    tags: ["denial", "coordination of benefits", "secondary insurance"],
    summary:
      "患者有 primary + secondary 两份保险，secondary claim 被拒，原因写的是 'COB information missing'。",
    resolution:
      "打电话给 secondary 保险公司确认 COB (Coordination of Benefits) 表格是否在保险公司系统里更新过；很多时候是患者从未跟保险公司口头确认过 COB，需要让患者本人打电话给保险公司确认一次，才能重新提交 claim。",
  },
  {
    id: "case-auth-expired",
    title: "预授权 (prior authorization) 在疗程中途过期",
    payer: "Medicare Advantage (various)",
    tags: ["prior authorization", "medicare advantage", "visit limit"],
    summary: "患者的针灸疗程做到一半，授权的 visit 次数用完，保险要求重新申请授权。",
    resolution:
      "在患者疗程过半时提前检查剩余 visit 数，若少于 3 次要提前联系保险要求 re-authorization，避免患者到店当天才发现没有授权导致无法治疗。",
  },
  {
    id: "case-wrong-cpt",
    title: "CPT code 与诊断不匹配被拒",
    payer: "Aetna",
    tags: ["cpt code", "diagnosis mismatch", "denial"],
    summary: "Claim 因为 CPT code 和 ICD-10 诊断代码不匹配被拒绝。",
    resolution:
      "核对治疗记录上医生填写的诊断代码，与账单上使用的 CPT code 是否对应该保险公司的 coverage policy；如不确定，联系 billing 或医生确认后再重新提交 (resubmit)，并在备注中写明是 corrected claim。",
  },
];
