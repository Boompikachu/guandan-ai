import type { ClientGameView } from "../../shared/multiplayer-protocol";

type OnlineTrickOwnerView = Pick<
  ClientGameView,
  "currentPlay" | "winningSeat" | "self" | "players"
>;

export function getOnlineTrickOwnerName(view: OnlineTrickOwnerView): string | null {
  if (view.currentPlay === null || view.winningSeat === null) return null;
  if (view.winningSeat === view.self.seat) return "You";
  return view.players[view.winningSeat]?.name ?? null;
}
