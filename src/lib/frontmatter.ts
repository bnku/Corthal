import type { NoteFrontmatter } from "./types";

export interface ParsedMarkdown {
  frontmatter: NoteFrontmatter | null;
  body: string;
}

export function parseFrontmatter(raw: string): ParsedMarkdown {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: null, body: raw };
  }

  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    return { frontmatter: null, body: raw };
  }

  const yamlBlock = match[1];
  const body = trimmed.slice(match[0].length);
  const frontmatter: NoteFrontmatter = {};

  const lines = yamlBlock.split(/\r?\n/);
  let currentKey: string | null = null;
  let isList = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    // List item: "  - tag_name"
    if (trimmedLine.startsWith("- ") && currentKey && isList) {
      const val = trimmedLine.slice(2).trim().replace(/^["']|["']$/g, "");
      if (!Array.isArray(frontmatter[currentKey])) {
        frontmatter[currentKey] = [];
      }
      frontmatter[currentKey].push(val);
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      const valPart = line.slice(colonIdx + 1).trim();

      currentKey = key;

      if (!valPart) {
        // Probably a list follows
        isList = true;
        frontmatter[key] = [];
      } else if (valPart.startsWith("[") && valPart.endsWith("]")) {
        // Bracketed array: [a, b, c]
        isList = false;
        const items = valPart
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        frontmatter[key] = items;
      } else {
        isList = false;
        frontmatter[key] = valPart.replace(/^["']|["']$/g, "");
      }
    }
  }

  return { frontmatter, body };
}
