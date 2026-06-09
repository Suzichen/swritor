import { parse, stringify } from "comment-json";

export interface SocialLinkItem {
  platform: string;
  url?: string;
  icon?: string;
  label?: string;
}

export interface SiteConfigData {
  $schema?: string;
  title: string;
  description: string;
  logo: string;
  favicon: string;
  siteUrl: string;
  author: string;
  language: string;
  timezone: string;
  basePath?: string;
  links: { enabled: boolean; items: Record<string, string> };
  socialLinks: { enabled: boolean; items: SocialLinkItem[] };
}

export function getConfigDefaults(): SiteConfigData {
  return {
    title: "",
    description: "",
    logo: "/logo.png",
    favicon: "/favicon.ico",
    siteUrl: "",
    author: "",
    language: "en",
    timezone: "UTC",
    links: { enabled: true, items: {} },
    socialLinks: { enabled: true, items: [] },
  };
}

/** Parse JSONC string, preserving comments as symbol properties */
export function parseConfig(raw: string): any {
  try {
    return parse(raw);
  } catch {
    return getConfigDefaults();
  }
}

/** Serialize object back to JSONC string, preserving comments */
export function serializeConfig(data: any): string {
  return stringify(data, null, 2) + "\n";
}
