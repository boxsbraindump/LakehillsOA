import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Popover } from "./Popover";
import { monthGridDays, monthKeyOf, shiftDateKey, shiftMonthKey, todayKey } from "../lib/date";
import { useLanguage } from "./LanguageProvider";

const WEEKDAYS = ["ledger.sun", "ledger.mon", "ledger.tue", "ledger.wed", "ledger.thu", "ledger.fri", "ledger.sat"] as const;

/** "2026-09-21" -> "2026/09/21", the compact form that fits a table cell. */
function compact(dateKey: string): string {
  return dateKey.replaceAll("-", "/");
}

/**
 * A date field that looks like the rest of the app.
 *
 * `<input type="date">` renders the operating system's own control — its calendar glyph, its
 * picker, its formatting — which is why the ledger had a row of grey OS icons running down it.
 * This draws the month itself, reusing the same grid helper the calendar view uses.
 *
 * Keyboard: arrows move by a day or a week, PageUp/PageDown by a month, Enter commits, Escape
 * closes. The highlighted day is the one that would be committed.
 */
export function DatePicker({
  value,
  onChange,
  ariaLabel,
  className = "",
  align = "start",
  placeholder = "—",
}: {
  value?: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  align?: "start" | "end";
  placeholder?: string;
}) {
  const { t, lang } = useLanguage();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const today = todayKey();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(value ?? today);
  const month = monthKeyOf(cursor);

  // Reopening on a different row must not show the previous row's month.
  useEffect(() => {
    if (open) setCursor(value ?? today);
  }, [open, value, today]);

  function commit(day: string) {
    onChange(day);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={[
          "cursor-pointer rounded-(--radius-control) border border-transparent px-1.5 py-0.5 text-left tabular-nums outline-none hover:border-(--color-hairline) focus-visible:ring-2 focus-visible:ring-(--color-primary)/40",
          value ? "" : "text-(--color-ink-faint)",
          className,
        ].join(" ")}
      >
        {value ? compact(value) : placeholder}
      </button>

      <Popover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} align={align} width={252}>
        <div
          tabIndex={-1}
          ref={(node) => node?.focus()}
          onKeyDown={(event) => {
            const by = (days: number) => {
              event.preventDefault();
              setCursor((c) => shiftDateKey(c, days));
            };
            if (event.key === "ArrowLeft") by(-1);
            else if (event.key === "ArrowRight") by(1);
            else if (event.key === "ArrowUp") by(-7);
            else if (event.key === "ArrowDown") by(7);
            else if (event.key === "PageUp") {
              event.preventDefault();
              setCursor((c) => shiftMonthKey(monthKeyOf(c), -1) + c.slice(7));
            } else if (event.key === "PageDown") {
              event.preventDefault();
              setCursor((c) => shiftMonthKey(monthKeyOf(c), 1) + c.slice(7));
            } else if (event.key === "Enter") {
              event.preventDefault();
              commit(cursor);
            }
          }}
          className="p-2 outline-none"
        >
          <div className="mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCursor(shiftMonthKey(month, -1) + cursor.slice(7))}
              aria-label={t("ledger.prevMonth")}
              className="rounded-(--radius-control) p-1 text-(--color-ink-faint) hover:text-(--color-primary)"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[13px] font-medium text-(--color-ink) tabular-nums">{month}</span>
            <button
              type="button"
              onClick={() => setCursor(shiftMonthKey(month, 1) + cursor.slice(7))}
              aria-label={t("ledger.nextMonth")}
              className="rounded-(--radius-control) p-1 text-(--color-ink-faint) hover:text-(--color-primary)"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7">
            {WEEKDAYS.map((key) => (
              <span
                key={key}
                className="py-1 text-center text-[11px] font-medium text-(--color-ink-faint)"
              >
                {t(key)}
              </span>
            ))}
            {monthGridDays(month).map((day) => {
              const inMonth = day.startsWith(month);
              const isSelected = day === value;
              const isCursor = day === cursor;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => commit(day)}
                  aria-current={isSelected ? "date" : undefined}
                  className={[
                    "m-0.5 rounded-(--radius-control) py-1 text-center text-[12px] tabular-nums",
                    inMonth ? "text-(--color-ink)" : "text-(--color-ink-faint)",
                    isSelected
                      ? "bg-(--color-primary) font-bold text-(--color-on-primary)"
                      : isCursor
                        ? "ring-1 ring-(--color-primary)/50"
                        : "hover:bg-(--color-canvas-soft)",
                    day === today && !isSelected ? "font-bold text-(--color-primary)" : "",
                  ].join(" ")}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
          </div>

          <div className="mt-1 flex items-center justify-between border-t border-(--color-hairline) pt-1.5">
            <button
              type="button"
              onClick={() => commit(today)}
              className="rounded-(--radius-control) px-2 py-1 text-[12px] font-medium text-(--color-primary)"
            >
              {t("ledger.thisMonthToday")}
            </button>
            <span className="px-1 text-[11px] text-(--color-ink-faint)">
              {value ? new Date(`${value}T12:00:00`).toLocaleDateString(
                lang === "zh" ? "zh-CN" : "en-US",
                { weekday: "short" },
              ) : ""}
            </span>
          </div>
        </div>
      </Popover>
    </>
  );
}
