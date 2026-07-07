import { useEffect, useState } from "react";
import { LogOut, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { defaultPayers } from "../data/payers";
import { defaultPlatforms } from "../data/platforms";
import { slugify } from "../lib/slugify";
import type { Payer, Platform } from "../lib/types";

const inputClass =
  "w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1.5 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)";

const PAYER_SEED_VERSION = "2026-07-payers-v1";

export default function Settings() {
  const { email, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { confirm } = useConfirm();
  const [payers, setPayers] = useSyncedStorage<Payer[]>("lh-payers", defaultPayers);
  const [payerSeedVersion, setPayerSeedVersion] = useSyncedStorage("lh-payers-seed-version", "");
  const [platforms, setPlatforms] = useSyncedStorage<Platform[]>(
    "lh-platforms",
    defaultPlatforms,
  );
  const [newName, setNewName] = useState("");
  const [newPayerId, setNewPayerId] = useState("");
  const [newPlatformName, setNewPlatformName] = useState("");

  useEffect(() => {
    if (payerSeedVersion === PAYER_SEED_VERSION) return;

    setPayers((prev) => {
      const existingKeys = new Set(
        prev.map((payer) => `${payer.name.trim().toLowerCase()}|${payer.payerId.trim().toLowerCase()}`),
      );
      const missingPayers = defaultPayers.filter(
        (payer) => !existingKeys.has(`${payer.name.toLowerCase()}|${payer.payerId.toLowerCase()}`),
      );
      return missingPayers.length > 0 ? [...prev, ...missingPayers] : prev;
    });
    setPayerSeedVersion(PAYER_SEED_VERSION);
  }, [payerSeedVersion, setPayerSeedVersion, setPayers]);

  function handleAddPayer(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setPayers((prev) => [
      ...prev,
      { id: slugify(newName, "payer"), name: newName.trim(), payerId: newPayerId.trim() },
    ]);
    setNewName("");
    setNewPayerId("");
  }

  async function handleDeletePayer(payer: Payer) {
    if (!(await confirm({ message: t("payers.deleteConfirm", { name: payer.name }) }))) return;
    setPayers((prev) => prev.filter((p) => p.id !== payer.id));
  }

  function handleAddPlatform(e: React.FormEvent) {
    e.preventDefault();
    const name = newPlatformName.trim();
    if (!name) return;
    setPlatforms((prev) => [...prev, { id: slugify(name, "platform"), name }]);
    setNewPlatformName("");
  }

  async function handleDeletePlatform(platform: Platform) {
    if (!(await confirm({ message: t("platforms.deleteConfirm", { name: platform.name }) }))) return;
    setPlatforms((prev) => prev.filter((p) => p.id !== platform.id));
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          {t("settings.title")}
        </h1>
      </div>

      <section className="mb-6 rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)">
        <h2 className="mb-3 text-[16px] font-bold text-(--color-ink)">{t("settings.account")}</h2>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-(--color-ink-faint)">
              {t("settings.signedInAs")}
            </p>
            <p className="truncate text-[14px] text-(--color-ink)">{email}</p>
          </div>
          <button
            onClick={logout}
            className="flex shrink-0 items-center gap-1.5 rounded-(--radius-md) border border-(--color-hairline) px-3 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
          >
            <LogOut size={14} />
            {t("profileMenu.logout")}
          </button>
        </div>
      </section>

      <section className="mb-6 rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)">
        <h2 className="mb-3 text-[16px] font-bold text-(--color-ink)">
          {t("settings.preferences")}
        </h2>
        <p className="mb-2 text-[12px] font-semibold text-(--color-ink-faint)">
          {t("settings.language")}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setLang("zh")}
            className={[
              "rounded-(--radius-md) border px-3 py-1.5 text-[13px] font-medium",
              lang === "zh"
                ? "border-(--color-primary) bg-(--color-primary)/10 text-(--color-primary)"
                : "border-(--color-hairline) text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)",
            ].join(" ")}
          >
            {t("settings.languageZh")}
          </button>
          <button
            onClick={() => setLang("en")}
            className={[
              "rounded-(--radius-md) border px-3 py-1.5 text-[13px] font-medium",
              lang === "en"
                ? "border-(--color-primary) bg-(--color-primary)/10 text-(--color-primary)"
                : "border-(--color-hairline) text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)",
            ].join(" ")}
          >
            {t("settings.languageEn")}
          </button>
        </div>
      </section>

      <section className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)">
        <h2 className="text-[16px] font-bold text-(--color-ink)">
          {t("settings.workspaceData")}
        </h2>

        <div className="mt-5 border-b border-(--color-hairline) pb-6">
          <h3 className="text-[14px] font-bold text-(--color-ink)">{t("settings.payers")}</h3>
        <p className="mt-1 mb-4 text-[13px] text-(--color-ink-muted)">{t("settings.payersHint")}</p>

        {payers.length === 0 ? (
          <p className="mb-4 text-[13px] text-(--color-ink-faint)">{t("payers.empty")}</p>
        ) : (
          <ul className="mb-4 flex flex-col divide-y divide-(--color-hairline)">
            {payers.map((payer) => (
              <li key={payer.id} className="group flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-(--color-ink)">{payer.name}</p>
                  {payer.payerId && (
                    <p className="text-[12px] text-(--color-ink-faint)">{payer.payerId}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDeletePayer(payer)}
                  aria-label={t("common.delete")}
                  className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddPayer} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
              {t("payers.name")}
            </label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("payers.namePlaceholder")}
              className={inputClass}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
              {t("payers.payerId")}
            </label>
            <input
              value={newPayerId}
              onChange={(e) => setNewPayerId(e.target.value)}
              placeholder={t("payers.payerIdPlaceholder")}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            className="flex shrink-0 items-center gap-1 rounded-(--radius-md) bg-(--color-primary) px-3 py-1.5 text-[13px] font-medium text-(--color-on-primary) hover:bg-(--color-primary-active)"
          >
            <Plus size={14} />
            {t("payers.addNew")}
          </button>
        </form>
        </div>

        <div className="pt-6">
          <h3 className="text-[14px] font-bold text-(--color-ink)">{t("settings.platforms")}</h3>
          <p className="mt-1 mb-4 text-[13px] text-(--color-ink-muted)">
            {t("settings.platformsHint")}
          </p>

          {platforms.length === 0 ? (
            <p className="mb-4 text-[13px] text-(--color-ink-faint)">{t("platforms.empty")}</p>
          ) : (
            <ul className="mb-4 flex flex-col divide-y divide-(--color-hairline)">
              {platforms.map((platform) => (
                <li key={platform.id} className="group flex items-center justify-between gap-3 py-2">
                  <p className="truncate text-[14px] text-(--color-ink)">{platform.name}</p>
                  <button
                    onClick={() => handleDeletePlatform(platform)}
                    aria-label={t("common.delete")}
                    className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddPlatform} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
                {t("platforms.name")}
              </label>
              <input
                value={newPlatformName}
                onChange={(e) => setNewPlatformName(e.target.value)}
                placeholder={t("platforms.namePlaceholder")}
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              className="flex shrink-0 items-center gap-1 rounded-(--radius-md) bg-(--color-primary) px-3 py-1.5 text-[13px] font-medium text-(--color-on-primary) hover:bg-(--color-primary-active)"
            >
              <Plus size={14} />
              {t("platforms.addNew")}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
