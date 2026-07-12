import { BookOpenText, CheckSquare2, Link2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import ProfileMenu from "../components/ProfileMenu";
import SyncStatusBadge from "../components/SyncStatusBadge";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import type { CustomCategory, CustomEntry } from "../lib/types";

const STARTER_CATEGORIES: CustomCategory[] = [
  {
    id: "personal-checklist",
    title: "行动清单",
    icon: "folder",
    template: "checklist",
  },
  {
    id: "personal-notes",
    title: "资料卡片",
    icon: "book-open",
    template: "oa-case",
  },
  {
    id: "personal-links",
    title: "链接库",
    icon: "help-circle",
    template: "payments",
  },
];

const STARTER_ENTRIES: Record<string, CustomEntry[]> = {
  "personal-checklist": [
    {
      id: "demo-checklist-quick-capture",
      title: "先把脑子里突然蹦出来的事记下来",
      detail: "不用马上整理，先收进来，之后有精力再分类。",
      notes: "例如：取消订阅、回一封邮件、保存一个申请链接。",
      tags: [],
    },
    {
      id: "demo-checklist-admin-reset",
      title: "15 分钟生活 admin reset",
      detail: "打开邮箱，看一眼账单，选一件今天能完成的小事。",
      notes: "适合脑子很乱、任务太多、不知道从哪里开始的时候。",
      tags: [],
    },
    {
      id: "demo-checklist-follow-up",
      title: "Follow up 还没处理完的申请",
      detail: "检查保存过的链接，更新状态，写下下一步。",
      notes: "链接放在链接库里，之后不用重新翻聊天记录或浏览器历史。",
      tags: [],
    },
  ],
  "personal-notes": [
    {
      id: "demo-note-job-application",
      title: "求职申请追踪小卡片",
      summary: "每一个岗位建一张卡，放职位链接、截止日期、用了哪个版本的简历、下一步要做什么。",
      resolution: "申请完之后，在行动清单里加一条：5 个工作日后 follow up。",
      notes: "把突然想到的事情变成一个可重复使用的小流程。",
      tags: ["求职", "admin", "follow-up"],
    },
    {
      id: "demo-note-tax-document",
      title: "报税资料都放在哪里",
      summary: "每年都会忘记 W-2、1099、学费表、捐赠收据分别在哪个平台下载。",
      resolution: "每个平台在链接库建一张卡，备注清楚要下载什么文件。",
      notes: "它比书签更有用，因为不只是保存链接，还说明这个链接是干什么的。",
      tags: ["报税", "文件"],
    },
    {
      id: "demo-note-health-admin",
      title: "健康账单处理小 SOP",
      summary: "收到 bill 或 appointment reminder 时，记录入口链接、账号提示、下一步要做什么。",
      resolution: "入口链接只保存一次；电话、follow up、due date 放进行动清单。",
      notes: "把生活 admin 从截图、短信、邮件里捞出来，放到一个地方。",
      tags: ["健康", "生活admin"],
    },
  ],
  "personal-links": [
    {
      id: "demo-link-job-board",
      title: "求职申请入口",
      notes: "保存具体投递入口，并备注用哪个简历版本、用什么账号登录。",
      tags: [],
      portals: [
        {
          name: "LinkedIn 收藏职位",
          url: "https://www.linkedin.com/jobs/",
        },
      ],
    },
    {
      id: "demo-link-money-admin",
      title: "财务 admin",
      notes: "账单、银行入口、订阅管理页面，以及任何不想再重新搜索的东西。",
      tags: [],
      portals: [
        {
          name: "预算表",
          url: "https://docs.google.com/",
        },
      ],
    },
    {
      id: "demo-link-documents",
      title: "重要文件入口",
      notes: "放证件更新、文件下载入口和操作说明，让未来的自己知道这个链接为什么重要。",
      tags: [],
      portals: [
        {
          name: "文件夹",
          url: "https://drive.google.com/",
        },
      ],
    },
  ],
};

const TEMPLATE_OPTIONS = [
  {
    key: "workspaceOnboarding.templateChecklist",
    body: "workspaceOnboarding.templateChecklistBody",
    icon: CheckSquare2,
  },
  {
    key: "workspaceOnboarding.templateCards",
    body: "workspaceOnboarding.templateCardsBody",
    icon: BookOpenText,
  },
  {
    key: "workspaceOnboarding.templateLinks",
    body: "workspaceOnboarding.templateLinksBody",
    icon: Link2,
  },
] as const;

export default function WorkspaceOnboarding({ onComplete }: { onComplete: () => void }) {
  const { t } = useLanguage();
  const { workspace } = useAuth();
  const navigate = useNavigate();
  const [, setCustomCategories] = useSyncedStorage<CustomCategory[]>(
    "lh-custom-categories",
    [],
  );
  const [, setCustomEntries] = useSyncedStorage<Record<string, CustomEntry[]>>(
    "lh-custom-entries",
    {},
  );

  function createWorkspace() {
    setCustomCategories((prev) => {
      const existingIds = new Set(prev.map((category) => category.id));
      return [
        ...prev,
        ...STARTER_CATEGORIES.filter((category) => !existingIds.has(category.id)),
      ];
    });
    setCustomEntries((prev) => ({
      ...prev,
      "personal-checklist":
        prev["personal-checklist"]?.length ? prev["personal-checklist"] : STARTER_ENTRIES["personal-checklist"],
      "personal-notes":
        prev["personal-notes"]?.length ? prev["personal-notes"] : STARTER_ENTRIES["personal-notes"],
      "personal-links":
        prev["personal-links"]?.length ? prev["personal-links"] : STARTER_ENTRIES["personal-links"],
    }));
    onComplete();
    navigate("/");
  }

  return (
    <div className="min-h-svh bg-[linear-gradient(180deg,rgba(255,255,255,0.86)_0%,rgba(244,248,247,0.96)_58%,rgba(247,250,249,1)_100%)]">
      <header className="border-b border-(--color-hairline) bg-white/86 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-(--radius-md) bg-(--color-primary) text-white shadow-[0_6px_18px_rgba(40,175,165,0.2)]">
              <Sparkles size={16} strokeWidth={2.3} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-(--color-ink)">
                {workspace?.name ?? t("workspaceOnboarding.workspaceFallback")}
              </p>
              <p className="text-[11px] text-(--color-ink-faint)">
                {t("workspaceOnboarding.privateLabel")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SyncStatusBadge />
            <div className="w-[180px]">
              <ProfileMenu placement="bottom" />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-18">
        <div className="grid gap-10 lg:grid-cols-[1fr_420px] lg:items-start">
          <div>
            <p className="text-[12px] font-semibold uppercase text-(--color-primary)">
              {t("workspaceOnboarding.label")}
            </p>
            <h1 className="mt-3 max-w-3xl text-[42px] leading-[1.02] font-bold tracking-(--tracking-heading) text-(--color-ink) sm:text-[56px]">
              {t("workspaceOnboarding.title")}
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-(--color-ink-muted) sm:text-[18px]">
              {t("workspaceOnboarding.body")}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={createWorkspace}
                className="rounded-(--radius-md) bg-(--color-primary) px-5 py-3 text-[14px] font-semibold text-white shadow-[0_12px_28px_rgba(40,175,165,0.22)] transition-transform duration-150 hover:bg-(--color-primary-active) active:scale-[0.98]"
              >
                {t("workspaceOnboarding.createWorkspace")}
              </button>
              <button
                type="button"
                onClick={() => {
                  onComplete();
                  navigate("/");
                }}
                className="rounded-(--radius-md) border border-(--color-hairline) bg-white/80 px-5 py-3 text-[14px] font-semibold text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
              >
                {t("workspaceOnboarding.startBlank")}
              </button>
            </div>
          </div>

          <div className="rounded-(--radius-xl) border border-(--color-hairline) bg-white/86 p-5 shadow-(--shadow-level-2)">
            <p className="text-[13px] font-semibold text-(--color-ink-faint)">
              {t("workspaceOnboarding.included")}
            </p>
            <div className="mt-4 grid gap-3">
              {TEMPLATE_OPTIONS.map(({ key, body, icon: Icon }) => (
                <div
                  key={key}
                  className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-canvas-tint) text-(--color-primary)">
                      <Icon size={19} strokeWidth={2.2} />
                    </span>
                    <div>
                      <h2 className="text-[16px] font-bold text-(--color-ink)">
                        {t(key as Parameters<typeof t>[0])}
                      </h2>
                      <p className="mt-1 text-[13px] leading-relaxed text-(--color-ink-muted)">
                        {t(body as Parameters<typeof t>[0])}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-(--radius-lg) border border-(--color-hairline) bg-white/78 p-5 text-[13px] leading-relaxed text-(--color-ink-muted) shadow-(--shadow-level-1)">
          {t("workspaceOnboarding.safetyNote")}
        </div>
      </main>
    </div>
  );
}
