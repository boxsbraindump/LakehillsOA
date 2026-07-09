import { BookOpenText, CheckSquare2, Link2, StickyNote, Sparkles } from "lucide-react";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import ProfileMenu from "../components/ProfileMenu";
import SyncStatusBadge from "../components/SyncStatusBadge";

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
  {
    key: "workspaceOnboarding.templateBlank",
    body: "workspaceOnboarding.templateBlankBody",
    icon: StickyNote,
  },
] as const;

export default function WorkspaceOnboarding() {
  const { t } = useLanguage();
  const { workspace } = useAuth();

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
              <ProfileMenu />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-[12px] font-semibold uppercase text-(--color-primary)">
            {t("workspaceOnboarding.label")}
          </p>
          <h1 className="mt-3 text-[42px] font-bold leading-[1.02] tracking-(--tracking-heading) text-(--color-ink) sm:text-[56px]">
            {t("workspaceOnboarding.title")}
          </h1>
          <p className="mt-5 text-[16px] leading-relaxed text-(--color-ink-muted) sm:text-[18px]">
            {t("workspaceOnboarding.body")}
          </p>
        </div>

        <div className="mt-10 grid gap-px overflow-hidden rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-hairline) md:grid-cols-2">
          {TEMPLATE_OPTIONS.map(({ key, body, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className="group bg-white p-6 text-left transition-colors hover:bg-(--color-canvas-tint) sm:p-7"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-(--radius-md) bg-(--color-canvas-tint) text-(--color-primary) transition-transform duration-200 group-hover:-translate-y-0.5">
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <h2 className="mt-5 text-[18px] font-bold text-(--color-ink)">
                {t(key as Parameters<typeof t>[0])}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-(--color-ink-muted)">
                {t(body as Parameters<typeof t>[0])}
              </p>
              <span className="mt-5 inline-flex rounded-(--radius-sm) border border-(--color-hairline) px-3 py-2 text-[12px] font-semibold text-(--color-ink-faint)">
                {t("workspaceOnboarding.templateComingSoon")}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-8 rounded-(--radius-lg) border border-(--color-hairline) bg-white/78 p-5 text-[13px] leading-relaxed text-(--color-ink-muted) shadow-(--shadow-level-1)">
          {t("workspaceOnboarding.safetyNote")}
        </div>
      </main>
    </div>
  );
}
