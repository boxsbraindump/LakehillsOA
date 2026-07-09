import { useState } from "react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { AlertCircle, Loader2, LockKeyhole, Sparkles } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useLanguage } from "./LanguageProvider";
import { googleClientId } from "../lib/syncApi";
import type { TranslationKey } from "../lib/translations";

const ERROR_CONTENT: Record<
  string,
  { title: TranslationKey; body: TranslationKey; action: TranslationKey }
> = {
  not_allowed: {
    title: "login.error.not_allowed.title",
    body: "login.error.not_allowed.body",
    action: "login.error.not_allowed.action",
  },
  invalid_token: {
    title: "login.error.invalid_token.title",
    body: "login.error.invalid_token.body",
    action: "login.error.invalid_token.action",
  },
  network_error: {
    title: "login.error.network_error.title",
    body: "login.error.network_error.body",
    action: "login.error.network_error.action",
  },
  sync_not_configured: {
    title: "login.error.sync_not_configured.title",
    body: "login.error.sync_not_configured.body",
    action: "login.error.sync_not_configured.action",
  },
  google_popup: {
    title: "login.error.google_popup.title",
    body: "login.error.google_popup.body",
    action: "login.error.google_popup.action",
  },
  generic: {
    title: "login.error.generic.title",
    body: "login.error.generic.body",
    action: "login.error.generic.action",
  },
};

function LoginErrorBox({ code }: { code: string }) {
  const { t } = useLanguage();
  const content = ERROR_CONTENT[code] ?? ERROR_CONTENT.generic;

  return (
    <div className="mt-4 rounded-(--radius-md) border border-red-200 bg-red-50/80 p-3.5 text-[13px] text-red-700">
      <div className="flex items-start gap-2">
        <AlertCircle size={15} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{t(content.title)}</p>
          <p className="mt-1 leading-relaxed">{t(content.body)}</p>
          <p className="mt-2 leading-relaxed text-red-800">{t(content.action)}</p>
          <p className="mt-2 text-[11px] font-medium text-red-500">
            {t("login.error.code", { code })}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPanel({ isChecking = false }: { isChecking?: boolean }) {
  const { t } = useLanguage();
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  return (
    <div className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-2) sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary) text-white shadow-[0_6px_18px_rgba(40,175,165,0.24)]">
          <Sparkles size={17} strokeWidth={2.25} />
        </span>
        <div>
          <p className="text-[16px] font-bold text-(--color-ink)">Lake Hills OA</p>
          <p className="mt-0.5 text-[13px] text-(--color-ink-muted)">{t("login.subtitle")}</p>
        </div>
      </div>

      {isChecking ? (
        <div className="flex items-center gap-2 rounded-(--radius-md) bg-(--color-canvas-soft) px-3 py-3 text-(--color-ink-muted)">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[13px]">{t("login.checkingSession")}</span>
        </div>
      ) : (
        <>
          {googleClientId ? (
            <GoogleOAuthProvider clientId={googleClientId}>
              <GoogleLogin
                width="100%"
                onSuccess={async (response) => {
                  setError(null);
                  if (!response.credential) {
                    setError("invalid_token");
                    return;
                  }
                  setIsVerifying(true);
                  const result = await loginWithGoogle(response.credential);
                  setIsVerifying(false);
                  if (!result.ok) setError(result.error);
                }}
                onError={() => setError("google_popup")}
              />
            </GoogleOAuthProvider>
          ) : (
            <LoginErrorBox code="sync_not_configured" />
          )}

          {isVerifying && (
            <div className="mt-3 flex items-center gap-1.5 text-(--color-ink-faint)">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[13px]">{t("login.verifying")}</span>
            </div>
          )}

          {error && <LoginErrorBox code={error} />}
        </>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-(--radius-md) bg-(--color-canvas-soft) px-3 py-3 text-[12px] leading-relaxed text-(--color-ink-muted)">
        <LockKeyhole size={14} className="mt-0.5 shrink-0 text-(--color-primary)" />
        <p>{t("publicHome.accessNote")}</p>
      </div>
    </div>
  );
}
