import { useEffect, useState } from "react";
import { readCellTime } from "../lib/visitLedger";

/**
 * An appointment time you can type however you would write it.
 *
 * Deliberately a text field rather than `<input type="time">`: the native control brings the
 * operating system's own spinner and clock, which is the chrome the rest of this page was built
 * to get rid of. It also insists on a rigid format, and the front desk writes "2:30".
 *
 * Committing runs the same parser the spreadsheet import uses, so what you type here and what
 * the sheet says are read by one set of rules — including that a bare 1:00–6:59 is the
 * afternoon. Anything unreadable reverts rather than being silently dropped; emptying the field
 * clears the time.
 */
export function TimeField({
  value,
  onChange,
  ariaLabel,
  className = "",
  placeholder = "--:--",
}: {
  value?: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");

  // Follow the record when it changes underneath — an undo, or another row being opened.
  useEffect(() => setDraft(value ?? ""), [value]);

  function commit() {
    const text = draft.trim();
    if (text === "") {
      if (value) onChange("");
      return;
    }
    const read = readCellTime(text);
    if (!read) {
      setDraft(value ?? "");
      return;
    }
    setDraft(read.time);
    if (read.time !== value) onChange(read.time);
  }

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(value ?? "");
          event.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
      placeholder={placeholder}
      inputMode="numeric"
      size={5}
      className={[
        "w-[5ch] rounded-(--radius-xs) border border-transparent bg-transparent px-1 py-0.5 text-center font-mono outline-none hover:border-(--color-hairline) focus:border-(--color-primary)",
        className,
      ].join(" ")}
    />
  );
}
