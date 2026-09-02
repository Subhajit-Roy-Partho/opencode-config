// Reapply patch for oh-my-opencode-slim minimumExpectedToolCount bug
// https://github.com/alvinunreal/oh-my-opencode-slim/issues/310
const fs = require('fs');
const path = require('path');

const targets = [
  path.join(__dirname, 'node_modules/oh-my-opencode-slim/dist/index.js'),
  path.join(process.env.HOME || '', '.cache/opencode/packages/oh-my-opencode-slim/node_modules/oh-my-opencode-slim/dist/index.js'),
  path.join(process.env.HOME || '', '.cache/opencode/packages/oh-my-opencode-slim@latest/node_modules/oh-my-opencode-slim/dist/index.js'),
];
const bad = 'function minimumExpectedToolCount(disabledTools = []) {\n  const disabledBaselineTools = new Set(disabledTools.filter(';
const good = 'function minimumExpectedToolCount(disabledTools = []) {\n  if (!Array.isArray(disabledTools)) disabledTools = [];\n  const disabledBaselineTools = new Set(disabledTools.filter(';
let patched = 0;
for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  let code = fs.readFileSync(target, 'utf8');
  if (code.includes(bad) && !code.includes('Array.isArray(disabledTools)')) {
    code = code.replace(bad, good);
    fs.writeFileSync(target, code, 'utf8');
    console.log(`[fix] patched ${target}`);
    patched++;
  } else if (code.includes('Array.isArray(disabledTools)')) {
    console.log(`[fix] already patched ${target}`);
  }
}
if (patched === 0) console.log('[fix] oh-my-opencode-slim already patched or not found');
