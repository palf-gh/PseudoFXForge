#include '../src/PseudoFXForge.jsxinc'

(function () {
    var comp = app.project && app.project.activeItem;
    if (!comp || !(comp instanceof CompItem) || comp.selectedLayers.length !== 1) {
        throw new Error('Select one layer in an active composition.');
    }
    var effect = PseudoFXForge.applyPseudoEffect({
        name: 'Forge Apply',
        matchName: 'Pseudo/Apply',
        controls: [
            { id: 'amount', name: 'Amount', type: 'slider', 'default': 25 }
        ]
    }, comp.selectedLayers[0].property('ADBE Effect Parade'), {
        outputDirectory: new Folder(Folder.userData.fsName + '/PseudoFXForge/examples'),
        fileName: 'apply-example.ffx'
    });
    alert(effect.matchName);
}());
