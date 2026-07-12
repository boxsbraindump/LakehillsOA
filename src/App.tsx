import { Outlet } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmProvider } from "./components/ConfirmProvider";
import ClickSpark from "./components/ClickSpark";
import { useAuth } from "./components/AuthProvider";
import WorkspaceOnboarding from "./pages/WorkspaceOnboarding";
import { useSyncedStorage } from "./hooks/useSyncedStorage";

function WorkspaceShell() {
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-(--color-canvas-soft) md:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.58)_0%,rgba(244,248,247,0.88)_52%,rgba(247,250,249,1)_100%)]">
        <Outlet />
      </main>
      <ClickSpark />
    </div>
  );
}

function App() {
  const { syncEnabled, workspace } = useAuth();
  const [workspaceInitialized, setWorkspaceInitialized] = useSyncedStorage(
    "lh-workspace-initialized",
    false,
  );
  const needsOnboarding = syncEnabled && workspace && !workspace.isPrimary && !workspaceInitialized;

  return (
    <ToastProvider>
      <ConfirmProvider>
        {needsOnboarding ? (
          <WorkspaceOnboarding onComplete={() => setWorkspaceInitialized(true)} />
        ) : (
          <WorkspaceShell key={workspace?.id ?? "local"} />
        )}
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;
