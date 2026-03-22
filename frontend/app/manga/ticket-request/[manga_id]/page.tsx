"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useDropzone } from 'react-dropzone';

function MyDropzone({ onImageSelect }: { onImageSelect: (file: File) => void }) {

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif']
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      console.log(acceptedFiles);
      onImageSelect(acceptedFiles[0]);
    }
  });

  return (
    <div {...getRootProps()} className="border-2 border-dashed border-gray-500 p-8 cursor-pointer rounded hover:border-gray-400 transition-colors">
      <input {...getInputProps()} />
      {isDragActive ? (
        <p>Drop the image here...</p>
      ) : (
        <p>Drag and drop an image here, or click to select</p>
      )}
    </div>
  );
}

type Manga = {
  id: number;
  title_english: string | null;
  cover_image_s3_key: string | null;
};

export default function MangaTicketPage() {
  const router = useRouter();
  const params = useParams();
  const manga_id = params?.manga_id as string;
  const [manga, setManga] = useState<Manga | null>(null);
  const [imgSrc, setImgSrc] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [volumeTitle, setVolumeTitle] = useState<string>("");
  const [volumeNumber, setVolumeNumber] = useState<string>("");
  const [submissionNotes, setSubmissionNotes] = useState<string>("");

  useEffect(() => {
    fetch(`http://localhost:8080/mangas/${manga_id}`)
      .then(res => {
        if (res.status !== 200) {
          throw new Error("Invalid status code!");
        }
        return res.json();
      })
      .then(data => {
        const mangaData = {
          id: data.id,
          title_english: data.title_english.String,
          cover_image_s3_key: data.cover_image_s3_key.String
        };
        setManga(mangaData);
        
        const coverKey = mangaData.cover_image_s3_key;
        if (coverKey) {
          setImgSrc(
            coverKey.startsWith("http")
              ? coverKey
              : `https://manga-collection-images.s3.amazonaws.com/${coverKey}`
          );
        }
      })
      .catch((err) => {
        alert("Unable to find manga!");
        router.push("/manga");
      });
  }, [manga_id, router]);

  function submitTicket(event: React.FormEvent){
    event.preventDefault();

      if (!selectedImage || !volumeTitle || !volumeNumber) {
        alert("Please fill in all fields and select an image.");
        return;
      }

    const formData = new FormData();

    formData.append("manga_id", manga_id);
    formData.append("volume_title", volumeTitle);
    formData.append("volume_number", volumeNumber);
    formData.append("submission_notes", submissionNotes);
    formData.append("image", selectedImage);


    fetch(`http://localhost:8080/submissions`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    })
      .then(res => {
        if (res.status !== 200) {
          throw new Error("Invalid status code!");
        }
        return res.json();
      })
        .then((res) => {
      if (res.status !== 200) {
        throw new Error("Failed to submit ticket!");
      }
      return res.json();
    })
    .then((data) => {
      alert("Ticket submitted successfully!");
      router.push(`/manga/${manga_id}`);
    })
    .catch((err) => {
      console.error(err);
      alert("Failed to submit ticket. Please try again.");
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="p-8 border-2 border-white rounded-xl bg-[#222] min-w-[320px] shadow-lg flex flex-col gap-6 items-center">
        <div className="flex gap-3 w-full justify-center">
          <button 
            onClick={() => router.push('/manga')}
            className="px-4 py-2 bg-[#333] text-white rounded border border-gray-600 hover:bg-[#444] hover:border-gray-500 transition-colors text-sm"
          >
            ← Back To Manga
          </button>
          <button 
            onClick={() => router.push(`/manga/${manga?.id}`)}
            className="px-4 py-2 bg-[#333] text-white rounded border border-gray-600 hover:bg-[#444] hover:border-gray-500 transition-colors text-sm"
          >
            ← {manga?.title_english}
          </button>
        </div>
        
        <header className="text-xl font-semibold text-white">Ticket Request: {manga?.title_english}</header>
        
        {imgSrc && (
          <img
            src={imgSrc}
            alt={manga?.title_english || ""}
            className="w-32 h-48 object-cover mb-2 rounded shadow-lg"
          />
        )}
        
        <MyDropzone onImageSelect={setSelectedImage} />
        
        <form className="w-full">
          {selectedImage && (
            <div className="flex flex-col items-center gap-4">
              <img
                src={URL.createObjectURL(selectedImage)}
                alt="Unable to load image!"
                className="w-32 h-48 object-cover rounded shadow-md"
              />
              <div className="w-full max-w-xs flex items-center gap-2">
                <div className="group relative">
                  <button
                    type="button"
                    className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/50 text-blue-400 text-xs flex items-center justify-center hover:bg-blue-500/30 transition-colors"
                  >
                    i
                  </button>
                  <div className="absolute left-0 top-7 w-64 bg-[#333] border border-gray-600 rounded p-2 text-xs text-gray-300 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-lg">
                    If the volume has a number, make sure to include it in the volume title (e.g., "Volume 5: The Final Battle")
                  </div>
                </div>
                <input 
                  placeholder="Volume Title"
                  value={volumeTitle}
                  onChange={(e) => {setVolumeTitle(e.target.value)}}
                  className="flex-1 px-4 py-2 rounded bg-[#333] border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-white transition-colors"
                />
              </div>
              <input
                placeholder="Volume Number"
                value={volumeNumber}
                onChange={(e) => {setVolumeNumber(e.target.value)}}
                className="w-full max-w-xs px-4 py-2 rounded bg-[#333] border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-white transition-colors"
              />
              <button 
                type="submit"
                onClick={submitTicket}
                className="px-6 py-2 bg-white text-black rounded font-medium hover:bg-gray-200 transition-colors"
              >
                Submit Request
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}