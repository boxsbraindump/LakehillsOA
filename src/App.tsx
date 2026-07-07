import { Outlet } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmProvider } from "./components/ConfirmProvider";
import ClickSpark from "./components/ClickSpark";

function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex h-svh flex-col overflow-hidden bg-(--color-canvas-soft) md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.58)_0%,rgba(244,248,247,0.88)_52%,rgba(247,250,249,1)_100%)]">
            <Outlet />
          </main>
          <ClickSpark />
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;
