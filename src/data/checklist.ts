import type { ChecklistSection } from "../lib/types";

// Placeholder content — edit freely to match Lake Hills' actual front-desk routine.
export const checklistSections: ChecklistSection[] = [
  {
    id: "opening",
    title: "开店 Opening",
    items: [
      { id: "opening-lights", label: "开灯、开空调、开背景音乐" },
      { id: "opening-voicemail", label: "听留言并回电", detail: "记录患者姓名、电话、来电原因" },
      { id: "opening-schedule", label: "打印/核对当天预约表" },
      { id: "opening-confirm", label: "确认当天患者是否已 confirm，未确认的电话提醒" },
      { id: "opening-rooms", label: "检查治疗室物资（针、酒精棉、垫巾）是否备齐" },
      { id: "opening-cash", label: "清点前台备用金" },
    ],
  },
  {
    id: "during-day",
    title: "营业中 During the Day",
    items: [
      { id: "day-checkin", label: "患者到达后核对保险信息 / 是否有更新" },
      { id: "day-copay", label: "收取 copay / 自费费用并开收据" },
      { id: "day-newpatient", label: "新患者：核实保险 eligibility，收集 intake 表格" },
      { id: "day-nextappt", label: "患者离开前预约下一次复诊" },
      { id: "day-fax", label: "处理传真 / 转诊单，归档到对应患者档案" },
    ],
  },
  {
    id: "closing",
    title: "打烊 Closing",
    items: [
      { id: "closing-cash", label: "核对当日现金 / 刷卡金额，填写结算表" },
      { id: "closing-notes", label: "确认所有治疗记录已完成签字" },
      { id: "closing-tomorrow", label: "预览次日排班，提前准备特殊需求（翻译、轮椅通道等）" },
      { id: "closing-lockup", label: "关闭设备、锁门、开启警报系统" },
    ],
  },
];
