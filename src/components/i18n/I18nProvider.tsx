"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  applyDocumentLanguage,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  readLanguagePreference,
  translate,
  writeLanguagePreference,
  type Language,
  type TranslationKey,
  type TranslationParams,
} from "../../i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

type I18nValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

const I18nContext = createContext<I18nValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => undefined,
  t: (key, params) => translate(DEFAULT_LANGUAGE, key, params),
});

const languageListeners = new Set<() => void>();

function subscribeToLanguagePreference(onStoreChange: () => void): () => void {
  function handleStorage(event: StorageEvent) {
    if (event.key === null || event.key === LANGUAGE_STORAGE_KEY) onStoreChange();
  }
  languageListeners.add(onStoreChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    languageListeners.delete(onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function getLanguagePreferenceSnapshot(): Language {
  return readLanguagePreference(window.localStorage);
}

function getServerLanguageSnapshot(): Language {
  return DEFAULT_LANGUAGE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(
    subscribeToLanguagePreference,
    getLanguagePreferenceSnapshot,
    getServerLanguageSnapshot,
  );

  useEffect(() => {
    applyDocumentLanguage(document.documentElement, language);
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    writeLanguagePreference(window.localStorage, next);
    languageListeners.forEach((listener) => listener());
  }, []);

  const value = useMemo<I18nValue>(() => ({
    language,
    setLanguage,
    t: (key, params) => translate(language, key, params),
  }), [language, setLanguage]);

  return (
    <I18nContext.Provider value={value}>
      <LanguageSwitcher language={language} setLanguage={setLanguage} t={value.t} />
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
