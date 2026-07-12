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
      "personal-checklist": prev["personal-checklist"] ?? [],
      "personal-notes": prev["personal-notes"] ?? [],
      "personal-links": prev["personal-links"] ?? [],
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
