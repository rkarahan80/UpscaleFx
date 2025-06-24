import React, { useState, useEffect } from 'react';
import VideoInput from './components/VideoInput';
// import { upscaleVideoWithBackend } from './lib/ffmpeg'; // If we had a helper
import './App.css';

// Define available scale options - this will be improved in the next step
const SCALE_OPTIONS = ["2x", "4x", "1080p", "4k"];

function App() {
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [upscaledVideoUrl, setUpscaledVideoUrl] = useState<string | null>(null);
  const [isUpscaling, setIsUpscaling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [selectedScaleOption, setSelectedScaleOption] = useState<string>(SCALE_OPTIONS[0]); // Default to "2x"

  // No FFmpeg.wasm loading needed anymore
  // useEffect(() => { ... }, []);

  const handleFileSelected = (file: File) => {
    setSelectedVideo(file);
    setUpscaledVideoUrl(null); // Reset previous upscaled video
    setError(null); // Reset errors
    setProgressMessage(null);
  };

  const handleUpscale = async () => {
    if (!selectedVideo) {
      setError('Please select a video file first.');
      return;
    }

    setIsUpscaling(true);
    setError(null);
    setUpscaledVideoUrl(null);
    setProgressMessage('Starting upscaling process... This may take a while on the server.');

    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('scale_option', selectedScaleOption);

    try {
      // The backend runs on port 8000. We'll use a proxy in vite.config.ts for /api
      const response = await fetch('/api/upscale-video/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorDetail = `Server error: ${response.status}`;
        try {
            const errorData = await response.json();
            errorDetail = errorData.detail || errorDetail;
        } catch (e) {
            // If parsing JSON fails, use the status text
            errorDetail = response.statusText || errorDetail;
        }
        throw new Error(errorDetail);
      }

      const blob = await response.blob();
      if (blob.type !== "video/mp4") { // Or handle other video types if backend supports
        console.warn("Received blob type is not video/mp4:", blob.type);
        // Potentially try to play it anyway, or show more specific error
      }
      const url = URL.createObjectURL(blob);
      setUpscaledVideoUrl(url);
      setProgressMessage('Upscaling complete! Your video is ready for download.');

    } catch (err: any) {
      console.error('Upscaling failed:', err);
      setError(`Upscaling failed: ${err.message || 'Unknown error'}`);
      setProgressMessage('Upscaling failed.');
    } finally {
      setIsUpscaling(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <header className="text-center my-8">
        <h1 className="text-4xl font-bold text-blue-600">UpscaleFx</h1>
        <p className="text-gray-500 mt-2">Upscale your videos with ease (Now with Python Backend!)</p>
      </header>

      {error && (
        <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <p><strong>Error:</strong> {error}</p>
        </div>
      )}

      <section className="my-6">
        <h2 className="text-2xl font-semibold mb-3 text-gray-700">1. Upload Video</h2>
        <VideoInput onFileSelected={handleFileSelected} />
      </section>

      {selectedVideo && (
        <section className="my-6">
          <h2 className="text-2xl font-semibold mb-3 text-gray-700">2. Select Upscale Option</h2>
          <div className="flex justify-center items-center space-x-2">
            <select
              value={selectedScaleOption}
              onChange={(e) => setSelectedScaleOption(e.target.value)}
              className="p-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={isUpscaling}
            >
              {SCALE_OPTIONS.map(option => (
                <option key={option} value={option}>{option.toUpperCase()}</option>
              ))}
            </select>
            <button
              onClick={handleUpscale}
              disabled={isUpscaling || !selectedVideo}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg text-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 ease-in-out"
            >
              {isUpscaling ? 'Upscaling...' : `Upscale Video (${selectedScaleOption.toUpperCase()})`}
            </button>
          </div>
        </section>
      )}


      {isUpscaling && (
        <section className="my-6 text-center">
          <div className="p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded">
            <p>{progressMessage || 'Upscaling in progress on the server...'}</p>
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2">
              <div className="bg-blue-600 h-2.5 rounded-full animate-pulse" style={{ width: '100%' }}></div>
            </div>
          </div>
        </section>
      )}

      {upscaledVideoUrl && (
        <section className="my-6 text-center">
          <h2 className="text-2xl font-semibold mb-3 text-green-600">3. Download Your Upscaled Video</h2>
          <a
            href={upscaledVideoUrl}
            download={`upscaled-${selectedScaleOption}-${selectedVideo?.name || 'video.mp4'}`}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg shadow-md inline-block transition-all duration-150 ease-in-out"
          >
            Download Upscaled Video
          </a>
          <video src={upscaledVideoUrl} controls className="mt-4 w-full rounded-lg shadow-md" />
        </section>
      )}

      <footer className="text-center mt-12 py-4 border-t border-gray-200">
        <p className="text-sm text-gray-500">UpscaleFx - Powered by React, Python (FastAPI), FFmpeg & TailwindCSS</p>
      </footer>
    </div>
  );
}

export default App;
