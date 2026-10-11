"use client";

import type { OnlineConnectionStatus } from "../../hooks/useOnlineRoom";
import { useI18n } from "../i18n/I18nProvider";

export function ConnectionBadge({ status }: { status: OnlineConnectionStatus }) {
  const { t } = useI18n();
  const label = status === "CONNECTED"
    ? t("common.connected")
    : status === "RECONNECTING"
      ? t("common.reconnecting")
      : t("common.disconnected");
  return (
    <span className={`connection-badge connection-badge--${status.toLowerCase()}`} role="status">
      <span aria-hidden="true" />
      {label}
    </span>
  );
}
