import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Check, LogOut, Plus, Settings, X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useLanguage } from "./LanguageProvider";

export default function ProfileMenu({ placement = "top" }: { placement?: "top" | "bottom" }) {
  const { email, logout, workspace, workspaces, switchWorkspace, createWorkspace, syncEnabled } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
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

  async function handleCreateWorkspace(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = newWorkspaceName.trim();
    if (!name) return;
    setWorkspaceError(null);
    const result = await createWorkspace(name);
    if (!result.ok) {
      setWorkspaceError(t("profileMenu.createWorkspaceError"));
      return;
    }
    setNewWorkspaceName("");
    setIsCreatingWorkspace(false);
    setOpen(false);
    navigate("/");
  }

  return (
    <div ref={ref} className="relative">
      {open && (
        <div
          className={[
            "fade-in-up absolute left-0 z-20 w-full min-w-[240px] rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) py-1 shadow-(--shadow-level-2)",
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
          {syncEnabled && (
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
              {isCreatingWorkspace ? (
                <form onSubmit={handleCreateWorkspace} className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={newWorkspaceName}
                      onChange={(e) => {
                        setNewWorkspaceName(e.target.value);
                        setWorkspaceError(null);
                      }}
                      placeholder={t("profileMenu.workspaceNamePlaceholder")}
                      className="min-w-0 flex-1 rounded-(--radius-sm) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1.5 text-[13px] text-(--color-ink) outline-none transition focus:border-(--color-primary)"
                    />
                    <button
                      type="submit"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-sm) bg-(--color-primary) text-white transition hover:bg-(--color-primary-hover)"
                      aria-label={t("profileMenu.createWorkspace")}
                    >
                      <Check size={14} strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingWorkspace(false);
                        setNewWorkspaceName("");
                        setWorkspaceError(null);
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-sm) text-(--color-ink-tertiary) transition hover:bg-(--color-canvas-soft) hover:text-(--color-ink)"
                      aria-label={t("common.cancel")}
                    >
                      <X size={14} strokeWidth={2.2} />
                    </button>
                  </div>
                  {workspaceError && (
                    <p className="mt-1.5 text-[12px] text-(--color-danger)">{workspaceError}</p>
                  )}
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingWorkspace(true);
                    setWorkspaceError(null);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] text-(--color-ink-secondary) hover:bg-(--color-canvas-soft)"
                >
                  <Plus size={15} strokeWidth={2} className="shrink-0" />
                  {t("profileMenu.newWorkspace")}
                </button>
              )}
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
