for development

1. npm install
2. python3 -m venv .venv
3. source .venv/bin/activate
4. pip install --upgrade pip
5. pip install -r python/requirements.txt
6. npm start

Packaging (self-contained AppImage with bundled Python backend)

1. Ensure you are on a Linux build machine with `node`, `npm`, and `python3` installed.
2. From the `linux/` folder run:

```bash
npm install
npm run build:backend    # creates python/backend (standalone executable)
npm run dist:linux       # builds an AppImage in dist/ (predist will run build:backend automatically)
```

The produced AppImage in `dist/` includes the bundled Python backend and required Python packages, so end users do not need to have Python or libraries pre-installed. The UI will display backend errors in the settings/status panel if any occur.

Running the AppImage

1. Make the AppImage as shown above. The file will be created in `linux/dist/`, for example `dist/ScreenSum-1.0.0.AppImage`.
2. Make it executable and run it:

```bash
chmod +x dist/ScreenSum-1.0.0.AppImage
./dist/ScreenSum-1.0.0.AppImage
```

3. To quit the running app:

- Right-click the tray icon and choose "Quit".
- Or close the window and select Quit from the tray menu.
- From a terminal, find and stop the process:

```bash
# find process by name and kill politely
ps aux | grep ScreenSum
kill <PID>

# or force by matching the AppImage filename
pkill -f ScreenSum-1.0.0.AppImage
```

Rebuilding after code changes

- After making changes to the Electron source or to the Python backend, rebuild the bundled backend and AppImage:

```bash
cd linux
npm install        # only needed the first time or to update deps
npm run build:backend   # bundles python/backend
npm run dist:linux      # builds AppImage (predist runs build:backend automatically)
```

Notes

- The build must be performed on a Linux machine (PyInstaller produces Linux executables). The produced AppImage is self-contained and can be distributed to other Linux users.
- If you want a `.deb` package as well, add `author.email` and `homepage` fields to `package.json` to satisfy packaging metadata.
