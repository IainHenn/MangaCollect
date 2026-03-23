import { buildS3ImageUrl, getSubmissionTypeMeta, unwrapString } from "@/lib/helpers";
import type { AdminSubmissionSummary } from "@/lib/types";

interface AdminRequestCardProps {
  request: AdminSubmissionSummary;
  onOpen: (requestId: number) => void;
}

export default function AdminRequestCard({ request, onOpen }: AdminRequestCardProps) {
  const title = unwrapString(request.title_english) || "Untitled";
  const volumeTitle = unwrapString(request.volume_title) || "Untitled Volume";
  const imageSrc = buildS3ImageUrl(request.cover_image_url);
  const typeMeta = getSubmissionTypeMeta(request.type);
  const id = request.id ?? 0;

  return (
    <button
      onClick={() => onOpen(id)}
      className="bg-[#222] rounded-xl p-4 flex flex-col items-start border border-white hover:shadow-lg transition text-left"
      disabled={!request.id}
    >
      <div className="w-full flex items-center justify-between mb-3">
        <span className={`px-2 py-1 rounded text-xs font-bold ${typeMeta.badgeClass}`}>
          {typeMeta.icon} {typeMeta.label}
        </span>
        <span className="text-xs text-gray-300">#{id || "N/A"}</span>
      </div>

      <div className="w-full flex gap-3 items-start">
        {imageSrc && (
          <div className="w-16 h-24 rounded bg-[#111] flex items-center justify-center overflow-hidden shrink-0">
            <img src={imageSrc} alt={volumeTitle} className="w-full h-full object-contain object-center" />
          </div>
        )}

        <div className="min-w-0">
          <h3 className="font-bold text-white truncate">{title}</h3>
          <p className="text-sm text-gray-300 truncate">{volumeTitle}</p>
          <p className="text-xs text-gray-400 mt-1">Volume #{request.volume_number}</p>
          <p className="text-xs text-gray-400 mt-1 capitalize">Status: {request.approval_status || "unknown"}</p>
        </div>
      </div>
    </button>
  );
}
