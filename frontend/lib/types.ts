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

export interface AuthTokenResponse {
  user_id?: number;
  username?: string;
  email?: string;
  token?: string;
  user_type?: string;
  error?: string;
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

export interface UserSearchResult {
  user_id: number;
  username: string;
}

export interface UserSearchResponse {
  results: UserSearchResult[];
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

export interface ProfileCollectionMangaResponse {
  manga: Record<string, number>;
  isOwner?: boolean;
  username?: string;
}

export interface ProfileCollectionVolumesResponse {
  volumes: Volume[];
  isOwner?: boolean;
  username?: string;
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

export type SubmissionStatus = "pending" | "approved" | "rejected";
export type SubmissionRequestType = "CREATE" | "EDIT" | "DELETE" | "UNKNOWN";

export interface AdminSubmissionSummary {
  id?: number;
  title_english: WrappedString;
  manga_id: number;
  volume_title: WrappedString;
  volume_number: number;
  submission_notes: string;
  cover_image_url: WrappedString;
  approval_status: SubmissionStatus | string;
  type?: SubmissionRequestType | string;
}

export interface AdminSubmissionSummaryResponse {
  submissions: AdminSubmissionSummary[];
}

export interface AdminSubmissionDetail {
  title_english: WrappedString;
  manga_id: number;
  volume_title: WrappedString;
  volume_number: number;
  submission_notes: string;
  cover_image_url: WrappedString;
  approval_status: SubmissionStatus | string;
  type?: SubmissionRequestType | string;
}

export interface AdminSubmissionFilters {
  status: SubmissionStatus | string;
}

export interface AdminSubmissionEditPayload {
  manga_id?: number;
  volume_title?: string;
  volume_number?: number;
  status?: SubmissionStatus | string;
}

export interface AdminActionPayload {
  submission_notes?: string;
}
