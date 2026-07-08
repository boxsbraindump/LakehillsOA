import { useState, type ReactNode } from "react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { AlertCircle, Sparkles, Loader2 } from "lucide-react";
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

function GateShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-(--color-canvas-soft) px-6">
      <div className="fade-in-up w-full max-w-sm rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-8 shadow-(--shadow-level-2)">
        {children}
      </div>
    </div>
  );
}

export default function LoginGate({ children }: { children: ReactNode }) {
  const { syncEnabled, isAuthenticated, isChecking, loginWithGoogle } = useAuth();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!syncEnabled || isAuthenticated) return <>{children}</>;

  if (isChecking) {
    return (
      <GateShell>
        <div className="flex items-center justify-center gap-2 py-4 text-(--color-ink-faint)">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-[14px]">{t("login.checkingSession")}</span>
        </div>
      </GateShell>
    );
  }

  return (
    <GateShell>
      <div className="mb-1 flex items-center gap-2">
        <Sparkles size={18} className="text-(--color-primary)" strokeWidth={2.25} />
        <h1 className="text-[18px] font-bold text-(--color-ink)">Lake Hills OA</h1>
      </div>
      <p className="mb-5 text-[14px] text-(--color-ink-muted)">{t("login.subtitle")}</p>

      <GoogleOAuthProvider clientId={googleClientId!}>
        <GoogleLogin
          width="320"
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

      {isVerifying && (
        <div className="mt-3 flex items-center gap-1.5 text-(--color-ink-faint)">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-[13px]">{t("login.verifying")}</span>
        </div>
      )}

      {error && <LoginErrorBox code={error} />}
    </GateShell>
  );
}
