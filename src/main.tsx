import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import Home from "./pages/Home.tsx";
import Checklist from "./pages/Checklist.tsx";
import OACases from "./pages/OACases.tsx";
import Payments from "./pages/Payments.tsx";
import Trash from "./pages/Trash.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Home />} />
          <Route path="checklist" element={<Checklist />} />
          <Route path="oa-cases" element={<OACases />} />
          <Route path="payments" element={<Payments />} />
          <Route path="trash" element={<Trash />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
);
