const {
    app,
    BrowserWindow,
    globalShortcut,
    ipcMain,
    Tray,
    Menu,
} = require('electron');

const { spawn } = require('child_process');
const path = require('path');
const log = require('electron-log');

// electron-store is ESM, so we load it dynamically below.
let Store;
let store = null;

// Setup logging
log.transports.file.level = 'info';

let mainWindow = null;
let pythonProcess = null;
let isProcessing = false;
let tray = null;

// Python backend path
let pythonScriptPath = '';
let pythonExecutable = 'python3';

// Check if running in development or production
function setupPythonPaths() {
    if (app.isPackaged) {
        // Production: Python backend is inside resources
        pythonScriptPath = path.join(
            process.resourcesPath,
            'python',
            'backend.py'
        );

        if (process.platform === 'win32') {
            pythonExecutable = path.join(
                process.resourcesPath,
                'python',
                'python.exe'
            );
        } else {
            pythonExecutable = path.join(
                process.resourcesPath,
                'python',
                'python3'
            );
        }
    } else {
        // Development
        pythonScriptPath = path.join(__dirname, 'python', 'backend.py');

        if (process.platform === 'win32') {
            pythonExecutable = 'python';
        } else {
            pythonExecutable = 'python3';
        }
    }

    log.info('Python executable:', pythonExecutable);
    log.info('Python script:', pythonScriptPath);
}

async function initializeStore() {
    try {
        const module = await import('electron-store');

        Store = module.default;

        store = new Store({
            defaults: {
                apiKey: '',
                model: 'qwen/qwen3.6-27b',
            },
        });

        log.info('electron-store initialized successfully');
    } catch (error) {
        log.error('Failed to initialize electron-store:', error);
        throw error;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 500,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        resizable: false,
        show: false,
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        log.error(
            `Failed to load index.html: ${errorCode} - ${errorDescription}`
        );
    });

    // Show window only if API key is not set
    const apiKey = store.get('apiKey');

    if (!apiKey) {
        mainWindow.show();
    } else {
        // Minimize to tray if API key exists
        mainWindow.hide();
        createTray();
    }

    // Handle window close
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // Prevent errors if renderer is destroyed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Dev tools
    // mainWindow.webContents.openDevTools();
}

function createTray() {
    if (tray) {
        return;
    }

    const iconPath = path.join(__dirname, 'assets', 'icon.png');

    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show ScreenSum',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            },
        },
        {
            label: 'Settings',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();

                    mainWindow.webContents.send('show-settings');
                }
            },
        },
        {
            type: 'separator',
        },
        {
            label: 'Quit',
            click: () => {
                app.isQuitting = true;
                app.quit();
            },
        },
    ]);

    tray.setToolTip('ScreenSum - Press Shift+A to solve MCQs');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function registerGlobalHotkey() {
    const ret = globalShortcut.register(
        'Shift+A',
        () => {
            if (isProcessing) {
                log.info('Already processing, skipping...');
                return;
            }

            const apiKey = store.get('apiKey');

            if (!apiKey) {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                    mainWindow.webContents.send('show-settings');
                }

                showNotification(
                    'ScreenSum',
                    'Please set your Groq API key in settings'
                );

                return;
            }

            log.info('Hotkey pressed! Running screen capture...');

            isProcessing = true;

            showNotification(
                'ScreenSum',
                '🔍 Analyzing screen...'
            );

            if (mainWindow) {
                mainWindow.webContents.send('processing-status', {
                    status: 'processing',
                });
            }

            runPythonBackend(apiKey);
        }
    );

    if (!ret) {
        log.error('Failed to register global hotkey');
    } else {
        log.info('Global hotkey registered: Shift+A');
    }
}

function runPythonBackend(apiKey) {
    if (pythonProcess) {
        log.info('Python process is already running');
        return;
    }

    const pythonArgs = [
        pythonScriptPath,
        '--api-key',
        apiKey,
    ];

    log.info('Starting Python backend...');
    log.info('Command:', pythonExecutable, pythonArgs);

    try {
        pythonProcess = spawn(
            pythonExecutable,
            pythonArgs,
            {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            }
        );
    } catch (error) {
        log.error('Failed to spawn Python process:', error);

        isProcessing = false;
        pythonProcess = null;

        showNotification(
            'ScreenSum',
            '❌ Failed to start Python backend'
        );

        if (mainWindow) {
            mainWindow.webContents.send('processing-status', {
                status: 'error',
                error: error.message,
            });
        }

        return;
    }

    let result = '';
    let answerDetected = false;

    pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();

        result += output;

        log.info('Python output:', output.trim());

        // Match ANSWER: A / B / C / D / E
        const matches = output.match(/ANSWER:\s*([A-E])/gi);

        if (matches && !answerDetected) {
            const match = matches[0].match(/ANSWER:\s*([A-E])/i);

            if (match) {
                answerDetected = true;

                const answer = match[1].toUpperCase();

                log.info('Answer detected:', answer);

                showNotification(
                    'ScreenSum',
                    `✅ Answer: ${answer}`
                );

                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send(
                        'answer-result',
                        {
                            answer,
                            raw: result,
                        }
                    );
                }
            }
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString();

        log.error('Python error:', errorOutput);

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(
                'processing-status',
                {
                    status: 'error',
                    error: errorOutput,
                }
            );
        }
    });

    pythonProcess.on('error', (error) => {
        log.error('Python process error:', error);

        isProcessing = false;
        pythonProcess = null;

        showNotification(
            'ScreenSum',
            `❌ Failed to start Python: ${error.message}`
        );

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(
                'processing-status',
                {
                    status: 'error',
                    error: error.message,
                }
            );
        }
    });

    pythonProcess.on('close', (code, signal) => {
        log.info(
            `Python process closed. code=${code}, signal=${signal}`
        );

        isProcessing = false;
        pythonProcess = null;

        if (code !== 0 && code !== null) {
            showNotification(
                'ScreenSum',
                '❌ Error occurred. Check logs.'
            );

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(
                    'processing-status',
                    {
                        status: 'error',
                        error: `Python process exited with code ${code}`,
                    }
                );
            }
        } else {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(
                    'processing-status',
                    {
                        status: 'complete',
                    }
                );
            }
        }
    });
}

function showNotification(title, body) {
    // Notifications are disabled by user request.
    // Suppress OS notifications but keep a log entry for debugging.
    log.info(`Notification suppressed: ${title} - ${body}`);
}

// =========================
// IPC HANDLERS
// =========================

ipcMain.handle('save-api-key', async (event, apiKey) => {
    try {
        if (typeof apiKey !== 'string') {
            throw new Error('Invalid API key');
        }

        store.set('apiKey', apiKey.trim());

        log.info('API key saved');

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.hide();
        }

        createTray();

        return {
            success: true,
        };
    } catch (error) {
        log.error('Failed to save API key:', error);

        return {
            success: false,
            error: error.message,
        };
    }
});

ipcMain.handle('get-api-key', () => {
    try {
        return store.get('apiKey', '');
    } catch (error) {
        log.error('Failed to get API key:', error);
        return '';
    }
});

ipcMain.handle('get-settings', () => {
    try {
        return {
            apiKey: store.get('apiKey', ''),
            model: store.get(
                'model',
                'qwen/qwen3.6-27b'
            ),
        };
    } catch (error) {
        log.error('Failed to get settings:', error);

        return {
            apiKey: '',
            model: 'qwen/qwen3.6-27b',
        };
    }
});

ipcMain.handle('save-settings', (event, settings) => {
    try {
        if (settings?.apiKey !== undefined) {
            store.set('apiKey', String(settings.apiKey).trim());
        }

        if (settings?.model !== undefined) {
            store.set('model', String(settings.model));
        }

        log.info('Settings saved');

        return {
            success: true,
        };
    } catch (error) {
        log.error('Failed to save settings:', error);

        return {
            success: false,
            error: error.message,
        };
    }
});

// =========================
// APP LIFECYCLE
// =========================

app.whenReady()
    .then(async () => {
        log.info('ScreenSum starting...');

        // Initialize electron-store BEFORE anything uses store
        await initializeStore();

        // Setup Python paths
        setupPythonPaths();

        // Create main window
        createWindow();

        // Register global hotkey
        registerGlobalHotkey();

        // macOS: show window when clicking dock icon
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            } else if (mainWindow) {
                mainWindow.show();
                mainWindow.focus();
            }
        });
    })
    .catch((error) => {
        log.error('Failed during app startup:', error);

        console.error('Failed during app startup:', error);

        app.quit();
    });

app.on('window-all-closed', () => {
    // Do NOT quit.
    // ScreenSum continues running in the system tray.
});

app.on('before-quit', () => {
    log.info('Application quitting...');

    app.isQuitting = true;

    // Kill Python process if running
    if (pythonProcess && !pythonProcess.killed) {
        log.info('Stopping Python process...');

        try {
            pythonProcess.kill();
        } catch (error) {
            log.error('Failed to kill Python process:', error);
        }
    }

    pythonProcess = null;
    isProcessing = false;

    // Unregister shortcuts
    globalShortcut.unregisterAll();

    // Destroy tray
    if (tray) {
        tray.destroy();
        tray = null;
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
    console.error(error);
});

process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Promise Rejection:', reason);
    console.error(reason);
});