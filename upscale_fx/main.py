import argparse, sys, os
from upscale_fx.interface import cli
from upscale_fx.core.video_processor import INTERPOLATION_METHODS

def main():
    parser = argparse.ArgumentParser(description="UpscaleFx", formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument('--input', type=str, required=True)
    parser.add_argument('--output', type=str, help="Output video path. Required unless only summarizing and upscaling is disabled elsewhere.")
    parser.add_argument('--scale_factor', type=float, default=2.0)
    parser.add_argument('--interpolation', type=str, default='cubic', help='OpenCV method: ' + ', '.join(INTERPOLATION_METHODS.keys()))
    parser.add_argument('--model_path', type=str, help='Keras model path.')

    parser.add_argument('--summarize_video', action='store_true', help='Generate video summary via Gemini.')
    parser.add_argument('--gemini_api_key', type=str, default=os.environ.get("GEMINI_API_KEY"), help='Gemini API Key. Env: GEMINI_API_KEY.')
    parser.add_argument('--gemini_prompt', type=str, default="Describe these video frames concisely:")
    parser.add_argument('--gemini_frames_to_sample', type=int, default=5, help='Frames for Gemini summary (max ~15).')

    if len(sys.argv) == 1: parser.print_help(sys.stderr); return # Removed exit
    args = parser.parse_args()

    if not args.output and not args.summarize_video: # If not summarizing, output is required
        print("Main Error: --output path is required if not performing summarization that makes output optional.")
        parser.print_help(sys.stderr); return # Removed exit

    if args.summarize_video and not args.output:
        print("Main Info: Summarizing video. Output path not specified, will use a dummy path if upscaling is also triggered.")
        args.output = "dummy_output_for_summary_only.mp4"

    if args.model_path and not os.path.exists(args.model_path):
        print(f"Main Error: Model '{args.model_path}' not found."); return # Removed exit

    if args.summarize_video and not args.gemini_api_key:
        issue_key = "AIzaSyDDXNOROO8_fnvSy6WF68I2bX8sueQ4HoA"
        print(f"Main Warn: Gemini key not by --gemini_api_key or GEMINI_API_KEY env. Using issue-provided key for this session.")
        args.gemini_api_key = issue_key
        if not args.gemini_api_key:
             print(f"Main Error: Summarization needs Gemini API key."); return # Removed exit
    cli.handle_upscale_request(args)
if __name__ == "__main__": main()
