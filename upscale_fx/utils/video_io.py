import cv2

def load_video(video_path: str):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open video file '{video_path}'")
        return None
    return cap

def get_video_properties(cap):
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    fourcc_int = int(cap.get(cv2.CAP_PROP_FOURCC))
    fourcc_chars = []
    for i in range(4):
        char_val = (fourcc_int >> 8 * i) & 0xFF
        if char_val == 0:
            break
        fourcc_chars.append(chr(char_val))
    fourcc = "".join(fourcc_chars).strip()
    return width, height, fps, fourcc

def create_video_writer(output_path: str, width: int, height: int, fps: float, input_fourcc_str: str):
    output_path_lower = output_path.lower()

    if width == 0 or height == 0:
        print(f"Error: Invalid dimensions ({width}x{height}) for video writer. Cannot create writer.")
        return None
    if fps <= 0:
        print(f"Error: Invalid FPS ({fps}) for video writer. Setting to 25.0 FPS.")
        fps = 25.0

    if output_path_lower.endswith('.mp4'):
        codec_to_use_str = 'mp4v'
    elif output_path_lower.endswith('.avi'):
        codec_to_use_str = 'XVID'
    else:
        print(f"Warning: Output file '{output_path}' has an unrecognized extension. Defaulting to 'mp4v' (MP4) codec.")
        codec_to_use_str = 'mp4v'
        if not output_path_lower.endswith('.mp4'):
            print(f"Consider using an .mp4 extension with the '{codec_to_use_str}' codec for best compatibility.")

    fourcc_to_use = cv2.VideoWriter_fourcc(*codec_to_use_str)
    out = cv2.VideoWriter(output_path, fourcc_to_use, fps, (width, height))

    if not out.isOpened():
        print(f"Error: Could not open video writer for '{output_path}' with codec '{codec_to_use_str}'.")
        print(f"Attempted Params: Codec={codec_to_use_str}, FPS={fps}, Dimensions={width}x{height}")
        if codec_to_use_str == 'mp4v':
            print("Trying fallback codec 'XVID' for the .mp4 container...")
            fallback_codec_str = 'XVID'
            fourcc_to_use = cv2.VideoWriter_fourcc(*fallback_codec_str)
            out = cv2.VideoWriter(output_path, fourcc_to_use, fps, (width, height))
            if out.isOpened():
                print(f"Successfully opened with fallback codec '{fallback_codec_str}'.")
            else:
                print(f"Error: Fallback codec '{fallback_codec_str}' also failed for '{output_path}'.")
                return None
        else:
            return None
    return out

def write_frame(out, frame):
    if frame is None:
        print("Debug: write_frame called with a None frame. This should not happen.")
        return
    if out is not None and out.isOpened():
        out.write(frame)
    else:
        print("Debug: write_frame called, but VideoWriter is not available or not open.")

def release_video_resources(cap, out=None):
    if cap and cap.isOpened():
        cap.release()
    if out and out.isOpened():
        out.release()
