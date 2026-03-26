import { API_BASE_URL } from "@/lib/helpers";
import type {
  AuthTokenResponse,
  ApiStatusResponse,
  AdminActionPayload,
  AdminSubmissionDetail,
  AdminSubmissionEditPayload,
  AdminSubmissionSummary,
  CollectionType,
  CollectionTypeResponse,
  Manga,
  MangaListResponse,
  MangaVolumesResponse,
  ProfileCollectionMangaResponse,
  ProfileCollectionVolumesResponse,
  ResetPasswordPayload,
  SearchBy,
  SearchFrom,
  SearchResponse,
  SignUpPayload,
  UserSearchResponse,
  VerifyEmailPayload,
  Volume,
} from "@/lib/types";

type AdminSubmissionWire = AdminSubmissionSummary & {
  submission_id?: number;
  ticket_type?: string;
};

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

export async function signInWithUserType(
  email: string,
  password: string,
): Promise<{ ok: boolean; userType: string; userId?: number; error?: string }> {
  const response = await signIn(email, password);
  const data = await parseJsonSafe<AuthTokenResponse>(response);

  if (!response.ok) {
    return {
      ok: false,
      userType: "",
      userId: undefined,
      error: data?.error ?? "Invalid credentials",
    };
  }

  return {
    ok: true,
    userType: data?.user_type ?? "",
    userId: data?.user_id,
  };
}

export async function signOut(): Promise<{ ok: boolean; missingRoute?: boolean; error?: string }> {
  const response = await apiFetch("/auth/logout", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });

  if (response.ok) {
    return { ok: true };
  }

  if (response.status === 404) {
    return {
      ok: false,
      missingRoute: true,
      error: "Logout endpoint is not available yet",
    };
  }

  const data = await parseJsonSafe<ApiStatusResponse>(response);
  return {
    ok: false,
    error: data?.error ?? "Logout failed",
  };
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

export async function searchUsers(query: string): Promise<UserSearchResponse> {
  const response = await apiFetch(`/users/search?search=${encodeURIComponent(query)}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    return { results: [] };
  }

  const data = await parseJsonSafe<UserSearchResponse>(response);
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

export async function fetchProfileCollectionManga(userId: number, collectionType: CollectionType): Promise<{ unauthorized: boolean; manga: CollectionTypeResponse["manga"]; isOwner: boolean; username?: string; error?: string }> {
  const response = await apiFetch(`/users/${userId}/collection_type/${collectionType}`, { credentials: "include" });

  if (response.status === 401 || response.status === 403) {
    return { unauthorized: true, manga: {}, isOwner: false };
  }

  if (!response.ok) {
    const data = await parseJsonSafe<ApiStatusResponse>(response);
    return { unauthorized: false, manga: {}, isOwner: false, error: data?.error ?? "Failed to fetch profile collection" };
  }

  const data = await parseJsonSafe<ProfileCollectionMangaResponse>(response);
  return {
    unauthorized: false,
    manga: data?.manga ?? {},
    isOwner: Boolean(data?.isOwner),
    username: data?.username,
  };
}

export async function fetchProfileCollectionVolumes(userId: number, collectionType: CollectionType, mangaId: number): Promise<{ volumes: Volume[]; isOwner: boolean; username?: string }> {
  const response = await apiFetch(`/users/${userId}/collection_type/${collectionType}/${mangaId}`, { credentials: "include" });
  if (!response.ok) return { volumes: [], isOwner: false };

  const data = await parseJsonSafe<Volume[] | ProfileCollectionVolumesResponse>(response);

  if (Array.isArray(data)) {
    return { volumes: data, isOwner: false };
  }

  return {
    volumes: Array.isArray(data?.volumes) ? data.volumes : [],
    isOwner: Boolean(data?.isOwner),
    username: data?.username,
  };
}

export async function submitTicket(formData: FormData): Promise<Response> {
  return apiFetch("/submissions", {
    method: "POST",
    body: formData,
    credentials: "include",
  });
}

export async function fetchUserSubmissions(userId: number): Promise<{
  submissions: AdminSubmissionSummary[];
  unauthorized: boolean;
  error?: string;
}> {
  const response = await apiFetch(`/submissions/users/${encodeURIComponent(String(userId))}`, {
    method: "GET",
    credentials: "include",
  });

  if (response.status === 401 || response.status === 403) {
    return { submissions: [], unauthorized: true };
  }

  if (!response.ok) {
    const data = await parseJsonSafe<ApiStatusResponse>(response);
    return {
      submissions: [],
      unauthorized: false,
      error: data?.error ?? "Failed to fetch your submissions",
    };
  }

  const data = await parseJsonSafe<{ submissions?: AdminSubmissionWire[] }>(response);
  const normalized = Array.isArray(data?.submissions)
    ? data.submissions.map(submission => ({
        ...submission,
        id: submission.id ?? submission.submission_id,
        type: submission.type ?? submission.ticket_type,
      }))
    : [];

  return {
    submissions: normalized,
    unauthorized: false,
  };
}

export async function fetchAdminSubmissions(status?: string): Promise<{
  submissions: AdminSubmissionSummary[];
  unauthorized: boolean;
  backendIssue?: string;
  error?: string;
}> {
  const queryParams = new URLSearchParams();
  if (status && status !== "all") {
    queryParams.set("status", status);
  }

  const queryString = queryParams.toString();
  const path = queryString ? `/admin/submissions?${queryString}` : "/admin/submissions";

  // NOTE: Current backend expects JSON body on GET /admin/submissions.
  // Browsers do not reliably support GET request bodies.
  const response = await apiFetch(path, {
    method: "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });

  if (response.status === 401 || response.status === 403) {
    return { submissions: [], unauthorized: true };
  }

  if (response.status === 404) {
    const data = await parseJsonSafe<ApiStatusResponse>(response);
    const backendIssue = data?.error || "Invalid filters";
    return {
      submissions: [],
      unauthorized: false,
      backendIssue:
        backendIssue === "Invalid filters"
          ? "GET /admin/submissions currently expects a JSON body via BindJSON in the backend, which browsers cannot send reliably for GET requests."
          : backendIssue,
    };
  }

  if (!response.ok) {
    const data = await parseJsonSafe<ApiStatusResponse>(response);
    return { submissions: [], unauthorized: false, error: data?.error ?? "Failed to fetch admin requests" };
  }

  const data = await parseJsonSafe<{ submissions?: AdminSubmissionWire[] }>(response);
  const normalized = Array.isArray(data?.submissions)
    ? data.submissions.map(submission => ({
        ...submission,
        id: submission.id ?? submission.submission_id,
        type: submission.type ?? submission.ticket_type,
      }))
    : [];

  return {
    submissions: normalized,
    unauthorized: false,
  };
}

export async function fetchAdminSubmission(submissionId: string): Promise<{ submission: AdminSubmissionDetail | null; error?: string }> {
  const response = await apiFetch(`/submissions/${submissionId}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const data = await parseJsonSafe<ApiStatusResponse>(response);
    return { submission: null, error: data?.error ?? "Failed to fetch request details" };
  }

  const data = await parseJsonSafe<(AdminSubmissionDetail & { ticket_type?: string; type?: string })>(response);
  if (!data) return { submission: null, error: "Failed to parse request details" };

  return {
    submission: {
      ...data,
      type: data.type ?? data.ticket_type,
    },
  };
}

export async function acceptAdminSubmission(submissionId: string, payload?: AdminActionPayload): Promise<{ ok: boolean; error?: string }> {
  const response = await apiFetch(`/admin/submissions/${submissionId}/accept`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });

  if (!response.ok) {
    const data = await parseJsonSafe<ApiStatusResponse>(response);
    return { ok: false, error: data?.error ?? "Failed to accept request" };
  }

  return { ok: true };
}

export async function rejectAdminSubmission(submissionId: string, payload?: AdminActionPayload): Promise<{ ok: boolean; error?: string }> {
  const response = await apiFetch(`/admin/submissions/${submissionId}/reject`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });

  if (!response.ok) {
    const data = await parseJsonSafe<ApiStatusResponse>(response);
    return { ok: false, error: data?.error ?? "Failed to reject request" };
  }

  return { ok: true };
}

export async function editAdminSubmission(submissionId: string, payload: AdminSubmissionEditPayload): Promise<{ ok: boolean; error?: string }> {
  const response = await apiFetch(`/admin/submissions/${submissionId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await parseJsonSafe<ApiStatusResponse>(response);
    return { ok: false, error: data?.error ?? "Failed to edit request" };
  }

  return { ok: true };
}
