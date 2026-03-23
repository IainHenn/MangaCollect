"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchUserSubmissions } from "@/lib/actions";
import { buildS3ImageUrl, getStoredUserId, getSubmissionTypeMeta, unwrapString } from "@/lib/helpers";
import type { AdminSubmissionSummary } from "@/lib/types";

export default function UserSubmissionsPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<AdminSubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    const userId = getStoredUserId();

    if (!userId) {
      setError("Could not determine your user id. Please sign in again.");
      setLoading(false);
      return;
    }

    fetchUserSubmissions(userId)
      .then(result => {
        if (result.unauthorized) {
          setUnauthorized(true);
          return;
        }

        if (result.error) {
          setError(result.error);
          return;
        }

        setSubmissions(result.submissions);
      })
      .catch(() => setError("Failed to load your submissions"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!unauthorized) return;

    const timer = setTimeout(() => {
      router.replace("/auth/signin");
    }, 800);

    return () => clearTimeout(timer);
  }, [router, unauthorized]);

  const validSubmissions = useMemo(
    () => submissions.filter(submission => typeof submission.id === "number"),
    [submissions],
  );

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-5xl flex items-center justify-between mb-6 gap-4">
        <h1 className="text-3xl font-bold">Your Submissions</h1>
        <button
          className="px-4 py-2 rounded bg-blue-700 text-white font-semibold hover:bg-blue-800 transition"
          onClick={() => router.push("/manga")}
        >
          Back to Manga
        </button>
      </div>

      {(loading || unauthorized) ? (
        <div className="flex items-center justify-center h-64">
          <svg className="animate-spin h-12 w-12 text-white" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      ) : error ? (
        <div className="w-full max-w-5xl p-4 rounded border border-red-500 bg-red-900/20 text-red-300">
          {error}
        </div>
      ) : validSubmissions.length === 0 ? (
        <div className="w-full max-w-5xl p-6 rounded border border-white bg-[#222] text-gray-300">
          You have not made any submissions yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
          {validSubmissions.map(submission => {
            const typeMeta = getSubmissionTypeMeta(submission.type);
            const coverUrl = buildS3ImageUrl(submission.cover_image_url);

            return (
              <article key={submission.id} className="border border-white rounded-lg bg-[#222] overflow-hidden">
                {coverUrl ? (
                  <img src={coverUrl} alt={unwrapString(submission.volume_title) || "Submission cover"} className="w-full h-48 object-cover" />
                ) : (
                  <div className="w-full h-48 bg-gray-800 flex items-center justify-center text-gray-400 text-sm">
                    No Cover Image
                  </div>
                )}

                <div className="p-4 flex flex-col gap-2">
                  <h2 className="text-lg font-semibold truncate">{unwrapString(submission.title_english) || "Untitled Manga"}</h2>
                  <p className="text-sm text-gray-300">
                    {unwrapString(submission.volume_title) || "Untitled Volume"} (Vol. {submission.volume_number ?? "N/A"})
                  </p>
                  <p className="text-sm text-gray-300">Status: {submission.approval_status || "pending"}</p>
                  <span className={`inline-flex w-fit items-center gap-1 px-2 py-1 rounded text-xs ${typeMeta.badgeClass}`}>
                    <span>{typeMeta.icon}</span>
                    <span>{typeMeta.label}</span>
                  </span>
                  <p className="text-sm text-gray-400 line-clamp-3">
                    {submission.submission_notes || "No notes provided."}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
