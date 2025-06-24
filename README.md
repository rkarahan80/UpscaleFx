# UpscaleFx

UpscaleFx is a web application that allows you to upscale your videos. It features a React frontend and a Python (FastAPI) backend that handles the video processing using FFmpeg.

## Features

*   **Video File Input**: Upload video files using a drag-and-drop interface or a file selector.
*   **Server-Side Upscaling**: Videos are processed on a Python backend using FFmpeg. This allows for more robust processing and handling of larger files or more complex operations (like upscaling to 4K) than client-side WebAssembly.
*   **Selectable Upscale Options**: Choose from predefined scale factors (e.g., 2x, 4x) or target resolutions (e.g., 1080p, 4K).
*   **Download Upscaled Video**: Once processing is complete, download the upscaled video back to your device.
*   **Video Preview**: Preview the upscaled video directly in the browser.

## Tech Stack

*   **Frontend**:
    *   React, TypeScript
    *   Vite (Build Tool)
    *   Tailwind CSS (Styling)
    *   `react-dropzone` (File Input)
*   **Backend**:
    *   Python
    *   FastAPI (Web Framework)
    *   Uvicorn (ASGI Server)
    *   `ffmpeg-python` (Python bindings for FFmpeg)
*   **Core Video Processing**:
    *   FFmpeg (must be installed on the backend server environment)

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. The project now consists of two main parts: the frontend React application and the backend Python server.

### Prerequisites

*   **Node.js**: v18.x or later recommended (for the frontend).
*   **npm or yarn**: Package manager for Node.js.
*   **Python**: 3.8 or newer (for the backend).
*   **pip**: Python package installer.
*   **FFmpeg**: Must be installed and accessible in the system's PATH where the backend server will run. Download from [ffmpeg.org](https://ffmpeg.org/download.html).

### Installation & Running

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd upscale-fx
    ```

2.  **Set up and run the Backend Server:**
    *   Navigate to the backend directory:
        ```bash
        cd backend
        ```
    *   Create a virtual environment (recommended):
        ```bash
        python -m venv venv
        source venv/bin/activate  # On Windows: venv\Scripts\activate
        ```
    *   Install Python dependencies:
        ```bash
        pip install -r requirements.txt
        ```
    *   Run the FastAPI server:
        ```bash
        uvicorn main:app --reload --host 0.0.0.0 --port 8000
        ```
    *   The backend server will be running at `http://localhost:8000`. Keep this terminal open.
    *   For more details, see `backend/README.md`.

3.  **Set up and run the Frontend Application:**
    *   Open a new terminal window/tab.
    *   Navigate back to the project root directory if you are in the `backend` directory:
        ```bash
        cd ..
        ```
    *   Install frontend dependencies:
        Using npm:
        ```bash
        npm install
        ```
        Or using yarn:
        ```bash
        yarn install
        ```
    *   Run the Vite development server:
        Using npm:
        ```bash
        npm run dev
        ```
        Or using yarn:
        ```bash
        yarn dev
        ```
    *   This will start the Vite development server, typically at `http://localhost:5173`. The application will open in your default web browser. API requests from the frontend to `/api/...` will be proxied to the backend server at `http://localhost:8000`.

## How It Works

1.  The user selects a video file and an upscale option (e.g., 2x, 4K) in the React frontend.
2.  The frontend uploads the video and the selected option to the Python backend API (`/api/upscale-video/`).
3.  The FastAPI backend saves the uploaded video temporarily.
4.  The backend uses `ffmpeg-python` to execute an FFmpeg command based on the chosen upscale option. This command scales the video.
5.  Once FFmpeg processing is complete, the backend sends the upscaled video file back to the frontend.
6.  The frontend receives the video data as a Blob, creates an Object URL, and makes it available for download and preview.
7.  Temporary files on the server are managed (input files are deleted; output files may require a separate cleanup strategy for long-term deployment).

## Testing the Application (End-to-End)

1.  **Ensure FFmpeg is installed** on your system and accessible in your PATH. Verify by running `ffmpeg -version` in your terminal.
2.  **Start the backend server:**
    *   `cd backend`
    *   `source venv/bin/activate` (or `venv\Scripts\activate` on Windows)
    *   `pip install -r requirements.txt` (if first time or dependencies changed)
    *   `uvicorn main:app --reload --port 8000`
    *   Look for confirmation that the server is running, e.g., `Uvicorn running on http://0.0.0.0:8000`.
3.  **Start the frontend development server:**
    *   In a new terminal, from the project root:
    *   `npm install` or `yarn install` (if first time or dependencies changed)
    *   `npm run dev` or `yarn dev`
    *   This should open the application in your browser, typically at `http://localhost:5173`.
4.  **Test the UI:**
    *   Open the application in your browser (`http://localhost:5173`).
    *   Upload a small video file (e.g., an MP4).
    *   Select an upscale option from the dropdown (e.g., "2x").
    *   Click the "Upscale Video" button.
    *   Observe the progress/loading indicators. The browser console and backend terminal will show logs.
    *   Once complete, an upscaled video preview and a download link should appear.
    *   Download the video and verify its resolution and content.
    *   Test with different upscale options (e.g., "4K", "1080p") if your test videos are suitable.
    *   Test error conditions:
        *   Try uploading a non-video file.
        *   If possible, try to simulate an FFmpeg error (e.g., with a corrupted video file, though this is harder to reliably test without specific files). Observe if the UI shows an error message.

## Future Enhancements (Possible Ideas)

*   More sophisticated progress reporting from backend to frontend (e.g., using WebSockets or server-sent events for FFmpeg progress).
*   Choice of more upscaling algorithms/filters in FFmpeg.
*   User authentication and management of uploaded/processed videos.
*   Automatic cleanup of processed files on the server.
*   Dockerization of both frontend and backend for easier deployment.
*   Option to select output video format/codec.
*   More robust error handling and user feedback for various failure scenarios.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.
(Further details can be added here if desired)
