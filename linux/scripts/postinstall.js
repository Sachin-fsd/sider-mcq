// postinstall.js - Runs after npm install
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const pythonDir = path.join(__dirname, '..', 'python');

// Check if Python is available
exec('python3 --version', (error) => {
    if (error) {
        console.warn('⚠️ Python3 not found. To build a bundled backend you need Python3 on the build machine.');
        console.warn('Run `npm run build:backend` on a Linux machine with Python3 to create a bundled backend executable.');
    } else {
        console.log('✅ Python3 found.');
    }
});