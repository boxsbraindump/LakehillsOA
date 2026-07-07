import { useEffect, useRef, useState } from "react";

type Spark = {
  id: number;
  x: number;
  y: number;
};

const CLICKABLE_SELECTOR =
  'button, a, input[type="checkbox"], [role="button"], [role="checkbox"], summary';

export default function ClickSpark() {
  const [sparks, setSparks] = useState<Spark[]>([]);
  const sparkIdRef = useRef(0);
  const timeoutRefs = useRef<number[]>([]);

  useEffect(() => {
    const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const activeTimeouts = timeoutRefs.current;

    const handlePointerDown = (event: PointerEvent) => {
      if (reduceMotionQuery.matches || event.button !== 0) return;
      if (!(event.target instanceof Element)) return;

      const target = event.target.closest(CLICKABLE_SELECTOR);
      if (!target || target.closest("[aria-disabled='true'], :disabled")) return;

      const id = sparkIdRef.current;
      sparkIdRef.current += 1;

      setSparks((current) => [...current, { id, x: event.clientX, y: event.clientY }]);

      const timeout = window.setTimeout(() => {
        setSparks((current) => current.filter((spark) => spark.id !== id));
        const timeoutIndex = activeTimeouts.indexOf(timeout);
        if (timeoutIndex >= 0) activeTimeouts.splice(timeoutIndex, 1);
      }, 520);

      activeTimeouts.push(timeout);
    };

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      activeTimeouts.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, []);

  return (
    <div className="click-spark-layer" aria-hidden>
      {sparks.map((spark) => (
        <span
          key={spark.id}
          className="click-spark"
          style={{ left: spark.x, top: spark.y }}
        >
          {Array.from({ length: 8 }).map((_, index) => (
            <i key={index} />
          ))}
        </span>
      ))}
    </div>
  );
}
