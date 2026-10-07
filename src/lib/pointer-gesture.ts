export const TAP_MOVEMENT_THRESHOLD_PX = 8;

export type PointerPoint = {
  clientX: number;
  clientY: number;
};

export function isTapGesture(
  start: PointerPoint,
  end: PointerPoint,
  threshold = TAP_MOVEMENT_THRESHOLD_PX,
): boolean {
  return Math.hypot(end.clientX - start.clientX, end.clientY - start.clientY) <= threshold;
}

export function canStartHandReorder(
  pointerType: string,
  arrangeMode: boolean,
): boolean {
  return pointerType !== "touch" || arrangeMode;
}
