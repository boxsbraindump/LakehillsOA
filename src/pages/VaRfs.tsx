import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, Loader2, RotateCcw } from "lucide-react";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useLanguage } from "../components/LanguageProvider";
import { useToast } from "../components/ToastProvider";
import {
  EMPTY_RFS_DEFAULTS,
  FORM_ASSET,
  FORM_REVISION,
  fillRfsForm,
  rfsFileName,
} from "../lib/vaRfsForm";
import type { RfsClinicDefaults, RfsPatientFields } from "../lib/vaRfsForm";

function todayUS(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${now.getFullYear()}`;
}

/**
 * The boxes that copy the clinic's usual answers start out holding them, rather than showing
 * them as grey placeholder text. A box that looks empty but prints something is unsettling,
 * and there is no way to tell from looking whether it will be filled.
 */
function startingPatient(defaults: RfsClinicDefaults): RfsPatientFields {
  return {
    veteranName: "",
    dateOfBirth: "",
    vaFacility: defaults.vaFacility,
    authorizationNumber: "",
    icd10: "",
    diagnosisDescription: "",
    cptCodes: defaults.cptCodes,
    cptDescription: "",
    reason: defaults.reason,
    todaysDate: todayUS(),
  };
}

const inputClass =
  "w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1.5 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)";

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
      {hint && <span className="mt-0.5 block text-[11px] text-(--color-ink-faint)">{hint}</span>}
    </label>
  );
}

/**
 * A VA patient who runs out of authorised visits needs a fresh Request for Service, and the
 * form is a flat PDF, so it was being filled in by hand every time. Most of its boxes are the
 * clinic's own details and never change; this page holds those and asks only for the rest.
 *
 * The veteran's details are deliberately **not** stored — they are typed, printed, and gone.
 */
export default function VaRfs() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [defaults, setDefaults] = useSyncedStorage<RfsClinicDefaults>(
    "lh-va-rfs-defaults",
    EMPTY_RFS_DEFAULTS,
  );
  const [patient, setPatient] = useState<RfsPatientFields>(() => startingPatient(defaults));

  // Filling the clinic details in *after* this page is already open should flow into the
  // boxes that copy them — but must never overwrite something typed for this request.
  const carriedRef = useRef({
    vaFacility: defaults.vaFacility,
    cptCodes: defaults.cptCodes,
    reason: defaults.reason,
  });
  useEffect(() => {
    const previous = carriedRef.current;
    const latest = {
      vaFacility: defaults.vaFacility,
      cptCodes: defaults.cptCodes,
      reason: defaults.reason,
    };
    carriedRef.current = latest;
    setPatient((current) => {
      const next = { ...current };
      for (const key of Object.keys(latest) as (keyof typeof latest)[]) {
        // Untouched means still blank, or still exactly what the old default put there.
        if (!current[key].trim() || current[key] === previous[key]) next[key] = latest[key];
      }
      return next;
    });
  }, [defaults.vaFacility, defaults.cptCodes, defaults.reason]);
  const [showDefaults, setShowDefaults] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (changes: Partial<RfsPatientFields>) => setPatient((prev) => ({ ...prev, ...changes }));
  const setDefault = (changes: Partial<RfsClinicDefaults>) =>
    setDefaults((prev) => ({ ...prev, ...changes }));

  const missingClinic = !defaults.providerOffice.trim() || !defaults.providerName.trim();
  const canGenerate = patient.veteranName.trim().length > 0 && !busy;

  async function generate() {
    setBusy(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${FORM_ASSET}`);
      if (!response.ok) throw new Error("form asset missing");
      const formBytes = await response.arrayBuffer();
      const filled = await fillRfsForm({ defaults, patient, formBytes });

      // Copy into a fresh buffer: the Blob constructor wants a plain ArrayBuffer view.
      const blob = new Blob([new Uint8Array(filled)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = rfsFileName(patient.veteranName, patient.todaysDate);
      link.click();
      URL.revokeObjectURL(url);
      showToast(t("vaRfs.generatedToast"));
    } catch {
      showToast(t("vaRfs.failedToast"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          {t("vaRfs.title")}
        </h1>
        <p className="mt-1 text-[15px] text-(--color-ink-muted)">{t("vaRfs.subtitle")}</p>
      </div>

      {missingClinic && (
        <p className="mb-4 rounded-(--radius-sm) bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {t("vaRfs.fillDefaultsFirst")}
        </p>
      )}

      <section className="mb-5 rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-1) sm:p-6">
        <h2 className="mb-1 text-[16px] font-bold text-(--color-ink)">{t("vaRfs.patientSection")}</h2>
        <p className="mb-4 text-[12px] text-(--color-ink-faint)">{t("vaRfs.notStoredNote")}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("vaRfs.veteranName")}
            value={patient.veteranName}
            onChange={(veteranName) => set({ veteranName })}
            placeholder={t("vaRfs.veteranNamePlaceholder")}
          />
          <Field
            label={t("vaRfs.dateOfBirth")}
            value={patient.dateOfBirth}
            onChange={(dateOfBirth) => set({ dateOfBirth })}
            placeholder="MM/DD/YYYY"
          />
          <Field
            label={t("vaRfs.vaFacility")}
            value={patient.vaFacility}
            onChange={(vaFacility) => set({ vaFacility })}
            placeholder={t("vaRfs.vaFacilityPlaceholder")}
            hint={t("vaRfs.vaFacilityHint")}
          />
          <Field
            label={t("vaRfs.authorizationNumber")}
            value={patient.authorizationNumber}
            onChange={(authorizationNumber) => set({ authorizationNumber })}
          />
          <Field
            label={t("vaRfs.icd10")}
            value={patient.icd10}
            onChange={(icd10) => set({ icd10 })}
            placeholder="M25.519"
          />
          <Field
            label={t("vaRfs.diagnosisDescription")}
            value={patient.diagnosisDescription}
            onChange={(diagnosisDescription) => set({ diagnosisDescription })}
            placeholder={t("vaRfs.diagnosisPlaceholder")}
          />
          <Field
            label={t("vaRfs.cptCodes")}
            value={patient.cptCodes}
            onChange={(cptCodes) => set({ cptCodes })}
            placeholder="97813, 97814"
            hint={t("vaRfs.cptHint")}
          />
          <Field
            label={t("vaRfs.todaysDate")}
            value={patient.todaysDate}
            onChange={(todaysDate) => set({ todaysDate })}
          />
        </div>

        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
            {t("vaRfs.reason")}
          </span>
          <textarea
            value={patient.reason}
            onChange={(e) => set({ reason: e.target.value })}
            placeholder={t("vaRfs.reasonPlaceholder")}
            rows={3}
            className={inputClass}
          />
          <span className="mt-0.5 block text-[11px] text-(--color-ink-faint)">
            {t("vaRfs.reasonHint")}
          </span>
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canGenerate}
            onClick={generate}
            className="flex items-center gap-1.5 rounded-(--radius-md) bg-(--color-primary) px-3.5 py-2 text-[14px] font-medium text-(--color-on-primary) disabled:opacity-40"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {t("vaRfs.generate")}
          </button>
          <button
            type="button"
            onClick={() => setPatient(startingPatient(defaults))}
            className="flex items-center gap-1.5 rounded-(--radius-md) border border-(--color-hairline) px-3 py-2 text-[13px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
          >
            <RotateCcw size={14} />
            {t("vaRfs.clear")}
          </button>
          <span className="text-[12px] text-(--color-ink-faint)">{t("vaRfs.signHint")}</span>
        </div>
      </section>

      <section className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-1) sm:p-6">
        <button
          type="button"
          onClick={() => setShowDefaults((prev) => !prev)}
          className="flex w-full items-center gap-1.5 text-left"
        >
          {showDefaults ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <span className="text-[16px] font-bold text-(--color-ink)">{t("vaRfs.clinicSection")}</span>
        </button>
        <p className="mt-1 ml-[22px] text-[12px] text-(--color-ink-muted)">
          {t("vaRfs.clinicHint")}
        </p>

        {showDefaults && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label={t("vaRfs.providerOffice")}
              value={defaults.providerOffice}
              onChange={(providerOffice) => setDefault({ providerOffice })}
            />
            <Field
              label={t("vaRfs.providerOfficeLine2")}
              value={defaults.providerOfficeLine2}
              onChange={(providerOfficeLine2) => setDefault({ providerOfficeLine2 })}
            />
            <Field
              label={t("vaRfs.phone")}
              value={defaults.phone}
              onChange={(phone) => setDefault({ phone })}
            />
            <Field label={t("vaRfs.fax")} value={defaults.fax} onChange={(fax) => setDefault({ fax })} />
            <Field
              label={t("vaRfs.email")}
              value={defaults.email}
              onChange={(email) => setDefault({ email })}
            />
            <Field
              label={t("vaRfs.providerName")}
              value={defaults.providerName}
              onChange={(providerName) => setDefault({ providerName })}
            />
            <Field label={t("vaRfs.npi")} value={defaults.npi} onChange={(npi) => setDefault({ npi })} />
            <Field
              label={t("vaRfs.defaultVaFacility")}
              value={defaults.vaFacility}
              onChange={(vaFacility) => setDefault({ vaFacility })}
            />
            <Field
              label={t("vaRfs.defaultCpt")}
              value={defaults.cptCodes}
              onChange={(cptCodes) => setDefault({ cptCodes })}
            />
            <Field
              label={t("vaRfs.cptDescription")}
              value={defaults.cptDescription}
              onChange={(cptDescription) => setDefault({ cptDescription })}
            />
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
                {t("vaRfs.defaultReason")}
              </span>
              <textarea
                value={defaults.reason}
                onChange={(e) => setDefault({ reason: e.target.value })}
                rows={2}
                className={inputClass}
              />
            </label>
          </div>
        )}
      </section>

      <p className="mt-4 text-[12px] text-(--color-ink-faint)">
        {t("vaRfs.revisionNote", { revision: FORM_REVISION })}
      </p>
    </div>
  );
}
