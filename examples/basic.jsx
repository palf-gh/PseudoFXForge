#include '../src/PseudoFXForge.jsxinc'

(function () {
    var definition = {
        name: 'Forge Example',
        matchName: 'Pseudo/Forge',
        controls: [
            { id: 'amount', name: 'Amount', type: 'slider', 'default': 50,
                min: 0, max: 100, sliderMin: 0, sliderMax: 100, unit: 'percent' },
            { id: 'enabled', name: 'Enabled', type: 'checkbox', 'default': true }
        ]
    };
    var result = PseudoFXForge.writeFFX(definition,
        new Folder(Folder.userData.fsName + '/PseudoFXForge/examples'));
    alert(result.file.fsName + '\n' + result.matchName);
}());
