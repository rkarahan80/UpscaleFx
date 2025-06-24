from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
import ffmpeg
import os
import shutil
import uuid

app = FastAPI()

# Create a temporary directory for uploads if it doesn't exist
UPLOAD_DIR = "temp_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse
import ffmpeg
import os
import shutil
import uuid
from typing import Optional

app = FastAPI()

# Create a temporary directory for uploads if it doesn't exist
UPLOAD_DIR = "temp_uploads"
PROCESSED_DIR = "temp_processed"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

@app.get("/")
async def read_root():
    return {"message": "Welcome to the Video Upscaling API"}

@app.post("/upscale-video/")
async def upscale_video_endpoint(
    video: UploadFile = File(...),
    scale_option: str = Form("2x") # e.g., "2x", "4x", "1080p", "4k"
):
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a video.")

    file_id = str(uuid.uuid4())
    original_filename = video.filename if video.filename else "video"
    file_extension = os.path.splitext(original_filename)[1] if original_filename and os.path.splitext(original_filename)[1] else ".mp4"

    input_temp_path = os.path.join(UPLOAD_DIR, f"{file_id}_input{file_extension}")
    output_temp_path = os.path.join(PROCESSED_DIR, f"{file_id}_upscaled{file_extension}")

    try:
        with open(input_temp_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save uploaded video: {str(e)}")
    finally:
        video.file.close()

    try:
        scale_factor_val = 0
        target_width_val = 0
        target_height_val = 0 # Primarily driven by width to maintain aspect ratio

        if scale_option.lower().endswith('x'):
            try:
                factor = float(scale_option.lower().replace('x', ''))
                if factor <= 0:
                    raise ValueError("Scale factor must be positive.")
                scale_factor_val = factor
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid scale factor format. Use '2x', '1.5x', etc.")
        elif scale_option.lower() == '1080p':
            target_width_val = 1920
            target_height_val = 1080 # Used as a reference, aspect ratio preserved by width
        elif scale_option.lower() == '4k':
            target_width_val = 3840
            target_height_val = 2160 # Used as a reference
        else:
            raise HTTPException(status_code=400, detail="Invalid scale_option. Supported: 'Nx' (e.g. '2x'), '1080p', '4k'.")

        upscaled_file_path = upscale_video_py(
            input_path=input_temp_path,
            output_path=output_temp_path,
            scale_factor=scale_factor_val,
            target_width=target_width_val,
            target_height=target_height_val # target_height is more of a guideline for the function
        )

        # Ensure filename for download is somewhat descriptive
        download_filename = f"upscaled_{scale_option}_{original_filename}"
        if not download_filename.endswith(file_extension): # ensure correct extension if original_filename was weird
            download_filename = f"{os.path.splitext(download_filename)[0]}{file_extension}"


        return FileResponse(
            path=upscaled_file_path,
            media_type='video/mp4', # Or determine dynamically if supporting other output types
            filename=download_filename # Suggests a filename to the browser
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e: # For issues like invalid scale factor, video probing
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e: # Catch-all for ffmpeg errors or other internal issues
        # Log the full error server-side for debugging
        print(f"Unhandled error during upscaling: {str(e)}")
        # Potentially clean up output_temp_path if it exists and is bad
        if os.path.exists(output_temp_path):
             os.remove(output_temp_path)
        raise HTTPException(status_code=500, detail=f"Error during video upscaling: {str(e)}")
    finally:
        # Clean up the input temporary file
        if os.path.exists(input_temp_path):
            os.remove(input_temp_path)
        # Note: The upscaled file (output_temp_path) is sent and then should ideally be cleaned up.
        # FileResponse can use a background task for cleanup after sending.
        # For simplicity now, we are not auto-deleting it. A cron job or similar might be needed for `PROCESSED_DIR`.
        # Or, if FileResponse is awaited, we can delete after:
        # response = FileResponse(...)
        # await response.send_body() # or similar if the method exists, or use BackgroundTask
        # if os.path.exists(upscaled_file_path):
        #    os.remove(upscaled_file_path)
        # For now, we'll leave it and address cleanup of PROCESSED_DIR as a potential improvement.

def get_video_dimensions(input_path: str) -> tuple[int, int]:
    """Gets the width and height of the video."""
    try:
        probe = ffmpeg.probe(input_path)
        video_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'video'), None)
        if video_stream is None:
            raise ValueError("No video stream found")
        return int(video_stream['width']), int(video_stream['height'])
    except ffmpeg.Error as e:
        print(f"ffmpeg.Error: {e.stderr.decode('utf8') if e.stderr else 'Unknown ffmpeg error'}")
        raise ValueError(f"Error probing video file: {e.stderr.decode('utf8') if e.stderr else 'Unknown ffmpeg error'}")
    except Exception as e:
        print(f"Error getting video dimensions: {str(e)}")
        raise ValueError(f"Could not get video dimensions: {str(e)}")


def upscale_video_py(
    input_path: str,
    output_path: str,
    scale_factor: float = 0,
    target_width: int = 0,
    target_height: int = 0
) -> str:
    """
    Upscales a video using ffmpeg-python.
    Specify either scale_factor or target_width and target_height.
    If target_width and target_height are given, aspect ratio is preserved based on target_width.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    try:
        original_width, original_height = get_video_dimensions(input_path)

        if scale_factor > 0:
            vf_filter = f"scale=w=iw*{scale_factor}:h=ih*{scale_factor}:flags=lanczos"
        elif target_width > 0 and target_height > 0:
            # Calculate new height to maintain aspect ratio based on target_width
            # Or, if you want to fit within a box, you might need more complex logic
            # For simplicity, let's scale to target_width and calculate height,
            # or scale to target_height and calculate width, ensuring it doesn't exceed 4K limits.

            # Let's aim for fitting within the target_width, preserving aspect ratio.
            # If you want to hit a specific resolution like 4K (3840x2160), you'd adjust.
            # For "4K" (UHD, 3840 width), we want to scale up to this width.

            # If specific target dimensions are given, use them but ensure aspect ratio is maintained.
            # A common way is to scale to fit within the given WxH, preserving aspect ratio.
            # Example: scale to width target_width, height is target_width * original_height / original_width
            # Then ensure height does not exceed target_height, and vice-versa.
            # For now, a simpler scale if specific target_width is given:
            # vf_filter = f"scale=w={target_width}:h=-1:flags=lanczos" # -1 preserves aspect ratio for height
            # However, the prompt implies "up to 4K", so we need to handle this.

            # Let's make target_width the primary driver for "4K" type scaling
            # and ensure we don't upscale needlessly if original is already larger.
            if target_width >= original_width: # Only upscale
                 vf_filter = f"scale=w={target_width}:h=-2:flags=lanczos" # -2 ensures height is divisible by 2 for codecs
            else: # If target is smaller, it's a downscale or no-op. For upscaling, this shouldn't be the primary path.
                 vf_filter = f"scale=w={original_width}:h={original_height}:flags=lanczos" # No change or use original

        else:
            raise ValueError("Either scale_factor or target_width must be specified.")

        stream = ffmpeg.input(input_path)
        stream = ffmpeg.output(stream, output_path, vf=vf_filter, preset='ultrafast', crf=23, vcodec='libx264')
        ffmpeg.run(stream, overwrite_output=True, quiet=True)

        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise Exception("Output file not created or is empty after ffmpeg processing.")

        return output_path
    except ffmpeg.Error as e:
        error_message = e.stderr.decode('utf8') if e.stderr else "Unknown ffmpeg error during upscaling"
        print(f"ffmpeg.Error during upscaling: {error_message}")
        # Clean up failed output if it exists and is empty
        if os.path.exists(output_path) and os.path.getsize(output_path) == 0:
            os.remove(output_path)
        raise Exception(f"FFmpeg error during upscaling: {error_message}")
    except Exception as e:
        print(f"Error during video upscaling: {str(e)}")
        if os.path.exists(output_path): # Clean up potentially corrupted output
             os.remove(output_path)
        raise Exception(f"General error during video upscaling: {str(e)}")


# Further implementation for actual upscaling endpoint will go here.

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
