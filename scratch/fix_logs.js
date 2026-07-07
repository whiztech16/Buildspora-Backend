const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace console.error('... error:', error.message) with logError("...", error)
  const regex1 = /console\.error\([\'\"]([^\'\"]+?)(?:\s+failed)?(?:\s+error)?\:?[\'\"]\,\s*error(?:\.response\?\.data\s*\|\|\s*error)?(?:\.message)?\);/g;
  const regex2 = /console\.error\([\'\"]([^\'\"]+?)\s+error\:?[\'\"]\,\s*data\);/g;
  const regex3 = /console\.error\([\'\"]([^\'\"]+?)\s+error\:?[\'\"]\,\s*error\);/g;
  
  let modified = false;
  content = content.replace(regex1, (match, contextName) => {
    modified = true;
    return `logError("${contextName}", error);`;
  });
  content = content.replace(regex2, (match, contextName) => {
    modified = true;
    return `logError("${contextName}", data);`;
  });
  content = content.replace(regex3, (match, contextName) => {
    modified = true;
    return `logError("${contextName}", error);`;
  });

  // Make sure logError is imported if we used it
  if (modified && !content.includes('logError')) {
    content = `import { logError } from "../lib/logger";\n` + content;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

processDir(path.join(__dirname, '../src/services'));
processDir(path.join(__dirname, '../src/middleware'));
