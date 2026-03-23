import { buildS3ImageUrl } from "@/lib/helpers";

interface MangaCardProps {
  id: number;
  title: string;
  coverImageKey?: string | null;
  onOpen: (mangaId: number) => void;
  onTicket: (mangaId: number) => void;
}

export default function MangaCard({ id, title, coverImageKey, onOpen, onTicket }: MangaCardProps) {
  const imgSrc = buildS3ImageUrl(coverImageKey);

  return (
    <div className="bg-[#222] rounded-xl p-4 flex flex-col items-center cursor-pointer border border-white hover:shadow-lg">
      <button onClick={() => onOpen(id)} className="w-full flex flex-col items-center text-left">
        {imgSrc && (
          <div className="w-32 h-48 mb-2 rounded bg-[#111] flex items-center justify-center overflow-hidden">
            <img src={imgSrc} alt={title} className="w-full h-full object-contain object-center" />
          </div>
        )}
        <span className="font-bold text-lg">{title || "Untitled"}</span>
      </button>
      <button onClick={() => onTicket(id)}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
        </svg>
      </button>
    </div>
  );
}
