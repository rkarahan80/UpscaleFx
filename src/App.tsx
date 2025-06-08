import React, { useState, useEffect } from 'react';
import VideoInput from './components/VideoInput';
import { upscaleVideo, loadFFmpeg } from './lib/ffmpeg';
import './App.css'; // For any additional global styles if needed

function App() {
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [upscaledVideoUrl, setUpscaledVideoUrl] = useState<string | null>(null);
  const [isUpscaling, setIsUpscaling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  useEffect(() => {
    // Load FFmpeg when the component mounts
    // And set up COOP/COEP headers for Vite dev server
    const initFFmpeg = async () => {
      try {
        setProgressMessage('Loading FFmpeg library...');
        await loadFFmpeg();
        setFfmpegLoaded(true);
        setProgressMessage('FFmpeg loaded.');
        console.log('FFmpeg loaded successfully.');
      } catch (err) {
        console.error('Failed to load FFmpeg:', err);
        setError('Failed to load FFmpeg. Upscaling will not be available.');
        setProgressMessage('Error loading FFmpeg.');
      }
    };
    initFFmpeg();
  }, []);

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
    if (!ffmpegLoaded) {
      setError('FFmpeg is not loaded yet. Please wait or try refreshing.');
      return;
    }

    setIsUpscaling(true);
    setError(null);
    setUpscaledVideoUrl(null);
    setProgressMessage('Starting upscaling process... This may take a while.');

    try {
      const url = await upscaleVideo(selectedVideo, 2); // Using 2x scale factor
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
        <p className="text-gray-500 mt-2">Upscale your videos with ease</p>
      </header>

      {!ffmpegLoaded && !error && (
        <div className="my-4 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
          <p>{progressMessage || 'Initializing FFmpeg...'}</p>
          {/* You could add a simple spinner here later */}
        </div>
      )}

      {error && (
        <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <p><strong>Error:</strong> {error}</p>
        </div>
      )}

      <section className="my-6">
        <h2 className="text-2xl font-semibold mb-3 text-gray-700">1. Upload Video</h2>
        <VideoInput onFileSelected={handleFileSelected} />
      </section>

      {selectedVideo && !isUpscaling && ffmpegLoaded && (
        <section className="my-6 text-center">
          <button
            onClick={handleUpscale}
            disabled={isUpscaling || !ffmpegLoaded}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg text-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 ease-in-out"
          >
            Upscale Video (2x)
          </button>
        </section>
      )}

      {isUpscaling && (
        <section className="my-6 text-center">
          <div className="p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded">
            <p>{progressMessage || 'Upscaling in progress...'}</p>
            {/* Basic progress bar using @radix-ui/react-progress (if installed) or a simple div */}
            {/* For now, just text feedback is fine as per plan */}
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2">
              <div className="bg-blue-600 h-2.5 rounded-full animate-pulse" style={{ width: '100%' }}></div>
            </div>
          </div>
        </section>
      )}

      {upscaledVideoUrl && (
        <section className="my-6 text-center">
          <h2 className="text-2xl font-semibold mb-3 text-green-600">2. Download Your Upscaled Video</h2>
          <a
            href={upscaledVideoUrl}
            download={`upscaled-${selectedVideo?.name || 'video.mp4'}`}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg shadow-md inline-block transition-all duration-150 ease-in-out"
          >
            Download Upscaled Video
          </a>
          <video src={upscaledVideoUrl} controls className="mt-4 w-full rounded-lg shadow-md" />
        </section>
      )}

      <footer className="text-center mt-12 py-4 border-t border-gray-200">
        <p className="text-sm text-gray-500">UpscaleFx - Powered by React, FFmpeg & TailwindCSS</p>
      </footer>
    </div>
  );
}

export default App;
