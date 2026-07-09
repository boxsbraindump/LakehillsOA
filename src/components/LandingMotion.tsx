import { useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function LandingMotion({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap.from("[data-hero-reveal]", {
        opacity: 0,
        y: 22,
        duration: 0.72,
        stagger: 0.09,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });

      gsap.from("[data-preview-frame]", {
        opacity: 0,
        y: 34,
        rotateX: 2,
        duration: 0.95,
        delay: 0.22,
        ease: "power3.out",
        clearProps: "opacity",
      });

      gsap.utils.toArray<HTMLElement>("[data-landing-reveal]").forEach((section) => {
        const items = section.querySelectorAll("[data-reveal-item]");
        gsap.from(items.length ? items : section, {
          opacity: 0,
          y: 26,
          duration: 0.7,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: {
            trigger: section,
            start: "top 82%",
            once: true,
          },
          clearProps: "transform,opacity",
        });
      });

      return () => {
        ScrollTrigger.getAll().forEach((trigger) => {
          if (scope.current?.contains(trigger.trigger as Node)) trigger.kill();
        });
      };
    },
    { scope },
  );

  return <div ref={scope}>{children}</div>;
}
