"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

type Manga = {
  id: number;
  title_english: string | { String: string };
  description: string | { String: string };
  cover_image_s3_key: string | { String: string } | null;
};

type Volume = {
  volume_id: number;
  volume_title: string | { String: string };
  volume_number: number;
  thumbnail_s3_key?: string | { String: string };
  user_col_status: string; // "collected", "wishlisted", "none"
};

function unwrap(val: any) {
  if (val && typeof val === "object") {
    if ("String" in val) return val.String;
    if ("Int16" in val) return val.Int16;
    if ("Valid" in val && "Int16" in val) return val.Int16;
  }
  return typeof val === "string" || typeof val === "number" ? val : "";
}

export default function MangaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const manga_id = params?.manga_id as string;
  const [manga, setManga] = useState<Manga | null>(null);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [panelView, setPanelView] = useState(false);

  useEffect(() => {
    fetch(`http://localhost:8080/mangas/${manga_id}`)
      .then(res => res.json())
      .then(data => setManga(data))
      .catch(() => setManga(null));
    fetch(`http://localhost:8080/mangas/${manga_id}/volumes`)
      .then(res => res.json())
      .then(data =>
        Array.isArray(data)
          ? data.map(v => ({
              ...v,
              volume_title: unwrap(v.volume_title),
              volume_number: unwrap(v.volume_number),
              thumbnail_s3_key: unwrap(v.thumbnail_s3_key),
              user_col_status: v.user_col_status && typeof v.user_col_status === "object" && "String" in v.user_col_status
                ? v.user_col_status.String
                : typeof v.user_col_status === "string"
                ? v.user_col_status
                : "",
            }))
          : []
      )
      .then(setVolumes)
      .catch(() => setVolumes([]));
  }, [manga_id]);

  async function handleAddToCollection(volume_id: number) {
    const res = await fetch(`http://localhost:8080/collection/${volume_id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
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
    const res = await fetch(`http://localhost:8080/wishlist/${volume_id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
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
    const endpoint =
      status === "collected"
        ? "collection"
        : status === "wishlisted"
        ? "wishlist"
        : "";
    if (!endpoint) return;
    const res = await fetch(`http://localhost:8080/${endpoint}/${volume_id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
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

  function refreshVolumes() {
    fetch(`http://localhost:8080/mangas/${manga_id}/volumes`)
      .then(res => res.json())
      .then(data =>
        Array.isArray(data)
          ? data.map(v => ({
              ...v,
              volume_title: unwrap(v.volume_title),
              volume_number: unwrap(v.volume_number),
              thumbnail_s3_key: unwrap(v.thumbnail_s3_key),
            }))
          : []
      )
      .then(setVolumes)
      .catch(() => setVolumes([]));
  }

  async function handleMarkAllAsCollected() {
    const res = await fetch(`http://localhost:8080/collection/manga/${manga_id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      setVolumes(volumes =>
        volumes.map(v => ({ ...v, user_col_status: "collected" }))
      );
    }
  }

  async function handleMarkAllAsWishlisted() {
    const res = await fetch(`http://localhost:8080/wishlist/manga/${manga_id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
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
            {unwrap(manga.cover_image_s3_key) && (
              <img
                src={
                  typeof unwrap(manga.cover_image_s3_key) === "string" &&
                  unwrap(manga.cover_image_s3_key).startsWith("http")
                    ? unwrap(manga.cover_image_s3_key)
                    : `https://manga-collection-images.s3.amazonaws.com/${unwrap(manga.cover_image_s3_key)}`
                }
                alt={unwrap(manga.title_english)}
                className="w-40 h-60 object-cover mb-4 rounded"
              />
            )}
            <h2 className="text-3xl font-bold">{unwrap(manga.title_english)}</h2>
            <div
              className="max-w-xl text-center mt-2 text-gray-200 prose prose-invert prose-sm"
              dangerouslySetInnerHTML={{ __html: unwrap(manga.description) }}
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
                    alt={unwrap(v.volume_title)}
                    className="w-24 h-36 object-cover mb-2 rounded"
                  />
                )}
                <span className="font-bold text-lg mb-2">{unwrap(v.volume_title)}</span>
                <span className="mb-2">Volume {unwrap(v.volume_number)}</span>
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
            {unwrap(manga.cover_image_s3_key) && (
              <img
                src={
                  typeof unwrap(manga.cover_image_s3_key) === "string" &&
                  unwrap(manga.cover_image_s3_key).startsWith("http")
                    ? unwrap(manga.cover_image_s3_key)
                    : `https://manga-collection-images.s3.amazonaws.com/${unwrap(manga.cover_image_s3_key)}`
                }
                alt={unwrap(manga.title_english)}
                className="w-40 h-60 object-cover mb-4 rounded"
              />
            )}
            <h2 className="text-3xl font-bold">{unwrap(manga.title_english)}</h2>
            <div
              className="max-w-xs text-left mt-2 text-gray-200 prose prose-invert prose-sm"
              dangerouslySetInnerHTML={{ __html: unwrap(manga.description) }}
            />
          </>
        )}
      </div>
      <div className="w-full">
        <div className="flex-1 max-h-[80vh] overflow-y-auto w-full">
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
              alt={unwrap(v.volume_title)}
              className="w-12 h-18 object-cover rounded"
            />
          )}
          <div className="flex flex-col flex-1">
            <span className="font-bold text-base">{unwrap(v.volume_title)}</span>
            <span className="text-sm">Volume {unwrap(v.volume_number)}</span>
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
