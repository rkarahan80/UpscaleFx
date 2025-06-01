import tensorflow as tf
import os
import cv2
import numpy as np

def local_load_video(video_path: str):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"DP Error: Could not open video file {video_path}")
        return None
    return cap

def lr_hr_pairs_from_video(video_path, scale_factor, frame_limit=None, dataset_name="unknown"):
    cap = local_load_video(video_path)
    if not cap:
        print(f"DP Warning: Skipping video {video_path} for {dataset_name} dataset (cannot open).")
        return

    frames_processed = 0
    while True:
        ret, hr_frame = cap.read()
        if not ret: break
        if frame_limit is not None and frames_processed >= frame_limit: break

        hr_frame = hr_frame.astype(np.float32) / 255.0
        hr_h, hr_w = hr_frame.shape[:2]
        lr_h, lr_w = hr_h // scale_factor, hr_w // scale_factor

        if lr_h == 0 or lr_w == 0: continue

        lr_frame = cv2.resize(hr_frame, (lr_w, lr_h), interpolation=cv2.INTER_AREA)
        lr_frame = lr_frame.astype(np.float32) # Ensure type

        # Ensure 3 channels if model expects RGB
        for i_frame, frame_arr in enumerate([lr_frame, hr_frame]):
            if frame_arr.ndim == 2: # Grayscale
                frame_arr = np.expand_dims(frame_arr, axis=-1)
            if frame_arr.shape[-1] == 1: # Grayscale with channel dim
                frame_arr = cv2.cvtColor(frame_arr, cv2.COLOR_GRAY2RGB)
            elif frame_arr.shape[-1] != 3: # Unexpected channel count
                print(f"DP Warning: Frame {frames_processed} in {video_path} ({('LR' if i_frame==0 else 'HR')}) has {frame_arr.shape[-1]} channels. Skipping.")
                hr_frame = None # Mark to skip this pair
                break
            if i_frame == 0: lr_frame = frame_arr
            else: hr_frame = frame_arr

        if hr_frame is None: continue # Skip if channel issue

        yield lr_frame, hr_frame
        frames_processed += 1
    if hasattr(cap, 'release'): cap.release()

def create_dataset_from_videos(video_files_dir, scale_factor, batch_size,
                               frame_limit_per_video=100, target_size_hr=None,
                               is_validation_set=False, dataset_name="dataset"):
    def generator():
        if not video_files_dir or not os.path.isdir(video_files_dir):
            print(f"DP Error: {dataset_name} video directory '{video_files_dir}' not found.")
            return
        video_files = [os.path.join(video_files_dir, f) for f in os.listdir(video_files_dir) if f.lower().endswith(('.mp4', '.avi', '.mov', '.mkv'))]
        if not video_files:
            print(f"DP Warning: No video files found in {dataset_name} directory: {video_files_dir}")
            return

        # print(f"DP Info: Creating {dataset_name} dataset from: {video_files_dir}")
        for video_file in video_files:
            for lr_img, hr_img in lr_hr_pairs_from_video(video_file, scale_factor, frame_limit_per_video, dataset_name=dataset_name):
                if target_size_hr: # (height, width) for HR
                    hr_h, hr_w = target_size_hr
                    lr_h, lr_w = hr_h // scale_factor, hr_w // scale_factor
                    lr_img = cv2.resize(lr_img, (lr_w, lr_h), interpolation=cv2.INTER_AREA)
                    hr_img = cv2.resize(hr_img, (hr_w, hr_h), interpolation=cv2.INTER_AREA)
                yield lr_img, hr_img

    hr_h_spec, hr_w_spec = (target_size_hr[0], target_size_hr[1]) if target_size_hr else (None, None)
    lr_h_spec, lr_w_spec = (hr_h_spec // scale_factor, hr_w_spec // scale_factor) if target_size_hr else (None, None)

    output_signature = (
        tf.TensorSpec(shape=(lr_h_spec, lr_w_spec, 3), dtype=tf.float32),
        tf.TensorSpec(shape=(hr_h_spec, hr_w_spec, 3), dtype=tf.float32)
    )

    dataset = tf.data.Dataset.from_generator(generator, output_signature=output_signature)

    # Ensure buffer_size > 0 for shuffle. Min value 1.
    buffer_shuffle_size = max(1, batch_size * 3 if batch_size else 10) # Heuristic for buffer size
    if not is_validation_set:
        dataset = dataset.shuffle(buffer_size=buffer_shuffle_size)

    dataset = dataset.batch(batch_size if batch_size > 0 else 1) # Ensure batch_size > 0
    dataset = dataset.prefetch(buffer_size=tf.data.AUTOTUNE)
    return dataset
