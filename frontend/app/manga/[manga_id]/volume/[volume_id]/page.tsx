"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Volume = {
  volume_id: number;
  volume_title: string | { String: string };
  volume_subtitle?: string | { String: string };
  volume_number: number | { Int16: number };
  manga_id: number;
  title_english?: string | { String: string };
  title_romaji?: string | { String: string };
  title_native?: string | { String: string };
  publisher?: string | { String: string };
  published_date?: string | { Time: string };
  page_count?: number | { Int16: number };
  isbn_10?: string | { String: string };
  isbn_13?: string | { String: string };
  price_amount?: number | { Float64: number };
  price_currency?: string | { String: string };
  thumbnail_s3_key?: string | { String: string };
  user_col_status: string | { String: string };
  volume_description?: string | { String: string };
  manga_description?: string | { String: string };
};

function unwrap(val: any) {
  if (val && typeof val === "object") {
    if ("String" in val) return val.String;
    if ("Int16" in val) return val.Int16;
    if ("Float64" in val) return val.Float64;
    if ("Time" in val) return val.Time;
  }
  return typeof val === "string" || typeof val === "number" ? val : "";
}

function show(val: any) {
  const v = unwrap(val);
  return v === null || v === undefined || v === "" ? "Could Not Be Found" : v;
}

export default function VolumeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const manga_id = params?.manga_id as string;
  const volume_id = params?.volume_id as string;
  const [volume, setVolume] = useState<Volume | null>(null);

  useEffect(() => {
    fetch(`http://localhost:8080/mangas/${manga_id}/volumes/${volume_id}`)
      .then(res => res.json())
      .then(data => {
        setVolume({
          ...data,
          volume_title: unwrap(data.volume_title),
          volume_subtitle: unwrap(data.volume_subtitle),
          volume_number: unwrap(data.volume_number),
          manga_id: data.manga_id,
          title_english: unwrap(data.title_english),
          title_romaji: unwrap(data.title_romaji),
          title_native: unwrap(data.title_native),
          publisher: unwrap(data.publisher),
          published_date: unwrap(data.published_date),
          page_count: unwrap(data.page_count),
          isbn_10: unwrap(data.isbn_10),
          isbn_13: unwrap(data.isbn_13),
          price_amount: unwrap(data.price_amount),
          price_currency: unwrap(data.price_currency),
          thumbnail_s3_key: unwrap(data.thumbnail_s3_key),
          user_col_status: data.user_col_status && typeof data.user_col_status === "object" && "String" in data.user_col_status
            ? data.user_col_status.String
            : typeof data.user_col_status === "string"
            ? data.user_col_status
            : "",
          volume_description: unwrap(data.volume_description),
          manga_description: unwrap(data.manga_description),
        });
      })
      .catch(() => setVolume(null));
  }, [manga_id, volume_id]);

  async function handleAddToCollection() {
    if (!volume) return;
    const res = await fetch(`http://localhost:8080/collection/${volume.volume_id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      setVolume({ ...volume, user_col_status: "collected" });
    }
  }
  async function handleAddToWishlist() {
    if (!volume) return;
    const res = await fetch(`http://localhost:8080/wishlist/${volume.volume_id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
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
    const res = await fetch(`http://localhost:8080/${endpoint}/${volume.volume_id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      setVolume({ ...volume, user_col_status: "" });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="p-8 border-2 border-white rounded-xl bg-[#222] min-w-[320px] shadow-lg flex flex-col gap-6 items-center">
        {volume && (
          <>
            {volume.thumbnail_s3_key && show(volume.thumbnail_s3_key) !== "Could Not Be Found" && (
              <img
                src={
                  typeof volume.thumbnail_s3_key === "string" && volume.thumbnail_s3_key.startsWith("http")
                    ? volume.thumbnail_s3_key
                    : volume.thumbnail_s3_key
                    ? `https://manga-collection-images.s3.amazonaws.com/${volume.thumbnail_s3_key}`
                    : ""
                }
                alt={show(volume.volume_title)}
                className="w-32 h-48 object-cover mb-2 rounded"
              />
            )}
            <h2 className="text-white text-2xl font-bold mb-2">{show(volume.volume_title)}</h2>
            <span className="text-white mb-2">Volume {show(volume.volume_number)}</span>
            {show(volume.volume_subtitle) !== "Could Not Be Found" && (
              <span className="text-white mb-2">Subtitle: {show(volume.volume_subtitle)}</span>
            )}
            <div className="text-white mb-2">
              <strong>English Title:</strong> {show(volume.title_english)}
            </div>
            <div className="text-white mb-2">
              <strong>Romaji Title:</strong> {show(volume.title_romaji)}
            </div>
            <div className="text-white mb-2">
              <strong>Native Title:</strong> {show(volume.title_native)}
            </div>
            <div className="text-white mb-2">
              <strong>Publisher:</strong> {show(volume.publisher)}
            </div>
            <div className="text-white mb-2">
              <strong>Published Date:</strong> {show(volume.published_date)}
            </div>
            <div className="text-white mb-2">
              <strong>Page Count:</strong> {show(volume.page_count)}
            </div>
            <div className="text-white mb-2">
              <strong>ISBN-10:</strong> {show(volume.isbn_10)}
            </div>
            <div className="text-white mb-2">
              <strong>ISBN-13:</strong> {show(volume.isbn_13)}
            </div>
            <div className="text-white mb-2">
              <strong>Volume Description:</strong> {show(volume.volume_description)}
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
