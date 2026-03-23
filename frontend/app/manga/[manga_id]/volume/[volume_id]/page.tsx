"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addVolumeToCollection,
  addVolumeToWishlist,
  fetchVolume,
  removeVolumeFromCollection,
  removeVolumeFromWishlist,
} from "@/lib/actions";
import { buildS3ImageUrl, displayOrFallback, unwrapNumber, unwrapString, unwrapTime } from "@/lib/helpers";
import type { Volume } from "@/lib/types";

function showString(val: Volume["volume_title"] | Volume["volume_subtitle"] | Volume["title_english"] | Volume["title_romaji"] | Volume["title_native"] | Volume["publisher"] | Volume["isbn_10"] | Volume["isbn_13"] | Volume["volume_description"] | undefined) {
  return displayOrFallback(unwrapString(val));
}

function showNumber(val: Volume["volume_number"] | Volume["page_count"] | Volume["price_amount"] | undefined) {
  return displayOrFallback(unwrapNumber(val));
}

function showTime(val: Volume["published_date"] | undefined) {
  return displayOrFallback(unwrapTime(val));
}

export default function VolumeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const manga_id = params?.manga_id as string;
  const volume_id = params?.volume_id as string;
  const [volume, setVolume] = useState<Volume | null>(null);

  useEffect(() => {
    fetchVolume(manga_id, volume_id)
      .then(data => setVolume(data))
      .catch(() => setVolume(null));
  }, [manga_id, volume_id]);

  async function handleAddToCollection() {
    if (!volume) return;
    const res = await addVolumeToCollection(volume.volume_id);
    if (res.ok) {
      setVolume({ ...volume, user_col_status: "collected" });
    }
  }
  async function handleAddToWishlist() {
    if (!volume) return;
    const res = await addVolumeToWishlist(volume.volume_id);
    if (res.ok) {
      setVolume({ ...volume, user_col_status: "wishlisted" });
    }
  }
  async function handleRemove() {
    if (!volume) return;
    let endpoint = "";
    if (volume.user_col_status === "collected") endpoint = "collection";
    else if (volume.user_col_status === "wishlisted") endpoint = "wishlist";
    else return;
    const res =
      endpoint === "collection"
        ? await removeVolumeFromCollection(volume.volume_id)
        : await removeVolumeFromWishlist(volume.volume_id);
    if (res.ok) {
      setVolume({ ...volume, user_col_status: "" });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="p-8 border-2 border-white rounded-xl bg-[#222] min-w-[320px] shadow-lg flex flex-col gap-6 items-center">
        {volume && (
          <>
            {volume.thumbnail_s3_key && (
              <img
                src={buildS3ImageUrl(volume.thumbnail_s3_key)}
                alt={String(showString(volume.volume_title))}
                className="w-32 h-48 object-cover mb-2 rounded"
              />
            )}
            <h2 className="text-white text-2xl font-bold mb-2">{showString(volume.volume_title)}</h2>
            <span className="text-white mb-2">Volume {showNumber(volume.volume_number)}</span>
            {showString(volume.volume_subtitle) !== "Could Not Be Found" && (
              <span className="text-white mb-2">Subtitle: {showString(volume.volume_subtitle)}</span>
            )}
            <div className="text-white mb-2">
              <strong>English Title:</strong> {showString(volume.title_english)}
            </div>
            <div className="text-white mb-2">
              <strong>Romaji Title:</strong> {showString(volume.title_romaji)}
            </div>
            <div className="text-white mb-2">
              <strong>Native Title:</strong> {showString(volume.title_native)}
            </div>
            <div className="text-white mb-2">
              <strong>Publisher:</strong> {showString(volume.publisher)}
            </div>
            <div className="text-white mb-2">
              <strong>Published Date:</strong> {showTime(volume.published_date)}
            </div>
            <div className="text-white mb-2">
              <strong>Page Count:</strong> {showNumber(volume.page_count)}
            </div>
            <div className="text-white mb-2">
              <strong>ISBN-10:</strong> {showString(volume.isbn_10)}
            </div>
            <div className="text-white mb-2">
              <strong>ISBN-13:</strong> {showString(volume.isbn_13)}
            </div>
            <div className="text-white mb-2">
              <strong>Volume Description:</strong> {showString(volume.volume_description)}
            </div>
            <div className="flex items-center gap-2 mb-2">
              {volume.user_col_status === "collected" && (
                <span title="Collected" className="text-green-400 text-xl">✔️</span>
              )}
              {volume.user_col_status === "wishlisted" && (
                <span title="Wishlisted" className="text-yellow-400 text-xl">★</span>
              )}
            </div>
            <div className="flex gap-2">
              {volume.user_col_status === "collected" ? (
                <>
                  <button
                    className="bg-red-600 text-white px-3 py-1 rounded"
                    onClick={handleRemove}
                  >
                    Remove from Collection
                  </button>
                  <button
                    className="bg-yellow-600 text-white px-3 py-1 rounded"
                    onClick={handleAddToWishlist}
                  >
                    Add to Wishlist
                  </button>
                </>
              ) : volume.user_col_status === "wishlisted" ? (
                <>
                  <button
                    className="bg-green-600 text-white px-3 py-1 rounded"
                    onClick={handleAddToCollection}
                  >
                    Add to Collection
                  </button>
                  <button
                    className="bg-red-600 text-white px-3 py-1 rounded"
                    onClick={handleRemove}
                  >
                    Remove from Wishlist
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="bg-green-600 text-white px-3 py-1 rounded"
                    onClick={handleAddToCollection}
                  >
                    Add to Collection
                  </button>
                  <button
                    className="bg-yellow-600 text-white px-3 py-1 rounded"
                    onClick={handleAddToWishlist}
                  >
                    Add to Wishlist
                  </button>
                </>
              )}
              <button
                className="bg-blue-600 text-white px-3 py-1 rounded"
                onClick={() => router.push(`/manga/${manga_id}`)}
              >
                Back to Manga
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
