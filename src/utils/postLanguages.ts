export const SPAGE_POST_LANGUAGES = ["en", "zh-CN", "ja"] as const;

export type SpagePostLanguage = typeof SPAGE_POST_LANGUAGES[number];

const SPAGE_POST_LANGUAGE_NAMES: Record<SpagePostLanguage, string> = {
  en: "English",
  "zh-CN": "简体中文",
  ja: "日本語",
};

const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/;

export function isValidPostLanguage(language: string) {
  return LANGUAGE_PATTERN.test(language);
}

export function normalizePostLanguage(language: string) {
  const parts = language.trim().split("-");
  return parts
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (part.length === 2) return part.toUpperCase();
      if (part.length === 4) return `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`;
      return part.toLowerCase();
    })
    .join("-");
}

export function isSpagePostLanguage(language: string): language is SpagePostLanguage {
  return SPAGE_POST_LANGUAGES.includes(language as SpagePostLanguage);
}

export function spagePostLanguageName(language: string) {
  return isSpagePostLanguage(language)
    ? SPAGE_POST_LANGUAGE_NAMES[language]
    : languageDisplayName(language);
}

export function parsePostFilename(filename: string) {
  const stem = filename.endsWith(".md") ? filename.slice(0, -3) : filename;
  const separator = stem.lastIndexOf(".");
  if (separator > 0) {
    const language = stem.slice(separator + 1);
    if (isValidPostLanguage(language)) {
      return { slug: stem.slice(0, separator), language };
    }
  }
  return { slug: stem, language: null };
}

export function localizedPostFilename(filename: string, language: string) {
  const { slug } = parsePostFilename(filename);
  return `${slug}.${normalizePostLanguage(language)}.md`;
}

export function languageDisplayName(language: string) {
  try {
    return new Intl.DisplayNames(["zh-CN"], { type: "language" }).of(language) || language;
  } catch {
    return language;
  }
}
