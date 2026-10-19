#include '../src/PseudoFXForge.jsxinc'

(function () {
    var reportFile = new File(Folder.temp.fsName + '/PseudoFXForge-validation.txt');
    var outputFolder = new Folder(Folder.temp.fsName + '/PseudoFXForge-validation');
    var originalItem = app.project.activeItem;
    var temporaryComp;
    var reportLines = [];
    var passed = 0;
    var failed = 0;

    // 検証結果の保存。
    function record(message) {
        reportLines.push(message);
        reportFile.encoding = 'UTF-8';

        if (!reportFile.open('w')) {
            throw new Error('Cannot open report: ' + reportFile.fsName);
        }

        try {
            if (!reportFile.write(reportLines.join('\n'))) {
                throw new Error('Cannot write report');
            }
        } finally {
            reportFile.close();
        }
    }

    function check(condition, label) {
        if (!condition) {
            failed++;
            record('FAIL ' + label);
        } else {
            passed++;
            record('PASS ' + label);
        }
    }

    function closeEnough(actual, expected) {
        return Math.abs(actual - expected) < 0.02;
    }

    function checkVector(actual, expected, label) {
        var matches = actual.length === expected.length;

        for (var componentIndex = 0; componentIndex < expected.length; componentIndex++) {
            matches = matches && closeEnough(actual[componentIndex], expected[componentIndex]);
        }

        check(matches, label + ' actual=' + actual.join(',') + ' expected=' + expected.join(','));
    }

    // AEが生成したバイナリーの検査。
    function checkWireFormat(file, normalised) {
        file.encoding = 'BINARY';
        if (!file.open('r')) {
            throw new Error('Cannot read generated FFX');
        }
        var bytes = file.read();
        file.close();
        var descriptors = [];
        var valueLengths = [];

        function uint32(offset) {
            return bytes.charCodeAt(offset) * 16777216 +
                bytes.charCodeAt(offset + 1) * 65536 +
                bytes.charCodeAt(offset + 2) * 256 +
                bytes.charCodeAt(offset + 3);
        }

        function walk(start, end) {
            var offset = start;
            while (offset < end) {
                var tag = bytes.substr(offset, 4);
                var length = uint32(offset + 4);
                var dataOffset = offset + 8;
                if (dataOffset + length > end) {
                    throw new Error('FFX chunk exceeds parent');
                }
                if (tag === 'LIST') {
                    walk(dataOffset + 4, dataOffset + length);
                } else if (tag === 'tdb4') {
                    descriptors.push({
                        dimensions: bytes.charCodeAt(dataOffset + 2) * 256 + bytes.charCodeAt(dataOffset + 3),
                        flags: uint32(dataOffset + 8)
                    });
                } else if (tag === 'cdat') {
                    valueLengths.push(length);
                }
                offset = dataOffset + length + length % 2;
            }
        }

        walk(12, bytes.length);
        var valid = descriptors.length === normalised.flat.length + 1;
        valid = valid && valueLengths.length === descriptors.length;
        valid = valid && descriptors[0].flags === 65536;

        for (var index = 0; index < descriptors.length; index++) {
            var type = 'root';
            if (index > 0) {
                type = normalised.flat[index - 1].type;
            }
            var dimensions = 1;
            var expectedLength = 40;
            if (type === 'colour') {
                dimensions = 4;
                expectedLength = 96;
            } else if (type === 'point') {
                dimensions = 2;
                expectedLength = 48;
            } else if (type === 'point3d') {
                dimensions = 3;
                expectedLength = 72;
            }
            valid = valid && descriptors[index].dimensions === dimensions;
            valid = valid && valueLengths[index] === expectedLength;
        }

        check(valid, 'native FFX dimensions, root flags and payload sizes');
        if (!valid) {
            throw new Error('Native binary layout differs from the required layout');
        }
    }

    try {
        record('PseudoFXForge ' + PseudoFXForge.version);
        record('AE ' + app.version + ' / ' + $.os);
        record('Output: ' + outputFolder.fsName);

        // 最小定義の生成と再利用。
        var minimal = {
            name: 'Forge Validation',
            matchName: 'Pseudo/Validate',
            controls: [{
                id: 'amount', name: 'Amount', type: 'slider',
                'default': 25, min: -100, max: 100,
                sliderMin: 0, sliderMax: 100
            }]
        };

        var firstWrite = PseudoFXForge.writeFFX(minimal, outputFolder, {fileName: 'minimal.ffx'});
        var secondWrite = PseudoFXForge.writeFFX(minimal, outputFolder, {fileName: 'minimal.ffx'});
        check(firstWrite.file.exists, 'minimal FFX exists');
        check(secondWrite.reused, 'identical FFX is reused');
        checkWireFormat(firstWrite.file, PseudoFXForge.normalise(minimal));

        temporaryComp = app.project.items.addComp('PseudoFXForge validation', 640, 480, 1, 1, 24);
        temporaryComp.openInViewer();
        var layer = temporaryComp.layers.addShape();
        var effects = layer.property('ADBE Effect Parade');

        record('BEGIN minimal registration');
        var minimalEffect = PseudoFXForge.applyPseudoEffect(minimal, effects, {
            outputDirectory: outputFolder,
            fileName: 'minimal.ffx'
        });

        check(minimalEffect.matchName === firstWrite.matchName, 'registered matchName');
        check(closeEnough(minimalEffect.property(1).value, 25), 'slider initial value');

        // 全コントロール型とグループの登録。
        var definition = {
            name: '全コントロール',
            matchName: 'Pseudo/AllTypes',
            controls: [
                {id: 'angle', name: '角度', type: 'angle', 'default': -12.5},
                {id: 'enabled', name: 'Enabled', type: 'checkbox', 'default': true},
                {id: 'tint', name: 'Colour', type: 'colour', 'default': [0.2, 0.4, 0.8]},
                {id: 'centre', name: 'Point', type: 'point', 'default': [50, 25]},
                {id: 'space', name: '3D Point', type: 'point3d', 'default': [25, 50, 0]},
                {id: 'source', name: 'Layer', type: 'layer', 'default': -1},
                {id: 'mode', name: 'Dropdown', type: 'dropdown', items: ['One', '二', 'Three'], 'default': 2},
                {id: 'heading', name: 'Heading', type: 'label'},
                {id: 'group', name: 'Closed group', type: 'group', open: false, children: [
                    {id: 'nested', name: 'Nested group', type: 'group', children: [
                        {id: 'inside', name: 'Inside', type: 'slider', 'default': 3}
                    ]}
                ]},
                {id: 'hidden', name: 'Invisible', type: 'slider', invisible: true, 'default': 7},
                {id: 'static', name: 'Static', type: 'slider', keyframes: false, 'default': 8},
                {id: 'held', name: 'Hold', type: 'slider', hold: true, 'default': 9},
                {id: 'percent', name: 'Percent', type: 'slider', unit: 'percent', 'default': 50},
                {id: 'pixels', name: 'Pixels', type: 'slider', unit: 'pixels', 'default': 10}
            ]
        };

        var normalised = PseudoFXForge.normalise(definition);
        var allTypesFile = PseudoFXForge.writeFFX(definition, outputFolder, {fileName: 'all-types.ffx'});
        checkWireFormat(allTypesFile.file, normalised);
        record('BEGIN all-types registration ' + normalised.matchName);
        var effect = PseudoFXForge.applyPseudoEffect(definition, effects, {
            outputDirectory: outputFolder,
            fileName: 'all-types.ffx'
        });

        function property(id) {
            return effect.property(normalised.properties[id].matchName);
        }

        check(effect.name === definition.name, 'Unicode effect name');
        check(property('angle').name === '角度', 'Unicode control name');
        check(closeEnough(property('angle').value, -12.5), 'angle initial value');
        check(closeEnough(property('enabled').value, 1), 'checkbox initial value');
        checkVector(property('tint').value.slice(0, 3), [0.2, 0.4, 0.8], 'colour initial value');
        checkVector(property('centre').value, [320, 120], 'Point percentage initial value');
        checkVector(property('space').value, [160, 240, 0], '3D Point percentage initial value');
        check(property('source').value === layer.index, 'Layer self initial value');
        check(property('mode').value === 2, 'Dropdown initial value');
        check(property('inside').value === 3, 'nested group property');
        check(property('hidden').value === 7, 'invisible property remains addressable');
        check(!property('static').canVaryOverTime, 'keyframes false');

        // 定義を変更したmatchNameの併存。
        var previousMatchName = normalised.matchName;
        definition.controls[0]['default'] = 45;
        var changedEffect = PseudoFXForge.applyPseudoEffect(definition, effects, {outputDirectory: outputFolder});
        check(changedEffect.matchName !== previousMatchName, 'changed definition gets a new matchName');
        check(closeEnough(changedEffect.property(PseudoFXForge.normalise(definition).properties.angle.matchName).value, 45), 'changed initial value');

        record('Manual UI checks: collapsed group, labels, dropdown text, invisible control, percent/pixel units, hold interpolation.');
    } catch (validationError) {
        failed++;
        record('ERROR ' + String(validationError) + ' line=' + validationError.line);
    } finally {
        // 検証用コンポジションの除去と表示の復元。
        if (temporaryComp) {
            try {
                temporaryComp.remove();
            } catch (cleanupError) {
                failed++;
                record('ERROR cleanup ' + String(cleanupError));
            }
        }

        if (originalItem && originalItem instanceof CompItem) {
            originalItem.openInViewer();
        }

        record('SUMMARY passed=' + passed + ' failed=' + failed);
        alert('PseudoFXForge validation\nPassed: ' + passed + '\nFailed: ' + failed + '\n\n' + reportFile.fsName);
    }
}());
