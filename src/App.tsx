import React, { useState, useEffect } from 'react';
import VideoInput from './components/VideoInput';
// import { upscaleVideoWithBackend } from './lib/ffmpeg'; // If we had a helper
import './App.css';

// Define available scale options
const SCALE_OPTIONS = ["2x", "4x", "1080p", "4k"];
// Define available format options
const FORMAT_OPTIONS = ["mp4", "avi", "mov", "mkv", "webm", "flv"];

// Define available format options
const FORMAT_OPTIONS = ["mp4", "avi", "mov", "mkv", "webm", "flv"];
// Define available compression quality presets
const COMPRESSION_PRESETS = [
  { value: "high", label: "High Quality (Larger File)" },
  { value: "medium", label: "Medium Quality (Balanced)" },
  { value: "low", label: "Low Quality (Smaller File)" },
];

// Enum for different processing states/types
enum ProcessingState {
  IDLE,
  UPSCALING,
  CONVERTING,
  COMPRESSING,
  CROPPING,
  TRIMMING,
  EXTRACTING_FRAME,
  EDITING_METADATA,
  ANALYZING_QUALITY,
  DENOISING_REALESRGAN,
  AI_UPSCALING,
  OBJECT_DETECTION,
  DETECTING_BLURRING_FACES,
  STABILIZING_VIDEO,
  GENERATING_THUMBNAIL,
  BATCH_PROCESSING,
}

interface ProcessedAssetInfo { // Renamed from ProcessedVideoInfo to be more generic
  url: string;
  filename: string;
  type: 'upscale' | 'convert' | 'compress' | 'crop' | 'trim' | 'frame' | 'metadata_edit' | 'quality_analysis' | 'denoise_realesrgan' | 'ai_upscale' | 'object_detection' | 'face_detection_blur' | 'video_stabilization' | 'thumbnail' | 'batch_item_success'; // Added batch_item_success
  assetType: 'video' | 'image'; // To distinguish between video and image output
}

// Helper to get video duration
const getVideoDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.onloadedmetadata = () => {
      window.URL.revokeObjectURL(videoElement.src);
      resolve(videoElement.duration);
    };
    videoElement.onerror = reject;
    videoElement.src = URL.createObjectURL(file);
  });
};


function App() {
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{ width: number, height: number, duration: number } | null>(null);
  const [fullVideoMetadata, setFullVideoMetadata] = useState<any | null>(null); // To store full probe output
  // Unified state for processed asset (video or image)
  const [processedAsset, setProcessedAsset] = useState<ProcessedAssetInfo | null>(null);
  const [currentProcessing, setCurrentProcessing] = useState<ProcessingState>(ProcessingState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  // States for UI selections
  const [selectedScaleOption, setSelectedScaleOption] = useState<string>(SCALE_OPTIONS[0]);
  const [selectedTargetFormat, setSelectedTargetFormat] = useState<string>(FORMAT_OPTIONS[0]);
  const [selectedCompressionPreset, setSelectedCompressionPreset] = useState<string>(COMPRESSION_PRESETS[1].value);
  const [cropParams, setCropParams] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [trimParams, setTrimParams] = useState({ startTime: '00:00:00', endTime: '00:00:00' });
  const [frameExtractParams, setFrameExtractParams] = useState({ timestamp: '00:00:05', format: 'jpg' });
  const [editableMetadata, setEditableMetadata] = useState<{ [key: string]: string }>({
    title: '',
    artist: '',
    album: '',
    genre: '',
    comment: '',
    // Add more common fields if desired
  });
  const [selectedQualityMetric, setSelectedQualityMetric] = useState<'psnr' | 'ssim'>('psnr');
  const [qualityAnalysisResult, setQualityAnalysisResult] = useState<{ metric: string; average_value: number } | null>(null);
  const [processedAssetForAnalysis, setProcessedAssetForAnalysis] = useState<File | null>(null);
  const AI_UPSCALE_OPTIONS = [{value: 2, label: "2x"}, {value: 4, label: "4x"}]; // Example, can be extended
  const [aiUpscaleFactor, setAiUpscaleFactor] = useState<number>(AI_UPSCALE_OPTIONS[0].value);
  const [blurFacesEnabled, setBlurFacesEnabled] = useState<boolean>(true);
  const [stabilizationParams, setStabilizationParams] = useState({ smoothing: 10, zoom: 0 });
  const [thumbnailParams, setThumbnailParams] = useState({ timestamp: '00:00:03', format: 'jpg' });

  interface FileWithUrl {
    file: File;
    objectUrl: string;
  }
  const [videoForCompare1, setVideoForCompare1] = useState<FileWithUrl | null>(null);
  const [videoForCompare2, setVideoForCompare2] = useState<FileWithUrl | null>(null);
  const comparePlayer1Ref = useRef<HTMLVideoElement>(null);
  const comparePlayer2Ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // If a processed asset is available and it's a video, fetch its blob to make it ready as a File for analysis
    if (processedAsset && processedAsset.assetType === 'video' && processedAsset.url) {
      fetch(processedAsset.url)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], processedAsset.filename, { type: blob.type });
          setProcessedAssetForAnalysis(file);
        })
        .catch(err => {
          console.error("Error fetching processed asset for analysis:", err);
          setProcessedAssetForAnalysis(null); // Reset if fetch fails
        });
    } else {
      setProcessedAssetForAnalysis(null); // Reset if no processed asset or it's not a video
    }
  }, [processedAsset]);

  useEffect(() => {
    if (selectedVideo) {
      const objectUrl = URL.createObjectURL(selectedVideo);
      setVideoForCompare1({ file: selectedVideo, objectUrl });
      return () => URL.revokeObjectURL(objectUrl); // Cleanup
    } else {
      setVideoForCompare1(null);
    }
  }, [selectedVideo]);

  useEffect(() => {
    if (processedAsset && processedAsset.assetType === 'video' && processedAsset.url) {
      // Assuming processedAsset.url is a blob URL that can be used directly
      // If it were a regular URL, we'd fetch the blob then create an object URL
      // For now, we'll assume it's directly usable or the previous effect for processedAssetForAnalysis handles blob creation
      if (processedAssetForAnalysis) { // Check if the File object is ready
         setVideoForCompare2({ file: processedAssetForAnalysis, objectUrl: processedAsset.url });
      } else {
        // Fallback if processedAssetForAnalysis isn't ready yet, try to use URL directly
        // This might happen if the effect for processedAssetForAnalysis hasn't run yet
        // Or if processedAsset.url is already an object URL from a previous step
        // However, to ensure we have a File object for consistency, ideally wait for processedAssetForAnalysis
        // For simplicity now, if processedAssetForAnalysis is not set, we might not have a File object for processed video here.
        // Let's ensure we only set videoForCompare2 if processedAssetForAnalysis (the File object) is ready.
         setVideoForCompare2(null); // Or handle more gracefully
      }
    } else {
      setVideoForCompare2(null);
    }
  }, [processedAsset, processedAssetForAnalysis]);


  const handleFileSelected = async (file: File) => {
    setSelectedVideo(file);
    setProcessedAsset(null);
    setProcessedAssetForAnalysis(null);
    setQualityAnalysisResult(null);
    setEditableMetadata({ title: '', artist: '', album: '', genre: '', comment: '' });
    setVideoMetadata(null);
    setFullVideoMetadata(null);
    setVideoForCompare1(null); // Reset comparison video 1
    setVideoForCompare2(null); // Reset comparison video 2
    setError(null);
    setProgressMessage(null);
    setCurrentProcessing(ProcessingState.IDLE);

    // Fetch and set basic video metadata (width, height, duration)
    try {
      const duration = await getVideoDuration(file);
      const videoElement = document.createElement('video');
      videoElement.preload = 'metadata';
      videoElement.onloadedmetadata = async () => { // Make this async
        const basicMeta = {
          width: videoElement.videoWidth,
          height: videoElement.videoHeight,
          duration: duration,
        };
        setVideoMetadata(basicMeta);
        setCropParams({ x: 0, y: 0, width: basicMeta.width, height: basicMeta.height });
        const endHours = Math.floor(duration / 3600);
        const endMinutes = Math.floor((duration % 3600) / 60);
        const endSeconds = Math.floor(duration % 60);
        setTrimParams({ startTime: '00:00:00', endTime: `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:${String(endSeconds).padStart(2, '0')}` });
        window.URL.revokeObjectURL(videoElement.src);

        // After basic metadata, fetch full metadata from backend
        const formData = new FormData();
        formData.append('video', file);
        try {
          const metaResponse = await fetch('/api/get-metadata/', { method: 'POST', body: formData });
          if (!metaResponse.ok) {
            const errorData = await metaResponse.json().catch(() => ({ detail: metaResponse.statusText }));
            throw new Error(errorData.detail || `Server error: ${metaResponse.status}`);
          }
          const fullMeta = await metaResponse.json();
          setFullVideoMetadata(fullMeta);
          // Populate editableMetadata from fetched tags
          if (fullMeta && fullMeta.format && fullMeta.format.tags) {
            const tags = fullMeta.format.tags;
            setEditableMetadata(prev => ({
              ...prev, // Keep all defined keys
              title: tags.title || prev.title || '',
              artist: tags.artist || prev.artist || '',
              album: tags.album || prev.album || '',
              genre: tags.genre || prev.genre || '',
              comment: tags.comment || prev.comment || '',
              // Add other specific tags if needed, ensuring they exist in initial editableMetadata state
            }));
          }
        } catch (metaErr: any) {
          console.error("Error fetching full metadata:", metaErr);
          setError(`Could not load full video metadata: ${metaErr.message}`);
          // Keep basic metadata if full metadata fails
        }
      };
      videoElement.onerror = () => {
        setError("Could not load basic video metadata.");
        setVideoMetadata(null);
        setFullVideoMetadata(null);
        window.URL.revokeObjectURL(videoElement.src);
      };
      videoElement.src = URL.createObjectURL(file);
    } catch (err) {
      console.error("Error getting video duration:", err);
      setError("Could not load basic video metadata (duration).");
      setVideoMetadata(null);
      setFullVideoMetadata(null);
    }
  };

  const handleThumbnailParamChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setThumbnailParams({ ...thumbnailParams, [e.target.name]: e.target.value });
  };

  const handleGenerateThumbnail = async () => {
    if (!selectedVideo) {
      setError("Please select a video file first.");
      return;
    }
     // Validate timestamp format (HH:MM:SS or seconds)
     if (!/^(?:[0-5]?\d:)?(?:[0-5]?\d:)?[0-5]?\d$|^\d+(\.\d+)?$/.test(thumbnailParams.timestamp)) {
      setError('Invalid timestamp format for thumbnail. Use HH:MM:SS or seconds (e.g., 00:01:30 or 90.5).');
      return;
    }

    setCurrentProcessing(ProcessingState.GENERATING_THUMBNAIL);
    setError(null);
    setProcessedAsset(null); // Clear previous asset before generating a new one
    setQualityAnalysisResult(null);
    setProgressMessage(`Generating thumbnail at ${thumbnailParams.timestamp} as ${thumbnailParams.format.toUpperCase()}...`);

    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('timestamp', thumbnailParams.timestamp);
    formData.append('image_format', thumbnailParams.format);

    try {
      // Re-use the /extract-frame/ endpoint for thumbnail generation
      const response = await fetch('/api/extract-frame/', { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      setProcessedAsset({
        url,
        filename: `thumbnail-${originalName}-at-${thumbnailParams.timestamp.replace(/:/g, '-')}.${thumbnailParams.format}`,
        type: 'thumbnail',
        assetType: 'image',
      });
      setProgressMessage('Thumbnail generation complete!');
    } catch (err: any) {
      setError(`Thumbnail generation failed: ${err.message}`);
      setProgressMessage('Thumbnail generation failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleStabilizationParamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStabilizationParams({ ...stabilizationParams, [e.target.name]: parseInt(e.target.value, 10) || 0 });
  };

  const handleStabilizeVideo = async () => {
    if (!selectedVideo) {
      setError("Please select a video file first.");
      return;
    }

    setCurrentProcessing(ProcessingState.STABILIZING_VIDEO);
    setError(null);
    setProcessedAsset(null);
    setQualityAnalysisResult(null);
    setProgressMessage("Starting video stabilization... This may take some time (two-pass process).");

    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('smoothing', String(stabilizationParams.smoothing));
    formData.append('zoom', String(stabilizationParams.zoom));


    try {
      const response = await fetch('/api/stabilize-video/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      const extension = selectedVideo.name.substring(selectedVideo.name.lastIndexOf('.')) || ".mp4";

      setProcessedAsset({
        url,
        filename: `stabilized-${originalName}${extension}`,
        type: 'video_stabilization',
        assetType: 'video',
      });
      setProgressMessage('Video stabilization complete! Video is ready.');

    } catch (err: any) {
      console.error('Video Stabilization failed:', err);
      setError(`Video Stabilization failed: ${err.message || 'Unknown error'}`);
      setProgressMessage('Video Stabilization failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleDetectBlurFaces = async () => {
    if (!selectedVideo) {
      setError("Please select a video file first.");
      return;
    }

    setCurrentProcessing(ProcessingState.DETECTING_BLURRING_FACES);
    setError(null);
    setProcessedAsset(null);
    setQualityAnalysisResult(null);
    setProgressMessage(`Starting face detection${blurFacesEnabled ? ' and blurring' : ''}... This may take time.`);

    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('blur_faces', String(blurFacesEnabled));

    try {
      const response = await fetch('/api/detect-blur-faces-video/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      const extension = selectedVideo.name.substring(selectedVideo.name.lastIndexOf('.')) || ".mp4";
      const operationType = blurFacesEnabled ? 'faces-blurred' : 'faces-detected';

      setProcessedAsset({
        url,
        filename: `${operationType}-${originalName}${extension}`,
        type: 'face_detection_blur', // Using a single type for this combined operation
        assetType: 'video',
      });
      setProgressMessage(`Face ${blurFacesEnabled ? 'detection and blurring' : 'detection'} complete!`);

    } catch (err: any) {
      console.error('Face Detection/Blurring failed:', err);
      setError(`Face Detection/Blurring failed: ${err.message || 'Unknown error'}`);
      setProgressMessage('Face Detection/Blurring failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleDetectObjects = async () => {
    if (!selectedVideo) {
      setError("Please select a video file first.");
      return;
    }

    setCurrentProcessing(ProcessingState.OBJECT_DETECTION);
    setError(null);
    setProcessedAsset(null);
    setQualityAnalysisResult(null);
    setProgressMessage("Starting object detection... This may take a long time. (Currently simulated)");

    const formData = new FormData();
    formData.append('video', selectedVideo);

    try {
      const response = await fetch('/api/detect-objects-video/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      const extension = selectedVideo.name.substring(selectedVideo.name.lastIndexOf('.')) || ".mp4";

      setProcessedAsset({
        url,
        filename: `object-detection-${originalName}${extension}`,
        type: 'object_detection',
        assetType: 'video',
      });
      setProgressMessage('Object detection processing complete! Video is ready.');

    } catch (err: any) {
      console.error('Object Detection failed:', err);
      setError(`Object Detection failed: ${err.message || 'Unknown error'}`);
      setProgressMessage('Object Detection failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleAiUpscale = async () => {
    if (!selectedVideo) {
      setError("Please select a video file first.");
      return;
    }

    setCurrentProcessing(ProcessingState.AI_UPSCALING);
    setError(null);
    setProcessedAsset(null);
    setQualityAnalysisResult(null);
    setProgressMessage(`Starting AI upscaling (x${aiUpscaleFactor})... This can take a very long time.`);

    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('upscale_factor', String(aiUpscaleFactor));

    try {
      const response = await fetch('/api/upscale-video-ai/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      const extension = selectedVideo.name.substring(selectedVideo.name.lastIndexOf('.')) || ".mp4";

      setProcessedAsset({
        url,
        filename: `ai-upscaled-x${aiUpscaleFactor}-${originalName}${extension}`,
        type: 'ai_upscale',
        assetType: 'video',
      });
      setProgressMessage(`AI Upscaling (x${aiUpscaleFactor}) complete! Your video is ready.`);

    } catch (err: any) {
      console.error('AI Upscaling failed:', err);
      setError(`AI Upscaling failed: ${err.message || 'Unknown error'}`);
      setProgressMessage('AI Upscaling failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleDenoiseRealESRGAN = async () => {
    if (!selectedVideo) {
      setError("Please select a video file first.");
      return;
    }

    setCurrentProcessing(ProcessingState.DENOISING_REALESRGAN);
    setError(null);
    setProcessedAsset(null); // Clear previous results
    setQualityAnalysisResult(null); // Clear quality analysis results
    setProgressMessage("Starting AI video denoising with Real-ESRGAN... This can take a very long time.");

    const formData = new FormData();
    formData.append('video', selectedVideo);

    try {
      const response = await fetch('/api/denoise-video-realesrgan/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      const extension = selectedVideo.name.substring(selectedVideo.name.lastIndexOf('.')) || ".mp4"; // Preserve original extension if possible

      setProcessedAsset({
        url,
        filename: `denoised-realesrgan-${originalName}${extension}`,
        type: 'denoise_realesrgan',
        assetType: 'video',
      });
      setProgressMessage('AI Denoising complete! Your video is ready.');

    } catch (err: any) {
      console.error('AI Denoising failed:', err);
      setError(`AI Denoising failed: ${err.message || 'Unknown error'}`);
      setProgressMessage('AI Denoising failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleAnalyzeQuality = async () => {
    if (!selectedVideo) {
      setError("Please upload an original video first.");
      return;
    }
    if (!processedAssetForAnalysis) {
      setError("No processed video available to analyze. Please perform an operation (e.g., compress, convert) on the video first, or ensure the processed video is loaded.");
      return;
    }

    setCurrentProcessing(ProcessingState.ANALYZING_QUALITY);
    setError(null);
    setQualityAnalysisResult(null);
    setProgressMessage(`Analyzing video quality with ${selectedQualityMetric.toUpperCase()}...`);

    const formData = new FormData();
    formData.append('original_video', selectedVideo);
    formData.append('processed_video', processedAssetForAnalysis);
    formData.append('metric_type', selectedQualityMetric);

    try {
      const response = await fetch('/api/analyze-quality/', { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }
      const result = await response.json();
      setQualityAnalysisResult(result);
      setProgressMessage(`${selectedQualityMetric.toUpperCase()} analysis complete.`);
    } catch (err: any) {
      setError(`Quality analysis failed: ${err.message}`);
      setProgressMessage('Quality analysis failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleExtractFrame = async () => {
    if (!selectedVideo || !videoMetadata) {
      setError('Please select a video file and ensure metadata is loaded.');
      return;
    }
    // Validate timestamp format (HH:MM:SS or seconds)
    if (!/^(?:[0-5]?\d:)?(?:[0-5]?\d:)?[0-5]?\d$|^\d+(\.\d+)?$/.test(frameExtractParams.timestamp)) {
        setError('Invalid timestamp format. Use HH:MM:SS or seconds (e.g., 00:01:30 or 90.5).');
        return;
    }
    // Optional: Validate timestamp against video duration
    // This requires parsing HH:MM:SS to seconds if needed.
    // For simplicity, let backend handle out-of-bounds errors for now.

    setCurrentProcessing(ProcessingState.EXTRACTING_FRAME);
    setError(null);
    setProcessedAsset(null);
    setProgressMessage(`Extracting frame at ${frameExtractParams.timestamp} as ${frameExtractParams.format.toUpperCase()}...`);

    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('timestamp', frameExtractParams.timestamp);
    formData.append('image_format', frameExtractParams.format);

    try {
      const response = await fetch('/api/extract-frame/', { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      setProcessedAsset({
        url,
        filename: `frame-${originalName}-at-${frameExtractParams.timestamp.replace(/:/g, '-')}.${frameExtractParams.format}`,
        type: 'frame',
        assetType: 'image',
      });
      setProgressMessage('Frame extraction complete!');
    } catch (err: any) {
      setError(`Frame extraction failed: ${err.message}`);
      setProgressMessage('Frame extraction failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleCropParamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCropParams({ ...cropParams, [e.target.name]: parseInt(e.target.value, 10) || 0 });
  };

  const handleTrimParamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTrimParams({ ...trimParams, [e.target.name]: e.target.value });
  };

  const handleFrameExtractParamChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFrameExtractParams({ ...frameExtractParams, [e.target.name]: e.target.value });
  };

  const handleEditableMetadataChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditableMetadata({ ...editableMetadata, [e.target.name]: e.target.value });
  };

  const handleSaveMetadata = async () => {
    if (!selectedVideo) {
      setError("Please select a video file first.");
      return;
    }

    setCurrentProcessing(ProcessingState.EDITING_METADATA);
    setError(null);
    setProcessedAsset(null);
    setProgressMessage("Saving metadata changes...");

    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('tags_json', JSON.stringify(editableMetadata));

    try {
      const response = await fetch('/api/edit-metadata/', { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      const extension = selectedVideo.name.substring(selectedVideo.name.lastIndexOf('.')) || ".mp4";

      setProcessedAsset({
        url,
        filename: `metadata-edited-${originalName}${extension}`,
        type: 'metadata_edit',
        assetType: 'video',
      });
      setProgressMessage('Metadata saved successfully! The new video is ready.');
      // Optionally, re-fetch full metadata to show updated values, though it might be redundant if `codec=copy` works as expected.
      // For now, we assume the backend correctly updated it.
    } catch (err: any) {
      setError(`Failed to save metadata: ${err.message}`);
      setProgressMessage('Metadata saving failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleUpscale = async () => {
    if (!selectedVideo) {
      setError('Please select a video file first.');
      return;
    }

    setCurrentProcessing(ProcessingState.UPSCALING);
    setError(null);
    setProcessedAsset(null);
    setProgressMessage('Starting upscaling process... This may take a while on the server.');

    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('scale_option', selectedScaleOption);

    try {
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
            errorDetail = response.statusText || errorDetail;
        }
        throw new Error(errorDetail);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      setProcessedAsset({
        url,
        filename: `upscaled-${selectedScaleOption}-${originalName}.${blob.type.split('/')[1] || 'mp4'}`,
        type: 'upscale',
        assetType: 'video',
      });
      setProgressMessage('Upscaling complete! Your video is ready.');

    } catch (err: any) {
      console.error('Upscaling failed:', err);
      setError(`Upscaling failed: ${err.message || 'Unknown error'}`);
      setProgressMessage('Upscaling failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleConvert = async () => {
    if (!selectedVideo) {
      setError('Please select a video file first.');
      return;
    }

    setCurrentProcessing(ProcessingState.CONVERTING);
    setError(null);
    setProcessedAsset(null);
    setProgressMessage(`Starting conversion to ${selectedTargetFormat.toUpperCase()}... This may take a while.`);

    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('target_format', selectedTargetFormat);

    try {
      const response = await fetch('/api/convert-video/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorDetail = `Server error: ${response.status}`;
        try {
            const errorData = await response.json();
            errorDetail = errorData.detail || errorDetail;
        } catch (e) {
            errorDetail = response.statusText || errorDetail;
        }
        throw new Error(errorDetail);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      setProcessedAsset({
        url,
        filename: `converted-${originalName}.${selectedTargetFormat}`,
        type: 'convert',
        assetType: 'video',
      });
      setProgressMessage(`Conversion to ${selectedTargetFormat.toUpperCase()} complete!`);

    } catch (err: any) {
      console.error('Conversion failed:', err);
      setError(`Conversion failed: ${err.message || 'Unknown error'}`);
      setProgressMessage('Conversion failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleCompress = async () => {
    if (!selectedVideo) {
      setError('Please select a video file first.');
      return;
    }

    setCurrentProcessing(ProcessingState.COMPRESSING);
    setError(null);
    setProcessedAsset(null);
    const presetLabel = COMPRESSION_PRESETS.find(p => p.value === selectedCompressionPreset)?.label || selectedCompressionPreset;
    setProgressMessage(`Starting compression (${presetLabel})... This may take a while.`);

    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('quality_preset', selectedCompressionPreset);

    try {
      const response = await fetch('/api/compress-video/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorDetail = `Server error: ${response.status}`;
        try {
            const errorData = await response.json();
            errorDetail = errorData.detail || errorDetail;
        } catch (e) {
            errorDetail = response.statusText || errorDetail;
        }
        throw new Error(errorDetail);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      // Backend ensures .mp4 extension for compressed files
      setProcessedAsset({
        url,
        filename: `compressed-${selectedCompressionPreset}-${originalName}.mp4`,
        type: 'compress',
        assetType: 'video',
      });
      setProgressMessage(`Compression (${presetLabel}) complete!`);

    } catch (err: any) {
      console.error('Compression failed:', err);
      setError(`Compression failed: ${err.message || 'Unknown error'}`);
      setProgressMessage('Compression failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleCrop = async () => {
    if (!selectedVideo || !videoMetadata) {
      setError('Please select a video file and ensure metadata is loaded.');
      return;
    }
    if (cropParams.width <= 0 || cropParams.height <= 0) {
      setError('Crop width and height must be greater than 0.');
      return;
    }
    if (cropParams.x + cropParams.width > videoMetadata.width || cropParams.y + cropParams.height > videoMetadata.height) {
      setError('Crop dimensions exceed original video dimensions.');
      return;
    }


    setCurrentProcessing(ProcessingState.CROPPING);
    setError(null);
    setProcessedAsset(null);
    setProgressMessage(`Starting crop (X:${cropParams.x} Y:${cropParams.y} W:${cropParams.width} H:${cropParams.height})...`);

    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('crop_x', String(cropParams.x));
    formData.append('crop_y', String(cropParams.y));
    formData.append('crop_width', String(cropParams.width));
    formData.append('crop_height', String(cropParams.height));

    try {
      const response = await fetch('/api/crop-video/', { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      setProcessedAsset({
        url,
        filename: `cropped-${cropParams.width}x${cropParams.height}-${originalName}.mp4`,
        type: 'crop',
        assetType: 'video',
      });
      setProgressMessage('Cropping complete!');
    } catch (err: any) {
      setError(`Cropping failed: ${err.message}`);
      setProgressMessage('Cropping failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };

  const handleTrim = async () => {
    if (!selectedVideo) {
      setError('Please select a video file first.');
      return;
    }
     // Basic time validation (optional, as backend/ffmpeg handles more complex cases)
    if (!/^\d{2}:\d{2}:\d{2}$/.test(trimParams.startTime) || !/^\d{2}:\d{2}:\d{2}$/.test(trimParams.endTime)) {
      setError('Time format should be HH:MM:SS.');
      return;
    }

    setCurrentProcessing(ProcessingState.TRIMMING);
    setError(null);
    setProcessedAsset(null);
    setProgressMessage(`Starting trim (Start: ${trimParams.startTime} End: ${trimParams.endTime})...`);

    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('start_time', trimParams.startTime);
    formData.append('end_time', trimParams.endTime);

    try {
      const response = await fetch('/api/trim-video/', { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const originalName = selectedVideo.name.substring(0, selectedVideo.name.lastIndexOf('.')) || "video";
      setProcessedAsset({
        url,
        filename: `trimmed-${trimParams.startTime.replace(/:/g, '-')}-to-${trimParams.endTime.replace(/:/g, '-')}-${originalName}.mp4`,
        type: 'trim',
        assetType: 'video',
      });
      setProgressMessage('Trimming complete!');
    } catch (err: any) {
      setError(`Trimming failed: ${err.message}`);
      setProgressMessage('Trimming failed.');
    } finally {
      setCurrentProcessing(ProcessingState.IDLE);
    }
  };


  const isProcessing = currentProcessing !== ProcessingState.IDLE;

  return (
    <div className="container mx-auto p-4 max-w-5xl"> {/* Increased max-width for more columns or wider edit section */}
      <header className="text-center my-8">
        <h1 className="text-4xl font-bold text-blue-600">UpscaleFx</h1>
        <p className="text-gray-500 mt-2">Advanced Video Processing Tools</p>
      </header>

      {error && (
        <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <p><strong>Error:</strong> {error}</p>
        </div>
      )}

      <section className="my-6 p-6 border rounded-lg shadow-lg bg-gray-50">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">1. Upload Video</h2>
        <VideoInput onFileSelected={handleFileSelected} />
      </section>

      {/* Display Full Metadata - Collapsible Section */}
      {selectedVideo && fullVideoMetadata && (
        <section className="my-6 p-6 border rounded-lg shadow-lg bg-gray-50">
          <details className="group">
            <summary className="text-xl font-semibold text-gray-700 cursor-pointer hover:text-blue-600 transition-colors flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 group-open:rotate-90 transition-transform"><polyline points="9 18 15 12 9 6"></polyline></svg>
              Full Video Metadata (Technical Details)
            </summary>
            <div className="mt-4 p-4 border rounded-md bg-white shadow max-h-96 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap break-all">
                {JSON.stringify(fullVideoMetadata, null, 2)}
              </pre>
            </div>
          </details>
        </section>
      )}

      {/* Video Quality Analysis Section */}
      {selectedVideo && processedAssetForAnalysis && videoMetadata && (
         <section className="my-8 p-6 border rounded-lg shadow-xl bg-white">
          <h2 className="text-2xl font-semibold mb-6 text-gray-700 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 text-cyan-500"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="m9 12 2 2 4-4"></path></svg>
            Video Quality Analysis
          </h2>
          <div className="text-sm text-center mb-4 text-gray-600">
            Comparing: <span className="font-medium">{selectedVideo.name}</span> (Original) vs. <span className="font-medium">{processedAssetForAnalysis.name}</span> (Processed)
          </div>
          <div className="flex flex-col items-center space-y-4 md:flex-row md:space-y-0 md:space-x-4 md:justify-center">
            <div>
              <label htmlFor="quality-metric" className="block text-sm font-medium text-gray-600">Select Metric:</label>
              <select
                id="quality-metric"
                value={selectedQualityMetric}
                onChange={(e) => setSelectedQualityMetric(e.target.value as 'psnr' | 'ssim')}
                className="mt-1 block w-full md:w-auto p-3 border border-gray-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 transition-shadow"
                disabled={isProcessing}
              >
                <option value="psnr">PSNR</option>
                <option value="ssim">SSIM</option>
              </select>
            </div>
            <button
              onClick={handleAnalyzeQuality}
              disabled={isProcessing || !selectedVideo || !processedAssetForAnalysis}
              className="w-full md:w-auto bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-6 rounded-lg text-md shadow-md disabled:opacity-60 transition-colors"
            >
              {currentProcessing === ProcessingState.ANALYZING_QUALITY ? 'Analyzing...' : `Analyze ${selectedQualityMetric.toUpperCase()}`}
            </button>
          </div>
          {qualityAnalysisResult && (
            <div className="mt-6 p-4 bg-gray-100 rounded-md text-center">
              <p className="text-lg font-semibold text-gray-800">
                Average {qualityAnalysisResult.metric.toUpperCase()}:
                <span className="text-cyan-600 ml-2">
                  {qualityAnalysisResult.average_value.toFixed(4)}
                  {qualityAnalysisResult.metric === 'psnr' ? ' dB' : ''}
                </span>
              </p>
            </div>
          )}
        </section>
      )}

      {/* Metadata Editing Section */}
      {selectedVideo && fullVideoMetadata && (
        <section className="my-8 p-6 border rounded-lg shadow-xl bg-white">
          <h2 className="text-2xl font-semibold mb-6 text-gray-700 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 text-lime-500"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path><path d="M15 12H9m6 4H9m3-8H9"></path></svg>
            Edit Common Metadata
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {Object.keys(editableMetadata).map((key) => (
              <div key={key}>
                <label htmlFor={`meta-${key}`} className="block text-sm font-medium text-gray-600 capitalize">
                  {key.replace(/_/g, ' ')}:
                </label>
                {key === 'comment' ? (
                  <textarea
                    id={`meta-${key}`}
                    name={key}
                    value={editableMetadata[key]}
                    onChange={handleEditableMetadataChange}
                    rows={3}
                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-lime-500 focus:border-lime-500 sm:text-sm"
                    disabled={isProcessing}
                  />
                ) : (
                  <input
                    type="text"
                    id={`meta-${key}`}
                    name={key}
                    value={editableMetadata[key]}
                    onChange={handleEditableMetadataChange}
                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-lime-500 focus:border-lime-500 sm:text-sm"
                    disabled={isProcessing}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <button
              onClick={handleSaveMetadata}
              disabled={isProcessing || !selectedVideo}
              className="bg-lime-500 hover:bg-lime-600 text-white font-bold py-3 px-6 rounded-lg text-md shadow-md disabled:opacity-60 transition-colors"
            >
              {currentProcessing === ProcessingState.EDITING_METADATA ? 'Saving Metadata...' : 'Save Metadata Changes'}
            </button>
          </div>
        </section>
      )}


      {selectedVideo && (
        // Container for main operations - Upscale, Convert, Compress
        <div className="grid md:grid-cols-3 gap-x-6 gap-y-6 my-8">
          {/* Upscaling Section */}
          <section className="p-6 border rounded-lg shadow-lg bg-white">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 text-green-500"><path d="m21 9-6-6-1.5 1.5L18 9h-3v1H9V9H3v1h3v2H3v1h3v2H3v1h4l2 2h3l2-2h4v-1h-3V9h3z"/></svg>
              Upscale Video
            </h2>
            <div className="flex flex-col space-y-4">
              <label htmlFor="scale-option" className="block text-sm font-medium text-gray-600">Select upscale factor:</label>
              <select
                id="scale-option"
                value={selectedScaleOption}
                onChange={(e) => setSelectedScaleOption(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 transition-shadow"
                disabled={isProcessing}
              >
                {SCALE_OPTIONS.map(option => (
                  <option key={option} value={option}>{option.toUpperCase()}</option>
                ))}
              </select>
              <button
                onClick={handleUpscale}
                disabled={isProcessing || !selectedVideo}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg text-md shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
              >
                {currentProcessing === ProcessingState.UPSCALING ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Upscaling...
                  </span>
                ) : `Upscale (${selectedScaleOption.toUpperCase()})`}
              </button>
            </div>
          </section>

          {/* Conversion Section */}
          <section className="p-6 border rounded-lg shadow-lg bg-white">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 text-purple-500"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              Convert Video Format
            </h2>
            <div className="flex flex-col space-y-4">
              <label htmlFor="format-option" className="block text-sm font-medium text-gray-600">Select target format:</label>
              <select
                id="format-option"
                value={selectedTargetFormat}
                onChange={(e) => setSelectedTargetFormat(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 transition-shadow"
                disabled={isProcessing}
              >
                {FORMAT_OPTIONS.map(format => (
                  <option key={format} value={format}>{format.toUpperCase()}</option>
                ))}
              </select>
              <button
                onClick={handleConvert}
                disabled={isProcessing || !selectedVideo}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg text-md shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
              >
                {currentProcessing === ProcessingState.CONVERTING ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Converting...
                  </span>
                ) : `Convert to ${selectedTargetFormat.toUpperCase()}`}
              </button>
            </div>
          </section>

          {/* Compression Section */}
          <section className="p-6 border rounded-lg shadow-lg bg-white">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 text-orange-500"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              Compress Video
            </h2>
            <div className="flex flex-col space-y-4">
              <label htmlFor="compression-preset" className="block text-sm font-medium text-gray-600">Select quality preset:</label>
              <select
                id="compression-preset"
                value={selectedCompressionPreset}
                onChange={(e) => setSelectedCompressionPreset(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                disabled={isProcessing}
              >
                {COMPRESSION_PRESETS.map(preset => (
                  <option key={preset.value} value={preset.value}>{preset.label}</option>
                ))}
              </select>
              <button
                onClick={handleCompress}
                disabled={isProcessing || !selectedVideo}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-lg text-md shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50"
                aria-label={`Compress video with ${selectedCompressionPreset} quality`}
              >
                {currentProcessing === ProcessingState.COMPRESSING ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Compressing...
                  </span>
                ) : `Compress Video (${COMPRESSION_PRESETS.find(p=>p.value === selectedCompressionPreset)?.value.toUpperCase()})`}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* AI Features Section - Start with Denoising */}
      {selectedVideo && (
        <section className="my-8 p-6 border rounded-lg shadow-xl bg-white">
           <h2 className="text-2xl font-semibold mb-6 text-gray-700 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 text-purple-500"><path d="M12 2a2.828 2.828 0 0 0-2 5 2.828 2.828 0 0 0-2 5 2.828 2.828 0 0 0 2 5 2.828 2.828 0 0 0 2 5 2.828 2.828 0 0 0 2-5 2.828 2.828 0 0 0 2-5 2.828 2.828 0 0 0-2-5 2.828 2.828 0 0 0-2-5z"></path><path d="m20 20-1.09-1.09"></path><path d="m4 4 1.09 1.09"></path><path d="m20 4-1.09 1.09"></path><path d="m4 20 1.09-1.09"></path><path d="M12 22v-2"></path><path d="M12 4V2"></path><path d="M22 12h-2"></path><path d="M4 12H2"></path></svg>
            AI / ML Features
          </h2>
          <div className="grid md:grid-cols-1 gap-x-6 gap-y-8"> {/* Single column for now, can be expanded */}
            {/* Real-ESRGAN Denoising UI */}
            <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="text-xl font-medium mb-3 text-purple-600 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M12 2a2.828 2.828 0 0 0-2 5 2.828 2.828 0 0 0-2 5 2.828 2.828 0 0 0 2 5 2.828 2.828 0 0 0 2 5 2.828 2.828 0 0 0 2-5 2.828 2.828 0 0 0 2-5 2.828 2.828 0 0 0-2-5 2.828 2.828 0 0 0-2-5Z"></path></svg>
                 Video Denoising (Real-ESRGAN)
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                Uses AI to reduce noise in the video. This process can be very time-consuming.
                May also enhance details or upscale depending on the model.
              </p>
              <button
                onClick={handleDenoiseRealESRGAN}
                disabled={isProcessing || !selectedVideo}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg text-md shadow-md disabled:opacity-60"
              >
                {currentProcessing === ProcessingState.DENOISING_REALESRGAN ? 'Denoising...' : 'Denoise Video (Real-ESRGAN)'}
              </button>
            </div>

            {/* AI Upscaling UI */}
            <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="text-xl font-medium mb-3 text-purple-600 flex items-center">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
                AI Video Upscaling (Real-ESRGAN)
              </h3>
              <p className="text-sm text-gray-500 mb-2">
                Uses AI to upscale video resolution for better quality. Also time-consuming.
              </p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="ai-upscale-factor" className="block text-sm font-medium text-gray-600">Upscale Factor:</label>
                  <select
                    id="ai-upscale-factor"
                    name="aiUpscaleFactor"
                    value={aiUpscaleFactor}
                    onChange={(e) => setAiUpscaleFactor(Number(e.target.value))}
                    className="w-full mt-1 p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500"
                    disabled={isProcessing}
                  >
                    {AI_UPSCALE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleAiUpscale}
                  disabled={isProcessing || !selectedVideo}
                  className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg text-md shadow-md disabled:opacity-60"
                >
                  {currentProcessing === ProcessingState.AI_UPSCALING ? 'AI Upscaling...' : `AI Upscale Video (${aiUpscaleFactor}x)`}
                </button>
              </div>
            </div>
            {/* Other AI features can be added here as new cards */}

            {/* Object Detection UI */}
            <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="text-xl font-medium mb-3 text-purple-600 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M12 11.5A2.5 2.5 0 0 1 9.5 9A2.5 2.5 0 0 1 12 6.5A2.5 2.5 0 0 1 14.5 9a2.5 2.5 0 0 1-2.5 2.5z"></path><path d="M20.25 12A8.25 8.25 0 0 0 12 3.75A8.25 8.25 0 0 0 3.75 12c0 2.75 1.336 5.25 3.438 6.836A8.213 8.213 0 0 0 12 20.25a8.213 8.213 0 0 0 4.812-1.414A8.255 8.255 0 0 0 20.25 12z"></path><line x1="12" x2="12" y1="20.25" y2="22.5"></line><line x1="12" x2="12" y1="1.5" y2="3.75"></line><line x1="3.75" x2="1.5" y1="12" y2="12"></line><line x1="22.5" x2="20.25" y1="12" y2="12"></line></svg>
                Object Detection in Video
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                Detects common objects in video frames and draws bounding boxes. (Currently simulated)
                This process can also be very time-consuming.
              </p>
              <button
                onClick={handleDetectObjects}
                disabled={isProcessing || !selectedVideo}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg text-md shadow-md disabled:opacity-60"
              >
                {currentProcessing === ProcessingState.OBJECT_DETECTION ? 'Detecting Objects...' : 'Detect Objects in Video'}
              </button>
            </div>

            {/* Face Detection/Blurring UI */}
            <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="text-xl font-medium mb-3 text-purple-600 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 0 0-16 0"></path><path d="M12 13a8 8 0 0 0-8 8h16a8 8 0 0 0-8-8z"></path><path d="M12 13a8 8 0 0 0-8 8"></path></svg>
                Face Detection & Blurring
              </h3>
              <p className="text-sm text-gray-500 mb-2">
                Detects faces and optionally blurs them. (Uses Haar Cascade; simulated if cascade unavailable)
              </p>
              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    id="blur-faces-checkbox"
                    name="blurFacesEnabled"
                    type="checkbox"
                    checked={blurFacesEnabled}
                    onChange={(e) => setBlurFacesEnabled(e.target.checked)}
                    className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    disabled={isProcessing}
                  />
                  <label htmlFor="blur-faces-checkbox" className="ml-2 block text-sm text-gray-700">
                    Blur Detected Faces
                  </label>
                </div>
                <button
                  onClick={handleDetectBlurFaces}
                  disabled={isProcessing || !selectedVideo}
                  className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg text-md shadow-md disabled:opacity-60"
                >
                  {currentProcessing === ProcessingState.DETECTING_BLURRING_FACES ? 'Processing Faces...' : 'Process Faces in Video'}
                </button>
              </div>
            </div>

             {/* Video Stabilization UI */}
             <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="text-xl font-medium mb-3 text-purple-600 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path><path d="M22 17c0 1.7-1.3 3-3 3h-2c-1.7 0-3-1.3-3-3v-2c0-1.7 1.3-3 3-3h2c1.7 0 3 1.3 3 3v2z"></path><path d="M2 7v10"></path></svg>
                Video Stabilization (FFmpeg)
              </h3>
              <p className="text-sm text-gray-500 mb-2">
                Reduces shakiness in the video using FFmpeg's vidstab filters (two-pass).
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
                <div>
                  <label htmlFor="stabilizationSmoothing" className="block text-xs font-medium text-gray-500">Smoothing (1-50):</label>
                  <input
                    type="number"
                    name="smoothing"
                    id="stabilizationSmoothing"
                    value={stabilizationParams.smoothing}
                    onChange={handleStabilizationParamChange}
                    min="0" max="50" step="1"
                    className="w-full mt-1 p-2 border rounded-md shadow-sm text-sm"
                    disabled={isProcessing}
                  />
                </div>
                <div>
                  <label htmlFor="stabilizationZoom" className="block text-xs font-medium text-gray-500">Zoom (0=none):</label>
                  <input
                    type="number"
                    name="zoom"
                    id="stabilizationZoom"
                    value={stabilizationParams.zoom}
                    onChange={handleStabilizationParamChange}
                    min="0" max="5" step="0.1"
                    className="w-full mt-1 p-2 border rounded-md shadow-sm text-sm"
                    disabled={isProcessing}
                  />
                </div>
              </div>
              <button
                onClick={handleStabilizeVideo}
                disabled={isProcessing || !selectedVideo}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg text-md shadow-md disabled:opacity-60"
              >
                {currentProcessing === ProcessingState.STABILIZING_VIDEO ? 'Stabilizing...' : 'Stabilize Video'}
              </button>
            </div>

          </div>
        </section>
      )}

      {/* Video Editing Section - Crop and Trim */}
      {selectedVideo && videoMetadata && (
        <section className="my-8 p-6 border rounded-lg shadow-xl bg-white">
          <h2 className="text-2xl font-semibold mb-6 text-gray-700 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 text-indigo-500"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            Edit Video & Generate Thumbnail
          </h2>
          <div className="text-sm text-center mb-4 text-gray-600">
            Original Dimensions: {videoMetadata.width}w x {videoMetadata.height}h &nbsp;|&nbsp; Duration: {new Date(videoMetadata.duration * 1000).toISOString().slice(11, 19)}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-6"> {/* Changed to 4 columns for lg screens */}
            {/* Cropping UI */}
            <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="text-xl font-medium mb-3 text-indigo-600 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M3.8 3.8A2 2 0 0 0 2 5.8V18a2 2 0 0 0 2 2h12.2a2 2 0 0 0 1.9-1.9"></path><path d="M8 12h8"></path><path d="M12 8v8"></path><path d="M18.2 18.2a2 2 0 0 0 1.9-1.9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2"></path></svg>
                Crop
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="crop_x" className="block text-sm font-medium text-gray-500">X:</label>
                  <input type="number" name="crop_x" id="crop_x" value={cropParams.x} onChange={handleCropParamChange} className="w-full mt-1 p-2 border rounded-md shadow-sm" disabled={isProcessing} />
                </div>
                <div>
                  <label htmlFor="crop_y" className="block text-sm font-medium text-gray-500">Y:</label>
                  <input type="number" name="crop_y" id="crop_y" value={cropParams.y} onChange={handleCropParamChange} className="w-full mt-1 p-2 border rounded-md shadow-sm" disabled={isProcessing} />
                </div>
                <div>
                  <label htmlFor="crop_width" className="block text-sm font-medium text-gray-500">Width:</label>
                  <input type="number" name="crop_width" id="crop_width" value={cropParams.width} onChange={handleCropParamChange} className="w-full mt-1 p-2 border rounded-md shadow-sm" disabled={isProcessing} />
                </div>
                <div>
                  <label htmlFor="crop_height" className="block text-sm font-medium text-gray-500">Height:</label>
                  <input type="number" name="crop_height" id="crop_height" value={cropParams.height} onChange={handleCropParamChange} className="w-full mt-1 p-2 border rounded-md shadow-sm" disabled={isProcessing} />
                </div>
              </div>
              <button
                onClick={handleCrop}
                disabled={isProcessing || !selectedVideo}
                className="mt-4 w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg text-md shadow-md disabled:opacity-60"
              >
                {currentProcessing === ProcessingState.CROPPING ? 'Cropping...' : 'Apply Crop'}
              </button>
            </div>

            {/* Trimming UI */}
            <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="text-xl font-medium mb-3 text-teal-600 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M17.657 18.657a8 8 0 1 0-11.314-11.314a8 8 0 0 0 11.314 11.314Z"></path><path d="M15 9l-6 6"></path><path d="M9 9h.01"></path><path d="M15 15h.01"></path></svg>
                Trim
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="startTime" className="block text-sm font-medium text-gray-500">Start (HH:MM:SS):</label>
                  <input type="text" name="startTime" id="startTime" value={trimParams.startTime} onChange={handleTrimParamChange} className="w-full mt-1 p-2 border rounded-md shadow-sm" placeholder="00:00:00" disabled={isProcessing} />
                </div>
                <div>
                  <label htmlFor="endTime" className="block text-sm font-medium text-gray-500">End (HH:MM:SS):</label>
                  <input type="text" name="endTime" id="endTime" value={trimParams.endTime} onChange={handleTrimParamChange} className="w-full mt-1 p-2 border rounded-md shadow-sm" placeholder="00:00:00" disabled={isProcessing} />
                </div>
              </div>
              <button
                onClick={handleTrim}
                disabled={isProcessing || !selectedVideo}
                className="mt-4 w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 px-4 rounded-lg text-md shadow-md disabled:opacity-60"
              >
                {currentProcessing === ProcessingState.TRIMMING ? 'Trimming...' : 'Apply Trim'}
              </button>
            </div>

            {/* Frame Extraction UI */}
            <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="text-xl font-medium mb-3 text-sky-600 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><line x1="3" x2="21" y1="9" y2="9"></line><line x1="3" x2="21" y1="15" y2="15"></line><line x1="9" x2="9" y1="3" y2="21"></line><line x1="15" x2="15" y1="3" y2="21"></line></svg>
                Extract Frame
              </h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="timestamp" className="block text-sm font-medium text-gray-500">Timestamp (HH:MM:SS or S):</label>
                  <input type="text" name="timestamp" id="timestamp" value={frameExtractParams.timestamp} onChange={handleFrameExtractParamChange} className="w-full mt-1 p-2 border rounded-md shadow-sm" placeholder="00:00:05" disabled={isProcessing} />
                </div>
                <div>
                  <label htmlFor="format" className="block text-sm font-medium text-gray-500">Image Format:</label>
                  <select name="format" id="format" value={frameExtractParams.format} onChange={handleFrameExtractParamChange} className="w-full mt-1 p-2 border rounded-md shadow-sm" disabled={isProcessing}>
                    <option value="jpg">JPG</option>
                    <option value="png">PNG</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleExtractFrame}
                disabled={isProcessing || !selectedVideo}
                className="mt-4 w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-4 rounded-lg text-md shadow-md disabled:opacity-60"
              >
                {currentProcessing === ProcessingState.EXTRACTING_FRAME ? 'Extracting...' : 'Extract Frame'}
              </button>
            </div>

            {/* Thumbnail Generation UI */}
            <div className="p-4 border rounded-md bg-gray-50">
              <h3 className="text-xl font-medium mb-3 text-amber-600 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                Generate Thumbnail
              </h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="thumbnailTimestamp" className="block text-sm font-medium text-gray-500">Timestamp (HH:MM:SS or S):</label>
                  <input
                    type="text"
                    name="timestamp"
                    id="thumbnailTimestamp"
                    value={thumbnailParams.timestamp}
                    onChange={handleThumbnailParamChange}
                    className="w-full mt-1 p-2 border rounded-md shadow-sm"
                    placeholder="00:00:03"
                    disabled={isProcessing}
                  />
                </div>
                <div>
                  <label htmlFor="thumbnailFormat" className="block text-sm font-medium text-gray-500">Image Format:</label>
                  <select
                    name="format"
                    id="thumbnailFormat"
                    value={thumbnailParams.format}
                    onChange={handleThumbnailParamChange}
                    className="w-full mt-1 p-2 border rounded-md shadow-sm"
                    disabled={isProcessing}
                  >
                    <option value="jpg">JPG</option>
                    <option value="png">PNG</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleGenerateThumbnail}
                disabled={isProcessing || !selectedVideo}
                className="mt-4 w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-lg text-md shadow-md disabled:opacity-60"
              >
                {currentProcessing === ProcessingState.GENERATING_THUMBNAIL ? 'Generating...' : 'Generate Thumbnail'}
              </button>
            </div>
          </div>
        </section>
      )}


      {isProcessing && (
        <section className="my-8 text-center">
          <div className="p-6 bg-blue-50 border border-blue-300 text-blue-700 rounded-lg shadow-md">
            <p className="font-semibold text-lg mb-2">{progressMessage || 'Processing your video...'}</p>
            <div className="w-full bg-blue-200 rounded-full h-4 dark:bg-gray-700 mt-1 overflow-hidden relative">
              <div
                className="bg-blue-500 h-4 rounded-full"
                style={{
                  width: '100%',
                  animation: 'pulse-bar 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                }}
              ></div>
            </div>
            <p className="text-sm mt-2 text-blue-600">This may take a few moments depending on the video size and operation.</p>
          </div>
        </section>
      )}

      {processedVideoInfo && (
        <section className="my-8 p-6 border rounded-lg shadow-xl bg-white">
          <h2 className="text-3xl font-bold mb-5 text-center">
            {processedAsset.type === 'upscale' && <span className="text-green-600">Upscaled Video Ready!</span>}
            {processedAsset.type === 'convert' && <span className="text-purple-600">Converted Video Ready!</span>}
            {processedAsset.type === 'compress' && <span className="text-orange-600">Compressed Video Ready!</span>}
            {processedAsset.type === 'crop' && <span className="text-indigo-600">Cropped Video Ready!</span>}
            {processedAsset.type === 'trim' && <span className="text-teal-600">Trimmed Video Ready!</span>}
            {processedAsset.type === 'frame' && <span className="text-sky-600">Extracted Frame Ready!</span>}
            {processedAsset.type === 'metadata_edit' && <span className="text-lime-600">Video with Updated Metadata Ready!</span>}
            {processedAsset.type === 'denoise_realesrgan' && <span className="text-purple-600">AI Denoised Video Ready!</span>}
            {processedAsset.type === 'ai_upscale' && <span className="text-pink-600">AI Upscaled Video Ready!</span>}
            {processedAsset.type === 'object_detection' && <span className="text-red-500">Video with Object Detections Ready!</span>}
            {processedAsset.type === 'face_detection_blur' && <span className="text-rose-500">Video with Face Processing Ready!</span>}
            {processedAsset.type === 'video_stabilization' && <span className="text-emerald-500">Stabilized Video Ready!</span>}
            {processedAsset.type === 'thumbnail' && <span className="text-amber-600">Thumbnail Ready!</span>}
          </h2>
          <div className="flex flex-col items-center space-y-4">
            {processedAsset.assetType === 'video' ? (
              <video src={processedAsset.url} controls className="w-full max-w-xl rounded-lg shadow-lg border border-gray-200" aria-label="Processed video preview" />
            ) : (
              <img src={processedAsset.url} alt={processedAsset.filename} className="max-w-xl w-full rounded-lg shadow-lg border border-gray-200" />
            )}
            <a
              href={processedAsset.url}
              download={processedAsset.filename}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg text-lg shadow-md inline-block transition-all duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-2 align-text-bottom"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              Download {processedAsset.assetType === 'image' ? 'Image' : 'Video'}
            </a>
            <p className="text-sm text-gray-500">Filename: <span className="font-medium text-gray-700">{processedAsset.filename}</span></p>
          </div>
        </section>
      )}

      {/* Add a key to force re-render of the App component in storybook */}
      <footer key="footer" className="text-center mt-12 py-4 border-t border-gray-200">
        <p className="text-sm text-gray-500">UpscaleFx - Powered by React, Python (FastAPI), FFmpeg & TailwindCSS</p>
      </footer>
    </div>
  );
}

export default App;
