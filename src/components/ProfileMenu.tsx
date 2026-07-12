import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, LogOut, Settings } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useLanguage } from "./LanguageProvider";

export default function ProfileMenu({ placement = "top" }: { placement?: "top" | "bottom" }) {
  const { email, logout, workspace, workspaces, switchWorkspace } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const initial = email?.trim()[0]?.toUpperCase() ?? "?";

  return (
    <div ref={ref} className="relative">
      {open && (
        <div
          className={[
            "fade-in-up absolute left-0 z-20 w-full min-w-[180px] rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) py-1 shadow-(--shadow-level-2)",
            placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
          ].join(" ")}
        >
          <button
            onClick={() => {
              setOpen(false);
              navigate("/settings");
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-[14px] text-(--color-ink-secondary) hover:bg-(--color-canvas-soft)"
          >
            <Settings size={15} strokeWidth={2} className="shrink-0" />
            {t("profileMenu.settings")}
          </button>
          {workspaces.length > 1 && (
            <>
              <div className="my-1 border-t border-(--color-hairline)" />
              <p className="px-3 pt-1 pb-1 text-[11px] font-semibold text-(--color-ink-faint)">
                {t("profileMenu.workspaces")}
              </p>
              {workspaces.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setOpen(false);
                    switchWorkspace(item.id);
                    navigate("/");
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] text-(--color-ink-secondary) hover:bg-(--color-canvas-soft)"
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {workspace?.id === item.id && (
                    <Check size={14} strokeWidth={2.2} className="shrink-0 text-(--color-primary)" />
                  )}
                </button>
              ))}
            </>
          )}
          <div className="my-1 border-t border-(--color-hairline)" />
          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-[14px] text-(--color-ink-secondary) hover:bg-(--color-canvas-soft)"
          >
            <LogOut size={15} strokeWidth={2} className="shrink-0" />
            {t("profileMenu.logout")}
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex w-full items-center gap-2.5 rounded-(--radius-md) px-2 py-2 text-left transition-colors",
          open ? "bg-(--color-canvas-soft)" : "hover:bg-(--color-canvas-soft)",
        ].join(" ")}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--color-primary)/12 text-[12px] font-semibold text-(--color-primary)">
          {initial}
        </span>
        <span className="hidden min-w-0 flex-1 truncate text-[13px] text-(--color-ink-secondary) md:block">
          {email}
        </span>
      </button>
    </div>
  );
}
