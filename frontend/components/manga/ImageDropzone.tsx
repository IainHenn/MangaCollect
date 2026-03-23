"use client";

import { useDropzone } from "react-dropzone";

interface Props {
  onImageSelect: (file: File) => void;
}

export default function ImageDropzone({ onImageSelect }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".gif"],
    },
    maxFiles: 1,
    onDrop: acceptedFiles => {
      if (acceptedFiles[0]) {
        onImageSelect(acceptedFiles[0]);
      }
    },
  });

  return (
    <div
      {...getRootProps()}
      className="border-2 border-dashed border-gray-500 p-8 cursor-pointer rounded hover:border-gray-400 transition-colors"
    >
      <input {...getInputProps()} />
      {isDragActive ? <p>Drop the image here...</p> : <p>Drag and drop an image here, or click to select</p>}
    </div>
  );
}
