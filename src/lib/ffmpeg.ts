import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// It's good practice to use a specific CDN URL for the core
// You can find the latest versions from jsDelivr or unpkg.
// Example: https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js
// Make sure the version matches the @ffmpeg/core version in package.json
const CORE_VERSION = "0.12.4"; // Or use the version from your package.json
const CORE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.js`;
const WASM_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.wasm`;
const WORKER_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.worker.js`;


let ffmpeg: FFmpeg | null = null;

export const loadFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpeg) {
    return ffmpeg;
  }
  ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg log]:', message); // Optional: for debugging FFmpeg messages
  });
  // Path to the ffmpeg.wasm file (and worker if not using SharedArrayBuffer)
  // This needs to be accessible by the browser.
  // Using a CDN like unpkg or jsdelivr is common for web distribution.
  await ffmpeg.load({
    coreURL: await toBlobURL(CORE_URL, 'application/javascript'),
    wasmURL: await toBlobURL(WASM_URL, 'application/wasm'),
    // workerURL: await toBlobURL(WORKER_URL, 'application/javascript'), // Uncomment if not using SharedArrayBuffer
  });
  return ffmpeg;
};

export const upscaleVideo = async (
  videoFile: File,
  scaleFactor: number = 2 // Default to 2x upscale
): Promise<string> => { // Returns a URL to the upscaled video
  const ffmpegInstance = await loadFFmpeg();
  const inputFileName = 'input.mp4'; // Or derive from videoFile.name
  const outputFileName = `output-${Date.now()}.mp4`;

  try {
    // Write the file to FFmpeg's virtual file system
    await ffmpegInstance.writeFile(inputFileName, await fetchFile(videoFile));

    console.log(`Starting upscaling for ${inputFileName}... Scale factor: ${scaleFactor}x`);

    // Run the FFmpeg command
    // Example: -vf "scale=iw*2:ih*2" for 2x upscale using bicubic by default
    // More complex filters can be used for better quality, e.g., lanczos, spline
    // -c:v libx264 is a common choice for H.264 output
    // -preset ultrafast for faster processing, at the cost of quality/size
    // -crf 23 is a good quality setting for H.264
    const command = [
      '-i', inputFileName,
      '-vf', `scale=iw*${scaleFactor}:ih*${scaleFactor}`,
      '-c:v', 'libx264', // Specify video codec
      '-preset', 'ultrafast', // Faster processing
      '-crf', '23', // Constant Rate Factor for quality
      outputFileName
    ];

    await ffmpegInstance.exec(command);

    console.log(`Upscaling finished. Output: ${outputFileName}`);

    // Read the result
    const data = await ffmpegInstance.readFile(outputFileName);

    // Create a URL from the data
    const blob = new Blob([data], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    // Optionally, clean up the files from the virtual file system
    // await ffmpegInstance.deleteFile(inputFileName);
    // await ffmpegInstance.deleteFile(outputFileName);
    // Or terminate the instance if no more operations are needed soon
    // await ffmpegInstance.terminate();
    // ffmpeg = null; // Reset for potential re-initialization

    return url;
  } catch (error) {
    console.error('Error during video upscaling:', error);
    // Clean up in case of error
    // try {
    //   await ffmpegInstance.deleteFile(inputFileName);
    //   await ffmpegInstance.deleteFile(outputFileName);
    // } catch (cleanupError) {
    //   console.error('Error during cleanup:', cleanupError);
    // }
    // await ffmpegInstance.terminate();
    // ffmpeg = null;
    throw error; // Re-throw the error to be handled by the caller
  }
};

// Note: For SharedArrayBuffer to work (which FFmpeg uses for better performance),
// your server needs to send COOP and COEP headers.
// For Vite dev server, you can configure this in `vite.config.ts`:
//
// export default defineConfig({
//   // ... other configs
//   server: {
//     headers: {
//       'Cross-Origin-Opener-Policy': 'same-origin',
//       'Cross-Origin-Embedder-Policy': 'require-corp',
//     },
//   },
//   optimizeDeps: {
//     exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] // Vite specific for wasm
//   }
// });
//
// Without these headers, FFmpeg might run slower or fall back to a non-SharedArrayBuffer version.
// The `workerURL` in `ffmpeg.load()` becomes more critical if SharedArrayBuffer is not available.
