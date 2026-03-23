import type { CollectionMangaEntry, WrappedNumber, WrappedString, WrappedTime } from "@/lib/types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

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
