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
  fetchWorkspaces,
  createRemoteWorkspace,
  setCurrentWorkspace,
  type WorkspaceMeta,
} from "../lib/syncApi";

interface AuthContextValue {
  syncEnabled: boolean;
  isAuthenticated: boolean;
  isChecking: boolean;
  email: string | null;
  workspace: WorkspaceMeta | null;
  workspaces: WorkspaceMeta[];
  loginWithGoogle: (idToken: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  createWorkspace: (name: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  switchWorkspace: (workspaceId: string) => void;
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
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>(() => {
    const current = getWorkspaceMeta();
    return current ? [current] : [];
  });

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
        fetchWorkspaces().then((items) => {
          if (!cancelled && items.length > 0) setWorkspaces(items);
        });
      } else {
        clearAuthToken();
        setEmail(null);
        setWorkspace(null);
        setWorkspaces([]);
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
      const items = await fetchWorkspaces();
      setWorkspaces(items.length > 0 ? items : [result.workspace]);
      return { ok: true as const };
    }
    return { ok: false as const, error: result.error };
  }, []);

  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      const next = workspaces.find((item) => item.id === workspaceId);
      if (!next || next.id === workspace?.id) return;
      setCurrentWorkspace(next);
      setWorkspace(next);
    },
    [workspace?.id, workspaces],
  );

  const createWorkspace = useCallback(async (name: string) => {
    const result = await createRemoteWorkspace(name);
    if (!result.ok) return { ok: false as const, error: result.error };
    setWorkspace(result.workspace);
    setWorkspaces((prev) => {
      const withoutDuplicate = prev.filter((item) => item.id !== result.workspace.id);
      return [...withoutDuplicate, result.workspace];
    });
    return { ok: true as const };
  }, []);

  const logout = useCallback(() => {
    void logoutRemote();
    clearAuthToken();
    setIsAuthenticated(false);
    setEmail(null);
    setWorkspace(null);
    setWorkspaces([]);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        syncEnabled,
        isAuthenticated,
        isChecking,
        email,
        workspace,
        workspaces,
        loginWithGoogle: login,
        createWorkspace,
        switchWorkspace,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
