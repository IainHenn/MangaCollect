"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminRequestCard from "@/components/admin/AdminRequestCard";
import AdminRouteGuard from "@/components/admin/AdminRouteGuard";
import { fetchAdminSubmissions } from "@/lib/actions";
import { clearStoredUserType } from "@/lib/helpers";
import type { AdminSubmissionSummary, SubmissionStatus } from "@/lib/types";

type SubmissionStatusFilter = "all" | SubmissionStatus;
type SubmissionTypeFilter = "all" | "CREATE" | "UPDATE" | "DELETE";

function normalizeRequestType(typeValue: string | undefined): SubmissionTypeFilter | "UNKNOWN" {
  const normalized = String(typeValue ?? "").toUpperCase();

  if (normalized === "EDIT" || normalized === "UPDATE") {
    return "UPDATE";
  }

  if (normalized === "CREATE" || normalized === "DELETE") {
    return normalized;
  }

  return "UNKNOWN";
}

export default function AdminRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<AdminSubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SubmissionStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<SubmissionTypeFilter>("all");
  const [error, setError] = useState("");
  const [backendIssue, setBackendIssue] = useState("");

  useEffect(() => {
    fetchAdminSubmissions(statusFilter)
      .then(result => {
        if (result.unauthorized) {
          clearStoredUserType();
          setError("Unauthorized. Please log in with an admin account.");
          router.replace("/admin/login");
          return;
        }

        if (result.backendIssue) {
          setBackendIssue(result.backendIssue);
        }

        if (result.error) {
          setError(result.error);
        }

        setRequests(result.submissions);
      })
      .catch(() => setError("Failed to load admin requests"))
      .finally(() => setLoading(false));
  }, [router, statusFilter]);

  const validRequests = useMemo(() => {
    const withValidId = requests.filter(request => typeof request.id === "number");

    if (typeFilter === "all") {
      return withValidId;
    }

    return withValidId.filter(request => normalizeRequestType(request.type) === typeFilter);
  }, [requests, typeFilter]);

  return (
    <AdminRouteGuard>
      <div className="min-h-screen bg-black text-white flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-5xl flex items-center justify-between mb-6 gap-4">
        <h1 className="text-3xl font-bold">Admin Requests</h1>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={e => {
              setLoading(true);
              setError("");
              setBackendIssue("");
              setStatusFilter(e.target.value as SubmissionStatusFilter);
            }}
            className="px-3 py-2 rounded bg-gray-800 text-white border border-gray-600"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as SubmissionTypeFilter)}
            className="px-3 py-2 rounded bg-gray-800 text-white border border-gray-600"
          >
            <option value="all">All Types</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
          </select>
          <button
            className="px-4 py-2 rounded bg-blue-700 text-white font-semibold hover:bg-blue-800 transition"
            onClick={() => {
              clearStoredUserType();
              router.push("/admin/login");
            }}
          >
            Switch Account
          </button>
        </div>
      </div>

      {backendIssue && (
        <div className="w-full max-w-5xl mb-4 p-4 rounded border border-yellow-500 bg-yellow-900/20 text-yellow-300">
          Backend Route Limitation: {backendIssue}
        </div>
      )}

      {error && (
        <div className="w-full max-w-5xl mb-4 p-4 rounded border border-red-500 bg-red-900/20 text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <svg className="animate-spin h-12 w-12 text-white" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      ) : validRequests.length === 0 ? (
        <div className="w-full max-w-5xl p-6 rounded border border-white bg-[#222] text-gray-300">
          No requests available for this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
          {validRequests.map(request => (
            <AdminRequestCard
              key={request.id}
              request={request}
              onOpen={id => router.push(`/admin/requests/${id}`)}
            />
          ))}
        </div>
      )}
      </div>
    </AdminRouteGuard>
  );
}
