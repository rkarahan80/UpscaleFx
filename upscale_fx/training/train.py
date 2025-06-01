import tensorflow as tf
import os
import argparse
import datetime
import numpy as np
import cv2

from upscale_fx.models import sr_model
from upscale_fx.training import data_pipeline

def psnr_metric(y_true, y_pred):
    return tf.image.psnr(y_true, y_pred, max_val=1.0)

def ssim_metric(y_true, y_pred):
    return tf.image.ssim(y_true, y_pred, max_val=1.0)

def _ensure_dummy_video_exists(video_dir_path, num_frames, frame_dims):
    if not os.path.isdir(video_dir_path):
        print(f"Train Info: Creating directory for dummy videos: {video_dir_path}")
        os.makedirs(video_dir_path, exist_ok=True)

    dummy_video_file = os.path.join(video_dir_path, "dummy_video_auto.mp4")
    if not os.path.exists(dummy_video_file):
        print(f"Train Info: Creating dummy video {dummy_video_file} ({num_frames} frames, {frame_dims[1]}x{frame_dims[0]})")
        hr_h, hr_w = frame_dims
        out_dummy = cv2.VideoWriter(dummy_video_file, cv2.VideoWriter_fourcc(*'mp4v'), 10, (hr_w, hr_h))
        if out_dummy.isOpened():
            for _ in range(num_frames):
                out_dummy.write(np.random.randint(0, 255, (hr_h, hr_w, 3), dtype=np.uint8))
            out_dummy.release()
        else:
            print(f"Train Error: Failed to create dummy video {dummy_video_file}.")
            return False
    return True

def train_model(config):
    print(f"Train Info: Config: {config}")
    hr_frame_dims = (config.target_height_hr, config.target_width_hr) if config.target_height_hr and config.target_width_hr else (64,64) # Default if not set

    if not os.path.isdir(config.video_dir) or not os.listdir(config.video_dir):
        print(f"Train Warning: Training video dir '{config.video_dir}' not found or empty. Creating/using dummy data.")
        if not _ensure_dummy_video_exists(config.video_dir, max(10, config.batch_size * 2), hr_frame_dims): return

    if config.val_video_dir and (not os.path.isdir(config.val_video_dir) or not os.listdir(config.val_video_dir)):
        print(f"Train Warning: Validation video dir '{config.val_video_dir}' not found or empty. Creating/using dummy data.")
        if not _ensure_dummy_video_exists(config.val_video_dir, max(5, config.batch_size), hr_frame_dims): config.val_video_dir = None # Disable val if dummy fails

    target_size_hr_tuple = (config.target_height_hr, config.target_width_hr) if config.target_height_hr and config.target_width_hr else None

    train_dataset = data_pipeline.create_dataset_from_videos(
        config.video_dir, scale_factor=config.scale_factor, batch_size=config.batch_size,
        frame_limit_per_video=config.frame_limit, target_size_hr=target_size_hr_tuple, dataset_name="training"
    )
    if not train_dataset: print("Train Error: Train dataset creation failed."); return

    val_dataset = None
    if config.val_video_dir:
        val_dataset = data_pipeline.create_dataset_from_videos(
            config.val_video_dir, scale_factor=config.scale_factor, batch_size=config.batch_size,
            frame_limit_per_video=config.val_frame_limit, target_size_hr=target_size_hr_tuple,
            is_validation_set=True, dataset_name="validation"
        )
        if not val_dataset: print("Train Warning: Validation dataset creation failed. Proceeding without validation.")

    # Simple dataset emptiness check
    if not any(True for _ in train_dataset.take(1)): print("Train Error: Training dataset is empty."); return
    if val_dataset and not any(True for _ in val_dataset.take(1)): print("Train Warning: Validation dataset is empty."); val_dataset = None

    lr_input_shape = (None, None, 3)
    if target_size_hr_tuple:
        lr_h = target_size_hr_tuple[0] // config.scale_factor
        lr_w = target_size_hr_tuple[1] // config.scale_factor
        lr_input_shape = (lr_h, lr_w, 3)

    model = sr_model.get_basic_sr_model(scale_factor=config.scale_factor, input_shape=lr_input_shape)
    model.summary(line_length=100)

    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=config.learning_rate),
                  loss='mean_squared_error', metrics=[psnr_metric, ssim_metric])

    callbacks = []
    if config.checkpoint_dir:
        os.makedirs(config.checkpoint_dir, exist_ok=True)
        callbacks.append(tf.keras.callbacks.ModelCheckpoint(
            filepath=os.path.join(config.checkpoint_dir, "sr_ckpt_epoch_{epoch:02d}.keras"),
            save_best_only=config.save_best_only, monitor='val_loss' if val_dataset else 'loss'))
    if config.log_dir:
        os.makedirs(config.log_dir, exist_ok=True)
        callbacks.append(tf.keras.callbacks.TensorBoard(
            log_dir=os.path.join(config.log_dir, datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))))

    print(f"Train Info: Starting training: {config.epochs} epochs, batch_size={config.batch_size}...")
    try:
        model.fit(train_dataset, epochs=config.epochs, callbacks=callbacks, validation_data=val_dataset)
        print("Train Info: Training finished.")
        if config.save_model_path:
            os.makedirs(os.path.dirname(config.save_model_path), exist_ok=True)
            model.save(config.save_model_path)
            print(f"Train Info: Final model saved to {config.save_model_path}")
    except Exception as e: print(f"Train Error during model.fit: {e}\n{traceback.format_exc()}")

if __name__ == '__main__':
    import traceback # For train_model error printing
    parser = argparse.ArgumentParser(description="Train SR Model with metrics and validation.")
    parser.add_argument('--video_dir', type=str, required=True)
    parser.add_argument('--val_video_dir', type=str)
    parser.add_argument('--scale_factor', type=int, default=2)
    parser.add_argument('--batch_size', type=int, default=1)
    parser.add_argument('--epochs', type=int, default=1)
    parser.add_argument('--learning_rate', type=float, default=1e-4)
    parser.add_argument('--frame_limit', type=int, default=4) # Minimal frames for test
    parser.add_argument('--val_frame_limit', type=int, default=2) # Minimal frames for test
    parser.add_argument('--target_height_hr', type=int, default=32) # Minimal size for test
    parser.add_argument('--target_width_hr', type=int, default=32)  # Minimal size for test
    parser.add_argument('--checkpoint_dir', type=str, default='./tf_ckpts_eval')
    parser.add_argument('--log_dir', type=str, default='./tf_logs_eval')
    parser.add_argument('--save_model_path', type=str, default='./tf_models_eval/final_sr.keras')
    parser.add_argument('--save_best_only', type=bool, default=False)
    args = parser.parse_args()
    train_model(args)
