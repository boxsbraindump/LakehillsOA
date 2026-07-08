import { Plus } from "lucide-react";

export default function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className = "",
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-(--radius-lg) border border-dashed border-(--color-hairline) bg-(--color-canvas)/72 px-5 py-8 text-center",
        className,
      ].join(" ")}
    >
      <p className="text-[15px] font-semibold text-(--color-ink)">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-(--color-ink-muted)">
        {description}
      </p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-(--radius-md) bg-(--color-primary) px-3 py-1.5 text-[13px] font-medium text-(--color-on-primary) transition-transform duration-150 hover:bg-(--color-primary-active) active:scale-[0.97]"
      >
        <Plus size={14} />
        {actionLabel}
      </button>
    </div>
  );
}
