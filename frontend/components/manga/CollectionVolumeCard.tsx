import { buildS3ImageUrl } from "@/lib/helpers";

interface CollectionVolumeCardProps {
  mangaId: number;
  volumeId: number;
  title: string;
  thumbnailKey?: string;
  isHighlighted: boolean;
  collectionType: "collected" | "wishlisted";
  readOnly?: boolean;
  onView: (mangaId: number, volumeId: number) => void;
  onMoveToWishlist: (volumeId: number) => void;
  onMoveToCollection: (volumeId: number) => void;
  onRemove: (volumeId: number) => void;
  setVolumeRef: (volumeId: number, element: HTMLDivElement | null) => void;
}

export default function CollectionVolumeCard({
  mangaId,
  volumeId,
  title,
  thumbnailKey,
  isHighlighted,
  collectionType,
  readOnly = false,
  onView,
  onMoveToWishlist,
  onMoveToCollection,
  onRemove,
  setVolumeRef,
}: CollectionVolumeCardProps) {
  const imgSrc = buildS3ImageUrl(thumbnailKey);

  return (
    <div
      ref={el => {
        setVolumeRef(volumeId, el);
      }}
      className={`bg-[#222] rounded-xl p-4 flex flex-col items-center border hover:shadow-lg transition ${
        isHighlighted ? "border-yellow-400 border-2 shadow-lg shadow-yellow-400/50" : "border-white"
      }`}
    >
      <button onClick={() => onView(mangaId, volumeId)} className="w-full hover:opacity-80 transition">
        {imgSrc && (
          <div className="w-24 h-36 mb-2 rounded mx-auto bg-[#111] flex items-center justify-center overflow-hidden">
            <img src={imgSrc} alt={title} className="w-full h-full object-contain object-center" />
          </div>
        )}
        <span className="font-bold text-lg mb-3 block">{title}</span>
      </button>

      <div className="w-full flex flex-col gap-2">
        <button
          onClick={e => {
            e.stopPropagation();
            onView(mangaId, volumeId);
          }}
          className="w-full px-2 py-1 rounded bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition"
        >
          View
        </button>

        {!readOnly && collectionType === "collected" && (
          <button
            onClick={e => {
              e.stopPropagation();
              onMoveToWishlist(volumeId);
            }}
            className="w-full px-2 py-1 rounded bg-yellow-700 text-white text-sm font-semibold hover:bg-yellow-800 transition"
          >
            Move to Wishlist
          </button>
        )}

        {!readOnly && collectionType === "wishlisted" && (
          <button
            onClick={e => {
              e.stopPropagation();
              onMoveToCollection(volumeId);
            }}
            className="w-full px-2 py-1 rounded bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition"
          >
            Add to Collection
          </button>
        )}

        {!readOnly && (
          <button
            onClick={e => {
              e.stopPropagation();
              onRemove(volumeId);
            }}
            className="w-full px-2 py-1 rounded bg-red-700 text-white text-sm font-semibold hover:bg-red-800 transition"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
