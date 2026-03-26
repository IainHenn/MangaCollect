"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchMangas as fetchMangaPage, searchManga, searchUsers, signOut } from "@/lib/actions";
import { clearStoredUserId, clearStoredUserType, mapUserSearchResults, unwrapString } from "@/lib/helpers";
import type { Manga, SearchResult } from "@/lib/types";
import MangaCard from "@/components/manga/MangaCard";

export default function MangaListPage() {
  const [manga, setManga] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"manga" | "volume" | "user">("manga");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);

  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      return;
    }

    if (searchType === "user") {
      searchUsers(searchQuery)
        .then(data => setSearchResults(mapUserSearchResults(data.results)))
        .catch(() => setSearchResults([]));
      return;
    }

    searchManga(searchQuery, "general", searchType)
      .then(data => setSearchResults(data.results ?? []))
      .catch(() => setSearchResults([]));
  }, [searchQuery, searchType]);

  // Fetch mangas with offset; backend returns { mangas: [...], hasMore: true/false }
  async function fetchMangas(nextOffset = 0, append = false) {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      const data = await fetchMangaPage(nextOffset);
      setManga(prev => (append ? [...prev, ...data.mangas] : data.mangas));
      setHasMore(Boolean(data.hasMore));
      setOffset(nextOffset);
    } catch (err) {
      console.error(err);
      if (!append) setManga([]);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }

  useEffect(() => {
    fetchMangas(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll: observe a sentinel at the bottom and load more when visible
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && hasMore && !loading && !loadingMore) {
            // load next page, append
            fetchMangas(offset + 20, true);
          }
        });
      },
      { root: null, rootMargin: "200px", threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
    // include the deps that should re-create observer when pagination state changes
  }, [hasMore, loading, loadingMore, offset]);

  function handleTicket(manga_id: number) {
    router.push(`/manga/ticket-request/${manga_id}`);
  }

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await signOut();
    } catch {
      // Local logout fallback still runs if endpoint is unavailable.
    } finally {
      clearStoredUserType();
      clearStoredUserId();
      router.push("/auth/signin");
    }
  }

  return (
    <>
      <div className="min-h-screen bg-black text-white flex flex-col items-center py-8 relative">
        
        <div className="border border-white rounded-lg p-6 relative w-full max-w-md">
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            className="
              mb-2 w-full p-2 rounded-lg
              bg-black text-white
              border border-white
              focus:outline-none focus:ring-2 focus:ring-white
              appearance-none
              cursor-pointer
            "
          >
            <option value="manga">Manga</option>
            <option value="volume">Volume</option>
            <option value="user">User</option>
          </select>
          
          <input
            id="search"
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-2 rounded text-white"
          />

          {/* Results dropdown */}
          {searchResults.length > 0 && searchQuery.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-full bg-black border border-white rounded-lg max-h-60 overflow-y-auto z-10">
              {searchResults.map(result => (
                <div
                  key={result.id}
                  className="p-2 hover:bg-gray-700 cursor-pointer"
                  onClick={() => {
                    setSearchQuery(result.text || "");
                    if (searchType === "user") {
                      router.push(`/manga/profile/${result.id}`)
                    } else if (searchType == "manga") {
                      router.push(`/manga/${result.id}`)
                    } else {
                      router.push(`/manga/${result.manga_id}/volume/${result.id}`)
                    }
                  }}
                >
                  {result.text || "Untitled"}
                </div>
              ))}
            </div>
          )}
        </div>


        <div className="absolute top-8 right-8 flex flex-col sm:flex-row gap-3">
          <button
            className="px-6 py-3 rounded bg-blue-700 text-white font-semibold shadow hover:bg-blue-800 transition"
            onClick={() => router.push("/manga/your-collection")}
          >
            Your Collection and Wishlist
          </button>
          <button
            className="px-6 py-3 rounded bg-emerald-700 text-white font-semibold shadow hover:bg-emerald-800 transition"
            onClick={() => router.push("/manga/your-submissions")}
          >
            Your Submissions
          </button>
          <button
            className="px-6 py-3 rounded bg-red-700 text-white font-semibold shadow hover:bg-red-800 transition disabled:opacity-60"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
        <h2 className="text-3xl font-bold mb-6">MangaCollect</h2>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <svg className="animate-spin h-12 w-12 text-white" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full max-w-5xl">
            {manga.map(m => {
              const title = unwrapString(m.title_english);

              return (
                <MangaCard
                  key={m.id}
                  id={m.id}
                  title={title || "Untitled"}
                  coverImageKey={unwrapString(m.cover_image_s3_key)}
                  onOpen={mangaId => router.push(`/manga/${mangaId}`)}
                  onTicket={handleTicket}
                />
              );
            })}
          </div>
        )}
        {/* Infinite scroll sentinel + loading indicator */}
        <div ref={sentinelRef} className="w-full h-1" />
        {loadingMore && (
          <div className="flex items-center justify-center py-4">
            <svg className="animate-spin h-8 w-8 text-white" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        )}
        {!hasMore && !loadingMore && (
          <div className="mt-6 text-sm text-gray-400">No more results</div>
        )}
      </div>
    </>
  );
}
