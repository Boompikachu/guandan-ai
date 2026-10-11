export type HandFanLayout = {
  cardWidth: number;
  step: number;
  width: number;
};

function preferredStep(cardWidth: number, count: number): number {
  if (count <= 5) return cardWidth + Math.min(10, cardWidth * 0.16);
  if (count <= 12) return cardWidth * 0.82;
  if (count <= 22) return cardWidth * 0.66;
  return cardWidth * 0.52;
}

export function calculateHandFanLayout({
  availableWidth,
  cardWidth,
  count,
  minExposure,
  allowOverflow,
}: {
  availableWidth: number;
  cardWidth: number;
  count: number;
  minExposure: number;
  allowOverflow: boolean;
}): HandFanLayout {
  if (count <= 1) return { cardWidth, step: 0, width: cardWidth };

  const fitStep = Math.max(0, (availableWidth - cardWidth) / (count - 1));
  const desiredStep = preferredStep(cardWidth, count);
  const step = allowOverflow && fitStep < minExposure
    ? Math.min(cardWidth, Math.max(desiredStep, minExposure))
    : Math.min(desiredStep, fitStep);

  return {
    cardWidth,
    step,
    width: cardWidth + (count - 1) * step,
  };
}
