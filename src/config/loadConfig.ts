import type { SceneOptions } from "../render/layers";

type StackFrame = { indent: number; obj: Record<string, unknown> };

const numberPattern = /^-?\d+(\.\d+)?$/;

function parseScalar(valueText: string): unknown {
  // Strip wrapping quotes
  if (
    (valueText.startsWith('"') && valueText.endsWith('"')) ||
    (valueText.startsWith("'") && valueText.endsWith("'"))
  ) {
    valueText = valueText.slice(1, -1);
  }

  if (valueText === "true") return true;
  if (valueText === "false") return false;
  if (numberPattern.test(valueText)) return Number(valueText);

  // Handle simple inline arrays like [0.1, 0.2]
  if (valueText.startsWith("[") && valueText.endsWith("]")) {
    const inner = valueText.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => parseScalar(item.trim()));
  }

  return valueText;
}

/**
 * Minimal YAML-ish parser for simple key/value mappings used by scene options.
 * Supports nested objects via indentation, numbers, booleans, and inline arrays.
 */
export function parseSceneYaml(yamlText: string): SceneOptions {
  const root: Record<string, unknown> = {};
  const stack: StackFrame[] = [{ indent: -1, obj: root }];

  for (const rawLine of yamlText.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;

    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    const line = rawLine.trim();
    const [rawKey, rawValue = ""] = line.split(":", 2);
    const key = rawKey.trim();
    const valueText = rawValue.trim();

    while (stack.length && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.obj ?? root;
    const value =
      valueText === "" ? {} : parseScalar(valueText);

    parent[key] = value;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      stack.push({ indent, obj: value as Record<string, unknown> });
    }
  }

  return root as SceneOptions;
}
