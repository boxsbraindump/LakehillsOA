import type { Dispatch, SetStateAction } from "react";
import { Plus, X } from "lucide-react";
import type { PaymentPortal, Platform } from "../lib/types";
import { useLanguage } from "./LanguageProvider";

const CUSTOM_PLATFORM_VALUE = "__custom__";

const inputClass =
  "w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1.5 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)";

export default function PortalFields({
  portals,
  platforms,
  setPortals,
}: {
  portals: PaymentPortal[];
  platforms: Platform[];
  setPortals: Dispatch<SetStateAction<PaymentPortal[]>>;
}) {
  const { t } = useLanguage();

  function updatePortal(index: number, field: keyof PaymentPortal, value: string) {
    setPortals((prev) => prev.map((portal, i) => (i === index ? { ...portal, [field]: value } : portal)));
  }

  function handlePlatformSelect(index: number, value: string) {
    if (value === CUSTOM_PLATFORM_VALUE) {
      updatePortal(index, "name", "");
      return;
    }

    const found = platforms.find((platform) => platform.id === value);
    if (!found) return;

    setPortals((prev) =>
      prev.map((portal, i) =>
        i === index
          ? {
              ...portal,
              name: found.name,
              url: found.url?.trim() ? found.url : portal.url,
            }
          : portal,
      ),
    );
  }

  function removePortal(index: number) {
    setPortals((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <>
      <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
        {t("paymentEntryForm.portalsLabel")}
      </label>
      <div className="flex flex-col gap-2">
        {portals.map((portal, i) => (
          <div
            key={i}
            className="rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas-soft) p-3"
          >
            {portals.length > 1 && (
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => removePortal(i)}
                  aria-label={t("common.delete")}
                  className="-mt-1 -mr-1 shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink-secondary)"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="grid gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-(--color-ink-faint)">
                  {t("platforms.name")}
                </label>
                {platforms.length > 0 && (
                  <select
                    value={
                      platforms.find((platform) => platform.name === portal.name)?.id ??
                      CUSTOM_PLATFORM_VALUE
                    }
                    onChange={(e) => handlePlatformSelect(i, e.target.value)}
                    className={inputClass}
                  >
                    <option value={CUSTOM_PLATFORM_VALUE}>
                      {t("paymentEntryForm.customPlatform")}
                    </option>
                    {platforms.map((platform) => (
                      <option key={platform.id} value={platform.id}>
                        {platform.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {(platforms.length === 0 ||
                !platforms.some((platform) => platform.name === portal.name)) && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-(--color-ink-faint)">
                    {t("paymentEntryForm.portalNamePlaceholder")}
                  </label>
                  <input
                    value={portal.name}
                    onChange={(e) => updatePortal(i, "name", e.target.value)}
                    placeholder={t("paymentEntryForm.portalNamePlaceholder")}
                    className={inputClass}
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-(--color-ink-faint)">
                  {t("platforms.url")}
                </label>
                <input
                  value={portal.url}
                  onChange={(e) => updatePortal(i, "url", e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setPortals((prev) => [...prev, { name: "", url: "" }])}
        className="mt-2 flex items-center gap-1 text-[13px] font-medium text-(--color-primary)"
      >
        <Plus size={14} />
        {t("paymentEntryForm.addPortal")}
      </button>
    </>
  );
}
