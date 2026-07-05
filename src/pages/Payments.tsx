import { paymentSections } from "../data/payments";
import { useHashHighlight } from "../hooks/useHashHighlight";

export default function Payments() {
  useHashHighlight();

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          Where to Find Payments
        </h1>
        <p className="mt-1 text-[15px] text-(--color-ink-muted)">
          各类付款该去哪里查、怎么核对
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {paymentSections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)"
          >
            <h2 className="mb-3 text-[18px] font-bold text-(--color-ink)">{section.title}</h2>
            <ol className="flex flex-col gap-2">
              {section.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-[14px] text-(--color-ink-secondary)">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--color-canvas-soft) text-[12px] font-semibold text-(--color-ink-muted)">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            {section.notes && (
              <div className="mt-4 rounded-(--radius-md) border border-(--color-accent-sky)/30 bg-(--color-accent-sky)/8 p-3.5 text-[13px] text-(--color-ink-secondary)">
                {section.notes}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
