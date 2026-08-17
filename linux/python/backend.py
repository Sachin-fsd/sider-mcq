#!/usr/bin/env python3
"""
ScreenSum Python Backend - Modified to support multiple API keys with rotation
"""
import base64
import io
import sys
import re
import json
import argparse
import subprocess
import os
from pathlib import Path
from datetime import datetime
import time

# Try to import dependencies
try:
    import mss
    from PIL import Image
    from groq import Groq
except ImportError as e:
    print(f"ERROR: Missing dependency: {e}", file=sys.stderr)
    sys.exit(1)

# Try to import mouse control
try:
    if sys.platform == "win32":
        import pyautogui
        MOUSE_CONTROL_AVAILABLE = True
    else:
        import subprocess
        MOUSE_CONTROL_AVAILABLE = True
except ImportError:
    MOUSE_CONTROL_AVAILABLE = False
    print("WARNING: Mouse control not available", file=sys.stderr)


# Default settings
MAX_WIDTH = 800
VISION_MODEL = "qwen/qwen3.6-27b"
REQUESTS_PER_KEY = 10  # Number of requests before switching API key

# File to track API key usage
USAGE_FILE = Path(os.path.expanduser("~/.screensum_usage.json"))


def load_usage_data():
    """Load API key usage data from file"""
    if USAGE_FILE.exists():
        try:
            with open(USAGE_FILE, 'r') as f:
                return json.load(f)
        except:
            return {"current_index": 0, "request_count": 0, "total_requests": 0}
    return {"current_index": 0, "request_count": 0, "total_requests": 0}


def save_usage_data(data):
    """Save API key usage data to file"""
    try:
        USAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(USAGE_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Warning: Could not save usage data: {e}", file=sys.stderr)


def get_next_api_key(api_keys):
    """Get the next API key based on rotation"""
    if not api_keys:
        return None
    
    usage = load_usage_data()
    
    # Check if we need to rotate
    if usage["request_count"] >= REQUESTS_PER_KEY:
        # Move to next key
        usage["current_index"] = (usage["current_index"] + 1) % len(api_keys)
        usage["request_count"] = 0
        save_usage_data(usage)
        print(f"🔄 Rotating to API key #{usage['current_index'] + 1}", file=sys.stderr)
    
    # Get the current key
    current_key = api_keys[usage["current_index"]]
    
    # Increment request count
    usage["request_count"] += 1
    usage["total_requests"] += 1
    save_usage_data(usage)
    
    print(f"📊 Using API key #{usage['current_index'] + 1} (Request #{usage['request_count']}/{REQUESTS_PER_KEY}, Total: {usage['total_requests']})", file=sys.stderr)
    
    return current_key


def reset_api_usage():
    """Reset the API usage counter (for testing)"""
    save_usage_data({"current_index": 0, "request_count": 0, "total_requests": 0})
    print("🔄 API usage counter reset", file=sys.stderr)


def move_mouse_linux(x, y):
    """Move mouse on Linux using xdotool"""
    try:
        subprocess.run(["xdotool", "mousemove", str(x), str(y)], check=True, capture_output=True)
        return True
    except Exception as e:
        print(f"[mouse error] {e}", file=sys.stderr)
        return False


def move_mouse_windows(x, y):
    """Move mouse on Windows using pyautogui"""
    try:
        import pyautogui
        pyautogui.moveTo(x, y)
        return True
    except Exception as e:
        print(f"[mouse error] {e}", file=sys.stderr)
        return False


def move_mouse(x, y):
    """Cross-platform mouse movement"""
    if sys.platform == "win32":
        return move_mouse_windows(x, y)
    else:
        return move_mouse_linux(x, y)


def get_screen_size():
    """Get screen dimensions"""
    try:
        import mss
        with mss.MSS() as sct:
            monitor = sct.monitors[0]
            return monitor["width"], monitor["height"]
    except:
        return 1920, 1080  # Fallback


def point_to_option(option):
    """Move mouse to point at the selected option"""
    SCREEN_WIDTH, SCREEN_HEIGHT = get_screen_size()
    
    positions = {
        'A': (int(SCREEN_WIDTH * 0.15), int(SCREEN_HEIGHT * 0.20)),
        'B': (int(SCREEN_WIDTH * 0.85), int(SCREEN_HEIGHT * 0.20)),
        'C': (int(SCREEN_WIDTH * 0.50), int(SCREEN_HEIGHT * 0.50)),
        'D': (int(SCREEN_WIDTH * 0.15), int(SCREEN_HEIGHT * 0.80)),
        'E': (int(SCREEN_WIDTH * 0.85), int(SCREEN_HEIGHT * 0.80)),
    }
    
    option = option.upper()
    if option in positions:
        x, y = positions[option]
        print(f"POINTING:{option}:{x}:{y}")
        return move_mouse(x, y)
    return False


def capture_screen_base64():
    """Capture screen and return as base64"""
    try:
        import mss
        from PIL import Image
        import io
        
        with mss.MSS() as sct:
            shot = sct.grab(sct.monitors[0])
        
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        
        if img.width > MAX_WIDTH:
            ratio = MAX_WIDTH / img.width
            img = img.resize((MAX_WIDTH, int(img.height * ratio)))
        
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        print(f"ERROR: Screenshot failed: {e}", file=sys.stderr)
        raise


def summarize_screen(image_b64, api_key):
    """Send to Groq and get answer"""
    client = Groq(api_key=api_key)
    
    completion = client.chat.completions.create(
        model=VISION_MODEL,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Look at this image. If there's a multiple choice question:\n"
                            "1. IGNORE any green highlights, mouse cursors, or user selections\n"
                            "2. Find the CORRECT answer mathematically\n"
                            "3. OUTPUT ONLY: A, B, C, D, or E\n"
                            "4. If no MCQ, output: NO MCQ\n"
                            "5. CRITICAL: Do NOT use <think> tags. Do NOT show reasoning.\n"
                            "6. Your ENTIRE response must be just one letter: A, B, C, D, or E"
                        )
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_b64}"
                        }
                    }
                ]
            }
        ],
        temperature=0.1,
        top_p=0.1,
        stream=False,
    )
    return completion.choices[0].message.content


def parse_response(response):
    """Parse AI response - look for answer at the END"""
    response = response.strip()
    
    if "NO MCQ" in response.upper():
        return None
    
    matches = re.findall(r'\b([ABCDE])\b', response.upper())
    if matches:
        return matches[-1]
    
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--api-key', required=True, help='Groq API key (comma-separated for multiple keys)')
    parser.add_argument('--reset-usage', action='store_true', help='Reset API usage counter')
    args = parser.parse_args()
    
    # Handle reset flag
    if args.reset_usage:
        reset_api_usage()
        print("✅ Usage counter reset. Exiting.")
        sys.exit(0)
    
    # Parse API keys (comma-separated)
    api_keys = [key.strip() for key in args.api_key.split(',') if key.strip()]
    
    if not api_keys:
        print("ERROR: No valid API keys provided", file=sys.stderr)
        sys.exit(1)
    
    print(f"🔑 Loaded {len(api_keys)} API keys", file=sys.stderr)
    
    try:
        # Get the next API key based on rotation
        current_api_key = get_next_api_key(api_keys)
        
        if not current_api_key:
            print("ERROR: Could not get API key", file=sys.stderr)
            sys.exit(1)
        
        # Capture screen
        print("CAPTURING", file=sys.stderr)
        image_b64 = capture_screen_base64()
        
        # Get answer from AI
        print("ANALYZING", file=sys.stderr)
        response = summarize_screen(image_b64, current_api_key)
        
        # Parse answer
        answer = parse_response(response)
        
        if answer:
            print(f"ANSWER:{answer}")
            # Move mouse to point at answer
            point_to_option(answer)
        else:
            print("ANSWER:NO_MCQ")
            
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()