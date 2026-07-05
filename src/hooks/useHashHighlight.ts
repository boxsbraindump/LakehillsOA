import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Scrolls to and briefly highlights the element matching the URL hash. */
export function useHashHighlight() {
  const location = useLocation();

  useEffect(() => {
    const id = location.hash.replace("#", "");
    if (!id) return;

    const el = document.getElementById(id);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-highlight");
    const timer = setTimeout(() => el.classList.remove("ring-highlight"), 2000);
    return () => clearTimeout(timer);
  }, [location]);
}
