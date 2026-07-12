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
    title: "Checklist",
    icon: "folder",
    template: "checklist",
  },
  {
    id: "personal-notes",
    title: "Notes & Cases",
    icon: "book-open",
    template: "oa-case",
  },
  {
    id: "personal-links",
    title: "Link Hub",
    icon: "help-circle",
    template: "payments",
  },
];

const STARTER_ENTRIES: Record<string, CustomEntry[]> = {
  "personal-checklist": [
    {
      id: "demo-checklist-quick-capture",
      title: "Quick capture before it disappears",
      detail: "Write the thought first. Sort it later when you have more energy.",
      notes: "Examples: cancel subscription, send follow-up email, save job link.",
      tags: [],
    },
    {
      id: "demo-checklist-admin-reset",
      title: "15-minute admin reset",
      detail: "Open inbox, check bills, choose one small thing to finish today.",
      notes: "Good for ADHD days when the list feels too big.",
      tags: [],
    },
    {
      id: "demo-checklist-follow-up",
      title: "Follow up on pending applications",
      detail: "Check saved links, update status, add next step.",
      notes: "Keep the link in Link Hub so you do not have to search again.",
      tags: [],
    },
  ],
  "personal-notes": [
    {
      id: "demo-note-job-application",
      title: "Job application tracker idea",
      summary: "Use one card for each role. Save the job link, deadline, resume version, and next action.",
      resolution: "Next time: add a checklist item to follow up 5 business days after applying.",
      notes: "Good example of turning a random thought into a reusable workflow.",
      tags: ["job", "admin", "follow-up"],
    },
    {
      id: "demo-note-tax-document",
      title: "Where I put tax documents",
      summary: "I always forget where W-2, 1099, tuition, and donation receipts live.",
      resolution: "Create a Link Hub card for each portal, then add notes about what document to download.",
      notes: "This is more useful than a bookmark because the note explains why the link matters.",
      tags: ["tax", "documents"],
    },
    {
      id: "demo-note-health-admin",
      title: "Health admin mini SOP",
      summary: "When a bill or appointment reminder comes in, record the portal, account number hint, and next step.",
      resolution: "Save portal links once. Use checklist for calls, follow-ups, and due dates.",
      notes: "Keeps life admin from living in screenshots and scattered messages.",
      tags: ["health", "life-admin"],
    },
  ],
  "personal-links": [
    {
      id: "demo-link-job-board",
      title: "Job application links",
      notes: "Save the exact portal plus notes about which resume version or login method to use.",
      tags: [],
      portals: [
        {
          name: "LinkedIn saved jobs",
          url: "https://www.linkedin.com/jobs/",
        },
      ],
    },
    {
      id: "demo-link-money-admin",
      title: "Money admin",
      notes: "Bills, bank portals, subscription pages, and anything that should not disappear into bookmarks.",
      tags: [],
      portals: [
        {
          name: "Budget spreadsheet",
          url: "https://docs.google.com/",
        },
      ],
    },
    {
      id: "demo-link-documents",
      title: "Important documents",
      notes: "Put renewal links, document portals, and instructions here so future-you knows what the link is for.",
      tags: [],
      portals: [
        {
          name: "Document folder",
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
