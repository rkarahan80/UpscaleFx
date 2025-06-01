import google.generativeai as genai
import os
import PIL.Image
import io
import cv2 # For convert_cv2_frames_to_pil

# Global flag to track if API is configured
__gemini_configured = False

def configure_gemini(api_key):
    global __gemini_configured
    if not api_key:
        print("GEMINI_API Error: No API key provided.")
        __gemini_configured = False
        return False
    try:
        genai.configure(api_key=api_key)
        # Test with a lightweight call, e.g., listing models, to confirm config
        # models = [m for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        # if not models:
        #     print("GEMINI_API Error: Configuration seemed to succeed but could not list usable models.")
        #     __gemini_configured = False
        #     return False
        print("GEMINI_API Info: Gemini API configured.")
        __gemini_configured = True
        return True
    except Exception as e:
        print(f"GEMINI_API Error: Failed to configure Gemini: {e}")
        __gemini_configured = False
        return False

def generate_video_summary(frames_pil, prompt_text="Describe this sequence of video frames as a short summary:", model_name="gemini-pro-vision"):
    global __gemini_configured
    if not __gemini_configured:
        # Attempt to configure from environment if not done explicitly and key is available
        # This is a fallback, ideally configure_gemini is called by the application first.
        env_api_key = os.environ.get("GEMINI_API_KEY_CLI_FALLBACK")
        if env_api_key:
            print("GEMINI_API Info: Attempting to configure Gemini from GEMINI_API_KEY_CLI_FALLBACK env var.")
            if not configure_gemini(env_api_key):
                return "Error: Gemini API key found in env but auto-configuration failed."
        else:
            return "Error: Gemini API not configured. Call configure_gemini() or set GEMINI_API_KEY_CLI_FALLBACK."

    if not frames_pil: return "Error: No PIL frames provided for summary."

    print(f"GEMINI_API Info: Generating summary for {len(frames_pil)} frames using {model_name}...")
    try:
        model = genai.GenerativeModel(model_name)
        content_parts = [prompt_text] + frames_pil[:15] # Limit frames for safety
        if len(frames_pil) > 15: print("GEMINI_API Info: Using first 15 frames for summary.")

        response = model.generate_content(content_parts)

        if not response.parts:
            reason = "Unknown reason."
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                reason = response.prompt_feedback.block_reason_message or str(response.prompt_feedback.block_reason)
            return f"Error: Content generation blocked or empty response. Reason: {reason}"

        summary = "".join(part.text for part in response.parts if hasattr(part, 'text'))
        if not summary.strip(): return "Gemini response contained no textual summary."

        print("GEMINI_API Info: Summary generated.")
        return summary
    except Exception as e:
        print(f"GEMINI_API Error during generation: {e}")
        import traceback; traceback.print_exc()
        return f"Error during Gemini API call: {type(e).__name__}"

def convert_cv2_frames_to_pil(cv2_frames_list):
    pil_images = []
    for frame_cv in cv2_frames_list:
        if frame_cv is None: continue
        frame_rgb = cv2.cvtColor(frame_cv, cv2.COLOR_BGR2RGB)
        pil_images.append(PIL.Image.fromarray(frame_rgb))
    return pil_images
