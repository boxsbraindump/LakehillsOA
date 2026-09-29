import {
  BookOpenText,
  CheckSquare2,
  Cloud,
  Languages,
  Link2,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useLanguage } from "./LanguageProvider";

export function CapabilityStrip() {
  const { t } = useLanguage();
  const items = [
    [Cloud, "publicHome.capabilitySync"],
    [Search, "publicHome.capabilitySearch"],
    [Users, "publicHome.capabilityShared"],
    [Languages, "publicHome.capabilityBilingual"],
  ] as const;

  return (
    <section
      data-landing-reveal
      className="border-y border-(--color-hairline) bg-white"
      aria-label={t("publicHome.capabilitiesLabel")}
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 px-5 sm:px-8 lg:grid-cols-4">
        {items.map(([Icon, key], index) => (
          <div
            key={key}
            data-reveal-item
            className={`flex min-h-24 items-center gap-3 border-(--color-hairline) py-5 ${
              index % 2 === 0 ? "pr-4" : "border-l pl-4"
            } lg:border-l lg:px-6 lg:first:border-l-0 lg:first:pl-0`}
          >
            <Icon size={20} className="shrink-0 text-(--color-primary)" />
            <span className="text-[13px] font-semibold leading-snug text-(--color-ink-secondary)">
              {t(key)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function WorkflowSection() {
  const { t } = useLanguage();
  const workflows = [
    {
      icon: CheckSquare2,
      title: "publicHome.workflowChecklistTitle",
      body: "publicHome.workflowChecklistBody",
      detail: "publicHome.workflowChecklistDetail",
    },
    {
      icon: BookOpenText,
      title: "publicHome.workflowCasesTitle",
      body: "publicHome.workflowCasesBody",
      detail: "publicHome.workflowCasesDetail",
    },
    {
      icon: Link2,
      title: "publicHome.workflowPaymentsTitle",
      body: "publicHome.workflowPaymentsBody",
      detail: "publicHome.workflowPaymentsDetail",
    },
  ] as const;

  return (
    <section
      id="workflow"
      data-landing-reveal
      className="scroll-mt-16 bg-(--color-canvas-soft)"
    >
      <div className="mx-auto max-w-6xl px-5 py-18 sm:px-8 lg:py-24">
        <div className="max-w-2xl" data-reveal-item>
          <h2 className="font-display text-[34px] font-bold leading-tight text-(--color-ink) sm:text-[40px]">
            {t("publicHome.workflowTitle")}
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-(--color-ink-muted)">
            {t("publicHome.workflowCopy")}
          </p>
        </div>

        {/*
          Three equal cards side by side is the most generic layout there is, and it forces
          three unrelated things into the same shape. These are three *kinds of work*, so they
          read better as a list: what it is on the left, what it does in the middle, who it
          suits on the right, on an uneven 4/5/3 split that stacks on a phone.
        */}
        <div className="mt-10 overflow-hidden rounded-(--radius-lg) border border-(--color-hairline) bg-white">
          {workflows.map(({ icon: Icon, title, body, detail }) => (
            <article
              key={title}
              data-reveal-item
              className="group grid gap-x-8 gap-y-4 border-b border-(--color-hairline) p-6 last:border-b-0 sm:p-7 lg:grid-cols-12 lg:items-start"
            >
              <div className="flex items-start gap-3 lg:col-span-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-canvas-tint) text-(--color-primary) transition-transform duration-300 group-hover:-translate-y-1">
                  <Icon size={20} />
                </span>
                <h3 className="mt-1.5 text-[18px] font-bold text-(--color-ink)">{t(title)}</h3>
              </div>
              <p className="text-[14px] leading-relaxed text-(--color-ink-muted) lg:col-span-5">
                {t(body)}
              </p>
              <div className="border-t border-(--color-hairline) pt-4 text-[12px] font-medium leading-relaxed text-(--color-ink-secondary) lg:col-span-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
                {t(detail)}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TeamKnowledgeSection() {
  const { t } = useLanguage();

  return (
    <section data-landing-reveal className="bg-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-18 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-20 lg:py-24">
        <div data-reveal-item>
          <h2 className="font-display max-w-xl text-[34px] font-bold leading-tight text-(--color-ink) sm:text-[40px]">
            {t("publicHome.knowledgeTitle")}
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-(--color-ink-muted)">
            {t("publicHome.knowledgeCopy")}
          </p>
          <div className="mt-8 space-y-5">
            {[
              [RefreshCw, "publicHome.knowledgeSync"],
              [ShieldCheck, "publicHome.knowledgeAccess"],
              [Search, "publicHome.knowledgeRecall"],
            ].map(([Icon, key]) => (
              <div key={key as string} className="flex items-start gap-3">
                <Icon
                  size={16}
                  className="mt-0.5 shrink-0 text-(--color-primary)"
                />
                <p className="text-[14px] leading-relaxed text-(--color-ink-secondary)">
                  {t(key as Parameters<typeof t>[0])}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div
          data-reveal-item
          className="overflow-hidden rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas-soft) shadow-(--shadow-level-1)"
        >
          <div className="border-b border-(--color-hairline) bg-white px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-bold text-(--color-ink)">
                  {t("publicHome.knowledgeExampleTitle")}
                </p>
                <p className="mt-1 text-[11px] text-(--color-ink-faint)">
                  {t("publicHome.knowledgeExampleMeta")}
                </p>
              </div>
              <span className="rounded-full bg-(--color-canvas-tint) px-2.5 py-1 text-[11px] font-semibold text-(--color-secondary)">
                Premera
              </span>
            </div>
          </div>
          <div className="space-y-3 p-5">
            <div className="rounded-(--radius-md) border border-(--color-hairline) bg-white p-4">
              <p className="text-[11px] font-semibold text-(--color-primary)">
                {t("publicHome.knowledgeSituation")}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-(--color-ink-secondary)">
                {t("publicHome.knowledgeSituationBody")}
              </p>
            </div>
            <div className="rounded-(--radius-md) border border-(--color-hairline) bg-white p-4">
              <p className="text-[11px] font-semibold text-(--color-primary)">
                {t("publicHome.knowledgeResolution")}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-(--color-ink-secondary)">
                {t("publicHome.knowledgeResolutionBody")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
