#!/usr/bin/env python3
"""
ScreenSum Python Backend - Modified to work with Electron
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
    parser.add_argument('--api-key', required=True, help='Groq API key')
    args = parser.parse_args()
    
    try:
        # Capture screen
        print("CAPTURING", file=sys.stderr)
        image_b64 = capture_screen_base64()
        
        # Get answer from AI
        print("ANALYZING", file=sys.stderr)
        response = summarize_screen(image_b64, args.api_key)
        
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