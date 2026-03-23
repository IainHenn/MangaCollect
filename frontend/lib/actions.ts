import { API_BASE_URL } from "@/lib/helpers";
import type {
  ApiStatusResponse,
  CollectionType,
  CollectionTypeResponse,
  Manga,
  MangaListResponse,
  MangaVolumesResponse,
  ResetPasswordPayload,
  SearchBy,
  SearchFrom,
  SearchResponse,
  SignUpPayload,
  VerifyEmailPayload,
  Volume,
} from "@/lib/types";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, init);
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function signIn(email: string, password: string): Promise<Response> {
  return apiFetch("/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
}

export async function signUp(payload: SignUpPayload): Promise<Response> {
  return apiFetch("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function requestPasswordReset(email: string): Promise<Response> {
  return apiFetch("/request-password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(payload: ResetPasswordPayload, useUsersEndpoint = false): Promise<Response> {
  const endpoint = useUsersEndpoint ? "/users/reset-password" : "/reset-password";

  return apiFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function verifyEmail(payload: VerifyEmailPayload, useUsersEndpoint = false): Promise<Response> {
  const endpoint = useUsersEndpoint ? "/users/verify-email" : "/verify-email";

  return apiFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function verifyEmailWithMessage(payload: VerifyEmailPayload): Promise<{ ok: boolean; message: string }> {
  const response = await verifyEmail(payload, false);

  if (response.ok) {
    return { ok: true, message: "Email verified!" };
  }

  const data = await parseJsonSafe<ApiStatusResponse>(response);
  const lowered = data?.error?.toLowerCase() ?? "";

  if (lowered.includes("already verified")) {
    return { ok: true, message: "Email is already verified." };
  }

  return { ok: false, message: data?.error ?? "Verification failed." };
}

export async function resendVerification(email: string): Promise<Response> {
  return apiFetch("/users/resend-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function searchManga(query: string, searchFrom: SearchFrom, by: SearchBy, includeCredentials = false): Promise<SearchResponse> {
  const response = await apiFetch(`/mangas/search?query=${encodeURIComponent(query)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: includeCredentials ? "include" : "same-origin",
    body: JSON.stringify({ searchFrom, by }),
  });

  if (!response.ok) {
    return { results: [] };
  }

  const data = await parseJsonSafe<SearchResponse>(response);
  return { results: data?.results ?? [] };
}

export async function fetchMangas(offset = 0): Promise<MangaListResponse> {
  const response = await apiFetch(`/mangas?offset=${offset}`);
  if (!response.ok) {
    return { mangas: [], hasMore: false };
  }

  const data = await parseJsonSafe<Partial<MangaListResponse>>(response);
  return {
    mangas: Array.isArray(data?.mangas) ? data.mangas : [],
    hasMore: Boolean(data?.hasMore),
  };
}

export async function fetchManga(mangaId: string): Promise<Manga | null> {
  const response = await apiFetch(`/mangas/${mangaId}`);
  if (!response.ok) return null;
  return parseJsonSafe<Manga>(response);
}

export async function fetchVolumes(mangaId: string, offset = 0): Promise<MangaVolumesResponse> {
  const response = await apiFetch(`/mangas/${mangaId}/volumes?offset=${offset}`);
  if (!response.ok) return { volumes: [], hasMore: false };

  const data = await parseJsonSafe<Partial<MangaVolumesResponse>>(response);
  return {
    volumes: Array.isArray(data?.volumes) ? data.volumes : [],
    hasMore: Boolean(data?.hasMore),
  };
}

export async function fetchVolume(mangaId: string, volumeId: string): Promise<Volume | null> {
  const response = await apiFetch(`/mangas/${mangaId}/volumes/${volumeId}`);
  if (!response.ok) return null;
  return parseJsonSafe<Volume>(response);
}

export async function addVolumeToCollection(volumeId: number): Promise<Response> {
  return apiFetch(`/collection/${volumeId}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
}

export async function addVolumeToWishlist(volumeId: number): Promise<Response> {
  return apiFetch(`/wishlist/${volumeId}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
}

export async function removeVolumeFromCollection(volumeId: number): Promise<Response> {
  return apiFetch(`/collection/${volumeId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
}

export async function removeVolumeFromWishlist(volumeId: number): Promise<Response> {
  return apiFetch(`/wishlist/${volumeId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
}

export async function markAllAsCollected(mangaId: string): Promise<Response> {
  return apiFetch(`/collection/manga/${mangaId}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
}

export async function markAllAsWishlisted(mangaId: string): Promise<Response> {
  return apiFetch(`/wishlist/manga/${mangaId}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
}

export async function fetchCollectionManga(collectionType: CollectionType): Promise<{ unauthorized: boolean; manga: CollectionTypeResponse["manga"] }> {
  const response = await apiFetch(`/collection_type/${collectionType}`, { credentials: "include" });

  if (response.status === 401) {
    return { unauthorized: true, manga: {} };
  }

  if (!response.ok) {
    return { unauthorized: false, manga: {} };
  }

  const data = await parseJsonSafe<CollectionTypeResponse>(response);
  return {
    unauthorized: false,
    manga: data?.manga ?? {},
  };
}

export async function fetchCollectionVolumes(collectionType: CollectionType, mangaId: number): Promise<Volume[]> {
  const response = await apiFetch(`/collection_type/${collectionType}/${mangaId}`, { credentials: "include" });
  if (!response.ok) return [];

  const data = await parseJsonSafe<Volume[] | { volumes: Volume[] }>(response);

  if (Array.isArray(data)) return data;
  return Array.isArray(data?.volumes) ? data.volumes : [];
}

export async function submitTicket(formData: FormData): Promise<Response> {
  return apiFetch("/submissions", {
    method: "POST",
    body: formData,
    credentials: "include",
  });
}
