import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  tone?: "danger" | "default";
}

interface PendingConfirm extends Required<ConfirmOptions> {
  resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(
    (value: boolean) => {
      pending?.resolve(value);
      setPending(null);
    },
    [pending],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({
          title: options.title ?? t("confirm.title"),
          message: options.message,
          confirmLabel: options.confirmLabel ?? t("common.delete"),
          tone: options.tone ?? "danger",
          resolve,
        });
      }),
    [t],
  );

  useEffect(() => {
    if (!pending) return;
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, pending]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10201e]/28 px-4 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="fade-in-up w-full max-w-sm rounded-(--radius-xl) border border-(--color-hairline) bg-white p-5 shadow-(--shadow-level-2)"
          >
            <div className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-md) bg-red-50 text-red-600">
                <AlertTriangle size={18} />
              </span>
              <div className="min-w-0">
                <h2 id="confirm-title" className="text-[16px] font-semibold text-(--color-ink)">
                  {pending.title}
                </h2>
                <p className="mt-1 text-[14px] leading-5 text-(--color-ink-muted)">
                  {pending.message}
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => close(false)}
                className="rounded-(--radius-md) border border-(--color-hairline) px-3 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) transition-colors hover:bg-(--color-canvas-tint)"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={[
                  "rounded-(--radius-md) px-3 py-1.5 text-[13px] font-medium text-white transition-[background-color,transform] active:scale-[0.98]",
                  pending.tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-(--color-primary) hover:bg-(--color-primary-active)",
                ].join(" ")}
              >
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
