import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { useLanguage } from "./LanguageProvider";

export default function LoginGate({ children }: { children: ReactNode }) {
  const { syncEnabled, isAuthenticated, isChecking } = useAuth();
  const { t } = useLanguage();

  if (!syncEnabled || isAuthenticated) return <>{children}</>;
  if (isChecking) {
    return (
      <div className="grid min-h-svh place-items-center bg-(--color-canvas-soft) px-6">
        <div className="flex items-center gap-3 rounded-(--radius-lg) border border-(--color-hairline) bg-white px-5 py-4 shadow-(--shadow-level-1)">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-(--color-primary)" />
          <span className="text-[14px] font-medium text-(--color-ink-secondary)">
            {t("login.checkingSession")}
          </span>
        </div>
      </div>
    );
  }
  return <Navigate to="/welcome" replace />;
}
