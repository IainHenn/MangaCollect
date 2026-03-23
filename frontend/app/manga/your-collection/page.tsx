"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addVolumeToCollection,
  addVolumeToWishlist,
  fetchCollectionManga,
  fetchCollectionVolumes,
  removeVolumeFromCollection,
  removeVolumeFromWishlist,
  searchManga,
} from "@/lib/actions";
import { buildS3ImageUrl, mapCollectionManga, unwrapString } from "@/lib/helpers";
import type { CollectionMangaEntry, CollectionType, SearchResult, Volume } from "@/lib/types";

interface CollectionVolumeEntry {
  volume_id: number;
  volume_title: string;
  thumbnail_s3_key?: string;
}

function mapVolumeEntries(volumes: Volume[]): CollectionVolumeEntry[] {
  return volumes.map(volume => ({
    volume_id: volume.volume_id,
    volume_title: unwrapString(volume.volume_title),
    thumbnail_s3_key: unwrapString(volume.thumbnail_s3_key),
  }));
}

export default function UserCollectionPage() {
  const [collectionType, setCollectionType] = useState<CollectionType>("collected");
  const [mangaList, setMangaList] = useState<CollectionMangaEntry[]>([]);
  const [selectedManga, setSelectedManga] = useState<CollectionMangaEntry | null>(null);
  const [volumes, setVolumes] = useState<CollectionVolumeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"manga" | "volume">("manga");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const [unauthorized, setUnauthorized] = useState(false);

  const [highlightedVolumeId, setHighlightedVolumeId] = useState<number | null>(null);
  const volumeRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchQuery) {
        setSearchResults([]);
        return;
      }

      searchManga(searchQuery, collectionType, searchType, true)
        .then(data => setSearchResults(data.results ?? []))
        .catch(() => setSearchResults([]));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchType, collectionType]);

  useEffect(() => {
    fetchCollectionManga(collectionType)
      .then(data => {
        setUnauthorized(data.unauthorized);
        setMangaList(mapCollectionManga(data.manga));
        setSelectedManga(null);
        setVolumes([]);
      })
      .catch(() => {
        setMangaList([]);
      })
      .finally(() => setLoading(false));
  }, [collectionType]);

  useEffect(() => {
    if (!selectedManga) {
      return;
    }

    fetchCollectionVolumes(collectionType, selectedManga.id)
      .then(data => setVolumes(mapVolumeEntries(data)))
      .catch(() => setVolumes([]))
      .finally(() => setLoading(false));
  }, [selectedManga, collectionType]);

  useEffect(() => {
    if (unauthorized) {
      const timer = setTimeout(() => {
        router.push("/auth/signup");
      }, 800);

      return () => clearTimeout(timer);
    }
  }, [unauthorized, router]);

  useEffect(() => {
    if (highlightedVolumeId && volumeRefs.current[highlightedVolumeId]) {
      const timer = setTimeout(() => {
        volumeRefs.current[highlightedVolumeId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [highlightedVolumeId, volumes]);

  useEffect(() => {
    if (highlightedVolumeId) {
      const timer = setTimeout(() => {
        setHighlightedVolumeId(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [highlightedVolumeId]);

  async function refreshVolumesForSelectedManga() {
    if (!selectedManga) return;
    const data = await fetchCollectionVolumes(collectionType, selectedManga.id);
    setVolumes(mapVolumeEntries(data));
  }

  async function removeVolume(volumeId: number) {
    if (collectionType === "collected") {
      await removeVolumeFromCollection(volumeId);
    } else {
      await removeVolumeFromWishlist(volumeId);
    }

    await refreshVolumesForSelectedManga();
  }

  async function moveToCollection(volumeId: number) {
    await addVolumeToCollection(volumeId);
    await refreshVolumesForSelectedManga();
  }

  async function moveToWishlist(volumeId: number) {
    await addVolumeToWishlist(volumeId);
    await refreshVolumesForSelectedManga();
  }

  async function moveAll(mangaId: number, targetType: CollectionType) {
    const currentVolumes = await fetchCollectionVolumes(collectionType, mangaId);

    for (const volume of currentVolumes) {
      if (targetType === "collected") {
        await addVolumeToCollection(volume.volume_id);
        await removeVolumeFromWishlist(volume.volume_id);
      } else {
        await addVolumeToWishlist(volume.volume_id);
        await removeVolumeFromCollection(volume.volume_id);
      }
    }

    await refreshVolumesForSelectedManga();
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-8">
      <h2 className="text-3xl font-bold mb-6">Your Collection</h2>

      <div className="border border-white rounded-lg p-6 relative w-full max-w-md mb-4">
        <select
          value={searchType}
          onChange={e => setSearchType(e.target.value as "manga" | "volume")}
          className="mb-2 w-full p-2 rounded-lg bg-black text-white border border-white focus:outline-none focus:ring-2 focus:ring-white appearance-none cursor-pointer"
        >
          <option value="manga">Manga</option>
          <option value="volume">Volume</option>
        </select>

        <input
          id="search"
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full p-2 rounded text-white"
        />

        {searchResults.length > 0 && searchQuery.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-full bg-black border border-white rounded-lg max-h-60 overflow-y-auto z-10">
            {searchResults.map(result => (
              <div
                key={result.id}
                className="p-2 hover:bg-gray-700 cursor-pointer"
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);

                  if (searchType === "manga") {
                    const foundManga = mangaList.find(m => m.id === result.id);
                    setSelectedManga(foundManga ?? { id: result.id, title_english: result.text });
                    setHighlightedVolumeId(null);
                    return;
                  }

                  const foundManga = mangaList.find(m => m.id === result.manga_id);
                  setSelectedManga(foundManga ?? { id: result.manga_id ?? 0, title_english: result.text });
                  setHighlightedVolumeId(result.id);
                }}
              >
                {result.text || "Untitled"}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8 flex gap-4 items-center">
        <label htmlFor="collectionTypeDropdown" className="text-lg font-semibold">
          View:
        </label>
        <select
          id="collectionTypeDropdown"
          value={collectionType}
          onChange={e => setCollectionType(e.target.value as CollectionType)}
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

      {(loading || unauthorized) ? (
        <div className="flex items-center justify-center h-64">
          <svg className="animate-spin h-12 w-12 text-white" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
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
                      collectionType === "collected" ? "bg-yellow-700 text-white" : "bg-green-700 text-white"
                    }`}
                    onClick={() => moveAll(selectedManga.id, collectionType === "collected" ? "wishlisted" : "collected")}
                  >
                    Move All to {collectionType === "collected" ? "Wishlist" : "Collection"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {volumes.length === 0 ? (
                    <div className="col-span-full text-gray-400">No volumes found.</div>
                  ) : (
                    volumes.map(v => {
                      const imgSrc = buildS3ImageUrl(v.thumbnail_s3_key);
                      const isHighlighted = highlightedVolumeId === v.volume_id;

                      return (
                        <div
                          key={v.volume_id}
                          ref={el => {
                            volumeRefs.current[v.volume_id] = el;
                          }}
                          className={`bg-[#222] rounded-xl p-4 flex flex-col items-center border hover:shadow-lg transition ${
                            isHighlighted ? "border-yellow-400 border-2 shadow-lg shadow-yellow-400/50" : "border-white"
                          }`}
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
                              onClick={e => {
                                e.stopPropagation();
                                router.push(`/manga/${selectedManga.id}/volume/${v.volume_id}`);
                              }}
                              className="w-full px-2 py-1 rounded bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition"
                            >
                              View
                            </button>

                            {collectionType === "collected" && (
                              <button
                                onClick={e => {
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
                                onClick={e => {
                                  e.stopPropagation();
                                  moveToCollection(v.volume_id);
                                }}
                                className="w-full px-2 py-1 rounded bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition"
                              >
                                Add to Collection
                              </button>
                            )}

                            <button
                              onClick={e => {
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
