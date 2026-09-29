import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover } from "./Popover";

export interface SelectOption {
  value: string;
  label: string;
  /** Optional chip classes, so an option can carry the colour it will have once chosen. */
  tone?: string;
}

/**
 * A select that looks like the rest of the app.
 *
 * A native `<select>` draws its own arrow and its own option list from the operating system, so
 * next to a coloured status chip it reads as something glued on from elsewhere. This renders the
 * trigger as the chip itself and the list as an ordinary panel.
 *
 * Keyboard: Up/Down move the highlight, Enter or Space commits, Escape closes, Home/End jump.
 * Typing is not handled — these lists are five items long.
 */
export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  align = "start",
  placeholder = "—",
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  align?: "start" | "end";
  placeholder?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const current = options.find((option) => option.value === value) ?? null;

  function openList() {
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  }

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (open) return;
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openList();
          }
        }}
        className={[
          "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)/40",
          className,
        ].join(" ")}
      >
        <span className="truncate">{current ? current.label : placeholder}</span>
        <ChevronDown size={12} className="shrink-0 opacity-50" />
      </button>

      <Popover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} align={align}>
        <ul
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          ref={(node) => node?.focus()}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((i) => (i + 1) % options.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => (i - 1 + options.length) % options.length);
            } else if (event.key === "Home") {
              event.preventDefault();
              setActive(0);
            } else if (event.key === "End") {
              event.preventDefault();
              setActive(options.length - 1);
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (options[active]) commit(options[active].value);
            }
          }}
          className="max-h-64 overflow-y-auto py-1 outline-none"
        >
          {options.map((option, i) => {
            const selected = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(option.value)}
                  className={[
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px]",
                    i === active ? "bg-(--color-canvas-soft)" : "",
                  ].join(" ")}
                >
                  <Check
                    size={14}
                    className={[
                      "shrink-0 text-(--color-primary)",
                      selected ? "" : "invisible",
                    ].join(" ")}
                  />
                  {option.tone ? (
                    <span
                      className={["rounded-full border px-2 py-0.5 text-[12px]", option.tone].join(
                        " ",
                      )}
                    >
                      {option.label}
                    </span>
                  ) : (
                    <span className="truncate text-(--color-ink)">{option.label}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Popover>
    </>
  );
}
