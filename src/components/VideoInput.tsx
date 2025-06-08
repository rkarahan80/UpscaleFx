import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface VideoInputProps {
  onFileSelected: (file: File) => void;
}

const VideoInput: React.FC<VideoInputProps> = ({ onFileSelected }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setError(null);
    setSelectedFile(null);

    if (rejectedFiles && rejectedFiles.length > 0) {
      // For now, just take the first error
      const firstError = rejectedFiles[0].errors[0];
      if (firstError) {
        setError(`Error: ${firstError.message}`);
      } else {
        setError('Error: File rejected for an unknown reason.');
      }
      return;
    }

    if (acceptedFiles && acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      // Basic video type validation
      if (file.type.startsWith('video/')) {
        setSelectedFile(file);
        onFileSelected(file);
      } else {
        setError('Error: Invalid file type. Please select a video file.');
      }
    }
  }, [onFileSelected]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.webm', '.ogg', '.mov'] // Example video types
    },
    multiple: false,
  });

  return (
    <div {...getRootProps()} style={dropzoneStyle} className="border-2 border-dashed border-gray-400 rounded-lg p-8 text-center cursor-pointer hover:border-gray-600 transition-colors">
      <input {...getInputProps()} />
      {isDragActive ? (
        <p className="text-blue-500">Drop the video file here ...</p>
      ) : (
        <p>Drag 'n' drop a video file here, or click to select file</p>
      )}
      {selectedFile && (
        <div className="mt-4 text-sm text-gray-700">
          <p><strong>Selected file:</strong> {selectedFile.name}</p>
          <p><strong>Type:</strong> {selectedFile.type}</p>
          <p><strong>Size:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
      )}
      {error && (
        <div className="mt-4 text-sm text-red-500">
          <p>{error}</p>
        </div>
      )}
    </div>
  );
};

// Basic styling (can be moved to CSS or enhanced with Tailwind later)
const dropzoneStyle: React.CSSProperties = {
  // Style will be primarily handled by Tailwind classes applied via className
};

export default VideoInput;
