// postinstall.js - Runs after npm install
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const pythonDir = path.join(__dirname, '..', 'python');

// Check if Python is available
exec('python3 --version', (error) => {
    if (error) {
        console.warn('⚠️ Python3 not found. Users will need to install Python manually.');
    } else {
        console.log('✅ Python3 found.');
    }
});