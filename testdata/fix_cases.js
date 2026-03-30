const fs = require('fs');
const path = require('path');

const jdPath = path.join('c:/Users/DeepakVK/Documents/panel-pulse-main/panel-pulse-main/testdata/TC01_JD.csv');
const l2Path = path.join('c:/Users/DeepakVK/Documents/panel-pulse-main/panel-pulse-main/testdata/TC01_L2.csv');
const l1Path = path.join('c:/Users/DeepakVK/Documents/panel-pulse-main/panel-pulse-main/testdata/TC01_L1.csv');

// Clean up existing messy appended line
function cleanLines(filepath) {
    let content = fs.readFileSync(filepath, 'utf8');
    // Remove the literal \n
    content = content.replace(/\\n/g, '\n');
    fs.writeFileSync(filepath, content.trim() + '\n');
}

try {
    cleanLines(jdPath);
    cleanLines(l2Path);
    cleanLines(l1Path);
    console.log("Successfully fixed newlines.");
} catch(e) {
    console.error("Error fixing files:", e);
}
