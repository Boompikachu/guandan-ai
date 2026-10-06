import type { OnlineConnectionStatus } from "../../hooks/useOnlineRoom";

export function ConnectionBadge({ status }: { status: OnlineConnectionStatus }) {
  const label = status === "CONNECTED"
    ? "Connected"
    : status === "RECONNECTING"
      ? "Reconnecting..."
      : "Disconnected";
  return (
    <span className={`connection-badge connection-badge--${status.toLowerCase()}`} role="status">
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

