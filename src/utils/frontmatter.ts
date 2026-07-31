import { Document, Scalar, parseDocument } from "yaml";

export interface PostMetadata {
  title: string;
  date: string;
  tags: string[];
  categories: string[];
  preview: string;
}

export interface ParsedPostSource {
  body: string;
  document: Document;
  metadata: Partial<PostMetadata>;
}

const FRONTMATTER_PATTERN = /^(?:\uFEFF)?\s*---[ \t]*\r?\n(?:(?:---[ \t]*(?:\r?\n|$))|([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$))/;

export function parsePostSource(raw: string): ParsedPostSource {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { body: raw, document: new Document({}), metadata: {} };
  }

  const document = parseDocument(match[1] ?? "");
  if (document.errors.length) {
    throw new Error(`Frontmatter 格式错误：${document.errors[0].message}`);
  }
  const parsedFrontmatter = document.toJS();
  if (parsedFrontmatter != null && (Array.isArray(parsedFrontmatter) || typeof parsedFrontmatter !== "object")) {
    throw new Error("Frontmatter 必须是键值对象");
  }
  const frontmatter = (parsedFrontmatter ?? {}) as Record<string, unknown>;

  return {
    body: raw.slice(match[0].length),
    document,
    metadata: {
      title: readString(frontmatter, "title"),
      date: readString(frontmatter, "date"),
      tags: readStringArray(frontmatter, "tags"),
      categories: readStringArray(frontmatter, "categories"),
      preview: readString(frontmatter, "preview"),
    },
  };
}

export function serializePostSource(
  document: Document,
  metadata: PostMetadata,
  body: string,
): string {
  const nextDocument = document.clone();
  nextDocument.set("title", metadata.title.trim());
  const normalizedDate = metadata.date.trim().replace("T", " ");
  if (normalizedDate) {
    const date = new Scalar(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalizedDate)
      ? `${normalizedDate}:00`
      : normalizedDate);
    date.type = Scalar.QUOTE_DOUBLE;
    nextDocument.set("date", date);
  } else {
    nextDocument.delete("date");
  }
  nextDocument.set("tags", metadata.tags);
  nextDocument.set("categories", metadata.categories);
  if (metadata.preview.trim()) nextDocument.set("preview", metadata.preview.trim());
  else nextDocument.delete("preview");

  const yaml = nextDocument.toString({ lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${body}`;
}

function readString(frontmatter: Record<string, unknown>, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) return undefined;
  const value = frontmatter[key];
  if (value == null) return "";
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Frontmatter 的 ${key} 必须是文本`);
  }
  return String(value);
}

function readStringArray(frontmatter: Record<string, unknown>, key: string): string[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) return undefined;
  const value = frontmatter[key];
  if (value == null) return [];
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") return item.trim() ? [item.trim()] : [];
      if (typeof item === "number" || typeof item === "boolean") return [String(item)];
      return [];
    });
  }
  return [];
}
