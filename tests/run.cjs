'use strict';
// バイナリーと制御フローを検証する。AEが受理するかは実機テストで確認する。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path').posix;
const vm = require('node:vm');
const source = fs.readFileSync(
    require('node:path').join(__dirname, '../src/PseudoFXForge.jsxinc'),
    'utf8'
);
let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log('PASS ' + name);
}
function host() {
    const files = new Map(),
        folders = new Set(['/', '/user']),
        faults = {};
    const norm = (p) => path.resolve('/', String(p).replace(/\\/g, '/'));
    function Folder(p) {
        this.fsName = norm(p);
        this.error = '';
    }
    Object.defineProperties(Folder.prototype, {
        exists: {
            get() {
                return folders.has(this.fsName);
            }
        },
        parent: {
            get() {
                return new Folder(path.dirname(this.fsName));
            }
        }
    });
    Folder.prototype.create = function () {
        if (faults.mkdir) return false;
        folders.add(this.fsName);
        return true;
    };
    Folder.userData = new Folder('/user');
    function File(p) {
        this.fsName = norm(p);
        this.error = '';
    }
    Object.defineProperties(File.prototype, {
        exists: {
            get() {
                return files.has(this.fsName);
            }
        },
        name: {
            get() {
                return path.basename(this.fsName);
            }
        },
        parent: {
            get() {
                return new Folder(path.dirname(this.fsName));
            }
        }
    });
    File.prototype.open = function (mode) {
        if (faults.open) return false;
        this.mode = mode;
        if (mode === 'w') files.set(this.fsName, '');
        return mode === 'w' || this.exists;
    };
    File.prototype.write = function (s) {
        if (faults.write) return false;
        files.set(this.fsName, (files.get(this.fsName) || '') + s);
        return true;
    };
    File.prototype.read = function () {
        return files.get(this.fsName);
    };
    File.prototype.close = function () {
        return true;
    };
    File.prototype.remove = function () {
        return files.delete(this.fsName);
    };
    File.prototype.rename = function (name) {
        if (faults.rename && faults.rename(this, name)) return false;
        const dest = norm(path.join(path.dirname(this.fsName), name));
        if (!this.exists || files.has(dest)) return false;
        files.set(dest, files.get(this.fsName));
        files.delete(this.fsName);
        this.fsName = dest;
        return true;
    };
    const context = vm.createContext({ File, Folder });
    vm.runInContext(source, context);
    return {
        api: context.PseudoFXForge,
        context,
        files,
        folders,
        faults,
        File
    };
}
const basic = () => ({
    name: 'Forge Test',
    matchName: 'Pseudo/Test',
    controls: [{ id: 'amount', name: 'Amount', type: 'slider', default: 12.5 }]
});
function error(fn, code) {
    assert.throws(fn, (e) => e.code === code);
}
function bytes(h, result) {
    return Buffer.from(h.files.get(result.file.fsName), 'latin1');
}
function chunks(b, start, end, found = []) {
    let p = start;
    while (p < end) {
        assert.ok(p + 8 <= end);
        const tag = b.toString('ascii', p, p + 4),
            size = b.readUInt32BE(p + 4),
            stop = p + 8 + size;
        assert.ok(stop <= end, tag + ' exceeds parent');
        found.push({ tag, start: p + 8, size });
        if (tag === 'LIST' || tag === 'RIFX') chunks(b, p + 12, stop, found);
        if (size % 2) assert.equal(b[stop], 0);
        p = stop + (size % 2);
    }
    assert.equal(p, end);
    return found;
}
test('JSON text and objects yield the same deterministic identity', () => {
    const { api } = host();
    const a = api.normalise(basic()),
        b = api.normalise(JSON.stringify(basic()));
    assert.equal(a.matchName, b.matchName);
    assert.equal(a.canonical, b.canonical);
    assert.match(a.fingerprint, /^[a-f0-9]{16}$/);
    assert.equal(a.properties.amount.index, 1);
    const c = basic();
    c.controls[0].default = 13;
    assert.notEqual(api.normalise(c).matchName, a.matchName);
});
test('attribute order and explicit defaults do not change normalised identity', () => {
    const { api } = host(),
        d = basic();
    const reordered = {
        controls: [
            {
                default: 12.5,
                type: 'slider',
                name: 'Amount',
                id: 'amount',
                invisible: false
            }
        ],
        matchName: d.matchName,
        name: d.name
    };
    assert.equal(
        api.normalise(d).matchName,
        api.normalise(reordered).matchName
    );
});
test('strict JSON rejects executable input, duplicates, reserved keys and trailing data', () => {
    const { api } = host();
    for (const s of [
        '{};throw 1',
        '{"name":1,"name":2}',
        '{"__proto__":{}}',
        '[1,]',
        '{"x":01}',
        '{"x":1e999}',
        '{"x":"\\uZZZZ"}'
    ])
        error(() => api.normalise(s), 'JSON');
});
test('validation rejects unknown attributes, duplicate ids and invalid dimensions', () => {
    const { api } = host();
    const cases = [
        (d) => (d.extra = true),
        (d) => d.controls.push({ ...d.controls[0] }),
        (d) => (d.controls[0].default = Infinity),
        (d) => (d.controls[0].type = 'unknown'),
        (d) =>
            (d.controls[0] = {
                id: 'p',
                name: 'Point',
                type: 'point',
                default: [1]
            }),
        (d) => (d.controls = []),
        (d) => (d.controls[0].name = 'x'.repeat(32)),
        (d) => (d.controls[0].min = 20)
    ];
    for (const mutate of cases) {
        const d = basic();
        mutate(d);
        error(() => api.normalise(d), 'INPUT');
    }
    try {
        api.normalise({ ...basic(), extra: 1 });
    } catch (e) {
        assert.equal(e.path, '$');
    }
});
test('binary has valid recursive big-endian chunk sizes and slider values', () => {
    const h = host(),
        r = h.api.writeFFX(basic(), '/out'),
        b = bytes(h, r);
    assert.equal(b.toString('ascii', 0, 4), 'RIFX');
    assert.equal(b.readUInt32BE(4) + 8, b.length);
    const all = chunks(b, 12, b.length),
        pard = all.filter((x) => x.tag === 'pard');
    assert.equal(pard.length, 2);
    assert.equal(pard[1].size, 148);
    assert.equal(b.readUInt32BE(pard[1].start + 12), 10);
    assert.equal(b.readFloatBE(pard[1].start + 120), 12.5);
});
test('negative floats, slider ranges, units, precision and visibility encode', () => {
    const h = host(),
        d = basic();
    Object.assign(d.controls[0], {
        default: -12.5,
        min: -100,
        max: 200,
        sliderMin: -20,
        sliderMax: 50,
        unit: 'percent',
        precision: 4,
        invisible: true,
        keyframes: false
    });
    const b = bytes(h, h.api.writeFFX(d, '/out'));
    const p = chunks(b, 12, b.length).filter((x) => x.tag === 'pard')[1].start;
    assert.equal(b.readUInt32BE(p + 4), 512);
    assert.equal(b.readUInt32BE(p + 48), 2);
    assert.deepEqual(
        [104, 108, 112, 116, 120].map((o) => b.readFloatBE(p + o)),
        [-100, 200, -20, 50, -12.5]
    );
    assert.equal(b.readUInt16BE(p + 124), 4);
    assert.equal(b.readUInt16BE(p + 126), 1);
});
test('checkbox parameters end with an empty secondary name before the next control', () => {
    const h = host(), d = basic();
    d.controls = [
        { id: 'check', name: 'Checkbox', type: 'checkbox', default: true },
        { id: 'amount', name: 'Amount', type: 'slider', default: 25 }
    ];
    const binary = bytes(h, h.api.writeFFX(d, '/out'));
    const entries = chunks(binary, 12, binary.length);
    const checkboxIndex = entries.findIndex(
        (entry) => entry.tag === 'pard' && binary.readUInt32BE(entry.start + 12) === 4
    );
    assert.ok(checkboxIndex >= 0);
    const secondaryName = entries[checkboxIndex + 1];
    assert.equal(secondaryName.tag, 'pdnm');
    assert.equal(binary[secondaryName.start], 0);
    assert.equal(entries[checkboxIndex + 2].tag, 'tdmn');
});

test('colour defaults use ARGB bytes and dropdown metadata matches items', () => {
    const h = host(),
        d = basic();
    d.controls = [
        { id: 'colour', name: 'Colour', type: 'colour', default: [0, 0.5, 1] },
        {
            id: 'choice',
            name: 'Choice',
            type: 'dropdown',
            items: ['First', 'Second', '三'],
            default: 2,
            keyframes: false
        }
    ];
    const b = bytes(h, h.api.writeFFX(d, '/out')),
        all = chunks(b, 12, b.length),
        pd = all.filter((x) => x.tag === 'pard');
    assert.deepEqual(
        Array.from(b.subarray(pd[1].start + 60, pd[1].start + 64)),
        [255, 0, 128, 255]
    );
    assert.equal(b.readUInt32BE(pd[2].start + 48), 2);
    assert.equal(b.readUInt32BE(pd[2].start + 56), 2);
    assert.equal(b.readUInt16BE(pd[2].start + 60), 3);
    assert.equal(b.readUInt16BE(pd[2].start + 62), 2);
    const names = all.find((x) => x.tag === 'pdnm');
    assert.equal(
        b.toString('utf8', names.start, names.start + names.size),
        'First|Second|三\0'
    );
});
test('control defaults occupy their native parameter fields', () => {
    const h = host(),
        d = basic();
    d.controls = [
        { id: 'a', name: 'Angle', type: 'angle', default: -12.5 },
        { id: 'c', name: 'Checkbox', type: 'checkbox', default: true },
        { id: 'p', name: 'Point', type: 'point', default: [25.5, 75] },
        { id: 'q', name: 'Point 3D', type: 'point3d', default: [10, 20, -30] }
    ];
    const b = bytes(h, h.api.writeFFX(d, '/out')),
        pd = chunks(b, 12, b.length).filter((x) => x.tag === 'pard');
    assert.equal(b.readInt32BE(pd[1].start + 60), -12.5 * 65536);
    assert.equal(b[pd[2].start + 60], 1);
    assert.equal(b.readInt32BE(pd[3].start + 68), 25.5 * 65536);
    assert.equal(b.readInt32BE(pd[3].start + 72), 75 * 65536);
    assert.deepEqual(
        [80, 88, 96].map((offset) => b.readDoubleBE(pd[4].start + offset)),
        [10, 20, -30]
    );
});
test('collapsed groups and animation behaviour use parameter flags', () => {
    const h = host(),
        d = basic();
    d.controls = [
        {
            id: 'g',
            name: 'Group',
            type: 'group',
            open: false,
            children: [
                {
                    id: 's',
                    name: 'Hold',
                    type: 'slider',
                    hold: true,
                    keyframes: false,
                    unit: 'pixels'
                }
            ]
        }
    ];
    const b = bytes(h, h.api.writeFFX(d, '/out')),
        pd = chunks(b, 12, b.length).filter((x) => x.tag === 'pard');
    assert.equal(b.readUInt32BE(pd[1].start + 48) & 32, 32);
    assert.equal(b.readUInt32BE(pd[2].start + 48) & 6, 6);
    assert.equal(b.readUInt16BE(pd[2].start + 126), 2);
});
test('layer defaults distinguish none and self', () => {
    const h = host(),
        d = basic();
    d.controls = [
        { id: 'none', name: 'None', type: 'layer', default: 0 },
        { id: 'self', name: 'Self', type: 'layer', default: -1 }
    ];
    const b = bytes(h, h.api.writeFFX(d, '/out')),
        pd = chunks(b, 12, b.length).filter((x) => x.tag === 'pard');
    assert.equal(b.readInt32BE(pd[1].start + 128), 0);
    assert.equal(b.readInt32BE(pd[2].start + 128), -1);
});
test('all control types and nested group markers encode', () => {
    const h = host(),
        d = basic();
    d.controls = [
        {
            id: 'g',
            name: 'Group',
            type: 'group',
            open: false,
            children: [
                { id: 'l', name: 'Label', type: 'label' },
                ...[
                    'slider',
                    'angle',
                    'checkbox',
                    'colour',
                    'point',
                    'point3d',
                    'layer',
                    'dropdown'
                ].map((type, i) => ({
                    id: 'c' + i,
                    name: '値' + i,
                    type,
                    ...(type === 'dropdown'
                        ? { items: ['One', 'Two'], default: 2 }
                        : {})
                }))
            ]
        }
    ];
    const n = h.api.normalise(d),
        b = bytes(h, h.api.writeFFX(d, '/out'));
    const all = chunks(b, 12, b.length),
        codes = all
            .filter((x) => x.tag === 'pard')
            .map((x) => b.readUInt32BE(x.start + 12));
    assert.deepEqual(codes, [0, 13, 13, 14, 10, 3, 4, 5, 6, 18, 0, 7, 14]);
    assert.equal(n.properties.c7.index, 11);
});
test('reuse compares full bytes and repairs corrupt files', () => {
    const h = host(),
        a = h.api.writeFFX(basic(), '/nested/out');
    assert.equal(a.reused, false);
    const original = h.files.get(a.file.fsName);
    assert.equal(h.api.writeFFX(basic(), '/nested/out').reused, true);
    h.files.set(a.file.fsName, 'broken');
    const r = h.api.writeFFX(basic(), '/nested/out');
    assert.equal(r.reused, false);
    assert.equal(h.files.get(r.file.fsName), original);
    assert.equal(h.files.size, 1);
});
test('replacement failure restores original path and removes temporary files', () => {
    const h = host(),
        r = h.api.writeFFX(basic(), '/out');
    h.files.set(r.file.fsName, 'old bytes');
    h.faults.rename = (f) => f.name.endsWith('.tmp');
    error(() => h.api.writeFFX(basic(), '/out'), 'IO');
    assert.equal(h.files.get(r.file.fsName), 'old bytes');
    assert.equal(h.files.size, 1);
});
test('write and directory errors surface as IO errors', () => {
    for (const failure of ['mkdir', 'open', 'write']) {
        const h = host();
        h.faults[failure] = true;
        error(() => h.api.writeFFX(basic(), '/out'), 'IO');
        assert.equal(h.files.size, 0);
    }
});
test('unsafe output names and unknown options are rejected', () => {
    const h = host();
    for (const fileName of ['../bad.ffx', 'CON.ffx', 'bad.txt'])
        error(() => h.api.writeFFX(basic(), '/out', { fileName }), 'INPUT');
    error(() => h.api.writeFFX(basic(), '/out', { overwrite: true }), 'INPUT');
});
function application(h, failPreset = false) {
    let registered = false,
        removed = false,
        restored = false;
    const selected = { selected: true };
    function CompItem() {}
    const active = new CompItem();
    active.numLayers = 1;
    active.layer = () => selected;
    active.openInViewer = () => {
        restored = true;
    };
    const comp = {
        layers: {
            addShape() {
                return {
                    selected: false,
                    applyPreset() {
                        assert.equal(selected.selected, false);
                        if (failPreset) throw new Error('preset failure');
                        registered = true;
                    }
                };
            }
        },
        remove() {
            removed = true;
        }
    };
    h.context.CompItem = CompItem;
    h.context.app = {
        project: {
            activeItem: active,
            items: {
                addComp() {
                    return comp;
                }
            }
        }
    };
    const result = { name: 'result' },
        effects = {
            matchName: 'ADBE Effect Parade',
            canAddProperty() {
                return registered;
            },
            addProperty() {
                return result;
            }
        };
    return {
        effects,
        result,
        state: () => ({
            registered,
            removed,
            restored,
            selected: selected.selected
        })
    };
}
test('registration isolates selection and cleans up after success', () => {
    const h = host(),
        a = application(h);
    assert.equal(h.api.applyPseudoEffect(basic(), a.effects), a.result);
    assert.deepEqual(a.state(), {
        registered: true,
        removed: true,
        restored: true,
        selected: true
    });
});
test('failed registration restores selection and removes temporary composition', () => {
    const h = host(),
        a = application(h, true);
    error(() => h.api.applyPseudoEffect(basic(), a.effects), 'REGISTER');
    assert.deepEqual(a.state(), {
        registered: false,
        removed: true,
        restored: true,
        selected: true
    });
});
test('already registered effects skip preset generation', () => {
    const h = host();
    h.context.app = { project: {} };
    const result = {};
    const definition = basic();
    definition.name = '日本語エフェクト';
    assert.equal(
        h.api.applyPseudoEffect(definition, {
            matchName: 'ADBE Effect Parade',
            canAddProperty() {
                return true;
            },
            addProperty() {
                return result;
            }
        }),
        result
    );
    assert.equal(h.files.size, 0);
    assert.equal(result.name, definition.name);
});
test('missing project and invalid effects group report distinct errors', () => {
    const h = host();
    error(() => h.api.applyPseudoEffect(basic(), null), 'HOST');
    h.context.app = { project: {} };
    error(() => h.api.applyPseudoEffect(basic(), null), 'INPUT');
});
test('parameter bounds reject values that cannot fit the native field', () => {
    const { api } = host();
    for (const control of [
        { id: 'a', name: 'Angle', type: 'angle', default: 32768 },
        { id: 'p', name: 'Point', type: 'point', default: [-32769, 0] },
        { id: 'l', name: 'Layer', type: 'layer', default: 1 },
        {
            id: 'd',
            name: 'Dropdown',
            type: 'dropdown',
            items: Array(65536).fill('Item')
        }
    ]) {
        const definition = basic();
        definition.controls = [control];
        error(() => api.normalise(definition), 'INPUT');
    }
});

test('sparse vector defaults are invalid input', () => {
    const { api } = host();
    for (const type of ['point', 'point3d', 'colour']) {
        const definition = basic();
        definition.controls = [
            {
                id: 'v',
                name: 'Vector',
                type,
                default: Array(type === 'point' ? 2 : 3)
            }
        ];
        error(() => api.normalise(definition), 'INPUT');
    }
});

test('the flattened control limit includes generated group endings', () => {
    const { api } = host(),
        definition = basic();
    definition.controls = Array.from({ length: 5000 }, (_, index) => ({
        id: 'label' + index,
        name: 'Label',
        type: 'label'
    }));
    error(() => api.normalise(definition), 'INPUT');
});

test('normalisation and generation leave the caller definition unchanged', () => {
    const h = host(),
        definition = basic();
    definition.controls.push({
        id: 'g',
        name: 'Group',
        type: 'group',
        children: [
            {
                id: 'c',
                name: 'Colour',
                type: 'colour',
                default: [0.1, 0.2, 0.3]
            }
        ]
    });
    const before = JSON.stringify(definition);
    h.api.normalise(definition);
    h.api.writeFFX(definition, '/out');
    assert.equal(JSON.stringify(definition), before);
});

test('effect matchNames fit the AE limit with the longest accepted base', () => {
    const { api } = host(),
        definition = basic();
    definition.matchName = 'Pseudo/abcdefghij';
    const first = api.normalise(definition);
    assert.equal(definition.matchName.length, 17);
    assert.equal(first.matchName.length, 31);
    assert.equal(first.matchName.slice(0, 18), definition.matchName + '_');
    assert.equal(first.matchName.slice(18).length, 13);
    assert.match(first.fingerprint, /^[a-f0-9]{16}$/);
    const alphabet = '0123456789abcdefghijklmnopqrstuv';
    const restoredFingerprint = Array.from(first.matchName.slice(18)).reduce(
        (value, character) => {
            const digit = alphabet.indexOf(character);
            assert.ok(digit >= 0);
            return value * 32n + BigInt(digit);
        },
        0n
    );
    assert.equal(restoredFingerprint, BigInt('0x' + first.fingerprint));
    assert.equal(
        api.normalise(JSON.stringify(definition)).matchName,
        first.matchName
    );
    definition.controls[0]['default'] = 13;
    assert.notEqual(api.normalise(definition).matchName, first.matchName);
    assert.ok(api.normalise(basic()).matchName.length <= 31);
});

test('property descriptors declare the native dimension count', () => {
    const h = host(),
        definition = basic();
    definition.controls = [
        { id: 's', name: 'Slider', type: 'slider' },
        { id: 'a', name: 'Angle', type: 'angle' },
        { id: 'b', name: 'Checkbox', type: 'checkbox' },
        { id: 'c', name: 'Colour', type: 'colour' },
        { id: 'p', name: 'Point', type: 'point' },
        { id: 'q', name: 'Point 3D', type: 'point3d' },
        { id: 'l', name: 'Layer', type: 'layer' },
        { id: 'd', name: 'Dropdown', type: 'dropdown', items: ['One', 'Two'] }
    ];
    const binary = bytes(h, h.api.writeFFX(definition, '/out'));
    const names = chunks(binary, 12, binary.length).filter(
        (entry) => entry.tag === 'tdmn'
    );
    const endMarker = names[names.length - 1];
    assert.equal(
        binary.toString('ascii', endMarker.start, endMarker.start + 14),
        'ADBE Group End'
    );
    const descriptors = chunks(binary, 12, binary.length).filter(
        (entry) => entry.tag === 'tdb4'
    );
    assert.deepEqual(
        descriptors.map((entry) => binary.readUInt16BE(entry.start + 2)),
        [1, 1, 1, 1, 4, 2, 3, 1, 1]
    );
});

test('root metadata uses one source layer independently of control count', () => {
    const h = host(),
        definition = basic();
    definition.controls.push({ id: 'extra', name: 'Extra', type: 'slider' });
    const binary = bytes(h, h.api.writeFFX(definition, '/out'));
    const entries = chunks(binary, 12, binary.length);
    assert.equal(
        binary.readUInt32BE(
            entries.find((entry) => entry.tag === 'pard').start + 56
        ),
        1
    );
    assert.equal(
        binary.readUInt32BE(
            entries.find((entry) => entry.tag === 'tdpi').start
        ),
        1
    );
});

test('descriptor flags and value buffers preserve ExtendScript branch semantics', () => {
    const h = host(),
        definition = basic();
    definition.controls = [
        { id: 'c', name: 'Colour', type: 'colour', 'default': [0.25, 0.5, 1] },
        { id: 'p', name: 'Point', type: 'point', 'default': [25, 75] },
        { id: 'q', name: 'Point 3D', type: 'point3d', 'default': [10, 20, 30] },
        { id: 'yes', name: 'Enabled', type: 'checkbox', 'default': true },
        { id: 'no', name: 'Disabled', type: 'checkbox', 'default': false }
    ];
    const binary = bytes(h, h.api.writeFFX(definition, '/out'));
    const entries = chunks(binary, 12, binary.length);
    const descriptors = entries.filter((entry) => entry.tag === 'tdb4');
    const values = entries.filter((entry) => entry.tag === 'cdat');
    assert.equal(binary.readUInt32BE(descriptors[0].start + 8), 0x10000);
    assert.deepEqual(
        values.map((entry) => entry.size),
        [40, 96, 48, 72, 40, 40]
    );
    assert.equal(binary.readDoubleBE(values[4].start), 1);
    assert.equal(binary.readDoubleBE(values[5].start), 0);
});

test('canAddProperty host exceptions receive an APPLY error code', () => {
    const h = host();
    h.context.app = { project: {} };
    error(
        () =>
            h.api.applyPseudoEffect(basic(), {
                matchName: 'ADBE Effect Parade',
                canAddProperty() {
                    throw new Error('Host failure');
                }
            }),
        'APPLY'
    );
    assert.equal(h.files.size, 0);
});

test('selection is restored if deselection fails before registration', () => {
    const h = host();
    function CompItem() {}
    const active = new CompItem(),
        first = { selected: true };
    let secondSelected = true,
        restored = false,
        created = false;
    const second = {
        get selected() {
            return secondSelected;
        },
        set selected(value) {
            if (!value) throw new Error('Selection failure');
            secondSelected = value;
        }
    };
    active.numLayers = 2;
    active.layer = (index) => (index === 1 ? first : second);
    active.openInViewer = () => {
        restored = true;
    };
    h.context.CompItem = CompItem;
    h.context.app = {
        project: {
            activeItem: active,
            items: {
                addComp() {
                    created = true;
                    throw new Error('Unexpected registration');
                }
            }
        }
    };
    error(
        () =>
            h.api.applyPseudoEffect(basic(), {
                matchName: 'ADBE Effect Parade',
                canAddProperty() {
                    return false;
                }
            }),
        'REGISTER'
    );
    assert.equal(first.selected, true);
    assert.equal(second.selected, true);
    assert.equal(restored, true);
    assert.equal(created, false);
});

console.log(
    passed +
        ' tests passed. Host doubles do not establish After Effects compatibility.'
);
