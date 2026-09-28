import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * A panel anchored to a trigger, rendered at the document root.
 *
 * It has to be a portal: the ledger table scrolls horizontally (`overflow-x-auto`), and a panel
 * positioned inside it is clipped at the table's edge — which is exactly where the status and
 * date cells are. Fixed positioning measured from the trigger keeps it outside that clip.
 *
 * Closes on Escape and on a pointer press outside it. Scrolling and resizing *re-measure* rather
 * than close: a panel that vanishes because the window changed size loses whatever the person
 * was in the middle of choosing, and a table this wide gets scrolled sideways constantly.
 */
export function Popover({
  open,
  anchorRef,
  onClose,
  children,
  align = "start",
  width,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  /** Which edge of the panel lines up with the trigger's. */
  align?: "start" | "end";
  /** Fixed panel width; otherwise it sizes to its contents but never narrower than the trigger. */
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  // Measured before paint, so the panel never appears at 0,0 and jumps.
  useLayoutEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;

    const measure = () => {
      const a = anchor.getBoundingClientRect();
      const panel = panelRef.current;
      const height = panel?.offsetHeight ?? 0;
      const panelWidth = width ?? panel?.offsetWidth ?? a.width;

      // Flip above when there is no room below, and keep the panel on screen either way.
      const below = a.bottom + 4;
      const fitsBelow = below + height <= window.innerHeight - 8;
      const top = fitsBelow ? below : Math.max(8, a.top - height - 4);

      const raw = align === "end" ? a.right - panelWidth : a.left;
      const left = Math.min(Math.max(8, raw), Math.max(8, window.innerWidth - panelWidth - 8));

      setPlace({ top, left, minWidth: a.width });
    };

    measure();
    // A second pass once the panel has real dimensions to flip against.
    const frame = requestAnimationFrame(measure);

    // Capture, because a scrolling ancestor does not bubble scroll to the window.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, anchorRef, align, width]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: place?.top ?? -9999,
        left: place?.left ?? -9999,
        minWidth: width ?? place?.minWidth,
        width,
        visibility: place ? "visible" : "hidden",
      }}
      className="pop-in z-[60] overflow-hidden rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) shadow-(--shadow-level-2)"
    >
      {children}
    </div>,
    document.body,
  );
}
