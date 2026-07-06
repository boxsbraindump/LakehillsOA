import { useState, type ReactNode } from "react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { Sparkles } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { googleClientId } from "../lib/syncApi";

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "此邮箱未获授权，请联系管理员添加",
  invalid_token: "登录验证失败，请重试",
  network_error: "无法连接服务器，请检查网络后重试",
};

export default function LoginGate({ children }: { children: ReactNode }) {
  const { syncEnabled, isAuthenticated, isChecking, loginWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (!syncEnabled || isAuthenticated) return <>{children}</>;
  if (isChecking) return null;

  return (
    <div className="flex min-h-svh items-center justify-center bg-(--color-canvas-soft) px-6">
      <div className="w-full max-w-sm rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-8 shadow-(--shadow-level-2)">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles size={18} className="text-(--color-primary)" strokeWidth={2.25} />
          <h1 className="text-[18px] font-bold text-(--color-ink)">Lake Hills OA</h1>
        </div>
        <p className="mb-5 text-[14px] text-(--color-ink-muted)">用 Google 账号登录继续</p>

        <GoogleOAuthProvider clientId={googleClientId!}>
          <GoogleLogin
            onSuccess={async (response) => {
              setError(null);
              if (!response.credential) {
                setError("invalid_token");
                return;
              }
              const result = await loginWithGoogle(response.credential);
              if (!result.ok) setError(result.error);
            }}
            onError={() => setError("invalid_token")}
          />
        </GoogleOAuthProvider>

        {error && (
          <p className="mt-3 text-[13px] text-red-500">
            {ERROR_MESSAGES[error] ?? "登录失败，请重试"}
          </p>
        )}
      </div>
    </div>
  );
}
