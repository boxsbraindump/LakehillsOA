import { useState, type ReactNode } from "react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { googleClientId } from "../lib/syncApi";

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "此邮箱未获授权，请联系管理员添加",
  invalid_token: "登录验证失败，请重试",
  network_error: "无法连接服务器，请检查网络后重试",
};

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
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!syncEnabled || isAuthenticated) return <>{children}</>;

  if (isChecking) {
    return (
      <GateShell>
        <div className="flex items-center justify-center gap-2 py-4 text-(--color-ink-faint)">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-[14px]">正在检查登录状态…</span>
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
      <p className="mb-5 text-[14px] text-(--color-ink-muted)">用 Google 账号登录继续</p>

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
          onError={() => setError("invalid_token")}
        />
      </GoogleOAuthProvider>

      {isVerifying && (
        <div className="mt-3 flex items-center gap-1.5 text-(--color-ink-faint)">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-[13px]">正在验证…</span>
        </div>
      )}

      {error && (
        <p className="mt-3 text-[13px] text-red-500">
          {ERROR_MESSAGES[error] ?? "登录失败，请重试"}
        </p>
      )}
    </GateShell>
  );
}
