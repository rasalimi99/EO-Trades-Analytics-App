const fs = require('fs');
const path = require('path');

function removeConsoleLogs(dir) {
    fs.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (!filePath.includes('node_modules')) {
                removeConsoleLogs(filePath);
            }
        } else if (filePath.endsWith('.js')) {
            let content = fs.readFileSync(filePath, 'utf8');
            // Match console.log statements, single-line and multi-line, excluding comments
            const updatedContent = content.replace(
                /(^|\n)\s*console\.log\((?:[^()]+|\([^()]*\))*\);?\s*(\n|$)/g,
                '$1$2' // Keep the leading/trailing newline or empty
            );
            if (content !== updatedContent) {
                fs.writeFileSync(filePath, updatedContent, 'utf8');
                console.log(`Removed console.log from ${filePath}`);
                // Check for remaining console.log
                if (updatedContent.match(/console\.log/)) {
                    console.warn(`Remaining console.log statements in ${filePath}`);
                }
            } else {
                console.log(`No console.log statements found in ${filePath}`);
            }
        }
    });
}

removeConsoleLogs(process.cwd());