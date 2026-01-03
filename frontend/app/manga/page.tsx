"use client";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    fetch("http://localhost:8080/mangas/")
      .then(res => res.json())
      .then(data => {
        // Unwrap title_english if it's an object with {String, Valid}
        setManga(
          Array.isArray(data)
            ? data.map(m => ({
                ...m,
                title_english:
                  m.title_english && typeof m.title_english === "object" && "String" in m.title_english
                    ? m.title_english.String
                    : typeof m.title_english === "string"
                    ? m.title_english
                    : "",
              }))
            : []
        );
      })
      .catch(() => setManga([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="min-h-screen bg-black text-white flex flex-col items-center py-8 relative">
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
                <div
                  key={m.id}
                  className="bg-[#222] rounded-xl p-4 flex flex-col items-center cursor-pointer border border-white hover:shadow-lg"
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
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
