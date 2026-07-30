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
}

const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parsePostSource(raw: string): ParsedPostSource {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { body: raw, document: new Document({}) };
  }

  return {
    body: raw.slice(match[0].length),
    document: parseDocument(match[1]),
  };
}

export function serializePostSource(
  document: Document,
  metadata: PostMetadata,
  body: string,
): string {
  document.set("title", metadata.title.trim());
  const normalizedDate = metadata.date.trim().replace("T", " ");
  const date = new Scalar(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalizedDate)
    ? `${normalizedDate}:00`
    : normalizedDate);
  date.type = Scalar.QUOTE_DOUBLE;
  document.set("date", date);
  document.set("tags", metadata.tags);
  document.set("categories", metadata.categories);
  document.set("preview", metadata.preview.trim());

  const yaml = document.toString({ lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${body}`;
}
