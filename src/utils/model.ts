import type { ModelParam, ModelSelection } from "../types/session.js";

export function parseModelSelection(
  raw: { id?: unknown; params?: unknown } | undefined,
  fallbackId: string,
): ModelSelection {
  const id = String(raw?.id ?? fallbackId);
  const params = Array.isArray(raw?.params)
    ? raw!.params
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const row = entry as { id?: unknown; value?: unknown };
          const paramId = String(row.id ?? "").trim();
          const value = String(row.value ?? "").trim();
          if (!paramId || !value) return null;
          return { id: paramId, value };
        })
        .filter((entry): entry is ModelParam => entry !== null)
    : [];
  return params.length > 0 ? { id, params } : { id };
}

export function toSdkModel(selection: ModelSelection) {
  return selection.params?.length
    ? { id: selection.id, params: selection.params }
    : { id: selection.id };
}
