// Reapply patch for oh-my-opencode-slim minimumExpectedToolCount bug
// https://github.com/alvinunreal/oh-my-opencode-slim/issues/310
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'node_modules/oh-my-opencode-slim/dist/index.js');
if (!fs.existsSync(target)) process.exit(0);

let code = fs.readFileSync(target, 'utf8');
const bad = 'function minimumExpectedToolCount(disabledTools = []) {\n  const disabledBaselineTools = new Set(disabledTools.filter(';
const good = 'function minimumExpectedToolCount(disabledTools = []) {\n  if (!Array.isArray(disabledTools)) disabledTools = [];\n  const disabledBaselineTools = new Set(disabledTools.filter(';

if (code.includes(bad) && !code.includes('Array.isArray(disabledTools)')) {
  code = code.replace(bad, good);
  fs.writeFileSync(target, code, 'utf8');
  console.log('[fix] oh-my-opencode-slim patch applied');
} else {
  console.log('[fix] oh-my-opencode-slim already patched or not found');
}
