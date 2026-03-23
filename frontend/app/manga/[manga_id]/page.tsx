"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  addVolumeToCollection,
  addVolumeToWishlist,
  fetchManga,
  fetchVolumes as fetchMangaVolumes,
  markAllAsCollected,
  markAllAsWishlisted,
  removeVolumeFromCollection,
  removeVolumeFromWishlist,
} from "@/lib/actions";
import { buildS3ImageUrl, unwrapNumber, unwrapString } from "@/lib/helpers";
import type { Manga, Volume } from "@/lib/types";

interface VolumeViewModel extends Volume {
  user_col_status: string;
}

function normalizeVolume(volume: Volume): VolumeViewModel {
  return {
    ...volume,
    volume_title: unwrapString(volume.volume_title),
    volume_number: unwrapNumber(volume.volume_number),
    thumbnail_s3_key: unwrapString(volume.thumbnail_s3_key),
    user_col_status: unwrapString(volume.user_col_status),
  };
}

export default function MangaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const manga_id = params?.manga_id as string;
  const [manga, setManga] = useState<Manga | null>(null);
  const [volumes, setVolumes] = useState<VolumeViewModel[]>([]);
  const [panelView, setPanelView] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const volumesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchManga(manga_id)
      .then(data => setManga(data))
      .catch(() => setManga(null));
    // initial load for volumes (pagination-aware)
    fetchVolumes(0, false);
  }, [manga_id]);

  // Infinite scroll: observe sentinel and load more when visible.
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;

    // Choose root: for panelView use viewport (null), otherwise observe inside volumes container
    const root = panelView ? null : volumesContainerRef.current;

    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && hasMore && !loadingMore) {
            fetchVolumes(offset + 20, true);
          }
        });
      },
      { root: root || null, rootMargin: "200px", threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, offset, panelView, fetchVolumes]);

  // Fetch volumes with offset; backend returns { volumes: [...], hasMore: true/false }
  async function fetchVolumes(nextOffset = 0, append = false) {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      const data = await fetchMangaVolumes(manga_id, nextOffset);
      const normalized = data.volumes.map(normalizeVolume);

      setVolumes(prev => (append ? [...prev, ...normalized] : normalized));
      setHasMore(Boolean(data.hasMore));
      setOffset(nextOffset);
    } catch (err) {
      console.error(err);
      if (!append) setVolumes([]);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }

  async function handleAddToCollection(volume_id: number) {
    const res = await addVolumeToCollection(volume_id);
    if (res.ok) {
      setVolumes(volumes =>
        volumes.map(v =>
          v.volume_id === volume_id
            ? { ...v, user_col_status: "collected" }
            : v
        )
      );
    }
  }
  async function handleAddToWishlist(volume_id: number) {
    const res = await addVolumeToWishlist(volume_id);
    if (res.ok) {
      setVolumes(volumes =>
        volumes.map(v =>
          v.volume_id === volume_id
            ? { ...v, user_col_status: "wishlisted" }
            : v
        )
      );
    }
  }
  async function handleRemove(volume_id: number, status: string) {
    if (status !== "collected" && status !== "wishlisted") return;

    const res =
      status === "collected"
        ? await removeVolumeFromCollection(volume_id)
        : await removeVolumeFromWishlist(volume_id);
    if (res.ok) {
      setVolumes(volumes =>
        volumes.map(v =>
          v.volume_id === volume_id
            ? { ...v, user_col_status: "" }
            : v
        )
      );
    }
  }

  async function handleMarkAllAsCollected() {
    const res = await markAllAsCollected(manga_id);
    if (res.ok) {
      setVolumes(volumes =>
        volumes.map(v => ({ ...v, user_col_status: "collected" }))
      );
    }
  }

  async function handleMarkAllAsWishlisted() {
    const res = await markAllAsWishlisted(manga_id);
    if (res.ok) {
      setVolumes(volumes =>
        volumes.map(v => ({ ...v, user_col_status: "wishlisted" }))
      );
    }
  }

  // Panel view (grid)
  if (panelView) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center py-8 pb-32">
        <div className="flex gap-2 mb-4">
          <button
            className="px-4 py-2 rounded bg-gray-700 text-white"
            onClick={() => router.push("/manga")}
          >
            Back to All Manga
          </button>
          <button
            className="px-4 py-2 rounded bg-gray-700 text-white"
            onClick={() => setPanelView(false)}
          >
            List View
          </button>
        </div>
        {manga && (
          <div className="flex flex-col items-center mb-8">
            {buildS3ImageUrl(manga.cover_image_s3_key) && (
              <img
                src={buildS3ImageUrl(manga.cover_image_s3_key)}
                alt={unwrapString(manga.title_english)}
                className="w-40 h-60 object-cover mb-4 rounded"
              />
            )}
            <h2 className="text-3xl font-bold">{unwrapString(manga.title_english)}</h2>
            <div
              className="max-w-xl text-center mt-2 text-gray-200 prose prose-invert prose-sm"
              dangerouslySetInnerHTML={{ __html: unwrapString(manga.description) }}
            />
          </div>
        )}
        
        <h3 className="text-2xl font-bold mb-4">Volumes</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full max-w-5xl">
          {volumes.map(v => {
            const thumbKey =
              v.thumbnail_s3_key && typeof v.thumbnail_s3_key === "string"
                ? v.thumbnail_s3_key
                : "";
            const imgSrc =
              thumbKey && thumbKey.startsWith("http")
                ? thumbKey
                : thumbKey
                ? `https://manga-collection-images.s3.amazonaws.com/${thumbKey}`
                : "";

            let actionButtons = null;
            let statusSymbol = null;
            if (v.user_col_status === "collected") {
              statusSymbol = (
                <span title="Collected" className="text-green-400 text-xl">✔️</span>
              );
              actionButtons = (
                <>
                  <button
                    className="bg-red-600 text-white px-3 py-1 rounded"
                    onClick={() => handleRemove(v.volume_id, "collected")}
                  >
                    Remove from Collection
                  </button>
                  <button
                    className="bg-yellow-600 text-white px-3 py-1 rounded"
                    onClick={() => handleAddToWishlist(v.volume_id)}
                  >
                    Add to Wishlist
                  </button>
                </>
              );
            } else if (v.user_col_status === "wishlisted") {
              statusSymbol = (
                <span title="Wishlisted" className="text-yellow-400 text-xl">★</span>
              );
              actionButtons = (
                <>
                  <button
                    className="bg-green-600 text-white px-3 py-1 rounded"
                    onClick={() => handleAddToCollection(v.volume_id)}
                  >
                    Add to Collection
                  </button>
                  <button
                    className="bg-red-600 text-white px-3 py-1 rounded"
                    onClick={() => handleRemove(v.volume_id, "wishlisted")}
                  >
                    Remove from Wishlist
                  </button>
                </>
              );
            } else {
              statusSymbol = null;
              actionButtons = (
                <>
                  <button
                    className="bg-green-600 text-white px-3 py-1 rounded"
                    onClick={() => handleAddToCollection(v.volume_id)}
                  >
                    Add to Collection
                  </button>
                  <button
                    className="bg-yellow-600 text-white px-3 py-1 rounded"
                    onClick={() => handleAddToWishlist(v.volume_id)}
                  >
                    Add to Wishlist
                  </button>
                </>
              );
            }

            return (
              <div
                key={v.volume_id}
                className="bg-[#222] rounded-xl p-4 flex flex-col items-center border border-white"
              >
                {imgSrc && (
                  <img
                    src={imgSrc}
                    alt={unwrapString(v.volume_title)}
                    className="w-24 h-36 object-cover mb-2 rounded"
                  />
                )}
                <span className="font-bold text-lg mb-2">{unwrapString(v.volume_title)}</span>
                <span className="mb-2">Volume {unwrapNumber(v.volume_number)}</span>
                <div className="flex items-center gap-2 mb-2">
                  {statusSymbol}
                </div>
                <div className="flex gap-2">
                  {actionButtons}
                  <button
                    className="bg-blue-600 text-white px-3 py-1 rounded"
                    onClick={() => router.push(`/manga/${manga_id}/volume/${v.volume_id}`)}
                  >
                    Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div ref={sentinelRef} className="w-full h-1" />
        {loadingMore && (
          <div className="flex items-center justify-center py-4">
            <svg className="animate-spin h-8 w-8 text-white" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        )}
        {/* Move bulk action buttons to the bottom of the page */}
        <div className="flex gap-2 mt-8 flex-wrap justify-center w-full fixed bottom-15 left-0 z-10">
          <button
            className="px-4 py-2 rounded bg-green-700 text-white font-semibold shadow"
            onClick={handleMarkAllAsCollected}
          >
            Mark All As Collected
          </button>
          <button
            className="px-4 py-2 rounded bg-yellow-700 text-white font-semibold shadow"
            onClick={handleMarkAllAsWishlisted}
          >
            Mark All As Wishlisted
          </button>
        </div>
      </div>
    );
  }

  // Default list view
  return (
    <div className="min-h-screen bg-black text-white flex flex-row items-start py-8 px-4">
      <div className="flex flex-col items-center w-full max-w-sm mr-8">
        <div className="flex gap-2 mb-4">
          <button
            className="px-4 py-2 rounded bg-gray-700 text-white"
            onClick={() => router.push("/manga")}
          >
            Back to All Manga
          </button>
          <button
            className="px-4 py-2 rounded bg-gray-700 text-white"
            onClick={() => setPanelView(true)}
          >
            Panel View
          </button>
        </div>
        {manga && (
          <>
            {buildS3ImageUrl(manga.cover_image_s3_key) && (
              <img
                src={buildS3ImageUrl(manga.cover_image_s3_key)}
                alt={unwrapString(manga.title_english)}
                className="w-40 h-60 object-cover mb-4 rounded"
              />
            )}
            <h2 className="text-3xl font-bold">{unwrapString(manga.title_english)}</h2>
            <div
              className="max-w-xs text-left mt-2 text-gray-200 prose prose-invert prose-sm"
              dangerouslySetInnerHTML={{ __html: unwrapString(manga.description) }}
            />
          </>
        )}
      </div>
      <div className="w-full">
        <div ref={volumesContainerRef} className="flex-1 max-h-[80vh] overflow-y-auto w-full">
          <h3 className="text-2xl font-bold mb-4">Volumes</h3>
        <div className="flex flex-col gap-4 w-full">
        {volumes.map(v => {
          const thumbKey =
            v.thumbnail_s3_key && typeof v.thumbnail_s3_key === "string"
          ? v.thumbnail_s3_key
          : "";
          const imgSrc =
            thumbKey && thumbKey.startsWith("http")
          ? thumbKey
          : thumbKey
          ? `https://manga-collection-images.s3.amazonaws.com/${thumbKey}`
          : "";

          let actionButtons = null;
          let statusSymbol = null;
          if (v.user_col_status === "collected") {
            statusSymbol = (
          <span title="Collected" className="text-green-400 text-lg">✔️</span>
            );
            actionButtons = (
          <>
            <button
              className="bg-red-600 text-white px-2 py-1 rounded text-xs"
              onClick={() => handleRemove(v.volume_id, "collected")}
            >
              Remove from Collection
            </button>
            <button
              className="bg-yellow-600 text-white px-2 py-1 rounded text-xs"
              onClick={() => handleAddToWishlist(v.volume_id)}
            >
              Add to Wishlist
            </button>
          </>
            );
          } else if (v.user_col_status === "wishlisted") {
            statusSymbol = (
          <span title="Wishlisted" className="text-yellow-400 text-lg">★</span>
            );
            actionButtons = (
          <>
            <button
              className="bg-green-600 text-white px-2 py-1 rounded text-xs"
              onClick={() => handleAddToCollection(v.volume_id)}
            >
              Add to Collection
            </button>
            <button
              className="bg-red-600 text-white px-2 py-1 rounded text-xs"
              onClick={() => handleRemove(v.volume_id, "wishlisted")}
            >
              Remove from Wishlist
            </button>
          </>
            );
          } else {
            statusSymbol = null;
            actionButtons = (
          <>
            <button
              className="bg-green-600 text-white px-2 py-1 rounded text-xs"
              onClick={() => handleAddToCollection(v.volume_id)}
            >
              Add to Collection
            </button>
            <button
              className="bg-yellow-600 text-white px-2 py-1 rounded text-xs"
              onClick={() => handleAddToWishlist(v.volume_id)}
            >
              Add to Wishlist
            </button>
          </>
            );
          }

          return (
            <div
          key={v.volume_id}
          className="flex items-center gap-4 bg-[#222] rounded-xl p-2 border border-white"
            >
          {imgSrc && (
            <img
              src={imgSrc}
              alt={unwrapString(v.volume_title)}
              className="w-12 h-18 object-cover rounded"
            />
          )}
          <div className="flex flex-col flex-1">
            <span className="font-bold text-base">{unwrapString(v.volume_title)}</span>
            <span className="text-sm">Volume {unwrapNumber(v.volume_number)}</span>
            <div className="flex items-center gap-2 mt-1">
              {statusSymbol}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {actionButtons}
            <button
              className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
              onClick={() => router.push(`/manga/${manga_id}/volume/${v.volume_id}`)}
            >
              Details
            </button>
          </div>
            </div>
          );
        })}
          </div>
        {/* sentinel inside scrollable list */}
        <div ref={sentinelRef} className="w-full h-1" />
        {loadingMore && (
          <div className="flex items-center justify-center py-4">
            <svg className="animate-spin h-8 w-8 text-white" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        )}
        </div>
        {/* Place bulk action buttons inside the volumes div, below the list */}
        <div className="flex gap-2 mt-8 flex-wrap justify-center">
          <button
        className="px-4 py-2 rounded bg-green-700 text-white font-semibold shadow"
        onClick={handleMarkAllAsCollected}
          >
        Mark All As Collected
          </button>
          <button
        className="px-4 py-2 rounded bg-yellow-700 text-white font-semibold shadow"
        onClick={handleMarkAllAsWishlisted}
          >
        Mark All As Wishlisted
          </button>
        </div>
      </div>
    </div>
  );
}
