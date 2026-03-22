"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

type Manga = {
  id: number;
  title_english: string | null;
  cover_image_s3_key: string | null;
};

export default function MangaListPage() {
  const [manga, setManga] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("manga");
  const [searchResults, setSearchResults] = useState([]);

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

    const controller = new AbortController(); // cancel previous requests
    const signal = controller.signal;

    fetch(`http://localhost:8080/mangas/search?query=${searchQuery}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        searchFrom: "general",
        by: searchType,
      }),
      signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.results) setSearchResults(data.results);
        else setSearchResults([]);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      });

    return () => controller.abort(); // cleanup previous fetch
  }, [searchQuery, searchType]);

  // Fetch mangas with offset; backend returns { mangas: [...], hasMore: true/false }
  async function fetchMangas(nextOffset = 0, append = false) {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      const res = await fetch(`http://localhost:8080/mangas?offset=${nextOffset}`);
      const data = await res.json();

      const items = Array.isArray(data.mangas) ? data.mangas : [];
      const normalized = items.map((m: any) => ({
        ...m,
        title_english:
          m.title_english && typeof m.title_english === "object" && "String" in m.title_english
            ? m.title_english.String
            : typeof m.title_english === "string"
            ? m.title_english
            : "",
      }));

      setManga(prev => (append ? [...prev, ...normalized] : normalized));
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

  function handleTicket(manga_id){
    router.push(`/manga/ticket-request/${manga_id}`)
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
              {searchResults.map((result: any) => (
                <div
                  key={result.id}
                  className="p-2 hover:bg-gray-700 cursor-pointer"
                  onClick={() => {
                    setSearchQuery(result.text || "");
                    if (searchType == "manga") {
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


        <div className="absolute top-8 right-8">
          <button
            className="px-6 py-3 rounded bg-blue-700 text-white font-semibold shadow hover:bg-blue-800 transition"
            onClick={() => router.push("/manga/your-collection")}
          >
            Your Collection and Wishlist
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
              // Unwrap cover_image_s3_key if needed
              let coverKey = "";
              if (m.cover_image_s3_key) {
                if (typeof m.cover_image_s3_key === "string") {
                  coverKey = m.cover_image_s3_key;
                } else if (
                  typeof m.cover_image_s3_key === "object" &&
                  "String" in m.cover_image_s3_key
                ) {
                  coverKey = m.cover_image_s3_key.String;
                }
              }
              const imgSrc =
                coverKey && coverKey.startsWith("http")
                  ? coverKey
                  : coverKey
                  ? `https://manga-collection-images.s3.amazonaws.com/${coverKey}`
                  : "";

              return (

                <div key={m.id} className="bg-[#222] rounded-xl p-4 flex flex-col items-center cursor-pointer border border-white hover:shadow-lg">
                  <div
                    onClick={() => router.push(`/manga/${m.id}`)}
                  >
                    {imgSrc && (
                      <img
                        src={imgSrc}
                        alt={typeof m.title_english === "string" ? m.title_english : ""}
                        className="w-32 h-48 object-cover mb-2 rounded"
                      />
                    )}
                    <span className="font-bold text-lg">
                      {typeof m.title_english === "string" && m.title_english
                        ? m.title_english
                        : "Untitled"}
                    </span>
                  </div>
                  <button onClick={() => handleTicket(m.id)}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
                    </svg>
                  </button>
                </div>
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
