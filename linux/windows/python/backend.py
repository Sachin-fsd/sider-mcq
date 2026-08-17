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
import traceback
from pathlib import Path

# Ensure dependencies are imported at module level (for PyInstaller)
import mss
from PIL import Image
from groq import Groq


# Default settings
MAX_WIDTH = 800
VISION_MODEL = "qwen/qwen3.6-27b"


def move_mouse(x, y):
    """Move mouse to specified coordinates using pyautogui"""
    try:
        import pyautogui
        # Slow down mouse movement for visibility
        pyautogui.moveTo(x, y, duration=0.5)
        print(f"DEBUG: Mouse moved to ({x}, {y})", file=sys.stderr)
        return True
    except ImportError:
        print("WARNING: pyautogui not available for mouse movement", file=sys.stderr)
        return False
    except Exception as e:
        print(f"ERROR: Failed to move mouse: {e}", file=sys.stderr)
        return False


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
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument('--api-key', required=True, help='Groq API key')
        args = parser.parse_args()
        
        print("DEBUG: Arguments parsed successfully", file=sys.stderr)
        
        # Validate API key
        if not args.api_key or len(args.api_key.strip()) == 0:
            print("ERROR: API key is empty", file=sys.stderr)
            sys.exit(1)
        
        print("DEBUG: API key received", file=sys.stderr)
        
        # Capture screen
        print("CAPTURING", file=sys.stderr)
        try:
            image_b64 = capture_screen_base64()
            print("DEBUG: Screen captured successfully", file=sys.stderr)
        except Exception as e:
            print(f"ERROR: Failed to capture screen: {e}", file=sys.stderr)
            sys.exit(1)
        
        # Get answer from AI
        print("ANALYZING", file=sys.stderr)
        try:
            response = summarize_screen(image_b64, args.api_key)
            print("DEBUG: AI response received", file=sys.stderr)
        except Exception as e:
            print(f"ERROR: Failed to analyze screen: {e}", file=sys.stderr)
            sys.exit(1)
        
        # Parse answer
        answer = parse_response(response)
        
        if answer:
            print(f"ANSWER:{answer}")
            # Move mouse to point at answer
            point_to_option(answer)
        else:
            print("ANSWER:NO_MCQ")
        
        print("DEBUG: Execution completed successfully", file=sys.stderr)
        sys.exit(0)
            
    except Exception as e:
        print(f"ERROR: Unexpected error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()