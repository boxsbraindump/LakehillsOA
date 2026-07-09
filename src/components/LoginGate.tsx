import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import PublicHome from "../pages/PublicHome";

export default function LoginGate({ children }: { children: ReactNode }) {
  const { syncEnabled, isAuthenticated, isChecking } = useAuth();

  if (!syncEnabled || isAuthenticated) return <>{children}</>;
  if (isChecking) return <PublicHome isChecking />;
  return <Navigate to="/welcome" replace />;
}
