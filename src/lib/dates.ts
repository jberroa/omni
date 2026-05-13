/** Normalize API timestamps (ISO strings) and legacy Firestore Timestamp shapes to Date. */
export function toEventDate(value: unknown): Date {
  if (value == null) return new Date();
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const fn = (value as { toDate?: () => Date }).toDate;
    if (typeof fn === "function") return fn.call(value);
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
