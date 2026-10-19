'use strict';

const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(__dirname, '../src/PseudoFXForge.jsxinc');
const modulePath = path.join(__dirname, '../module/PseudoFXForge.js');
const exportsCode = `
export var version = PseudoFXForge.version;
export var normalise = PseudoFXForge.normalise;
export var writeFFX = PseudoFXForge.writeFFX;
export var applyPseudoEffect = PseudoFXForge.applyPseudoEffect;
export default PseudoFXForge;
`;
const expected = fs.readFileSync(sourcePath, 'utf8').trimEnd() + '\n' + exportsCode;

// モジュール版とJSXINC版の実装一致を確認
if (process.argv.includes('--check')) {
    if (!fs.existsSync(modulePath) || fs.readFileSync(modulePath, 'utf8') !== expected) {
        throw new Error('Module is out of date. Run npm run sync:module.');
    }
    console.log('PASS module implementation matches JSXINC');
} else {
    fs.mkdirSync(path.dirname(modulePath), { recursive: true });
    fs.writeFileSync(modulePath, expected);
    console.log('Updated module/PseudoFXForge.js');
}
