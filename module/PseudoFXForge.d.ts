/* ============================================================
 * PseudoFXForge v0.1.0
 * Copyright (c) 2026 Palf | MIT License
 * ============================================================ */

export interface ControlBase {
    id: string;
    name: string;
    invisible?: boolean;
}

export interface ValueControlBase extends ControlBase {
    keyframes?: boolean;
    hold?: boolean;
}

export interface SliderControl extends ValueControlBase {
    type: 'slider';
    default?: number;
    min?: number;
    max?: number;
    sliderMin?: number;
    sliderMax?: number;
    precision?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    unit?: 'none' | 'percent' | 'pixels';
}

export interface AngleControl extends ValueControlBase {
    type: 'angle';
    default?: number;
}

export interface CheckboxControl extends ValueControlBase {
    type: 'checkbox';
    default?: boolean;
}

export interface ColourControl extends ValueControlBase {
    type: 'colour';
    default?: [number, number, number];
}

export interface PointControl extends ValueControlBase {
    type: 'point';
    default?: [number, number];
}

export interface Point3DControl extends ValueControlBase {
    type: 'point3d';
    default?: [number, number, number];
}

export interface LayerControl extends ValueControlBase {
    type: 'layer';
    default?: -1 | 0;
}

export interface DropdownControl extends ValueControlBase {
    type: 'dropdown';
    items: string[];
    default?: number;
}

export interface LabelControl extends ControlBase {
    type: 'label';
}

export interface GroupControl extends ControlBase {
    type: 'group';
    children: PseudoEffectControl[];
    open?: boolean;
}

export type PseudoEffectControl =
    | SliderControl
    | AngleControl
    | CheckboxControl
    | ColourControl
    | PointControl
    | Point3DControl
    | LayerControl
    | DropdownControl
    | LabelControl
    | GroupControl;

export interface PseudoEffectDefinition {
    name: string;
    matchName: string;
    controls: PseudoEffectControl[];
}

export type PseudoEffectInput = PseudoEffectDefinition | string;
export type OutputDirectory = string | Folder;

export interface PropertyReference {
    index: number;
    matchName: string;
}

export interface ControlPosition {
    index: number;
}

export type NormalisedControl =
    | (Required<SliderControl> & ControlPosition)
    | (Required<AngleControl> & ControlPosition)
    | (Required<CheckboxControl> & ControlPosition)
    | (Required<ColourControl> & ControlPosition)
    | (Required<PointControl> & ControlPosition)
    | (Required<Point3DControl> & ControlPosition)
    | (Required<LayerControl> & ControlPosition)
    | (Required<DropdownControl> & ControlPosition)
    | (Required<LabelControl> & ControlPosition)
    | (Omit<Required<GroupControl>, 'children'> & ControlPosition & {
        children: NormalisedControl[];
    });

export interface GroupEndControl {
    type: 'endgroup';
    index: number;
}

export interface NormalisedEffect {
    name: string;
    baseMatchName: string;
    matchName: string;
    controls: NormalisedControl[];
    properties: { [id: string]: PropertyReference };
    fingerprint: string;
    canonical: string;
    flat: (NormalisedControl | GroupEndControl)[];
}

export interface WriteFFXOptions {
    fileName?: string;
}

export interface ApplyPseudoEffectOptions extends WriteFFXOptions {
    outputDirectory?: OutputDirectory;
}

export interface WriteFFXResult {
    file: File;
    matchName: string;
    reused: boolean;
}

export interface PseudoFXForgeAPI {
    readonly version: string;
    normalise(data: PseudoEffectInput): NormalisedEffect;
    writeFFX(data: PseudoEffectInput, outputDirectory: OutputDirectory, options?: WriteFFXOptions): WriteFFXResult;
    applyPseudoEffect(data: PseudoEffectInput, effectsProp: PropertyGroup, options?: ApplyPseudoEffectOptions): PropertyGroup;
}

export const version: PseudoFXForgeAPI['version'];
export const normalise: PseudoFXForgeAPI['normalise'];
export const writeFFX: PseudoFXForgeAPI['writeFFX'];
export const applyPseudoEffect: PseudoFXForgeAPI['applyPseudoEffect'];

declare const PseudoFXForge: PseudoFXForgeAPI;
export default PseudoFXForge;
