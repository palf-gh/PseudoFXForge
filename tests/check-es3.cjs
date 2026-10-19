'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const root = path.resolve(__dirname, '..');
const options = { ecmaVersion: 3, allowReserved: 'never' };

function parseExtendScript(source) {
    const tree = acorn.parse(source, options);
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (
            node.type === 'ConditionalExpression' &&
            [node.test, node.consequent, node.alternate].some(
                (child) => child.type === 'ConditionalExpression'
            )
        ) {
            throw new SyntaxError(
                'Nested conditional expressions are incompatible with ExtendScript at offset ' +
                    node.start
            );
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === 'object') visit(value);
        }
    }
    visit(tree);
    return tree;
}

// 予約語を識別子・属性名のどちらでも拒否する設定を確認する。
for (const invalid of [
    'function byte() {}',
    'var value = { default: 0 };',
    'value.default;',
    'var value = () => 0;',
    'var value = first ? 1 : second ? 2 : 3;',
    'var value = first ? (second ? 1 : 2) : 3;',
    'var value = (first ? second : third) ? 1 : 2;'
]) {
    assert.throws(() => parseExtendScript(invalid));
}
parseExtendScript(
    "var value = { 'default': 0 }; value['default']; value = flag ? 1 : 0;"
);

function collect(directory) {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const filename = path.join(directory, entry.name);
            return entry.isDirectory()
                ? collect(filename)
                : /\.jsx(?:inc)?$/i.test(entry.name)
                  ? [filename]
                  : [];
        });
}

const files = ['src', 'examples', 'tests'].flatMap((directory) =>
    collect(path.join(root, directory))
);
let failures = 0;
for (const filename of files) {
    // ExtendScriptのディレクティブだけを空白へ置き換え、元の行番号を保つ。
    const source = fs
        .readFileSync(filename, 'utf8')
        .replace(/^[\t ]*#include[^\r\n]*/gm, (directive) =>
            ' '.repeat(directive.length)
        );
    try {
        parseExtendScript(source);
        console.log('PASS ES3 ' + path.relative(root, filename));
    } catch (error) {
        failures++;
        console.error(path.relative(root, filename) + ': ' + error.message);
    }
}
if (failures) process.exitCode = 1;
else
    console.log(
        files.length +
            ' ExtendScript files passed strict ES3 reserved-word checks.'
    );
