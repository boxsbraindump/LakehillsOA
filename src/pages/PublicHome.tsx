import {
  ArrowRight,
  Check,
  CheckSquare2,
  ExternalLink,
  FileQuestion,
  Search,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import SignInPanel from "../components/SignInPanel";
import LandingMotion from "../components/LandingMotion";
import {
  CapabilityStrip,
  TeamKnowledgeSection,
  WorkflowSection,
} from "../components/PublicHomeSections";

function BrandMark() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-(--radius-md) bg-(--color-primary) text-white shadow-[0_6px_18px_rgba(40,175,165,0.2)]">
      <Sparkles size={16} strokeWidth={2.3} />
    </span>
  );
}

function WorkspacePreview() {
  const { t } = useLanguage();

  return (
    <div
      data-preview-frame
      className="overflow-hidden rounded-(--radius-lg) border border-(--color-hairline) bg-white shadow-(--shadow-level-2)"
    >
      <div className="flex h-9 items-center gap-1.5 border-b border-(--color-hairline) bg-(--color-canvas-soft) px-3">
        <span className="h-2 w-2 rounded-full bg-[#d96e6e]" />
        <span className="h-2 w-2 rounded-full bg-[#e1b35d]" />
        <span className="h-2 w-2 rounded-full bg-[#68aa81]" />
        <span className="ml-3 text-[11px] font-medium text-(--color-ink-faint)">Lake Hills OA</span>
      </div>

      <div className="grid min-h-74 md:grid-cols-[190px_1fr]">
        <aside className="hidden border-r border-(--color-hairline) bg-white p-4 md:block">
          <div className="mb-5 flex items-center gap-2">
            <BrandMark />
            <span className="text-[13px] font-bold text-(--color-ink)">Lake Hills OA</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 rounded-(--radius-sm) bg-(--color-primary) px-2.5 py-2 text-[11px] font-semibold text-white">
              <Search size={13} />
              {t("publicHome.previewSearch")}
            </div>
            <div className="flex items-center gap-2 px-2.5 py-2 text-[11px] text-(--color-ink-muted)">
              <CheckSquare2 size={13} />
              {t("publicHome.previewChecklist")}
            </div>
            <div className="flex items-center gap-2 px-2.5 py-2 text-[11px] text-(--color-ink-muted)">
              <FileQuestion size={13} />
              {t("publicHome.previewCase")}
            </div>
            <div className="flex items-center gap-2 px-2.5 py-2 text-[11px] text-(--color-ink-muted)">
              <WalletCards size={13} />
              {t("publicHome.previewPayment")}
            </div>
          </div>
        </aside>

        <div className="bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(244,248,247,0.92))] p-5 sm:p-7">
          <div className="mx-auto max-w-2xl">
            <p className="text-[11px] font-semibold uppercase text-(--color-primary)">
              {t("publicHome.previewLabel")}
            </p>
            <h2 className="mt-1 text-[22px] font-bold text-(--color-ink)">
              {t("publicHome.previewTitle")}
            </h2>
            <div className="mt-4 flex items-center gap-2 rounded-(--radius-md) border border-(--color-hairline) bg-white px-3 py-2.5 shadow-(--shadow-level-1)">
              <Search size={15} className="text-(--color-primary)" />
              <span className="text-[12px] text-(--color-ink-faint)">
                {t("publicHome.previewPlaceholder")}
              </span>
              <span className="landing-search-caret ml-auto h-4 w-px bg-(--color-primary)" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-(--radius-md) border border-(--color-hairline) bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-bold text-(--color-ink)">Aetna</p>
                  <span className="rounded-full bg-(--color-canvas-tint) px-2 py-1 text-[10px] font-semibold text-(--color-secondary)">
                    {t("publicHome.previewCase")}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-(--color-ink-muted)">
                  {t("publicHome.previewResult")}
                </p>
              </div>
              <div className="rounded-(--radius-md) border border-(--color-hairline) bg-white p-4">
                <div className="flex items-center gap-2">
                  <ExternalLink size={13} className="text-(--color-primary)" />
                  <p className="text-[13px] font-bold text-(--color-ink)">Availity</p>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-(--color-ink-muted)">
                  {t("publicHome.previewPortal")}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-[10px] font-medium text-(--color-ink-faint)">
              <span className="flex items-center gap-1.5">
                <span className="landing-sync-pulse h-1.5 w-1.5 rounded-full bg-(--color-primary)" />
                {t("publicHome.previewSynced")}
              </span>
              <span>{t("publicHome.previewShared")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublicHome({ isChecking: checkingOverride }: { isChecking?: boolean }) {
  const { t, lang, setLang } = useLanguage();
  const { syncEnabled, isAuthenticated, isChecking } = useAuth();
  const canOpenWorkspace = !syncEnabled || isAuthenticated;

  return (
    <LandingMotion>
      <div className="min-h-svh overflow-x-hidden bg-(--color-canvas-soft)">
      <header className="sticky top-0 z-20 border-b border-(--color-hairline) bg-white/92 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/welcome" className="flex min-w-0 items-center gap-2.5">
            <BrandMark />
            <span className="truncate text-[15px] font-bold text-(--color-ink)">Lake Hills OA</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <nav className="hidden items-center gap-5 text-[13px] font-medium text-(--color-ink-muted) sm:flex">
              <a href="#features" className="transition-colors hover:text-(--color-ink)">
                {t("publicHome.navFeatures")}
              </a>
              <a href="#workflow" className="transition-colors hover:text-(--color-ink)">
                {t("publicHome.navWorkflow")}
              </a>
              <a href="#access" className="transition-colors hover:text-(--color-ink)">
                {t("publicHome.navAccess")}
              </a>
            </nav>
            <div
              className="flex items-center rounded-(--radius-sm) border border-(--color-hairline) bg-(--color-canvas-soft) p-0.5"
              aria-label={t("settings.language")}
            >
              <button
                type="button"
                onClick={() => setLang("zh")}
                className={`rounded-[3px] px-2 py-1 text-[11px] font-semibold transition-colors ${
                  lang === "zh" ? "bg-white text-(--color-ink) shadow-sm" : "text-(--color-ink-faint)"
                }`}
              >
                {t("settings.languageZh")}
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`rounded-[3px] px-2 py-1 text-[11px] font-semibold transition-colors ${
                  lang === "en" ? "bg-white text-(--color-ink) shadow-sm" : "text-(--color-ink-faint)"
                }`}
              >
                {t("settings.languageEn")}
              </button>
            </div>
            {canOpenWorkspace ? (
              <Link
                to="/"
                className="hidden items-center gap-1.5 rounded-(--radius-sm) bg-(--color-primary) px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-(--color-primary-active) sm:flex"
              >
                {t("publicHome.openWorkspace")}
                <ArrowRight size={13} />
              </Link>
            ) : (
              <a
                href="#access"
                className="hidden items-center gap-1.5 rounded-(--radius-sm) bg-(--color-primary) px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-(--color-primary-active) sm:flex"
              >
                {t("publicHome.signIn")}
                <ArrowRight size={13} />
              </a>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-14 pt-14 sm:px-8 sm:pt-20 lg:pb-20">
          <div className="max-w-3xl">
            <p
              data-hero-reveal
              className="mb-4 text-[12px] font-semibold uppercase text-(--color-primary)"
            >
              Lake Hills Acupuncture · Internal
            </p>
            <h1
              data-hero-reveal
              className="max-w-2xl text-[clamp(2.75rem,7vw,5.5rem)] font-bold leading-[0.96] tracking-(--tracking-display) text-(--color-ink)"
            >
              Lake Hills OA
            </h1>
            <p
              data-hero-reveal
              className="mt-6 max-w-xl text-[17px] leading-relaxed text-(--color-ink-muted) sm:text-[19px]"
            >
              {t("publicHome.heroCopy")}
            </p>
            <div data-hero-reveal className="mt-7 flex flex-wrap items-center gap-3">
              {canOpenWorkspace ? (
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 rounded-(--radius-md) bg-(--color-primary) px-4 py-3 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(40,175,165,0.2)] transition-colors hover:bg-(--color-primary-active)"
                >
                  {t("publicHome.openWorkspace")}
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <a
                  href="#access"
                  className="inline-flex items-center gap-2 rounded-(--radius-md) bg-(--color-primary) px-4 py-3 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(40,175,165,0.2)] transition-colors hover:bg-(--color-primary-active)"
                >
                  {t("publicHome.signIn")}
                  <ArrowRight size={16} />
                </a>
              )}
              <a
                href="#features"
                className="inline-flex items-center rounded-(--radius-md) border border-(--color-hairline) bg-white px-4 py-3 text-[14px] font-semibold text-(--color-ink-secondary) transition-colors hover:bg-(--color-canvas-tint)"
              >
                {t("publicHome.learnMore")}
              </a>
            </div>
          </div>

          <div className="mt-12 sm:mt-16">
            <WorkspacePreview />
          </div>
        </section>

        <CapabilityStrip />

        <section id="features" data-landing-reveal className="bg-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.5fr] lg:gap-20 lg:py-20">
            <div data-reveal-item>
              <h2 className="mt-3 text-[32px] font-bold leading-tight text-(--color-ink)">
                {t("publicHome.featuresTitle")}
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-(--color-ink-muted)">
                {t("publicHome.featuresCopy")}
              </p>
            </div>

            <div
              data-reveal-item
              className="grid gap-px overflow-hidden rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-hairline) sm:grid-cols-2"
            >
              {[
                ["publicHome.featureSearchTitle", "publicHome.featureSearchBody"],
                ["publicHome.featureDailyTitle", "publicHome.featureDailyBody"],
                ["publicHome.featureSharedTitle", "publicHome.featureSharedBody"],
                ["publicHome.featureFlexibleTitle", "publicHome.featureFlexibleBody"],
              ].map(([title, body]) => (
                <div key={title} className="bg-(--color-canvas) p-5 sm:p-6">
                  <Check size={16} className="text-(--color-primary)" strokeWidth={2.4} />
                  <h3 className="mt-4 text-[15px] font-bold text-(--color-ink)">
                    {t(title as Parameters<typeof t>[0])}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-(--color-ink-muted)">
                    {t(body as Parameters<typeof t>[0])}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <WorkflowSection />
        <TeamKnowledgeSection />

        <section
          id="access"
          data-landing-reveal
          className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_400px] lg:items-center lg:gap-20 lg:py-24"
        >
          <div data-reveal-item className="max-w-xl">
            <h2 className="mt-3 text-[32px] font-bold leading-tight text-(--color-ink)">
              {t("publicHome.accessTitle")}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-(--color-ink-muted)">
              {t("publicHome.accessCopy")}
            </p>
          </div>

          {canOpenWorkspace ? (
            <div
              data-reveal-item
              className="rounded-(--radius-lg) border border-(--color-hairline) bg-white p-6 shadow-(--shadow-level-2)"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-(--radius-md) bg-(--color-canvas-tint) text-(--color-primary)">
                <Check size={19} strokeWidth={2.5} />
              </div>
              <h3 className="mt-5 text-[18px] font-bold text-(--color-ink)">
                {t("publicHome.readyTitle")}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-(--color-ink-muted)">
                {t("publicHome.readyBody")}
              </p>
              <Link
                to="/"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-(--radius-md) bg-(--color-primary) px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-(--color-primary-active)"
              >
                {t("publicHome.openWorkspace")}
                <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <div data-reveal-item>
              <SignInPanel isChecking={checkingOverride ?? isChecking} />
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-(--color-hairline) bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-[12px] text-(--color-ink-faint) sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>Lake Hills OA</span>
          <span>{t("publicHome.footer")}</span>
        </div>
      </footer>
      </div>
    </LandingMotion>
  );
}
