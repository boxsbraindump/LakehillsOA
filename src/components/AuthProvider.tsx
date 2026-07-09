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
  getWorkspaceMeta,
  clearAuthToken,
  verifySession,
  loginWithGoogle,
  logoutRemote,
  setUnauthorizedHandler,
  type WorkspaceMeta,
} from "../lib/syncApi";

interface AuthContextValue {
  syncEnabled: boolean;
  isAuthenticated: boolean;
  isChecking: boolean;
  email: string | null;
  workspace: WorkspaceMeta | null;
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
  const [workspace, setWorkspace] = useState<WorkspaceMeta | null>(() => getWorkspaceMeta());

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearAuthToken();
      setIsAuthenticated(false);
      setEmail(null);
      setWorkspace(null);
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
    verifySession(existing).then((result) => {
      if (cancelled) return;
      setIsAuthenticated(result.ok);
      if (result.ok) {
        setEmail(result.email);
        setWorkspace(result.workspace);
      } else {
        clearAuthToken();
        setEmail(null);
        setWorkspace(null);
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
      setWorkspace(result.workspace);
      return { ok: true as const };
    }
    return { ok: false as const, error: result.error };
  }, []);

  const logout = useCallback(() => {
    void logoutRemote();
    clearAuthToken();
    setIsAuthenticated(false);
    setEmail(null);
    setWorkspace(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        syncEnabled,
        isAuthenticated,
        isChecking,
        email,
        workspace,
        loginWithGoogle: login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
