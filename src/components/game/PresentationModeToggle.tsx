"use client";

import type { GamePresentationMode } from "../../lib/game-presentation";
import { useI18n } from "../i18n/I18nProvider";
import styles from "./PresentationModeToggle.module.css";

export function PresentationModeToggle({
  mode,
  onChange,
  className = "",
}: {
  mode: GamePresentationMode;
  onChange: (mode: GamePresentationMode) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const nextMode = mode === "guided" ? "compact" : "guided";

  return (
    <button
      type="button"
      className={`${styles.toggle} ${className}`.trim()}
      data-presentation-toggle=""
      aria-label={t("presentation.modeAria", {
        mode: t(mode === "guided" ? "presentation.guided" : "presentation.compact"),
      })}
      onClick={() => onChange(nextMode)}
    >
      <span>{t(mode === "guided" ? "presentation.guided" : "presentation.compact")}</span>
      <strong>{t(nextMode === "guided" ? "presentation.showGuidance" : "presentation.reduceGuidance")}</strong>
    </button>
  );
}
