"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  calculateHandFanLayout,
  type HandFanLayout,
} from "../../lib/hand-fan-layout";

type FanLayoutOptions = {
  compact?: boolean;
  minExposure?: number;
};

export function useUniformFanLayout(
  count: number,
  { compact = false, minExposure = compact ? 10 : 34 }: FanLayoutOptions = {},
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<HandFanLayout | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || count === 0) {
      setLayout(null);
      return;
    }
    const element = container;

    const media = window.matchMedia(
      "(max-width: 1000px) and (max-height: 500px), (max-width: 960px) and (pointer: coarse)",
    );
    let frame = 0;

    function measure() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const card = element.querySelector<HTMLElement>("[data-fan-card]");
        if (!card) return;
        const computed = window.getComputedStyle(element);
        const available = Math.max(
          0,
          element.clientWidth -
            Number.parseFloat(computed.paddingLeft) -
            Number.parseFloat(computed.paddingRight),
        );
        const cardWidth = card.offsetWidth;
        const next = calculateHandFanLayout({
          availableWidth: available,
          cardWidth,
          count,
          minExposure,
          allowOverflow: media.matches,
        });
        setLayout((current) =>
          current &&
          Math.abs(current.cardWidth - cardWidth) < 0.5 &&
          Math.abs(current.step - next.step) < 0.5 &&
          Math.abs(current.width - next.width) < 0.5
            ? current
            : next);
      });
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const card = element.querySelector<HTMLElement>("[data-fan-card]");
    if (card) observer.observe(card);
    media.addEventListener("change", measure);
    measure();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener("change", measure);
    };
  }, [compact, count, minExposure]);

  const fanStyle = layout
    ? ({
        "--fan-width": `${layout.width}px`,
      } as CSSProperties)
    : undefined;

  return { containerRef, fanStyle, fanStep: layout?.step ?? null };
}
