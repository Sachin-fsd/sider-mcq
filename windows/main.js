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
const fs = require('fs');
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
        // Production (Users): Use the bundled binary we just made
        pythonExecutable = path.join(process.resourcesPath, 'backend.exe');
        // The logic is already correct for Windows here
    } else {
        // Development: Use system python
        pythonScriptPath = path.join(__dirname, 'python', 'backend.py');
        pythonExecutable = 'python'; // Windows uses 'python', not 'python3'
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
                apiKeys: [], // Changed from apiKey to apiKeys array
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
        width: 650,
        height: 600,
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

    // Show window only if no API keys are set
    const apiKeys = store.get('apiKeys', []);
    const hasApiKeys = apiKeys && apiKeys.length > 0;

    if (!hasApiKeys) {
        mainWindow.show();
    } else {
        // Minimize to tray if API keys exist
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

            const apiKeys = store.get('apiKeys', []);

            if (!apiKeys || apiKeys.length === 0) {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                    mainWindow.webContents.send('show-settings');
                }

                showNotification(
                    'ScreenSum',
                    'Please set at least one Groq API key in settings'
                );

                return;
            }

            log.info('Hotkey pressed! Running screen capture...');
            log.info(`Using ${apiKeys.length} API keys with rotation`);

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

            runPythonBackend(apiKeys);
        }
    );

    if (!ret) {
        log.error('Failed to register global hotkey');
    } else {
        log.info('Global hotkey registered: Shift+A');
    }
}

function runPythonBackend(apiKeys) {
    if (pythonProcess) {
        log.info('Python process is already running');
        return;
    }

    // Join API keys with comma
    const apiKeysString = apiKeys.join(',');

    // Build args: in dev mode include script path, in production just pass args to exe
    const pythonArgs = app.isPackaged
        ? ['--api-key', apiKeysString]
        : [pythonScriptPath, '--api-key', apiKeysString];

    log.info('Starting Python backend...');
    log.info('Command:', pythonExecutable, pythonArgs);
    log.info('Python executable path:', pythonExecutable);
    log.info('App packaged?', app.isPackaged);
    log.info('Resources path:', process.resourcesPath);
    log.info(`Using ${apiKeys.length} API keys with rotation`);

    // Check if executable exists (in production mode)
    if (app.isPackaged && !fs.existsSync(pythonExecutable)) {
        const errorMsg = `Backend executable not found at: ${pythonExecutable}`;
        log.error(errorMsg);

        isProcessing = false;

        showNotification('ScreenSum', '❌ ' + errorMsg);

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('processing-status', {
                status: 'error',
                error: errorMsg,
            });
        }

        return;
    }

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
            const errorMsg = `Python process exited with code ${code}`;
            log.error(errorMsg);

            showNotification(
                'ScreenSum',
                `❌ ${errorMsg}`
            );

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(
                    'processing-status',
                    {
                        status: 'error',
                        error: errorMsg,
                    }
                );
            }

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

// Save multiple API keys
ipcMain.handle('save-api-keys', async (event, apiKeys) => {
    try {
        if (!Array.isArray(apiKeys)) {
            throw new Error('Invalid API keys array');
        }

        // Filter out empty strings and trim
        const validKeys = apiKeys
            .map(key => key.trim())
            .filter(key => key.length > 0);

        if (validKeys.length === 0) {
            throw new Error('At least one valid API key is required');
        }

        store.set('apiKeys', validKeys);
        store.set('apiKeyCount', validKeys.length);

        log.info(`Saved ${validKeys.length} API keys`);

        // Reset usage counter when keys are updated
        const usageFilePath = path.join(
            process.env.HOME || process.env.USERPROFILE,
            '.screensum_usage.json'
        );
        try {
            if (fs.existsSync(usageFilePath)) {
                fs.unlinkSync(usageFilePath);
                log.info('Reset API usage counter');
            }
        } catch (e) {
            log.warn('Could not reset usage counter:', e);
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.hide();
        }

        createTray();

        return {
            success: true,
            count: validKeys.length,
        };
    } catch (error) {
        log.error('Failed to save API keys:', error);

        return {
            success: false,
            error: error.message,
        };
    }
});

// Get saved API keys
ipcMain.handle('get-api-keys', () => {
    try {
        return store.get('apiKeys', []);
    } catch (error) {
        log.error('Failed to get API keys:', error);
        return [];
    }
});

// Legacy support - get single API key
ipcMain.handle('get-api-key', () => {
    // Legacy support - returns first key or empty string
    try {
        const keys = store.get('apiKeys', []);
        return keys.length > 0 ? keys[0] : '';
    } catch (error) {
        log.error('Failed to get API key:', error);
        return '';
    }
});

// Legacy support - save single API key
ipcMain.handle('save-api-key', async (event, apiKey) => {
    try {
        if (typeof apiKey !== 'string') {
            throw new Error('Invalid API key');
        }

        // Save as array with single key
        const validKey = apiKey.trim();
        if (!validKey) {
            throw new Error('API key cannot be empty');
        }

        store.set('apiKeys', [validKey]);
        log.info('API key saved (legacy mode)');

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

ipcMain.handle('get-settings', () => {
    try {
        return {
            apiKeys: store.get('apiKeys', []),
            model: store.get(
                'model',
                'qwen/qwen3.6-27b'
            ),
        };
    } catch (error) {
        log.error('Failed to get settings:', error);

        return {
            apiKeys: [],
            model: 'qwen/qwen3.6-27b',
        };
    }
});

ipcMain.handle('save-settings', (event, settings) => {
    try {
        if (settings?.apiKeys !== undefined && Array.isArray(settings.apiKeys)) {
            const validKeys = settings.apiKeys
                .map(key => String(key).trim())
                .filter(key => key.length > 0);
            store.set('apiKeys', validKeys);
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