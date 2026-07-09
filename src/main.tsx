import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import Home from "./pages/Home.tsx";
import Checklist from "./pages/Checklist.tsx";
import OACases from "./pages/OACases.tsx";
import Payments from "./pages/Payments.tsx";
import CustomCategory from "./pages/CustomCategory.tsx";
import Trash from "./pages/Trash.tsx";
import Settings from "./pages/Settings.tsx";
import { AuthProvider } from "./components/AuthProvider.tsx";
import LoginGate from "./components/LoginGate.tsx";
import { LanguageProvider } from "./components/LanguageProvider.tsx";
import PublicHome from "./pages/PublicHome.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="welcome" element={<PublicHome />} />
            <Route
              element={
                <LoginGate>
                  <App />
                </LoginGate>
              }
            >
                <Route index element={<Home />} />
                <Route path="checklist" element={<Checklist />} />
                <Route path="oa-cases" element={<OACases />} />
                <Route path="payments" element={<Payments />} />
                <Route path="custom/:categoryId" element={<CustomCategory />} />
                <Route path="trash" element={<Trash />} />
                <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
);
