"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

type FanLayoutOptions = {
  compact?: boolean;
  minExposure?: number;
};

type FanLayout = {
  cardWidth: number;
  step: number;
  width: number;
};

function preferredStep(cardWidth: number, count: number): number {
  if (count >= 23) return cardWidth * 0.62;
  if (count >= 15) return cardWidth * 0.8;
  if (count >= 9) return cardWidth * 0.94;
  return cardWidth + 6;
}

export function useUniformFanLayout(
  count: number,
  { compact = false, minExposure = compact ? 10 : 34 }: FanLayoutOptions = {},
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<FanLayout | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || count === 0) {
      setLayout(null);
      return;
    }
    const element = container;

    const media = window.matchMedia("(max-width: 960px) and (pointer: coarse)");
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
        const fitStep = count <= 1 ? 0 : Math.max(0, (available - cardWidth) / (count - 1));
        const desiredStep = preferredStep(cardWidth, count);
        const step = count <= 1
          ? 0
          : media.matches && fitStep < minExposure
            ? Math.min(desiredStep, minExposure)
            : Math.min(desiredStep, fitStep);
        const width = cardWidth + Math.max(0, count - 1) * step;
        setLayout((current) =>
          current &&
          Math.abs(current.cardWidth - cardWidth) < 0.5 &&
          Math.abs(current.step - step) < 0.5 &&
          Math.abs(current.width - width) < 0.5
            ? current
            : { cardWidth, step, width });
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
        "--fan-step": `${layout.step}px`,
        "--fan-width": `${layout.width}px`,
      } as CSSProperties)
    : undefined;

  return { containerRef, fanStyle };
}
