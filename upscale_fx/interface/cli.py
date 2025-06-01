from upscale_fx.core import video_processor
from upscale_fx.utils import video_io, gemini_api # Added gemini_api
import cv2, numpy as np # For frame sampling

def handle_upscale_request(args):
    print(f"CLI Info: Args: In='{args.input}', Out='{args.output}', Scale={args.scale_factor}, Summarize='{args.summarize_video}'")

    if args.summarize_video:
        if not args.gemini_api_key:
            print("CLI Error: Gemini API key missing for summarization.")
        elif not gemini_api.configure_gemini(args.gemini_api_key):
            print("CLI Error: Gemini API config failed. Skipping summarization.")
        else:
            print(f"CLI Info: Summarizing video: {args.input}")
            s_cap = video_io.load_video(args.input)
            s_frames_cv2 = []
            if s_cap:
                total_f = int(s_cap.get(cv2.CAP_PROP_FRAME_COUNT))
                n_sample = min(args.gemini_frames_to_sample, total_f if total_f > 0 else args.gemini_frames_to_sample, 15)
                if n_sample <= 0: n_sample = 1

                indices = np.linspace(0, total_f -1, n_sample, dtype=int) if total_f > 0 else [0]*n_sample
                for idx in indices:
                    if total_f > 0: s_cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
                    ret_s, frame_s = s_cap.read()
                    if ret_s: s_frames_cv2.append(frame_s)
                    if len(s_frames_cv2) >= n_sample: break
                video_io.release_video_resources(s_cap)

                if s_frames_cv2:
                    s_frames_pil = gemini_api.convert_cv2_frames_to_pil(s_frames_cv2)
                    if s_frames_pil:
                        summary = gemini_api.generate_video_summary(s_frames_pil, args.gemini_prompt)
                        print(f"\n--- Gemini Video Summary ---\n{summary or 'No summary text.'}\n---------------------------\n")
                    else: print("CLI Warn: Frame conversion for Gemini failed.")
                else: print("CLI Warn: No frames sampled for Gemini.")
            else: print(f"CLI Warn: Could not open {args.input} for summary.")

    if not args.output or (args.output == "dummy_output_for_summary_only.mp4" and not args.model_path and args.interpolation == 'cubic' and args.scale_factor == 2.0) :
        if args.summarize_video and args.output == "dummy_output_for_summary_only.mp4":
             print("CLI Info: Summarization complete. Upscaling skipped as output path was a dummy and other params seem default.")
             return

    print(f"CLI Info: Proceeding with upscaling for {args.input} to {args.output}...")
    if args.scale_factor <= 0: print("CLI Error: Scale factor must be positive for upscaling."); return

    cap = video_io.load_video(args.input)
    if not cap: print(f"CLI Error: Failed to load video '{args.input}' for upscaling."); return

    w, h, fps, fourcc = video_io.get_video_properties(cap)
    fps = fps if (fps > 0 and fps <= 240) else 25.0
    target_w, target_h = int(w * args.scale_factor), int(h * args.scale_factor)

    if target_w <= 0 or target_h <= 0:
        print(f"CLI Error: Invalid target dimensions {target_w}x{target_h} for upscaling."); video_io.release_video_resources(cap); return

    print(f"CLI Info: Upscaling Input {w}x{h}@{fps:.2f}fps to Target Output: {target_w}x{target_h}@{fps:.2f}fps.")

    if args.model_path:
        if video_processor.load_tf_model(args.model_path) is None:
            print(f"CLI Error: Failed to load TF model '{args.model_path}'. Upscaling cannot proceed with this model.");
            video_io.release_video_resources(cap); return

    out = video_io.create_video_writer(args.output, target_w, target_h, fps, fourcc)
    if not out: video_io.release_video_resources(cap); return

    method = "TensorFlow" if args.model_path and video_processor.loaded_sr_model else f"OpenCV ({args.interpolation})"
    print(f"CLI Info: Upscaling with {method}...")

    fc = 0; pc = 0
    while True:
        ret, frame = cap.read();
        if not ret: break
        fc += 1

        up_frame = video_processor.upscale_frame(frame, args.scale_factor, args.interpolation, args.model_path)
        if up_frame is None: print(f"CLI Warn: Frame {fc} failed to upscale. Skipping."); continue

        if up_frame.shape[1] != target_w or up_frame.shape[0] != target_h:
            up_frame = cv2.resize(up_frame, (target_w, target_h), interpolation=cv2.INTER_AREA)

        video_io.write_frame(out, up_frame); pc += 1
        if pc > 0 and pc % 50 == 0: print(f"Upscaled {pc} frames...")

    print(f"CLI Info: Upscaling finished. Frames Read: {fc}, Frames Written: {pc}.")
    video_io.release_video_resources(cap, out)
    if pc > 0: print(f"Upscaled video saved to: {args.output}")
    else: print(f"No frames written to {args.output} during upscaling.")
