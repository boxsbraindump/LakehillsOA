import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  syncEnabled,
  getAuthToken,
  getAuthEmail,
  clearAuthToken,
  verifySession,
  loginWithGoogle,
  logoutRemote,
  setUnauthorizedHandler,
} from "../lib/syncApi";

interface AuthContextValue {
  syncEnabled: boolean;
  isAuthenticated: boolean;
  isChecking: boolean;
  email: string | null;
  loginWithGoogle: (idToken: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!syncEnabled);
  const [isChecking, setIsChecking] = useState(syncEnabled);
  const [email, setEmail] = useState<string | null>(() => getAuthEmail());

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearAuthToken();
      setIsAuthenticated(false);
      setEmail(null);
    });
  }, []);

  useEffect(() => {
    if (!syncEnabled) return;
    const existing = getAuthToken();
    if (!existing) {
      setIsChecking(false);
      return;
    }
    let cancelled = false;
    verifySession(existing).then((ok) => {
      if (cancelled) return;
      setIsAuthenticated(ok);
      if (!ok) {
        clearAuthToken();
        setEmail(null);
      }
      setIsChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (idToken: string) => {
    const result = await loginWithGoogle(idToken);
    if (result.ok) {
      setIsAuthenticated(true);
      setEmail(result.email);
      return { ok: true as const };
    }
    return { ok: false as const, error: result.error };
  }, []);

  const logout = useCallback(() => {
    void logoutRemote();
    clearAuthToken();
    setIsAuthenticated(false);
    setEmail(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ syncEnabled, isAuthenticated, isChecking, email, loginWithGoogle: login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
