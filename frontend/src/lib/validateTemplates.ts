/**
 * Validates {{input.path.to.field}} template variables against accumulated upstream data.
 */

const slugify = (s: string) => s.toLowerCase().replace(/[\s.]+/g, '_');

import { getNodeFields } from '@/components/flow/config/InputPreview';

export interface TemplateError {
  match: string;       // The full {{...}} match
  path: string;        // The path inside (e.g. "input.Summarizer.content")
  message: string;     // Human-readable error
  suggestions: string[];  // Possible correct paths
}
function getFieldsForNode(node: any): string[] {
  return (getNodeFields(node) || []).map((f: any) => f.name);
}

/** Extract path parts from a full path, supporting bracket indexing */
function parsePath(path: string): string[] {
  const parts: string[] = [];
  for (const segment of path.split('.')) {
    const bracketMatch = segment.match(/^(\w+)((?:\[\d+\])*)$/);
    if (bracketMatch) {
      parts.push(bracketMatch[1]);
      // Remove brackets from the rest
      const rest = bracketMatch[2];
      const brackets = rest.match(/\[\d+\]/g);
      if (brackets) parts.push(...brackets.map(b => b.replace(/[\[\]]/g, '')));
    } else {
      parts.push(segment);
    }
  }
  return parts;
}

/** Levenshtein distance for "did you mean?" suggestions */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= m; i++) {
      d[i][j] = a[i - 1] === b[j - 1]
        ? d[i - 1][j - 1]
        : Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]) + 1;
    }
  }
  return d[m][n];
}

/** Find closest matches from a list of candidates */
function closest(term: string, candidates: string[], maxDist = 3): string[] {
  return candidates
    .map(c => ({ c, d: levenshtein(term.toLowerCase(), c.toLowerCase()) }))
    .filter(x => x.d > 0 && x.d <= maxDist)
    .sort((a, b) => a.d - b.d)
    .map(x => x.c)
    .slice(0, 3);
}

/**
 * Build a flat map of all available paths from upstream nodes.
 * Returns { "label.field": true, "label": true, ... }
 */
export function buildAvailablePaths(
  upstreamLabels: string[],
  nodes: any[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const label of upstreamLabels) {
    const upNode = nodes.find(n => {
      const raw = n.data?.label || n.data?.type || n.id;
      return raw === label || slugify(raw) === label;
    });
    if (!upNode) continue;
    const fields = getFieldsForNode(upNode);

    map.set(`input.${label}`, 'label');
    for (const f of fields) {
      map.set(`input.${label}.${f}`, 'field');
    }
  }
  return map;
}

/**
 * Validate all {{input...}} templates in a string against the available upstream data.
 * Returns an array of errors. Empty array = all valid.
 */
export function validateTemplates(
  template: string,
  upstreamLabels: string[],
  nodes: any[],
): TemplateError[] {
  const available = buildAvailablePaths(upstreamLabels, nodes);
  const allPaths = Array.from(available.keys());

  const errors: TemplateError[] = [];
  const regex = /\{\{input\.([^}]+)\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    const fullMatch = match[0];
    const path = match[1].trim();

    // Check if the full path exists
    const fullInputPath = `input.${path}`;
    if (available.has(fullInputPath)) continue;

    // Try to find what went wrong
    const parts = path.split('.');
    // input.Label.field → [Label, field]
    if (parts.length === 1) {
      // Just "input.Something" — check if it's a label
      const label = parts[0];
      const labelPath = `input.${label}`;
      if (!available.has(labelPath)) {
        const suggestions = closest(label, upstreamLabels);
        errors.push({
          match: fullMatch,
          path: fullInputPath,
          message: `Node "${label}" not found upstream`,
          suggestions: suggestions.map(s => `input.${s}`),
        });
      }
      // field not checked — label-only paths are valid
    } else if (parts.length >= 2) {
      // input.Label.field or input.Label.field[0].subfield
      const label = parts[0];
      const field = parts[1];
      const labelPath = `input.${label}`;

      // Check label exists
      if (!available.has(labelPath)) {
        const suggestions = closest(label, upstreamLabels);
        errors.push({
          match: fullMatch,
          path: fullInputPath,
          message: `Node "${label}" not found upstream`,
          suggestions: suggestions.map(s => `input.${s}`),
        });
        continue;
      }

      // Check field exists
      const upNode = nodes.find(n => {
        const raw = n.data?.label || n.data?.type || n.id;
        return raw === label || slugify(raw) === label;
      });
      if (upNode) {
        const knownFields = getFieldsForNode(upNode);
        if (knownFields.length > 0 && !knownFields.includes(field)) {
          const suggestions = closest(field, knownFields);
          errors.push({
            match: fullMatch,
            path: fullInputPath,
            message: `Field "${field}" not found in "${label}"`,
            suggestions: suggestions.map(s => `input.${label}.${s}`),
          });
        }
      }
    }
  }

  return errors;
}
