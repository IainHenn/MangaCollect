import type { CollectionMangaEntry, SubmissionRequestType, WrappedNumber, WrappedString, WrappedTime } from "@/lib/types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const USER_TYPE_STORAGE_KEY = "mangacollect_user_type";
const USER_ID_STORAGE_KEY = "mangacollect_user_id";

export function unwrapString(value: WrappedString): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "String" in value) return value.String;
  return "";
}

export function unwrapNumber(value: WrappedNumber): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "Int16" in value) return value.Int16;
  if (value && typeof value === "object" && "Float64" in value) return value.Float64;
  return 0;
}

export function unwrapTime(value: WrappedTime): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "Time" in value) return value.Time;
  return "";
}

export function displayOrFallback(value: string | number | null | undefined, fallback = "Could Not Be Found"): string | number {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
}

export function buildS3ImageUrl(imageKey: WrappedString): string {
  const key = unwrapString(imageKey);
  if (!key) return "";
  if (key.startsWith("http")) return key;
  return `https://manga-collection-images.s3.amazonaws.com/${key}`;
}

export function mapCollectionManga(response: Record<string, number> | undefined): CollectionMangaEntry[] {
  if (!response || typeof response !== "object") return [];

  return Object.entries(response).map(([title, id]) => ({
    id,
    title_english: title,
  }));
}

export function normalizeSubmissionType(typeValue: string | undefined): SubmissionRequestType {
  const normalized = (typeValue ?? "").toUpperCase();

  if (normalized === "CREATE" || normalized === "EDIT" || normalized === "DELETE") {
    return normalized;
  }

  return "UNKNOWN";
}

export function getSubmissionTypeMeta(typeValue: string | undefined): { label: string; icon: string; badgeClass: string } {
  const type = normalizeSubmissionType(typeValue);

  switch (type) {
    case "CREATE":
      return {
        label: "Create",
        icon: "+",
        badgeClass: "bg-green-700 text-white",
      };
    case "EDIT":
      return {
        label: "Edit",
        icon: "~",
        badgeClass: "bg-yellow-700 text-white",
      };
    case "DELETE":
      return {
        label: "Delete",
        icon: "-",
        badgeClass: "bg-red-700 text-white",
      };
    default:
      return {
        label: "Unknown",
        icon: "?",
        badgeClass: "bg-gray-700 text-white",
      };
  }
}

export function setStoredUserType(userType: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_TYPE_STORAGE_KEY, userType);
}

export function getStoredUserType(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(USER_TYPE_STORAGE_KEY) ?? "";
}

export function clearStoredUserType(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_TYPE_STORAGE_KEY);
}

export function setStoredUserId(userId: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_ID_STORAGE_KEY, String(userId));
}

export function getStoredUserId(): number | null {
  if (typeof window === "undefined") return null;

  const storedValue = window.localStorage.getItem(USER_ID_STORAGE_KEY);
  if (!storedValue) return null;

  const parsedValue = Number(storedValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) return null;

  return parsedValue;
}

export function clearStoredUserId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_ID_STORAGE_KEY);
}

export function isStoredAdminUser(): boolean {
  return getStoredUserType() === "admin";
}
