"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MangaEntry = { id: number; title_english: string };
type VolumeEntry = { volume_id: number; volume_title: string; thumbnail_s3_key?: string | { String: string } };

function unwrap(val: any) {
  if (val && typeof val === "object" && "String" in val) return val.String;
  return typeof val === "string" ? val : "";
}

export default function UserCollectionPage() {
  const [collectionType, setCollectionType] = useState<"collected" | "wishlisted">("collected");
  const [mangaList, setMangaList] = useState<MangaEntry[]>([]);
  const [selectedManga, setSelectedManga] = useState<MangaEntry | null>(null);
  const [volumes, setVolumes] = useState<VolumeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  
  // For searching
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("manga");
  const [searchResults, setSearchResults] = useState([]);

  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);




  const router = useRouter();

  // Debouncing search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // For search
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


  // Fetch unique manga for the selected collection type
  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:8080/collection_type/${collectionType}`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.manga && typeof data.manga === "object") {
          const mangaArray = Object.entries(data.manga).map(([title, id]) => ({
            id: id as number,
            title_english: title,
          }));
          setMangaList(mangaArray);
        } else {
          setMangaList([]);
        }
        setSelectedManga(null);
        setVolumes([]);
      })
      .catch(err => {
        console.error("Failed to fetch manga", err);
        setMangaList([]);
      })
      .finally(() => setLoading(false));
  }, [collectionType]);

  // Fetch volumes for selected manga
  useEffect(() => {
    if (!selectedManga) {
      setVolumes([]);
      return;
    }
    setLoading(true);
    fetch(`http://localhost:8080/collection_type/${collectionType}/${selectedManga.id}`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const volumes = data.map((v: any) => ({
            volume_id: v.volume_id,
            volume_title: v.volume_title,
            thumbnail_s3_key: v.thumbnail_s3_key,
          }));
          setVolumes(volumes);
        } else {
          setVolumes([]);
        }
      })
      .catch(err => {
        console.error("Failed to fetch volumes", err);
        setVolumes([]);
      })
      .finally(() => setLoading(false));
  }, [selectedManga, collectionType]);


  // Remove volume from collection
  async function removeVolume(volumeID: number) {
    const endpoint = collectionType === "collected" 
      ? `http://localhost:8080/collection/${volumeID}`
      : `http://localhost:8080/wishlist/${volumeID}`;
    await fetch(endpoint, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    // Refresh volumes
    if (selectedManga) {
      fetch(`http://localhost:8080/collection_type/${collectionType}/${selectedManga.id}`, { credentials: "include" })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const volumes = data.map((v: any) => ({
              volume_id: v.volume_id,
              volume_title: v.volume_title,
              thumbnail_s3_key: v.thumbnail_s3_key,
            }));
            setVolumes(volumes);
          }
        });
    }
  }

  // Move single volume to collection
  async function moveToCollection(volumeID: number) {
    await fetch(`http://localhost:8080/collection/${volumeID}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    // Refresh volumes
    if (selectedManga) {
      fetch(`http://localhost:8080/collection_type/${collectionType}/${selectedManga.id}`, { credentials: "include" })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const volumes = data.map((v: any) => ({
              volume_id: v.volume_id,
              volume_title: v.volume_title,
              thumbnail_s3_key: v.thumbnail_s3_key,
            }));
            setVolumes(volumes);
          }
        });
    }
  }

  // Move single volume to wishlist
  async function moveToWishlist(volumeID: number) {
    await fetch(`http://localhost:8080/wishlist/${volumeID}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    // Refresh volumes
    if (selectedManga) {
      fetch(`http://localhost:8080/collection_type/${collectionType}/${selectedManga.id}`, { credentials: "include" })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const volumes = data.map((v: any) => ({
              volume_id: v.volume_id,
              volume_title: v.volume_title,
              thumbnail_s3_key: v.thumbnail_s3_key,
            }));
            setVolumes(volumes);
          }
        });
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-8">
      <h2 className="text-3xl font-bold mb-6">Your Collection</h2>


      <div className="border border-white rounded-lg p-6 relative w-full max-w-md mb-4">
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

                  if(searchType == "manga"){
                    setSelectedManga({"id": result.id, "title_english": result.text})
                  } else if (searchType == "volume") {
                    setSelectedManga({"id": result.manga_id, "title_english": result.text})
                  }
                }}
              >
                {result.text || "Untitled"}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Dropdown for Collection Type */}
      <div className="mb-8 flex gap-4 items-center">
        <label htmlFor="collectionTypeDropdown" className="text-lg font-semibold">
          View:
        </label>
        <select
          id="collectionTypeDropdown"
          value={collectionType}
          onChange={(e) => setCollectionType(e.target.value as "collected" | "wishlisted")}
          className="px-4 py-2 rounded bg-gray-800 text-white border border-gray-600 cursor-pointer hover:bg-gray-700 transition"
        >
          <option value="collected">Collection</option>
          <option value="wishlisted">Wishlist</option>
        </select>
        <button
          className="px-4 py-2 rounded bg-blue-700 text-white font-semibold shadow hover:bg-blue-800 transition"
          onClick={() => router.push("/manga")}
        >
          Back to All Manga
        </button>
      </div>

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
        <div className="w-full max-w-5xl flex flex-col md:flex-row gap-8">
          <div className="w-full md:w-1/3">
            <h3 className="text-xl font-bold mb-4">
              {collectionType === "collected" ? "Collected Manga" : "Wishlisted Manga"}
            </h3>
            <div className="flex flex-col gap-2">
              {mangaList.length === 0 ? (
                <div className="text-gray-400">
                  No manga found in your {collectionType === "collected" ? "collection" : "wishlist"}.
                </div>
              ) : (
                mangaList.map(m => (
                  <button
                    key={m.id}
                    className={`text-left px-4 py-2 rounded border border-white mb-1 hover:bg-gray-700 transition ${
                      selectedManga && selectedManga.id === m.id ? "bg-gray-800" : "bg-[#222]"
                    }`}
                    onClick={() => setSelectedManga(m)}
                  >
                    {m.title_english || "Untitled"}
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="w-full md:w-2/3">
            {selectedManga ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold">{selectedManga.title_english || "Untitled"}</h3>
                  <button
                    className={`px-3 py-1 rounded font-semibold shadow ${
                      collectionType === "collected"
                        ? "bg-yellow-700 text-white"
                        : "bg-green-700 text-white"
                    }`}
                    onClick={() =>
                      moveAll(selectedManga.id, collectionType === "collected" ? "wishlisted" : "collected")
                    }
                  >
                    Move All to {collectionType === "collected" ? "Wishlist" : "Collection"}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {volumes.length === 0 ? (
                    <div className="col-span-full text-gray-400">No volumes found.</div>
                  ) : (
                    volumes.map(v => {
                      const thumbKey =
                        v.thumbnail_s3_key && typeof v.thumbnail_s3_key === "string"
                          ? v.thumbnail_s3_key
                          : v.thumbnail_s3_key && typeof v.thumbnail_s3_key === "object" && "String" in v.thumbnail_s3_key
                          ? v.thumbnail_s3_key.String
                          : "";
                      const imgSrc =
                        thumbKey && thumbKey.startsWith("http")
                          ? thumbKey
                          : thumbKey
                          ? `https://manga-collection-images.s3.amazonaws.com/${thumbKey}`
                          : "";
                      return (
                        <div
                          key={v.volume_id}
                          className="bg-[#222] rounded-xl p-4 flex flex-col items-center border border-white hover:shadow-lg transition"
                        >
                          <button
                            onClick={() => router.push(`/manga/${selectedManga.id}/volume/${v.volume_id}`)}
                            className="w-full hover:opacity-80 transition"
                          >
                            {imgSrc && (
                              <img
                                src={imgSrc}
                                alt={v.volume_title}
                                className="w-24 h-36 object-cover mb-2 rounded mx-auto"
                              />
                            )}
                            <span className="font-bold text-lg mb-3 block">{v.volume_title}</span>
                          </button>
                          
                          <div className="w-full flex flex-col gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/manga/${selectedManga.id}/volume/${v.volume_id}`);
                              }}
                              className="w-full px-2 py-1 rounded bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition"
                            >
                              View
                            </button>
                            
                            {collectionType === "collected" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveToWishlist(v.volume_id);
                                }}
                                className="w-full px-2 py-1 rounded bg-yellow-700 text-white text-sm font-semibold hover:bg-yellow-800 transition"
                              >
                                Move to Wishlist
                              </button>
                            )}
                            
                            {collectionType === "wishlisted" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveToCollection(v.volume_id);
                                }}
                                className="w-full px-2 py-1 rounded bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition"
                              >
                                Add to Collection
                              </button>
                            )}
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeVolume(v.volume_id);
                              }}
                              className="w-full px-2 py-1 rounded bg-red-700 text-white text-sm font-semibold hover:bg-red-800 transition"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div className="text-gray-400">
                Select a manga to view its volumes in your {collectionType === "collected" ? "collection" : "wishlist"}.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
