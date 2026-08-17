# ScreenSum - MCQ Solver with AI

An Electron app that uses AI to solve MCQ questions by analyzing screen captures and moving the cursor to the correct answer.

## Features

- 🎯 **Automatic MCQ Detection** - Captures screen and analyzes MCQ
- 🤖 **AI-Powered Answers** - Uses Groq API for fast analysis
- 🖱️ **Cursor Movement** - Automatically moves cursor to correct answer option (A, B, C, D, E)
- 🔐 **API Key Storage** - Securely stores your Groq API key locally
- ⌨️ **Hotkey Support** - Press `Shift + A` to solve MCQs

## System Requirements

- **Windows 10/11** (64-bit)
- **2GB RAM minimum**
- **Internet connection** (for Groq API)
- **Groq API Key** (free from https://console.groq.com)

---

## Installation & Setup

### Option 1: Run from Pre-built Installer (.exe) - Easiest Way ✅

1. Download/Run: `release/ScreenSum Setup 1.0.0.exe`
2. Install the application
3. Open ScreenSum
4. Go to Settings and enter your Groq API Key
5. Press `Shift + A` on any MCQ screen to solve

---

### Option 2: Run from Source Code - Development Mode

#### Prerequisites

- **Node.js** (v16+) - Download from https://nodejs.org
- **Python 3.9+** - Download from https://www.python.org (check "Add Python to PATH")
- **Git** (optional) - For cloning the repo

#### Step 1: Clone/Download Project

```bash
# Navigate to project folder
cd c:\Users\shravan\Desktop\sider-mcq
```

#### Step 2: Create Virtual Environment

```powershell
# Create Python virtual environment
python -m venv venv

# Activate it (Windows)
venv\Scripts\activate

# You should see (venv) at the start of terminal line
```

#### Step 3: Install Dependencies

```powershell
# Install Python packages with --no-cache-dir to avoid disk space issues
pip install --no-cache-dir --upgrade pip

pip install --no-cache-dir mss pillow groq pyautogui

# Verify installation
pip list
```

**If pip install fails, try these fixes:**

**Fix 1: Use --no-build-isolation**

```powershell
pip install --no-cache-dir --no-build-isolation pyautogui
```

**Fix 2: Clear pip cache completely**

```powershell
pip cache purge
pip install --no-cache-dir mss pillow groq pyautogui
```

**Fix 3: Update pip first**

```powershell
python -m pip install --upgrade pip
pip install --no-cache-dir mss pillow groq pyautogui
```

#### Step 4: Install Node Dependencies

```powershell
# Install JavaScript dependencies
npm install
```

#### Step 5: Run in Development Mode

```powershell
# Start the Electron app
npm start
```

The app will open. Set your API key and press `Shift + A` on an MCQ screen to test!

---

## Building Production .exe

### Complete Build Process (Step by Step)

```powershell
# 1. Navigate to project
cd c:\Users\shravan\Desktop\sider-mcq

# 2. Activate virtual environment
venv\Scripts\activate

# 3. Reinstall dependencies with --no-cache-dir
pip install --no-cache-dir mss pillow groq pyautogui

# 4. Clean old builds
Remove-Item -Path dist -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path build -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path release -Recurse -Force -ErrorAction SilentlyContinue

# 5. Build Python backend as standalone executable
pyinstaller --onefile --windowed --name backend python/backend.py

# Verify backend.exe was created
Test-Path dist/backend.exe
# Should return: True

# 6. Build final Electron installer
npm run dist:win

# Wait for build to complete (~2-3 minutes)
```

### Final Output

✅ **Standalone Installer:** `release/ScreenSum Setup 1.0.0.exe`

This .exe can be installed and run on **any Windows PC without Python or dependencies**.

---

## Troubleshooting

### Error: "Backend executable not found"

**Solution:**

- Make sure `dist/backend.exe` exists before running `npm run dist:win`
- Check with: `Test-Path c:\Users\shravan\Desktop\sider-mcq\dist\backend.exe`
- If missing, rebuild with PyInstaller: `pyinstaller --onefile --windowed --name backend python/backend.py`

### Error: "Python process exited with code -4058"

**Solution:**

- This means missing dependencies or import errors
- Fix: `pip install --no-cache-dir mss pillow groq pyautogui`
- Reinstall from scratch:
  ```powershell
  pip uninstall mss pillow groq pyautogui -y
  pip cache purge
  pip install --no-cache-dir mss pillow groq pyautogui
  ```

### Error: "The system cannot move the file to a different disk drive"

**Solution:**

- This is a pip caching issue
- Fix: `pip cache purge`
- Then reinstall: `pip install --no-cache-dir mss pillow groq pyautogui`

### Error: "Module not found: groq/mss/PIL"

**Solution:**

- The virtual environment is not activated
- Activate it: `venv\Scripts\activate`
- You should see `(venv)` at the start of terminal line
- Then reinstall: `pip install --no-cache-dir mss pillow groq pyautogui`

### Cursor not moving after answer detected

**Solution:**

- Make sure pyautogui is installed: `pip list | grep PyAutoGUI`
- Reinstall if missing: `pip install --no-cache-dir pyautogui`
- Test in development mode first: `npm start`
- Rebuild .exe if needed

### App freezes while analyzing

**Solution:**

- This is normal, it takes 5-15 seconds for AI analysis
- Wait for the "✅ Answer: X" notification
- If it hangs for >30 seconds, check:
  - API key is valid
  - Internet connection is working
  - Groq API is not rate-limited

### API Key not saving

**Solution:**

- Close the app completely
- Clear app cache: Delete folder `%APPDATA%\screensum-electron`
- Restart app and re-enter API key

---

## Getting Groq API Key

1. Visit https://console.groq.com
2. Sign up (free account)
3. Go to API Keys section
4. Create new API key
5. Copy and paste in ScreenSum Settings
6. Save!

---

## File Structure

```
sider-mcq/
├── python/
│   ├── backend.py          # Python AI logic (core)
│   └── requirements.txt     # Python dependencies
├── main.js                  # Electron main process
├── renderer.js              # UI logic
├── preload.js              # Electron preload
├── index.html              # UI template
├── styles.css              # Styling
├── package.json            # Node dependencies & build config
├── venv/                   # Python virtual environment (DO NOT COMMIT)
├── dist/                   # Compiled backend.exe (auto-generated)
├── release/                # Final installer (auto-generated)
└── README.md              # This file
```

---

## How It Works

1. **Screenshot Capture** - Takes screenshot of screen
2. **AI Analysis** - Sends to Groq API with vision model
3. **Answer Detection** - Identifies correct answer (A/B/C/D/E)
4. **Cursor Movement** - Moves mouse to corresponding position
5. **Notification** - Shows result to user

---

## Development Notes

### Available Commands

```powershell
# Start in development mode
npm start

# Build .exe for production
npm run dist:win

# Clean builds
Remove-Item -Path dist, build, release -Recurse -Force -ErrorAction SilentlyContinue
```

### Modifying Backend Logic

Edit `python/backend.py` to:

- Change AI model: Modify `VISION_MODEL` variable
- Adjust cursor positions: Edit `positions` dict in `point_to_option()`
- Change screenshot resolution: Modify `MAX_WIDTH` variable

### Building for Other Platforms

```powershell
# Build for Linux
npm run dist:linux

# Build for Mac
npm run dist:mac
```

---

## Common Settings

### Edit Python backend settings in `python/backend.py`:

```python
# Change AI model (default: qwen/qwen3.6-27b)
VISION_MODEL = "qwen/qwen3.6-27b"

# Change screenshot max width (default: 800px)
MAX_WIDTH = 800

# Adjust cursor positions (A/B/C/D/E)
positions = {
    'A': (int(SCREEN_WIDTH * 0.15), int(SCREEN_HEIGHT * 0.20)),
    'B': (int(SCREEN_WIDTH * 0.85), int(SCREEN_HEIGHT * 0.20)),
    'C': (int(SCREEN_WIDTH * 0.50), int(SCREEN_HEIGHT * 0.50)),
    'D': (int(SCREEN_WIDTH * 0.15), int(SCREEN_HEIGHT * 0.80)),
    'E': (int(SCREEN_WIDTH * 0.85), int(SCREEN_HEIGHT * 0.80)),
}
```

---

## Performance Tips

1. **Reduce screenshot resolution** - Faster processing, lower API costs

   ```python
   MAX_WIDTH = 600  # Instead of 800
   ```

2. **Use faster Groq models** - Trade accuracy for speed

   ```python
   VISION_MODEL = "mixtral-8x7b-32768"  # Faster
   ```

3. **Close other apps** - Frees up system resources

---

## License

MIT License - Feel free to modify and distribute!

---

## Support

If you encounter issues:

1. Check the **Troubleshooting** section above
2. Verify all dependencies are installed: `pip list`
3. Check logs in development mode: `npm start`
4. Share error messages for help

---

## Keyboard Shortcuts

| Shortcut          | Action                       |
| ----------------- | ---------------------------- |
| `Shift + A`       | Analyze screen and solve MCQ |
| `ESC`             | Close result panel           |
| Double-click tray | Show/hide window             |

---

**Happy MCQ Solving! 🚀**
