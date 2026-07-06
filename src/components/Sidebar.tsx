import { NavLink } from "react-router-dom";
import { ClipboardCheck, FileSearch, CreditCard, Sparkles, Trash2, LogOut } from "lucide-react";
import { useAuth } from "./AuthProvider";

const NAV_ITEMS = [
  { to: "/checklist", label: "前台工作 Checklist", icon: ClipboardCheck, dot: "var(--color-accent-teal)" },
  { to: "/oa-cases", label: "OA Cases", icon: FileSearch, dot: "var(--color-accent-orange)" },
  { to: "/payments", label: "Where to Find Payments", icon: CreditCard, dot: "var(--color-accent-purple)" },
] as const;

const UTILITY_NAV_ITEMS = [{ to: "/trash", label: "垃圾桶", icon: Trash2 }] as const;

export default function Sidebar() {
  const { syncEnabled, email, logout } = useAuth();

  return (
    <aside className="flex shrink-0 flex-col border-b border-(--color-hairline) bg-(--color-canvas) px-3 py-3 md:h-svh md:w-64 md:border-r md:border-b-0 md:py-4">
      <NavLink
        to="/"
        className="flex items-center gap-2 rounded-(--radius-md) px-2 py-1.5 text-[15px] font-semibold text-(--color-ink) hover:bg-(--color-canvas-soft)"
      >
        <Sparkles size={18} className="text-(--color-primary)" strokeWidth={2.25} />
        Lake Hills OA
      </NavLink>

      <div className="hidden px-2 pb-4 text-[12px] text-(--color-ink-faint) md:block">
        Lake Hills Acupuncture · Internal
      </div>

      <nav className="flex gap-0.5 overflow-x-auto md:flex-col md:overflow-visible">
        {NAV_ITEMS.map(({ to, label, icon: Icon, dot }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                "group flex shrink-0 items-center gap-2.5 rounded-(--radius-md) px-2 py-2 text-[14px] whitespace-nowrap transition-colors",
                isActive
                  ? "bg-(--color-primary)/8 font-medium text-(--color-primary)"
                  : "text-(--color-ink-secondary) hover:bg-(--color-canvas-soft)",
              ].join(" ")
            }
          >
            <Icon size={16} strokeWidth={2} className="shrink-0" />
            <span className="truncate">{label}</span>
            <span
              className="ml-auto hidden h-1.5 w-1.5 shrink-0 rounded-full md:block"
              style={{ backgroundColor: dot }}
              aria-hidden
            />
          </NavLink>
        ))}
      </nav>

      <nav className="mt-auto flex gap-0.5 overflow-x-auto border-(--color-hairline) pt-2 md:mt-4 md:flex-col md:overflow-visible md:border-t">
        {UTILITY_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                "flex shrink-0 items-center gap-2.5 rounded-(--radius-md) px-2 py-2 text-[14px] whitespace-nowrap transition-colors",
                isActive
                  ? "bg-(--color-primary)/8 font-medium text-(--color-primary)"
                  : "text-(--color-ink-secondary) hover:bg-(--color-canvas-soft)",
              ].join(" ")
            }
          >
            <Icon size={16} strokeWidth={2} className="shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
        {syncEnabled && (
          <>
            {email && (
              <div className="hidden truncate px-2 pt-1 text-[12px] text-(--color-ink-faint) md:block">
                {email}
              </div>
            )}
            <button
              onClick={logout}
              className="flex shrink-0 items-center gap-2.5 rounded-(--radius-md) px-2 py-2 text-[14px] whitespace-nowrap text-(--color-ink-secondary) transition-colors hover:bg-(--color-canvas-soft)"
            >
              <LogOut size={16} strokeWidth={2} className="shrink-0" />
              <span className="truncate">退出登录</span>
            </button>
          </>
        )}
      </nav>
    </aside>
  );
}
