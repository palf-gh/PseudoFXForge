import PseudoFXForge, {
    normalise,
    writeFFX,
    applyPseudoEffect,
    PseudoEffectDefinition,
    PseudoEffectControl
} from '../module/PseudoFXForge';

const definition: PseudoEffectDefinition = {
    name: 'Typed effect',
    matchName: 'Pseudo/Typed',
    controls: [
        { id: 'slider', name: 'Slider', type: 'slider', default: 25, unit: 'percent' },
        { id: 'angle', name: 'Angle', type: 'angle', default: 45 },
        { id: 'check', name: 'Checkbox', type: 'checkbox', default: true },
        { id: 'colour', name: 'Colour', type: 'colour', default: [0.2, 0.4, 0.8] },
        { id: 'point', name: 'Point', type: 'point', default: [50, 50] },
        { id: 'point3d', name: 'Point 3D', type: 'point3d', default: [50, 50, 0] },
        { id: 'layer', name: 'Layer', type: 'layer', default: -1 },
        { id: 'dropdown', name: 'Dropdown', type: 'dropdown', items: ['One', 'Two'], default: 1 },
        { id: 'label', name: 'Label', type: 'label' },
        { id: 'group', name: 'Group', type: 'group', open: true, children: [] }
    ]
};

const directory = new Folder(Folder.temp.fsName + '/Forge');
const result = writeFFX(definition, directory, { fileName: 'typed.ffx' });
const file: File = result.file;
const reused: boolean = result.reused;
const matchName: string = normalise(definition).properties.slider.matchName;
const jsonName: string = PseudoFXForge.normalise('{"name":"JSON"}').matchName;
declare const effects: PropertyGroup;
const effect: PropertyGroup = applyPseudoEffect(definition, effects, {
    outputDirectory: directory,
    fileName: 'typed.ffx'
});

// @ts-expect-error Checkboxの初期値は真偽値
const invalidCheckbox: PseudoEffectControl = { id: 'check', name: 'Check', type: 'checkbox', default: 1 };
// @ts-expect-error Pointは2要素
const invalidPoint: PseudoEffectControl = { id: 'point', name: 'Point', type: 'point', default: [1, 2, 3] };
// @ts-expect-error Dropdownの項目は必須
const invalidDropdown: PseudoEffectControl = { id: 'menu', name: 'Menu', type: 'dropdown' };
// @ts-expect-error Groupに初期値はない
const invalidGroup: PseudoEffectControl = { id: 'group', name: 'Group', type: 'group', children: [], default: 1 };
// @ts-expect-error 未知のオプション
writeFFX(definition, directory, { overwrite: true });
// @ts-expect-error 適用先はEffectsのPropertyGroup
applyPseudoEffect(definition, 1);
