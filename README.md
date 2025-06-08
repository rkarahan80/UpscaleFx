# UpscaleFx

UpscaleFx is a web-based application that allows you to upscale your videos using FFmpeg.wasm. This project demonstrates the use of React, TypeScript, Vite, Tailwind CSS, and FFmpeg compiled to WebAssembly to perform video processing directly in the browser.

## Features

*   **Video File Input**: Upload video files using a drag-and-drop interface or a file selector.
*   **Client-Side Upscaling**: Upscales videos (currently at a fixed 2x factor) using FFmpeg.wasm. No server-side processing is required for the core upscaling task.
*   **Download Upscaled Video**: Once processing is complete, download the upscaled video back to your device.
*   **Video Preview**: Preview the upscaled video directly in the browser.

## Tech Stack

*   **Frontend**: React, TypeScript
*   **Build Tool**: Vite
*   **Styling**: Tailwind CSS
*   **Video Processing**: FFmpeg.wasm (`@ffmpeg/ffmpeg`, `@ffmpeg/util`)
*   **UI Components**: `react-dropzone` for file input.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

*   Node.js (v18.x or later recommended)
*   npm or yarn

### Installation & Running

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd upscale-fx
    ```

2.  **Install dependencies:**
    Using npm:
    ```bash
    npm install
    ```
    Or using yarn:
    ```bash
    yarn install
    ```

3.  **Run the development server:**
    Using npm:
    ```bash
    npm run dev
    ```
    Or using yarn:
    ```bash
    yarn dev
    ```
    This will start the Vite development server, typically at `http://localhost:5173`. The application will open in your default web browser.

    **Note on FFmpeg Performance**: For optimal FFmpeg performance (utilizing SharedArrayBuffer), the Vite development server is configured to serve the necessary COOP (Cross-Origin-Opener-Policy) and COEP (Cross-Origin-Embedder-Policy) headers.

## How It Works

1.  The user selects a video file.
2.  The application loads FFmpeg.wasm if it hasn't been loaded already.
3.  The video file is written to FFmpeg's virtual file system.
4.  An FFmpeg command is executed to upscale the video (e.g., `scale=iw*2:ih*2`).
5.  The resulting upscaled video data is read from the virtual file system.
6.  A Blob URL is created for the upscaled video, allowing for download and preview.

## Future Enhancements (Possible Ideas)

*   Selectable scale factors (e.g., 1.5x, 2x, 3x, 4x).
*   Choice of upscaling algorithms/filters.
*   Preview of original vs. upscaled video.
*   More detailed progress reporting for FFmpeg operations.
*   Support for more output formats or codecs.
*   Error handling improvements and user feedback.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.
(Further details can be added here if desired)
