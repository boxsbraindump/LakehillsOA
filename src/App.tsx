import { Outlet } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { ToastProvider } from "./components/ToastProvider";

function App() {
  return (
    <ToastProvider>
      <div className="flex h-svh flex-col overflow-hidden bg-(--color-canvas-soft) md:flex-row">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}

export default App;
