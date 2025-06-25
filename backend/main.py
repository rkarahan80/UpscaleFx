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


def convert_video_py(input_path: str, output_path: str, target_format: str) -> str:
    """
    Converts a video to a target format using ffmpeg-python.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    # Basic format validation, can be expanded
    allowed_formats = ["mp4", "avi", "mov", "mkv", "webm", "flv"]
    if target_format.lower() not in allowed_formats:
        raise ValueError(f"Unsupported target format: {target_format}. Supported formats: {', '.join(allowed_formats)}")

    output_path_with_extension = f"{os.path.splitext(output_path)[0]}.{target_format.lower()}"

    try:
        stream = ffmpeg.input(input_path)
        # Use same preset and crf as upscale for now, can be parameterized later
        # For some formats, specific codecs might be better/required.
        # This basic conversion will let ffmpeg choose default codecs for the container.
        # Example: .mov might default to h264, .webm to vp9 etc.
        # If specific codecs are needed, this line needs to be more complex.
        stream = ffmpeg.output(stream, output_path_with_extension, preset='ultrafast', crf=23)
        ffmpeg.run(stream, overwrite_output=True, quiet=True)

        if not os.path.exists(output_path_with_extension) or os.path.getsize(output_path_with_extension) == 0:
            raise Exception(f"Output file not created or is empty after ffmpeg processing for format {target_format}.")

        return output_path_with_extension
    except ffmpeg.Error as e:
        error_message = e.stderr.decode('utf8') if e.stderr else f"Unknown ffmpeg error during conversion to {target_format}"
        print(f"ffmpeg.Error during conversion: {error_message}")
        if os.path.exists(output_path_with_extension) and os.path.getsize(output_path_with_extension) == 0:
            os.remove(output_path_with_extension)
        raise Exception(f"FFmpeg error during conversion to {target_format}: {error_message}")
    except Exception as e:
        print(f"Error during video conversion: {str(e)}")
        if os.path.exists(output_path_with_extension): # Clean up potentially corrupted output
             os.remove(output_path_with_extension)
        raise Exception(f"General error during video conversion to {target_format}: {str(e)}")


@app.post("/convert-video/")
async def convert_video_endpoint(
    video: UploadFile = File(...),
    target_format: str = Form("mp4") # e.g., "mp4", "avi", "mov", "mkv"
):
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a video.")

    file_id = str(uuid.uuid4())
    original_filename = video.filename if video.filename else "video"
    # Keep original extension for input temp file
    input_file_extension = os.path.splitext(original_filename)[1] if original_filename and os.path.splitext(original_filename)[1] else ".tmp"

    input_temp_path = os.path.join(UPLOAD_DIR, f"{file_id}_input{input_file_extension}")
    # Output path will get its extension from the conversion function
    output_temp_base = os.path.join(PROCESSED_DIR, f"{file_id}_converted")


    try:
        with open(input_temp_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save uploaded video: {str(e)}")
    finally:
        video.file.close()

    converted_file_path = ""
    try:
        converted_file_path = convert_video_py(
            input_path=input_temp_path,
            output_path=output_temp_base, # Base name, function adds extension
            target_format=target_format.lower()
        )

        # Determine media type based on target format for the response
        media_type_map = {
            "mp4": "video/mp4",
            "avi": "video/x-msvideo",
            "mov": "video/quicktime",
            "mkv": "video/x-matroska",
            "webm": "video/webm",
            "flv": "video/x-flv",
        }
        response_media_type = media_type_map.get(target_format.lower(), "application/octet-stream")

        download_filename = f"{os.path.splitext(original_filename)[0]}_converted.{target_format.lower()}"

        return FileResponse(
            path=converted_file_path,
            media_type=response_media_type,
            filename=download_filename
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e: # For issues like invalid format
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Unhandled error during conversion: {str(e)}")
        if converted_file_path and os.path.exists(converted_file_path): # if output path was determined and file exists
             os.remove(converted_file_path)
        raise HTTPException(status_code=500, detail=f"Error during video conversion: {str(e)}")
    finally:
        if os.path.exists(input_temp_path):
            os.remove(input_temp_path)
        # As with upscaling, processed file cleanup is not yet implemented with BackgroundTask

def compress_video_py(input_path: str, output_path: str, quality_preset: str) -> str:
    """
    Compresses a video using ffmpeg-python with libx264.
    quality_preset maps to CRF values and encoding preset.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    quality_settings = {
        "high": {"crf": 20, "preset": "medium"},  # Good quality, decent size
        "medium": {"crf": 24, "preset": "medium"}, # Balanced
        "low": {"crf": 28, "preset": "fast"}    # Smaller size, faster, might lose quality
    }

    if quality_preset.lower() not in quality_settings:
        raise ValueError(f"Unsupported quality preset: {quality_preset}. Supported: {', '.join(quality_settings.keys())}")

    settings = quality_settings[quality_preset.lower()]
    output_crf = settings["crf"]
    output_preset = settings["preset"]

    # Output will be MP4 by default for libx264
    output_path_with_extension = f"{os.path.splitext(output_path)[0]}.mp4"


    try:
        stream = ffmpeg.input(input_path)
        # Using libx264 for broad compatibility. Could offer libx265 for better compression if desired.
        stream = ffmpeg.output(stream, output_path_with_extension, vcodec='libx264', crf=output_crf, preset=output_preset)
        ffmpeg.run(stream, overwrite_output=True, quiet=True)

        if not os.path.exists(output_path_with_extension) or os.path.getsize(output_path_with_extension) == 0:
            raise Exception(f"Output file not created or is empty after ffmpeg compression with preset {quality_preset}.")

        return output_path_with_extension
    except ffmpeg.Error as e:
        error_message = e.stderr.decode('utf8') if e.stderr else f"Unknown ffmpeg error during compression (preset: {quality_preset})"
        print(f"ffmpeg.Error during compression: {error_message}")
        if os.path.exists(output_path_with_extension) and os.path.getsize(output_path_with_extension) == 0:
            os.remove(output_path_with_extension)
        raise Exception(f"FFmpeg error during compression (preset: {quality_preset}): {error_message}")
    except Exception as e:
        print(f"Error during video compression: {str(e)}")
        if os.path.exists(output_path_with_extension):
             os.remove(output_path_with_extension)
        raise Exception(f"General error during video compression (preset: {quality_preset}): {str(e)}")


@app.post("/compress-video/")
async def compress_video_endpoint(
    video: UploadFile = File(...),
    quality_preset: str = Form("medium") # e.g., "high", "medium", "low"
):
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a video.")

    file_id = str(uuid.uuid4())
    original_filename = video.filename if video.filename else "video"
    # Keep original extension for input temp file, though compression output will be mp4
    input_file_extension = os.path.splitext(original_filename)[1] if original_filename and os.path.splitext(original_filename)[1] else ".tmp"

    input_temp_path = os.path.join(UPLOAD_DIR, f"{file_id}_input{input_file_extension}")
    # Output path base, function adds .mp4 extension
    output_temp_base = os.path.join(PROCESSED_DIR, f"{file_id}_compressed_{quality_preset}")

    try:
        with open(input_temp_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save uploaded video: {str(e)}")
    finally:
        video.file.close()

    compressed_file_path = ""
    try:
        compressed_file_path = compress_video_py(
            input_path=input_temp_path,
            output_path=output_temp_base,
            quality_preset=quality_preset.lower()
        )

        # Output is always MP4 for this compression function
        response_media_type = "video/mp4"
        original_name_no_ext = os.path.splitext(original_filename)[0]
        download_filename = f"{original_name_no_ext}_compressed_{quality_preset}.mp4"

        return FileResponse(
            path=compressed_file_path,
            media_type=response_media_type,
            filename=download_filename
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e: # For issues like invalid preset
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Unhandled error during compression: {str(e)}")
        if compressed_file_path and os.path.exists(compressed_file_path):
             os.remove(compressed_file_path)
        raise HTTPException(status_code=500, detail=f"Error during video compression: {str(e)}")
    finally:
        if os.path.exists(input_temp_path):
            os.remove(input_temp_path)


def crop_video_py(input_path: str, output_path: str, crop_x: int, crop_y: int, crop_width: int, crop_height: int) -> str:
    """Crops a video using ffmpeg-python."""
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    if crop_width <= 0 or crop_height <= 0:
        raise ValueError("Crop width and height must be positive values.")
    if crop_x < 0 or crop_y < 0:
        raise ValueError("Crop X and Y coordinates cannot be negative.")

    # Output will be MP4 by default
    output_path_with_extension = f"{os.path.splitext(output_path)[0]}.mp4"

    try:
        # Probe video to check if crop dimensions are valid against original dimensions
        original_width, original_height = get_video_dimensions(input_path)
        if crop_x + crop_width > original_width or crop_y + crop_height > original_height:
            raise ValueError(
                f"Crop dimensions ({crop_width}x{crop_height} at {crop_x},{crop_y}) "
                f"exceed original video dimensions ({original_width}x{original_height})."
            )

        stream = ffmpeg.input(input_path)
        # Use same preset and crf as compression for now, can be parameterized
        stream = ffmpeg.output(
            stream,
            output_path_with_extension,
            vf=f'crop={crop_width}:{crop_height}:{crop_x}:{crop_y}',
            vcodec='libx264',
            crf=23, # Medium quality
            preset='medium'
        )
        ffmpeg.run(stream, overwrite_output=True, quiet=True)

        if not os.path.exists(output_path_with_extension) or os.path.getsize(output_path_with_extension) == 0:
            raise Exception("Output file not created or is empty after ffmpeg cropping.")
        return output_path_with_extension
    except ffmpeg.Error as e:
        error_message = e.stderr.decode('utf8') if e.stderr else "Unknown ffmpeg error during cropping"
        print(f"ffmpeg.Error during cropping: {error_message}")
        if os.path.exists(output_path_with_extension) and os.path.getsize(output_path_with_extension) == 0:
            os.remove(output_path_with_extension)
        raise Exception(f"FFmpeg error during cropping: {error_message}")
    except Exception as e:
        print(f"Error during video cropping: {str(e)}")
        if os.path.exists(output_path_with_extension):
            os.remove(output_path_with_extension)
        raise Exception(f"General error during video cropping: {str(e)}")

@app.post("/crop-video/")
async def crop_video_endpoint(
    video: UploadFile = File(...),
    crop_x: int = Form(...),
    crop_y: int = Form(...),
    crop_width: int = Form(...),
    crop_height: int = Form(...)
):
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a video.")

    file_id = str(uuid.uuid4())
    original_filename = video.filename if video.filename else "video"
    input_file_extension = os.path.splitext(original_filename)[1] if original_filename and os.path.splitext(original_filename)[1] else ".tmp"

    input_temp_path = os.path.join(UPLOAD_DIR, f"{file_id}_input{input_file_extension}")
    output_temp_base = os.path.join(PROCESSED_DIR, f"{file_id}_cropped")

    try:
        with open(input_temp_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save uploaded video: {str(e)}")
    finally:
        video.file.close()

    cropped_file_path = ""
    try:
        cropped_file_path = crop_video_py(
            input_path=input_temp_path,
            output_path=output_temp_base,
            crop_x=crop_x,
            crop_y=crop_y,
            crop_width=crop_width,
            crop_height=crop_height
        )

        response_media_type = "video/mp4" # Output is MP4
        original_name_no_ext = os.path.splitext(original_filename)[0]
        download_filename = f"{original_name_no_ext}_cropped_{crop_width}x{crop_height}.mp4"

        return FileResponse(
            path=cropped_file_path,
            media_type=response_media_type,
            filename=download_filename
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e: # For issues like invalid crop values
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Unhandled error during cropping: {str(e)}")
        if cropped_file_path and os.path.exists(cropped_file_path):
             os.remove(cropped_file_path)
        raise HTTPException(status_code=500, detail=f"Error during video cropping: {str(e)}")
    finally:
        if os.path.exists(input_temp_path):
            os.remove(input_temp_path)


def trim_video_py(input_path: str, output_path: str, start_time: str, end_time: str) -> str:
    """Trims a video using ffmpeg-python from start_time to end_time."""
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    # Basic validation for time format can be added here if needed, e.g., regex for HH:MM:SS or seconds.
    # FFmpeg is quite flexible with time formats.

    # Output will be MP4 by default
    output_path_with_extension = f"{os.path.splitext(output_path)[0]}.mp4"

    try:
        # Probe video to get duration for more robust validation if desired,
        # e.g., to check if start_time < end_time and end_time <= duration.
        # For now, relying on ffmpeg to handle invalid time inputs.
        # probe = ffmpeg.probe(input_path)
        # duration = float(probe['format']['duration'])

        stream = ffmpeg.input(input_path, ss=start_time) # Input seeking (ss before -i)
        # If end_time is provided, use it with -to option for ffmpeg.output
        # Otherwise, if only start_time is given, it will go to the end of the video.
        # For trimming, typically both start and end are desired.
        # The -to option specifies an absolute end time.
        # Alternatively, -t duration can be used if end_time is duration from start_time.
        stream = ffmpeg.output(
            stream,
            output_path_with_extension,
            to=end_time, # Output seeking (to relative to start of output)
            vcodec='libx264', # Re-encode to ensure consistency
            acodec='aac',     # Re-encode audio
            crf=23,
            preset='medium'
            # Using -c copy (vcodec='copy', acodec='copy') would be faster if no re-encoding is needed,
            # but might be less reliable across formats or if precise cutting on non-keyframes is an issue.
            # Re-encoding provides more robustness here.
        )
        ffmpeg.run(stream, overwrite_output=True, quiet=True)

        if not os.path.exists(output_path_with_extension) or os.path.getsize(output_path_with_extension) == 0:
            raise Exception("Output file not created or is empty after ffmpeg trimming.")
        return output_path_with_extension
    except ffmpeg.Error as e:
        error_message = e.stderr.decode('utf8') if e.stderr else "Unknown ffmpeg error during trimming"
        print(f"ffmpeg.Error during trimming: {error_message}")
        if os.path.exists(output_path_with_extension) and os.path.getsize(output_path_with_extension) == 0:
            os.remove(output_path_with_extension)
        raise Exception(f"FFmpeg error during trimming: {error_message}")
    except Exception as e:
        print(f"Error during video trimming: {str(e)}")
        if os.path.exists(output_path_with_extension):
            os.remove(output_path_with_extension)
        raise Exception(f"General error during video trimming: {str(e)}")

@app.post("/trim-video/")
async def trim_video_endpoint(
    video: UploadFile = File(...),
    start_time: str = Form(...), # Expecting format like "HH:MM:SS" or seconds
    end_time: str = Form(...)    # Expecting format like "HH:MM:SS" or seconds
):
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a video.")

    file_id = str(uuid.uuid4())
    original_filename = video.filename if video.filename else "video"
    input_file_extension = os.path.splitext(original_filename)[1] if original_filename and os.path.splitext(original_filename)[1] else ".tmp"

    input_temp_path = os.path.join(UPLOAD_DIR, f"{file_id}_input{input_file_extension}")
    output_temp_base = os.path.join(PROCESSED_DIR, f"{file_id}_trimmed")

    try:
        with open(input_temp_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save uploaded video: {str(e)}")
    finally:
        video.file.close()

    trimmed_file_path = ""
    try:
        trimmed_file_path = trim_video_py(
            input_path=input_temp_path,
            output_path=output_temp_base,
            start_time=start_time,
            end_time=end_time
        )

        response_media_type = "video/mp4" # Output is MP4
        original_name_no_ext = os.path.splitext(original_filename)[0]
        download_filename = f"{original_name_no_ext}_trimmed_{start_time.replace(':', '-')}_to_{end_time.replace(':', '-')}.mp4"

        return FileResponse(
            path=trimmed_file_path,
            media_type=response_media_type,
            filename=download_filename
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e: # For issues like invalid time values (if we add validation)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Unhandled error during trimming: {str(e)}")
        if trimmed_file_path and os.path.exists(trimmed_file_path):
             os.remove(trimmed_file_path)
        raise HTTPException(status_code=500, detail=f"Error during video trimming: {str(e)}")
    finally:
        if os.path.exists(input_temp_path):
            os.remove(input_temp_path)


def extract_frame_py(input_path: str, output_path_base: str, timestamp: str, output_format: str = "jpg") -> str:
    """Extracts a single frame from a video at a given timestamp."""
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    allowed_image_formats = ["jpg", "jpeg", "png"]
    if output_format.lower() not in allowed_image_formats:
        raise ValueError(f"Unsupported image format: {output_format}. Supported: {', '.join(allowed_image_formats)}")

    output_filename = f"{output_path_base}.{output_format.lower()}"

    try:
        (
            ffmpeg
            .input(input_path, ss=timestamp)
            .output(output_filename, vframes=1, format='image2', vcodec=f'mjpeg' if output_format.lower() in ['jpg', 'jpeg'] else 'png')
            .run(overwrite_output=True, quiet=True)
        )

        if not os.path.exists(output_filename) or os.path.getsize(output_filename) == 0:
            raise Exception("Output frame not created or is empty after ffmpeg processing.")
        return output_filename
    except ffmpeg.Error as e:
        error_message = e.stderr.decode('utf8') if e.stderr else "Unknown ffmpeg error during frame extraction"
        print(f"ffmpeg.Error during frame extraction: {error_message}")
        if os.path.exists(output_filename) and os.path.getsize(output_filename) == 0:
            os.remove(output_filename)
        raise Exception(f"FFmpeg error during frame extraction: {error_message}")
    except Exception as e:
        print(f"Error during frame extraction: {str(e)}")
        if os.path.exists(output_filename):
            os.remove(output_filename)
        raise Exception(f"General error during frame extraction: {str(e)}")

@app.post("/extract-frame/")
async def extract_frame_endpoint(
    video: UploadFile = File(...),
    timestamp: str = Form(...), # Expecting format like "HH:MM:SS" or seconds
    image_format: str = Form("jpg") # "jpg" or "png"
):
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a video.")

    file_id = str(uuid.uuid4())
    original_filename = video.filename if video.filename else "video"
    input_file_extension = os.path.splitext(original_filename)[1] if original_filename and os.path.splitext(original_filename)[1] else ".tmp"

    input_temp_path = os.path.join(UPLOAD_DIR, f"{file_id}_input{input_file_extension}")
    # Base name for the output, function will add extension
    output_temp_base = os.path.join(PROCESSED_DIR, f"{file_id}_frame_at_{timestamp.replace(':', '-')}")

    try:
        with open(input_temp_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save uploaded video: {str(e)}")
    finally:
        video.file.close()

    extracted_frame_path = ""
    try:
        extracted_frame_path = extract_frame_py(
            input_path=input_temp_path,
            output_path_base=output_temp_base,
            timestamp=timestamp,
            output_format=image_format
        )

        media_type_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}
        response_media_type = media_type_map.get(image_format.lower(), "application/octet-stream")

        original_name_no_ext = os.path.splitext(original_filename)[0]
        download_filename = f"{original_name_no_ext}_frame_at_{timestamp.replace(':', '-')}.{image_format.lower()}"

        return FileResponse(
            path=extracted_frame_path,
            media_type=response_media_type,
            filename=download_filename
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e: # For issues like invalid timestamp or format
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Unhandled error during frame extraction: {str(e)}")
        if extracted_frame_path and os.path.exists(extracted_frame_path):
             os.remove(extracted_frame_path)
        raise HTTPException(status_code=500, detail=f"Error during frame extraction: {str(e)}")
    finally:
        if os.path.exists(input_temp_path):
            os.remove(input_temp_path)


@app.post("/get-metadata/") # Changed to POST to accept file upload easily
async def get_metadata_endpoint(video: UploadFile = File(...)):
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a video.")

    file_id = str(uuid.uuid4())
    original_filename = video.filename if video.filename else "video"
    input_file_extension = os.path.splitext(original_filename)[1] if original_filename and os.path.splitext(original_filename)[1] else ".tmp"
    input_temp_path = os.path.join(UPLOAD_DIR, f"{file_id}_metadata_input{input_file_extension}")

    try:
        with open(input_temp_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save uploaded video: {str(e)}")
    finally:
        video.file.close()

    try:
        probe = ffmpeg.probe(input_temp_path)
        # Return the whole probe for now, frontend can parse what it needs.
        # Or, select specific fields to return.
        # Example of selecting specific fields:
        # streams_info = []
        # for stream in probe.get('streams', []):
        #     streams_info.append({
        #         'codec_name': stream.get('codec_name'),
        #         'codec_type': stream.get('codec_type'),
        #         'width': stream.get('width'),
        #         'height': stream.get('height'),
        #         'r_frame_rate': stream.get('r_frame_rate'),
        #         'bit_rate': stream.get('bit_rate'),
        #         # Add other stream specific fields as needed
        #     })
        # metadata = {
        #     'format_name': probe.get('format', {}).get('format_name'),
        #     'duration': probe.get('format', {}).get('duration'),
        #     'size': probe.get('format', {}).get('size'),
        #     'bit_rate': probe.get('format', {}).get('bit_rate'),
        #     'tags': probe.get('format', {}).get('tags', {}),
        #     'streams': streams_info
        # }
        return probe # Returning the full probe is simpler for now
    except ffmpeg.Error as e:
        error_message = e.stderr.decode('utf8') if e.stderr else "Unknown ffmpeg error during metadata probing"
        print(f"ffmpeg.Error during metadata probing: {error_message}")
        raise HTTPException(status_code=500, detail=f"Error probing video metadata: {error_message}")
    except Exception as e:
        print(f"Error getting video metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Could not get video metadata: {str(e)}")
    finally:
        if os.path.exists(input_temp_path):
            os.remove(input_temp_path)

import re # For parsing ffmpeg output

# ... (keep existing imports and code) ...

def analyze_video_quality_py(original_path: str, processed_path: str, metric_type: str) -> dict:
    """
    Analyzes video quality between an original and processed video using PSNR or SSIM.
    Returns a dictionary with the metric and its average value.
    """
    if not os.path.exists(original_path) or not os.path.exists(processed_path):
        raise FileNotFoundError("One or both video files not found for quality analysis.")

    metric_type = metric_type.lower()
    if metric_type not in ["psnr", "ssim"]:
        raise ValueError(f"Unsupported metric_type: {metric_type}. Supported: 'psnr', 'ssim'.")

    # Ensure temp_processed directory exists for log files
    os.makedirs(PROCESSED_DIR, exist_ok=True)

    # Using a unique log file name to avoid conflicts if multiple analyses run
    log_file_name = f"{uuid.uuid4()}_{metric_type}_stats.txt"
    stats_log_path = os.path.join(PROCESSED_DIR, log_file_name)

    try:
        # Note: For PSNR/SSIM, videos should ideally have same resolution & pixel format.
        # FFmpeg might rescale automatically, but this can affect results.
        # For simplicity, we are not adding explicit scaling here.

        lavfi_filter_str = f"{metric_type}=stats_file='{stats_log_path}'"

        # Execute FFmpeg command
        # We pipe output to null device and capture stderr, as summary stats are often there.
        process = (
            ffmpeg
            .input(processed_path)
            .input(original_path)
            .filter_complex(lavfi_filter_str)
            .output('-', format='null') # Output to null, metrics go to stderr or stats_file
            .run_async(pipe_stdout=True, pipe_stderr=True) # Use run_async for better control
        )
        _, stderr_bytes = process.communicate() # Get stdout and stderr
        stderr_str = stderr_bytes.decode('utf-8', errors='ignore')

        # Parsing logic (this is often the trickiest part with ffmpeg)
        # PSNR average is usually like: "[Parsed_psnr_0 @ ...] PSNR y:XX.YY u:XX.YY v:XX.YY average:XX.YY ..."
        # SSIM average is usually like: "[Parsed_ssim_0 @ ...] SSIM Y:X.XXXXXX (XX.XXXXdB) U:X.XXXXXX (XX.XXXXdB) V:X.XXXXXX (XX.XXXXdB) All:X.XXXXXX (XX.XXXXdB)"

        average_value = None
        if metric_type == "psnr":
            match = re.search(r"average:([\d\.]+)", stderr_str)
            if match:
                average_value = float(match.group(1))
        elif metric_type == "ssim":
            # For SSIM, we're interested in the 'All' value.
            match = re.search(r"All:([\d\.]+)", stderr_str) # Matches the direct SSIM value (0-1)
            if match:
                average_value = float(match.group(1))

        if average_value is None:
            # Fallback: try to read from stats_file if stderr parsing fails or for more detailed info
            # This part might need more refinement based on exact log file format for each metric
            if os.path.exists(stats_log_path):
                with open(stats_log_path, 'r') as f_log:
                    log_content = f_log.read()
                if metric_type == "psnr":
                    # Example PSNR log line: "n:1 mse_avg:12.23 mse_y:10.1 mse_u:15.3 mse_v:15.3 psnr_avg:28.8 psnr_y:29.5 psnr_u:27.3 psnr_v:27.3"
                    # Search for psnr_avg
                    match_log = re.search(r"psnr_avg:([\d\.]+)", log_content)
                    if match_log:
                        average_value = float(match_log.group(1))
                elif metric_type == "ssim":
                     # Example SSIM log line: "1 MSEL:1.23 MSES:1.34 SSIML:0.98 SSIMS:0.97" (format varies)
                     # More commonly, the summary is in stderr for SSIM.
                     # If parsing from file, need to know exact format. FFmpeg's ssim filter log format:
                     # "n:1 Y:0.99 U:0.98 V:0.98 All:0.987 (18.8dB)"
                    match_log = re.search(r"All:([\d\.]+)", log_content)
                    if match_log:
                        average_value = float(match_log.group(1))

        if average_value is None:
            print(f"Could not parse {metric_type.upper()} value from ffmpeg output. Stderr was:\n{stderr_str}")
            if os.path.exists(stats_log_path): print(f"Log file content ({stats_log_path}):\n{log_content if 'log_content' in locals() else 'Could not read'}")
            raise ValueError(f"Could not parse {metric_type.upper()} value from ffmpeg output.")

        return {"metric": metric_type, "average_value": average_value}

    except ffmpeg.Error as e:
        error_message = e.stderr.decode('utf8') if e.stderr else f"Unknown ffmpeg error during {metric_type} analysis"
        print(f"ffmpeg.Error during {metric_type} analysis: {error_message}")
        raise Exception(f"FFmpeg error during {metric_type} analysis: {error_message}")
    except Exception as e:
        print(f"Error during video quality analysis ({metric_type}): {str(e)}")
        raise Exception(f"General error during {metric_type} analysis: {str(e)}")
    finally:
        if os.path.exists(stats_log_path):
            os.remove(stats_log_path) # Clean up the log file


@app.post("/analyze-quality/")
async def analyze_quality_endpoint(
    original_video: UploadFile = File(...),
    processed_video: UploadFile = File(...),
    metric_type: str = Form(...) # "psnr" or "ssim"
):
    if not original_video.content_type or not original_video.content_type.startswith("video/") or \
       not processed_video.content_type or not processed_video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Both files must be videos.")

    # Save original video
    original_file_id = str(uuid.uuid4())
    original_ext = os.path.splitext(original_video.filename if original_video.filename else ".tmp")[1]
    original_temp_path = os.path.join(UPLOAD_DIR, f"{original_file_id}_original{original_ext}")
    try:
        with open(original_temp_path, "wb") as buffer:
            shutil.copyfileobj(original_video.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save original video: {e}")
    finally:
        original_video.file.close()

    # Save processed video
    processed_file_id = str(uuid.uuid4())
    processed_ext = os.path.splitext(processed_video.filename if processed_video.filename else ".tmp")[1]
    processed_temp_path = os.path.join(UPLOAD_DIR, f"{processed_file_id}_processed{processed_ext}")
    try:
        with open(processed_temp_path, "wb") as buffer:
            shutil.copyfileobj(processed_video.file, buffer)
    except Exception as e:
        # Clean up original if processed fails to save
        if os.path.exists(original_temp_path): os.remove(original_temp_path)
        raise HTTPException(status_code=500, detail=f"Could not save processed video: {e}")
    finally:
        processed_video.file.close()

    try:
        result = analyze_video_quality_py(
            original_path=original_temp_path,
            processed_path=processed_temp_path,
            metric_type=metric_type
        )
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e: # For invalid metric_type or parsing issues
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e: # General ffmpeg or other errors
        print(f"Unhandled error during quality analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error during quality analysis: {str(e)}")
    finally:
        # Cleanup
        if os.path.exists(original_temp_path):
            os.remove(original_temp_path)
        if os.path.exists(processed_temp_path):
            os.remove(processed_temp_path)

import subprocess # For running external processes like Real-ESRGAN
from pathlib import Path # For easier path manipulation
import re # For parsing ffmpeg output
import cv2 # OpenCV for object detection
from typing import List, Dict, Any # Ensure List is imported

# Pydantic model for receiving metadata tags, though we'll use Form with JSON string for simplicity with file uploads.
# class MetadataEditRequest(BaseModel):
#     tags: Dict[str, Any]

def edit_metadata_py(input_path: str, output_path: str, metadata_tags: Dict[str, Any]) -> str:
    """Edits metadata tags of a video using ffmpeg-python and copies codecs."""
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    # Ensure output has the same extension as input, or default to .mp4 if unknown
    _, input_ext = os.path.splitext(input_path)
    if not input_ext: # Should have an extension from original upload
        input_ext = ".mp4"

    output_path_with_extension = f"{os.path.splitext(output_path)[0]}{input_ext}"

    # Filter out any None values from tags, as ffmpeg might not like them
    clean_metadata_tags = {k: str(v) for k, v in metadata_tags.items() if v is not None and v != ''} # Ensure values are strings

    try:
        stream = ffmpeg.input(input_path)

        output_options = {
            'map_metadata': '0', # Preserve existing metadata from input stream 0
            'map': '0',          # Map all streams from input 0
            'codec': 'copy',     # Copy all codecs
            'metadata': clean_metadata_tags # Apply new/updated global metadata tags
        }

        # Add movflags if it's an mp4 or mov, as it helps with global tags like title, artist.
        # This flag helps ensure that global tags are written in a way that's broadly compatible.
        if input_ext.lower() in ['.mp4', '.mov', '.m4a', '.m4v', '.qt']:
            output_options['movflags'] = 'use_metadata_tags'

        # Clear specific tags if they are empty in the input, otherwise ffmpeg might not remove them.
        # This is more complex; for now, we rely on overwriting.
        # Example: if metadata_tags['title'] == '', ffmpeg might not clear the title.
        # To explicitly clear, one would use `-metadata title=`.
        # The `metadata` kwarg in ffmpeg-python should handle overwriting. If a key is present with a value, it's set.
        # If a key from clean_metadata_tags has an empty string, ffmpeg should set it to empty.

        stream = ffmpeg.output(stream, output_path_with_extension, **output_options)
        ffmpeg.run(stream, overwrite_output=True, quiet=True)

        if not os.path.exists(output_path_with_extension) or os.path.getsize(output_path_with_extension) == 0:
            raise Exception("Output file not created or is empty after metadata edit.")
        return output_path_with_extension
    except ffmpeg.Error as e:
        error_message = e.stderr.decode('utf8') if e.stderr else "Unknown ffmpeg error during metadata editing"
        print(f"ffmpeg.Error during metadata editing: {error_message}")
        if os.path.exists(output_path_with_extension) and os.path.getsize(output_path_with_extension) == 0:
            os.remove(output_path_with_extension)
        raise Exception(f"FFmpeg error during metadata editing: {error_message}")
    except Exception as e:
        print(f"Error during video metadata editing: {str(e)}")
        if os.path.exists(output_path_with_extension):
            os.remove(output_path_with_extension)
        raise Exception(f"General error during video metadata editing: {str(e)}")

@app.post("/edit-metadata/")
async def edit_metadata_endpoint(
    video: UploadFile = File(...),
    tags_json: str = Form(...) # JSON string of tags: '{"title": "New Title", "artist": "Me"}'
):
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a video.")

    import json
    try:
        metadata_to_edit = json.loads(tags_json)
        if not isinstance(metadata_to_edit, dict):
            raise ValueError("Tags must be a JSON object.")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for tags.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


    file_id = str(uuid.uuid4())
    original_filename = video.filename if video.filename else "video"
    input_file_extension = os.path.splitext(original_filename)[1] if original_filename and os.path.splitext(original_filename)[1] else ".mp4"

    input_temp_path = os.path.join(UPLOAD_DIR, f"{file_id}_metaedit_input{input_file_extension}")
    output_temp_base = os.path.join(PROCESSED_DIR, f"{file_id}_metaedit_output") # Extension added by function

    try:
        with open(input_temp_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save uploaded video: {str(e)}")
    finally:
        video.file.close()

    edited_file_path = ""
    try:
        edited_file_path = edit_metadata_py(
            input_path=input_temp_path,
            output_path=output_temp_base,
            metadata_tags=metadata_to_edit
        )

        # Determine media type from the edited file's extension for safety
        _, output_ext = os.path.splitext(edited_file_path)
        media_type = f"video/{output_ext.lstrip('.')}" if output_ext else "application/octet-stream"
        if output_ext.lower() == ".mkv": media_type = "video/x-matroska" # common special case

        download_filename = f"{os.path.splitext(original_filename)[0]}_metadata_edited{output_ext}"

        return FileResponse(
            path=edited_file_path,
            media_type=media_type,
            filename=download_filename
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Unhandled error during metadata editing: {str(e)}")
        if edited_file_path and os.path.exists(edited_file_path):
             os.remove(edited_file_path)
        raise HTTPException(status_code=500, detail=f"Error during video metadata editing: {str(e)}")
    finally:
        if os.path.exists(input_temp_path):
            os.remove(input_temp_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
