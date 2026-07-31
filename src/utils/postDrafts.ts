export function postDraftValues(draft: string) {
  return draft
    .split(/[,，]/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function mergePostDraftValues(values: string[], draft: string) {
  return Array.from(new Set([...values, ...postDraftValues(draft)]));
}
