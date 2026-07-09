import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import PublicHome from "../pages/PublicHome";

export default function LoginGate({ children }: { children: ReactNode }) {
  const { syncEnabled, isAuthenticated, isChecking } = useAuth();

  if (!syncEnabled || isAuthenticated) return <>{children}</>;
  return <PublicHome isChecking={isChecking} />;
}
