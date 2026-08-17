// Renderer process
const api = window.electronAPI;

// DOM elements
const settingsPanel = document.getElementById('settings-panel');
const statusPanel = document.getElementById('status-panel');
const statusMessage = document.getElementById('status-message');
const resultArea = document.getElementById('result-area');
const answerDisplay = document.getElementById('answer-display');
const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key-btn');
const modelSelect = document.getElementById('model-select');
const closeResultBtn = document.getElementById('close-result-btn');

// State
let isProcessing = false;

// Load saved settings
async function loadSettings() {
    const settings = await api.getSettings();
    if (settings.apiKey) {
        apiKeyInput.value = settings.apiKey;
    }
    if (settings.model) {
        modelSelect.value = settings.model;
    }
}

// Save API key
saveKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        statusMessage.textContent = '⚠️ Please enter a valid API key';
        return;
    }

    const result = await api.saveApiKey(apiKey);

    if (result.success) {
        statusMessage.textContent = '✅ API key saved! You can close this window now.';
        setTimeout(() => {
            settingsPanel.classList.add('hidden');
            statusPanel.classList.remove('hidden');
            statusMessage.textContent = '✅ Ready! Press Shift+A to solve MCQs.';
        }, 1500);
    } else {
        statusMessage.textContent = `❌ Error: ${result.error || 'Failed to save API key'}`;
    }
});

// Close result
closeResultBtn.addEventListener('click', () => {
    resultArea.classList.add('hidden');
    answerDisplay.textContent = '-';
    answerDisplay.className = 'answer-box';
});

// Listen for answer results
api.onAnswerResult((data) => {
    isProcessing = false;
    statusMessage.textContent = '✅ Done!';
    statusMessage.className = 'status-success';

    answerDisplay.textContent = data.answer || 'No answer found';
    answerDisplay.className = 'answer-box answered';
    resultArea.classList.remove('hidden');
});

// Listen for processing status
api.onProcessingStatus((data) => {
    if (data.status === 'processing') {
        isProcessing = true;
        statusMessage.innerHTML = '<span class="loading-spinner"></span> Analyzing screen...';
        statusMessage.className = 'status-processing';
        resultArea.classList.add('hidden');
    } else if (data.status === 'error') {
        isProcessing = false;
        statusMessage.textContent = `❌ Error: ${data.error || 'Unknown error'}`;
        statusMessage.className = 'status-error';
    } else if (data.status === 'complete') {
        isProcessing = false;
        statusMessage.textContent = '✅ Ready! Press Shift+A to solve MCQs.';
        statusMessage.className = 'status-success';
    }
});

// Listen for show settings
api.onShowSettings(() => {
    settingsPanel.classList.remove('hidden');
    statusPanel.classList.add('hidden');
});

// Initialize
loadSettings();

// If API key exists, show status panel
api.getApiKey().then((key) => {
    if (key) {
        settingsPanel.classList.add('hidden');
        statusPanel.classList.remove('hidden');
        statusMessage.textContent = '✅ Ready! Press Shift+A to solve MCQs.';
    }
});