// Renderer process
const api = window.electronAPI;

// DOM elements
const settingsPanel = document.getElementById('settings-panel');
const statusPanel = document.getElementById('status-panel');
const statusMessage = document.getElementById('status-message');
const resultArea = document.getElementById('result-area');
const answerDisplay = document.getElementById('answer-display');
const apiKeysContainer = document.getElementById('api-keys-container');
const addKeyBtn = document.getElementById('add-key-btn');
const saveKeysBtn = document.getElementById('save-keys-btn');
const modelSelect = document.getElementById('model-select');
const closeResultBtn = document.getElementById('close-result-btn');
const keyInfo = document.getElementById('key-info');

// State
let isProcessing = false;
const MAX_KEYS = 5;

// Add a new API key input field
function addKeyInput(value = '') {
    const row = document.createElement('div');
    row.className = 'api-key-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'api-key-input';
    input.placeholder = 'gsk_xxxxxxxxxxxxxxxxxxxx';
    input.value = value;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-key-btn';
    removeBtn.textContent = '✕';
    removeBtn.style.display = 'none';
    removeBtn.addEventListener('click', () => {
        row.remove();
        updateKeyInfo();
        updateRemoveButtons();
    });

    row.appendChild(input);
    row.appendChild(removeBtn);
    apiKeysContainer.appendChild(row);

    // Show remove button if more than 1 key
    updateRemoveButtons();
    updateKeyInfo();

    return input;
}

// Update visibility of remove buttons
function updateRemoveButtons() {
    const rows = apiKeysContainer.querySelectorAll('.api-key-row');
    rows.forEach((row, index) => {
        const btn = row.querySelector('.remove-key-btn');
        if (rows.length > 1) {
            btn.style.display = 'inline-block';
        } else {
            btn.style.display = 'none';
        }
    });
}

// Update key count info
function updateKeyInfo() {
    const inputs = apiKeysContainer.querySelectorAll('.api-key-input');
    const validKeys = Array.from(inputs).filter(input => input.value.trim().length > 0);
    const total = inputs.length;

    if (total === 0) {
        keyInfo.textContent = '⚠️ Add at least one API key';
        keyInfo.style.color = '#f38ba8';
    } else {
        keyInfo.textContent = `📊 ${validKeys.length} of ${total} keys have values (Max ${MAX_KEYS})`;
        keyInfo.style.color = '#a6adc8';
    }
}

// Load saved settings
async function loadSettings() {
    const settings = await api.getSettings();
    const apiKeys = settings.apiKeys || [];

    // Clear existing inputs
    apiKeysContainer.innerHTML = '';

    // Add saved keys
    if (apiKeys.length === 0) {
        addKeyInput('');
    } else {
        apiKeys.forEach(key => addKeyInput(key));
    }

    if (settings.model) {
        modelSelect.value = settings.model;
    }

    updateKeyInfo();
    updateRemoveButtons();
}

// Save API keys
saveKeysBtn.addEventListener('click', async () => {
    const inputs = apiKeysContainer.querySelectorAll('.api-key-input');
    const apiKeys = Array.from(inputs)
        .map(input => input.value.trim())
        .filter(key => key.length > 0);

    if (apiKeys.length === 0) {
        statusMessage.textContent = '⚠️ Please enter at least one valid API key';
        return;
    }

    if (apiKeys.length > MAX_KEYS) {
        statusMessage.textContent = `⚠️ Maximum ${MAX_KEYS} API keys allowed`;
        return;
    }

    const result = await api.saveApiKeys(apiKeys);

    if (result.success) {
        statusMessage.textContent = `✅ ${result.count} API key${result.count > 1 ? 's' : ''} saved! Rotation enabled.`;
        setTimeout(() => {
            settingsPanel.classList.add('hidden');
            statusPanel.classList.remove('hidden');
            statusMessage.textContent = `✅ Ready! ${result.count} keys loaded with 10 requests each. Press Shift+A to solve MCQs.`;
        }, 1500);
    } else {
        statusMessage.textContent = `❌ Error: ${result.error || 'Failed to save API keys'}`;
    }
});

// Add key button
addKeyBtn.addEventListener('click', () => {
    const currentCount = apiKeysContainer.querySelectorAll('.api-key-row').length;
    if (currentCount < MAX_KEYS) {
        addKeyInput('');
        updateKeyInfo();
        updateRemoveButtons();
    } else {
        statusMessage.textContent = `⚠️ Maximum ${MAX_KEYS} API keys allowed`;
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

// Check if API keys exist
api.getApiKeys().then((keys) => {
    if (keys && keys.length > 0) {
        settingsPanel.classList.add('hidden');
        statusPanel.classList.remove('hidden');
        statusMessage.textContent = `✅ Ready! ${keys.length} keys loaded with 10 requests each. Press Shift+A to solve MCQs.`;
    }
});