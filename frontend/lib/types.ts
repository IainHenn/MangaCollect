export type SearchBy = "manga" | "volume";
export type SearchFrom = "general" | "collected" | "wishlisted";
export type CollectionType = "collected" | "wishlisted";

export type WrappedString = string | { String: string } | null | undefined;
export type WrappedNumber = number | { Int16: number } | { Float64: number } | null | undefined;
export type WrappedTime = string | { Time: string } | null | undefined;

export interface ApiStatusResponse {
  status?: number;
  error?: string;
}

export interface AuthPayloads {
  email: string;
  password: string;
}

export interface SignUpPayload {
  username: string;
  email: string;
  password: string;
}

export interface VerifyEmailPayload {
  email: string;
  token: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export interface SearchResult {
  id: number;
  text: string;
  manga_id?: number;
}

export interface Manga {
  id: number;
  title_english: WrappedString;
  description?: WrappedString;
  cover_image_s3_key?: WrappedString;
}

export interface Volume {
  volume_id: number;
  volume_title: WrappedString;
  volume_subtitle?: WrappedString;
  volume_number: WrappedNumber;
  manga_id?: number;
  title_english?: WrappedString;
  title_romaji?: WrappedString;
  title_native?: WrappedString;
  publisher?: WrappedString;
  published_date?: WrappedTime;
  page_count?: WrappedNumber;
  isbn_10?: WrappedString;
  isbn_13?: WrappedString;
  price_amount?: WrappedNumber;
  price_currency?: WrappedString;
  thumbnail_s3_key?: WrappedString;
  user_col_status?: WrappedString;
  volume_description?: WrappedString;
  manga_description?: WrappedString;
}

export interface MangaListResponse {
  mangas: Manga[];
  hasMore: boolean;
}

export interface MangaVolumesResponse {
  volumes: Volume[];
  hasMore: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface CollectionTypeResponse {
  manga: Record<string, number>;
}

export interface CollectionMangaEntry {
  id: number;
  title_english: string;
}

export interface CollectionVolumeEntry {
  volume_id: number;
  volume_title: string;
  thumbnail_s3_key?: WrappedString;
}
