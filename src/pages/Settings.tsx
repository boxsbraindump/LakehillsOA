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
const PLATFORM_SEED_VERSION = "2026-07-platforms-v1";

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
  const [platformSeedVersion, setPlatformSeedVersion] = useSyncedStorage(
    "lh-platforms-seed-version",
    "",
  );
  const [newName, setNewName] = useState("");
  const [newPayerId, setNewPayerId] = useState("");
  const [newPlatformName, setNewPlatformName] = useState("");
  const [newPlatformUrl, setNewPlatformUrl] = useState("");

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

  useEffect(() => {
    if (platformSeedVersion === PLATFORM_SEED_VERSION) return;

    setPlatforms((prev) => {
      const existingNames = new Set(prev.map((platform) => platform.name.trim().toLowerCase()));
      const missingPlatforms = defaultPlatforms.filter(
        (platform) => !existingNames.has(platform.name.toLowerCase()),
      );
      return missingPlatforms.length > 0 ? [...prev, ...missingPlatforms] : prev;
    });
    setPlatformSeedVersion(PLATFORM_SEED_VERSION);
  }, [platformSeedVersion, setPlatformSeedVersion, setPlatforms]);

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
    setPlatforms((prev) => [...prev, { id: slugify(name, "platform"), name, url: newPlatformUrl.trim() }]);
    setNewPlatformName("");
    setNewPlatformUrl("");
  }

  async function handleDeletePlatform(platform: Platform) {
    if (!(await confirm({ message: t("platforms.deleteConfirm", { name: platform.name }) }))) return;
    setPlatforms((prev) => prev.filter((p) => p.id !== platform.id));
  }

  function updatePlatform(platformId: string, updates: Partial<Pick<Platform, "name" | "url">>) {
    setPlatforms((prev) =>
      prev.map((platform) => (platform.id === platformId ? { ...platform, ...updates } : platform)),
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          {t("settings.title")}
        </h1>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)">
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

        <section className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)">
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
      </div>

      <section className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)">
        <h2 className="text-[16px] font-bold text-(--color-ink)">
          {t("settings.workspaceData")}
        </h2>

        <div className="mt-5 grid gap-8 xl:grid-cols-[1.35fr_1fr]">
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-(--color-ink)">{t("settings.payers")}</h3>
            <p className="mt-1 mb-4 text-[13px] text-(--color-ink-muted)">{t("settings.payersHint")}</p>

            {payers.length === 0 ? (
              <p className="mb-4 text-[13px] text-(--color-ink-faint)">{t("payers.empty")}</p>
            ) : (
              <ul className="mb-4 flex max-h-[520px] flex-col divide-y divide-(--color-hairline) overflow-y-auto pr-2">
                {payers.map((payer) => (
                  <li key={payer.id} className="group grid grid-cols-[minmax(0,1fr)_104px_24px] items-center gap-3 py-2">
                    <p className="truncate text-[14px] text-(--color-ink)">{payer.name}</p>
                    <p className="truncate text-[12px] text-(--color-ink-faint)">{payer.payerId}</p>
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

            <form onSubmit={handleAddPayer} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_132px_auto] sm:items-end">
              <div>
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
              <div>
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
                className="flex shrink-0 items-center justify-center gap-1 rounded-(--radius-md) bg-(--color-primary) px-3 py-1.5 text-[13px] font-medium text-(--color-on-primary) hover:bg-(--color-primary-active)"
              >
                <Plus size={14} />
                {t("payers.addNew")}
              </button>
            </form>
          </div>

          <div className="min-w-0 border-t border-(--color-hairline) pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
            <h3 className="text-[14px] font-bold text-(--color-ink)">{t("settings.platforms")}</h3>
            <p className="mt-1 mb-4 text-[13px] text-(--color-ink-muted)">
              {t("settings.platformsHint")}
            </p>

            {platforms.length === 0 ? (
              <p className="mb-4 text-[13px] text-(--color-ink-faint)">{t("platforms.empty")}</p>
            ) : (
              <ul className="mb-4 flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-2">
                {platforms.map((platform) => (
                  <li key={platform.id} className="group grid gap-2 rounded-(--radius-md) border border-(--color-hairline) p-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={platform.name}
                        onChange={(e) => updatePlatform(platform.id, { name: e.target.value })}
                        aria-label={t("platforms.name")}
                        className={`${inputClass} flex-1`}
                      />
                      <button
                        onClick={() => handleDeletePlatform(platform)}
                        aria-label={t("common.delete")}
                        className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <input
                      value={platform.url ?? ""}
                      onChange={(e) => updatePlatform(platform.id, { url: e.target.value })}
                      placeholder={t("platforms.urlPlaceholder")}
                      aria-label={t("platforms.url")}
                      className={inputClass}
                    />
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAddPlatform} className="grid gap-2">
              <div>
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
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
                  {t("platforms.url")}
                </label>
                <input
                  value={newPlatformUrl}
                  onChange={(e) => setNewPlatformUrl(e.target.value)}
                  placeholder={t("platforms.urlPlaceholder")}
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                className="flex shrink-0 items-center justify-center gap-1 rounded-(--radius-md) bg-(--color-primary) px-3 py-1.5 text-[13px] font-medium text-(--color-on-primary) hover:bg-(--color-primary-active)"
              >
                <Plus size={14} />
                {t("platforms.addNew")}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
