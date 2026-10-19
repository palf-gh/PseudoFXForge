'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const acorn = require('acorn');

async function main() {
    const modulePath = path.join(__dirname, '../module/PseudoFXForge.js');
    const moduleSource = fs.readFileSync(modulePath, 'utf8');
    const source = fs.readFileSync(path.join(__dirname, '../src/PseudoFXForge.jsxinc'), 'utf8');
    const ast = acorn.parse(moduleSource, { ecmaVersion: 2015, sourceType: 'module' });
    const firstExport = ast.body.find((node) => node.type.startsWith('Export'));

    // exportより前の実装はES3のまま
    acorn.parse(moduleSource.slice(0, firstExport.start), {
        ecmaVersion: 3,
        allowReserved: 'never'
    });

    const imported = await import(pathToFileURL(modulePath).href);
    const forge = imported.default;
    assert.equal(imported.version, forge.version);
    for (const name of ['normalise', 'writeFFX', 'applyPseudoEffect']) {
        assert.equal(imported[name], forge[name]);
    }

    // 同じ入力から同じ定義・識別子が得られる
    const context = vm.createContext({});
    vm.runInContext(source, context);
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/all-controls.json'), 'utf8'));
    const expected = JSON.stringify(context.PseudoFXForge.normalise(data));
    assert.equal(JSON.stringify(forge.normalise(data)), expected);
    assert.equal(JSON.stringify(forge.normalise(JSON.stringify(data))), expected);
    assert.throws(() => forge.normalise('{'), /JSON/);
    console.log('PASS ESM default and named imports, ES3 implementation, and matching normalisation');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
