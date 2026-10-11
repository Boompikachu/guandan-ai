"use client";

import type { Language, TranslationKey, TranslationParams } from "../../i18n";
import styles from "./LanguageSwitcher.module.css";

export function LanguageSwitcher({
  language,
  setLanguage,
  t,
}: {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}) {
  return (
    <div className={styles.switcher} role="group" aria-label={t("language.label")}>
      <button
        type="button"
        className={language === "en" ? styles.active : undefined}
        aria-pressed={language === "en"}
        aria-label={t("language.english")}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
      <i aria-hidden="true" />
      <button
        type="button"
        className={language === "zh-CN" ? styles.active : undefined}
        aria-pressed={language === "zh-CN"}
        aria-label={t("language.chinese")}
        onClick={() => setLanguage("zh-CN")}
      >
        中文
      </button>
    </div>
  );
}
