import cv2
import numpy as np
# TensorFlow will be imported conditionally later

INTERPOLATION_METHODS = {
    'nearest': cv2.INTER_NEAREST,
    'linear': cv2.INTER_LINEAR,
    'cubic': cv2.INTER_CUBIC,
    'area': cv2.INTER_AREA,
    'lanczos4': cv2.INTER_LANCZOS4
}

loaded_sr_model = None
loaded_model_scale_factor = None

def load_tf_model(model_path):
    global loaded_sr_model, loaded_model_scale_factor
    if loaded_sr_model is not None: # Check if this specific model_path has been loaded
        # This simple check assumes one global model. If multiple models, need more complex cache
        # For now, if any model is loaded, assume it's the one we want if path matches last load (not explicitly checked here)
        # A better check would be: if loaded_sr_model and loaded_sr_model.path_attribute == model_path: return
        return loaded_sr_model

    try:
        import tensorflow as tf
        print(f"VP Info: Loading TensorFlow model from: {model_path}")
        loaded_sr_model = tf.keras.models.load_model(model_path, compile=False)
        # loaded_sr_model.path_attribute = model_path # Store path if models can change
        loaded_sr_model.summary(line_length=100)

        try:
            if len(loaded_sr_model.input_shape) == 4 and len(loaded_sr_model.output_shape) == 4:
                input_h = loaded_sr_model.input_shape[1]
                output_h = loaded_sr_model.output_shape[1]
                if input_h is not None and output_h is not None and input_h > 0 and output_h > input_h:
                    inferred_scale = output_h // input_h
                    if inferred_scale > 1 and (output_h % input_h == 0):
                        loaded_model_scale_factor = inferred_scale
                        print(f"VP Info: Inferred scale factor from model H_out/H_in: {loaded_model_scale_factor}x")
                    else:
                        print(f"VP Warning: Could not reliably infer scale factor from H_out({output_h})/H_in({input_h}).")
                else:
                    print("VP Info: Model has dynamic height (None) or input height not smaller than output. Cannot infer scale factor this way.")
            else:
                print("VP Info: Model input/output shape not as expected (batch, H, W, C). Cannot infer scale factor.")
        except Exception as e:
            print(f"VP Warning: Exception while trying to infer model's scale factor: {e}")

        print("VP Info: TensorFlow model loaded successfully.")
        return loaded_sr_model
    except ImportError:
        print("VP Error: TensorFlow could not be imported. Install it to use TF models.")
        loaded_sr_model = None # Ensure it's None if import fails
        return None
    except Exception as e:
        print(f"VP Error: Failed to load TensorFlow model from {model_path}: {e}")
        import traceback; traceback.print_exc()
        loaded_sr_model = None # Ensure it's None if load fails
        return None

def upscale_frame_tf(frame: np.ndarray, model, user_requested_scale_factor: int):
    global loaded_model_scale_factor
    if frame is None: print("VP Error: Input frame is None for TF upscaling."); return None

    original_dtype = frame.dtype
    current_frame_max = frame.max()
    if original_dtype != np.float32 or current_frame_max > 1.1 : # Check if normalization is likely needed
        frame = frame.astype(np.float32) / (current_frame_max if current_frame_max > 1.0 and original_dtype != np.uint8 else 255.0)

    if loaded_model_scale_factor and loaded_model_scale_factor != user_requested_scale_factor:
        print(f"VP Warning: Model's inferred scale is {loaded_model_scale_factor}x, user requested {user_requested_scale_factor}x. Model will use its native scale.")

    lr_frame_batch = np.expand_dims(frame, axis=0)
    try:
        sr_frame_batch = model.predict(lr_frame_batch, verbose=0) # verbose=0 to reduce console spam
        sr_frame = np.clip(sr_frame_batch[0], 0.0, 1.0)
        # Denormalize back to original range if it was uint8, or keep as float if original was float (less common for video frames)
        # For now, always denormalize to uint8 for video writing consistency
        return (sr_frame * 255.0).astype(np.uint8)
    except Exception as e:
        print(f"VP Error: TensorFlow model inference failed: {e}")
        import traceback; traceback.print_exc()
        return None

def upscale_frame(frame: np.ndarray, scale_factor: float, interpolation_method: str = 'cubic', model_path: str = None):
    global loaded_sr_model # Use the global model variable

    current_model_to_use = None
    if model_path:
        if loaded_sr_model is None: # Or some logic to check if the loaded_sr_model.path matches model_path
            current_model_to_use = load_tf_model(model_path)
        else:
            current_model_to_use = loaded_sr_model # Assume already loaded model is the correct one if path matches (not explicitly checked here)

    if current_model_to_use and model_path: # Check model_path again, as loading might have failed
        return upscale_frame_tf(frame, current_model_to_use, int(scale_factor))
    else:
        if frame is None: print("VP Error: Input frame is None for OpenCV upscaling."); return None
        if not (isinstance(scale_factor, (int, float)) and scale_factor > 0):
            print(f"VP Warning: Invalid scale_factor '{scale_factor}' for OpenCV. Returning original frame."); return frame

        h, w = frame.shape[:2]
        if w == 0 or h == 0: print(f"VP Error: Input frame has zero dimension ({w}x{h}) for OpenCV. Returning frame."); return frame

        nw, nh = int(w * scale_factor), int(h * scale_factor)
        if nw <= 0 or nh <= 0: print(f"VP Error: Calculated new dimensions for OpenCV are non-positive ({nw}x{nh}). Returning frame."); return frame

        cv_inter_flag = INTERPOLATION_METHODS.get(interpolation_method.lower(), cv2.INTER_CUBIC)
        try:
            return cv2.resize(frame, (nw, nh), interpolation=cv_inter_flag)
        except Exception as e:
            print(f"VP Error: OpenCV resize failed: {e}. Returning frame."); return frame
