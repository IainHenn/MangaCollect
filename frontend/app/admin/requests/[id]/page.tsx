"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  acceptAdminSubmission,
  editAdminSubmission,
  fetchAdminSubmission,
  rejectAdminSubmission,
} from "@/lib/actions";
import AdminRouteGuard from "@/components/admin/AdminRouteGuard";
import { buildS3ImageUrl, clearStoredUserType, getSubmissionTypeMeta, unwrapString } from "@/lib/helpers";
import type { AdminSubmissionDetail } from "@/lib/types";

export default function AdminRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const hasId = Boolean(id);

  const [request, setRequest] = useState<AdminSubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [volumeTitle, setVolumeTitle] = useState("");
  const [volumeNumber, setVolumeNumber] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [initialFormValues, setInitialFormValues] = useState({
    volumeTitle: "",
    volumeNumber: "",
  });

  useEffect(() => {
    if (!hasId) return;

    fetchAdminSubmission(id)
      .then(result => {
        if (result.error || !result.submission) {
          if (String(result.error).toLowerCase().includes("unauthorized")) {
            clearStoredUserType();
            router.replace("/admin/login");
          }
          setError(result.error ?? "Request not found");
          return;
        }

        setRequest(result.submission);
        setVolumeTitle(unwrapString(result.submission.volume_title));
        setVolumeNumber(String(result.submission.volume_number ?? ""));
        setInitialFormValues({
          volumeTitle: unwrapString(result.submission.volume_title),
          volumeNumber: String(result.submission.volume_number ?? ""),
        });
      })
        .catch(() => setError("Failed to load request details"))
      .finally(() => setLoading(false));
      }, [hasId, id, router]);

  const imageSrc = useMemo(() => buildS3ImageUrl(request?.cover_image_url), [request]);
  const typeMeta = getSubmissionTypeMeta(request?.type);
  const hasEditChanges =
    volumeTitle !== initialFormValues.volumeTitle ||
    volumeNumber !== initialFormValues.volumeNumber;

  async function handleAccept() {
    const result = await acceptAdminSubmission(id, { submission_notes: adminNotes });
    if (!result.ok) {
      setError(result.error ?? "Failed to accept request");
      return;
    }

    setMessage("Request accepted and volume created.");
  }

  async function handleReject() {
    const result = await rejectAdminSubmission(id, { submission_notes: adminNotes });
    if (!result.ok) {
      setError(result.error ?? "Failed to reject request");
      return;
    }

    setMessage("Request rejected.");
  }

  async function handleEdit() {
    const payload: {
      volume_title?: string;
      volume_number?: number;
    } = {};

    if (volumeTitle) payload.volume_title = volumeTitle;
    if (volumeNumber) payload.volume_number = Number(volumeNumber);

    const result = await editAdminSubmission(id, payload);
    if (!result.ok) {
      setError(result.error ?? "Failed to edit request");
      return;
    }

    setMessage("Request updated.");
    setInitialFormValues({
      volumeTitle,
      volumeNumber,
    });
  }

  return (
    <AdminRouteGuard>
      <div className="min-h-screen bg-black text-white flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-4xl mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin Request Detail</h1>
        <button
          className="px-4 py-2 rounded bg-blue-700 text-white font-semibold hover:bg-blue-800 transition"
          onClick={() => router.push("/admin/requests")}
        >
          Back to Requests
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <svg className="animate-spin h-12 w-12 text-white" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      ) : !hasId ? (
        <div className="w-full max-w-4xl p-4 rounded border border-red-500 bg-red-900/20 text-red-300">Missing request id</div>
      ) : error ? (
        <div className="w-full max-w-4xl p-4 rounded border border-red-500 bg-red-900/20 text-red-300">{error}</div>
      ) : request ? (
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#222] rounded-xl p-6 border border-white">
            <div className="mb-3">
              <span className={`px-2 py-1 rounded text-xs font-bold ${typeMeta.badgeClass}`}>
                {typeMeta.icon} {typeMeta.label}
              </span>
            </div>
            <h2 className="text-2xl font-bold mb-2">{unwrapString(request.title_english) || "Untitled"}</h2>
            <p className="text-gray-300 mb-1">Manga ID: {request.manga_id}</p>
            <p className="text-gray-300 mb-1">Volume: {unwrapString(request.volume_title)}</p>
            <p className="text-gray-300 mb-1">Volume Number: {request.volume_number}</p>
            <p className="text-gray-300 mb-1 capitalize">Status: {request.approval_status}</p>

            {imageSrc && (
              <div className="w-40 h-56 rounded bg-[#111] flex items-center justify-center overflow-hidden mt-4">
                <img src={imageSrc} alt={unwrapString(request.volume_title)} className="w-full h-full object-contain object-center" />
              </div>
            )}

            <div className="mt-4">
              <h3 className="font-semibold mb-2">Submission Notes</h3>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{request.submission_notes || "No notes"}</p>
            </div>
          </div>

          <div className="bg-[#222] rounded-xl p-6 border border-white">
            <h3 className="text-xl font-bold mb-4">Review Actions</h3>

            <div className="flex flex-col gap-3">
              <div className="p-3 rounded border border-gray-700 bg-[#111] text-gray-300">
                <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">Manga ID</span>
                <span>{request.manga_id}</span>
              </div>
              <input
                value={volumeTitle}
                onChange={e => setVolumeTitle(e.target.value)}
                placeholder="Volume Title"
                className="p-3 rounded border border-gray-600 bg-[#111] text-white placeholder-gray-400 outline-none focus:border-white focus:ring-1 focus:ring-white"
              />
              <input
                value={volumeNumber}
                onChange={e => setVolumeNumber(e.target.value)}
                placeholder="Volume Number"
                className="p-3 rounded border border-gray-600 bg-[#111] text-white placeholder-gray-400 outline-none focus:border-white focus:ring-1 focus:ring-white"
              />
              <div className="p-3 rounded border border-gray-700 bg-[#111] text-gray-300 capitalize">
                <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">Submission Status</span>
                <span>{request.approval_status}</span>
              </div>
              <textarea
                value={adminNotes}
                onChange={e => setAdminNotes(e.target.value)}
                placeholder="Admin notes for accept/reject"
                className="p-3 rounded border border-gray-600 bg-[#111] text-white placeholder-gray-400 outline-none focus:border-white focus:ring-1 focus:ring-white min-h-24"
              />
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button className="px-4 py-2 rounded bg-green-700 text-white font-semibold" onClick={handleAccept}>
                Accept
              </button>
              <button className="px-4 py-2 rounded bg-red-700 text-white font-semibold" onClick={handleReject}>
                Reject
              </button>
              {hasEditChanges && (
                <button className="px-4 py-2 rounded bg-yellow-700 text-white font-semibold" onClick={handleEdit}>
                  Save Edits
                </button>
              )}
            </div>

            {message && <div className="w-full py-2 mt-4 rounded text-center font-bold bg-green-600 text-white">{message}</div>}
          </div>
        </div>
      ) : null}
      </div>
    </AdminRouteGuard>
  );
}
