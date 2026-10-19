import PseudoFXForge, { type PseudoEffectDefinition } from '../module/PseudoFXForge';

const definition: PseudoEffectDefinition = {
    name: 'Forge Example',
    matchName: 'Pseudo/Example',
    controls: [
        { id: 'amount', name: 'Amount', type: 'slider', default: 50 }
    ]
};

const comp = app.project.activeItem;
if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) {
    throw new Error('Select a layer in a composition.');
}

const effects = comp.selectedLayers[0].property('ADBE Effect Parade') as PropertyGroup;
PseudoFXForge.applyPseudoEffect(definition, effects, {
    outputDirectory: new Folder(Folder.userData.fsName + '/PseudoFXForge')
});
