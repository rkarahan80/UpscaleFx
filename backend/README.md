# UpscaleFx Backend

This directory contains the Python FastAPI backend for the UpscaleFx application. It handles video uploading, processing (upscaling using FFmpeg), and serves the processed video back to the frontend.

## Features

*   **Video Upload:** Accepts video files from the frontend.
*   **Video Upscaling:** Uses `ffmpeg-python` to upscale videos based on user-selected options (e.g., 2x, 4x, 1080p, 4K).
*   **File Serving:** Serves the upscaled video back to the user.

## Tech Stack

*   **Python 3.8+**
*   **FastAPI:** Modern, fast (high-performance) web framework for building APIs.
*   **Uvicorn:** ASGI server for running FastAPI applications.
*   **ffmpeg-python:** Python bindings for FFmpeg, used for video processing.
*   **FFmpeg:** The underlying multimedia framework (must be installed on the system where the backend runs).

## Prerequisites

*   Python 3.8 or newer.
*   `pip` for installing Python packages.
*   **FFmpeg executable:** FFmpeg must be installed and accessible in the system's PATH. You can download it from [ffmpeg.org](https://ffmpeg.org/download.html).

## Setup and Running

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Run the FastAPI server:**
    ```bash
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
    ```
    *   `main:app` refers to the `app` instance in the `main.py` file.
    *   `--reload` enables auto-reloading when code changes (useful for development).
    *   The server will typically be available at `http://localhost:8000`.

## API Endpoints

*   **`GET /`**:
    *   Description: Root endpoint, returns a welcome message.
    *   Response: `{"message": "Welcome to the Video Upscaling API"}`

*   **`POST /upscale-video/`**:
    *   Description: Accepts a video file and an upscale option, processes the video, and returns the upscaled video.
    *   Request: `multipart/form-data`
        *   `video`: The video file to upscale.
        *   `scale_option`: A string indicating the desired upscale operation (e.g., "2x", "4x", "1080p", "4k").
    *   Response:
        *   Success (200 OK): The upscaled video file as a stream (`FileResponse`).
        *   Error (400, 404, 500): JSON object with an error `detail` message.

## Temporary File Management

*   Uploaded videos are temporarily stored in the `temp_uploads` directory.
*   Processed (upscaled) videos are temporarily stored in the `temp_processed` directory.
*   Input files in `temp_uploads` are deleted after processing.
*   **Note:** Files in `temp_processed` are not automatically cleaned up by the application in the current version. A separate mechanism (e.g., a cron job or manual cleanup) would be needed for production environments to manage disk space.

## Development Notes

*   Ensure FFmpeg is correctly installed and in your PATH. You can test this by running `ffmpeg -version` in your terminal.
*   The `ultrafast` preset for FFmpeg is used to speed up processing. For higher quality at the cost of processing time, you might consider presets like `medium` or `slow`.
*   Error handling for FFmpeg processes is included, and error messages from FFmpeg are logged to the console and returned in API error responses where appropriate.
