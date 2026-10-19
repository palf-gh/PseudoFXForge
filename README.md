# PseudoFXForge

[日本語](#日本語) | [English](#english)

## 日本語

JSONからAfter Effectsの疑似エフェクト用FFXを生成するExtendScriptライブラリです。FFXを指定フォルダーへ保存し、同じ定義のファイルを再利用してレイヤーへ適用できます。

実行時にNode.js、CEP、外部コマンドは必要ありません。

### 導入

配布用の `PseudoFXForge.jsxinc` をスクリプトから `#include` してください。After Effectsの環境設定で、スクリプトによるファイルへの書き込みを許可します。

リポジトリ内では本体は `src/PseudoFXForge.jsxinc` にあります。配布先でも単体で使用できます。

```javascript
#include 'src/PseudoFXForge.jsxinc'

var data = {
    name: 'Example',
    matchName: 'Pseudo/Demo',
    controls: [
        { id: 'amount', name: 'Amount', type: 'slider', 'default': 50,
          min: 0, max: 100, unit: 'percent' }
    ]
};
var saved = PseudoFXForge.writeFFX(data, new Folder('D:/Presets'));
// saved.file: File、saved.matchName: 実際のmatchName
```

Windows専用のパスを例示しています。macOSでは保存先を置き換えてください。

### API

- `PseudoFXForge.normalise(data)`：JSON文字列またはオブジェクトを検証・正規化します。
- `PseudoFXForge.writeFFX(data, outputDirectory, options)`：FFXを保存します。一致する既存ファイルがあれば再利用します。
- `PseudoFXForge.applyPseudoEffect(data, effectsProp, options)`：必要な登録を済ませ、指定したEffectsプロパティへ疑似エフェクトを追加します。

入力の `matchName` には定義から生成した識別子が付加されます。式や後続の処理では、正規化結果または生成結果に含まれる実際の `matchName` を使用してください。定義を変更すると、識別子も変わります。

識別子は64ビットの指紋をBase32の13文字で表します。入力の17文字に `_` と13文字を付けても、実際のmatchNameは31文字以内です。`normalise` が返す `fingerprint` は従来どおり16桁の16進文字列です。

エンコード形式の版も識別子に含めます。現在は第2版で、修正前にAEへ部分登録された定義と同じmatchNameを再利用しないようにしています。

#### normalise(data)

`data` はJSON文字列またはオブジェクトです。JSON文字列は `eval` を使わず解析します。戻り値には次の情報を含みます。

- `name`、`baseMatchName`、`matchName`：表示名、入力のmatchName、実際のmatchName。
- `controls`：既定値を補った定義。`flat` はグループ・ラベルの終端を含むプロパティ順の一覧。
- `properties[id]`：コントロールの `index` と `matchName`。インデックスは1から始まります。
- `fingerprint`、`canonical`：定義の識別子と正規化した比較用文字列。

正規化結果の内部用フィールドを入力へ混ぜないでください。保存・適用には元の定義を渡します。

グループとラベルの終端もプロパティ番号に含まれるため、入力配列の位置から番号を計算せず、`properties[id].index` を使用してください。

#### writeFFX(data, outputDirectory, options)

保存先はフォルダーのパス文字列または `Folder` です。存在しないフォルダーは作成します。`options.fileName` で拡張子 `.ffx` を持つファイル名を指定できます。ディレクトリー部分は含められません。省略時は実際のmatchNameから決定します。

戻り値は `{ file: File, matchName: String, reused: Boolean }` です。既存ファイルの内容が完全に一致する場合だけ `reused` が `true` になります。不一致・破損の場合は再生成します。短い識別子だけで内容の一致を判断しません。

保存時は一時ファイルへ書き込み、読み直して検証してから置き換えます。既存ファイルは置き換えの間バックアップします。ファイル操作の失敗は例外になります。

#### applyPseudoEffect(data, effectsProp, options)

`effectsProp` にはレイヤーの `property('ADBE Effect Parade')` を渡します。戻り値は追加した `PropertyGroup` です。`options.outputDirectory` で保存先、`options.fileName` でファイル名を指定できます。既定保存先は `Folder.userData` 配下の `PseudoFXForge` です。

```javascript
var effect = PseudoFXForge.applyPseudoEffect(
    data,
    layer.property('ADBE Effect Parade'),
    { outputDirectory: new Folder('D:/Presets'), fileName: 'example.ffx' }
);
var info = PseudoFXForge.normalise(data);
effect.property(info.properties.amount.index).setValue(75);
```

既に追加可能なmatchNameならそのまま追加します。未登録の場合はFFXを用意し、一時コンポジション内で適用して登録してから対象へ追加します。一時項目は成功・失敗にかかわらず除去し、選択状態を復元します。既存プロジェクトが必要です。

既に登録済みの場合はFFXの書き込みを省略します。指定先への出力や既存ファイルの照合を必ず実行したい場合は、先に `writeFFX` を呼んでください。上の保存先はWindowsの例です。

AEはプロパティ追加時に既存のプロパティ参照を無効にすることがあります。複数のエフェクトを順に追加する場合は、必要に応じてレイヤーからプロパティを取り直してください。

### JSON仕様

入力例は [全コントロールの定義](examples/all-controls.json)、[保存するスクリプト](examples/basic.jsx)、[選択レイヤーへ適用するスクリプト](examples/apply.jsx) を参照してください。[JSON Schema](schema/pseudo-effect.schema.json) はエディターでの入力補助に使えます。型をまたぐ数値関係、UTF-8のバイト数、IDの重複、階層の深さは実行時にも検証します。

ルートの必須属性は `name`、`matchName`、`controls` です。`controls` は空にできません。`matchName` は `Pseudo/` で始め、続けてASCIIの英数字、`.`、`-`、`_` を使用します。接頭辞を含めて17文字までです。

各コントロールには `id`、`name`、`type` が必要です。`id` はASCII英字で始め、英数字と `_` を使用します。入れ子も含め、定義全体で重複できません。コントロール名はUTF-8で31バイトまでです。名前・項目名には制御文字を含められません。未知の属性や型はエラーになります。

共通属性 `invisible` の既定値は `false` です。値を持つ型では `keyframes` と `hold` も指定できます。`keyframes` はCheckbox・Layer・Dropdownで `false`、それ以外で `true` が既定値です。`hold` の既定値は `false` です。

- `slider`：`default` は0、`min` は−1000000、`max` は1000000、`precision` は2。精度は0〜6です。`sliderMin` は `max(min, 0)`、`sliderMax` は `min(max, 100)` が既定値です。`min <= sliderMin <= sliderMax <= max` を満たし、初期値を有効範囲内にします。`unit` は `none`（既定）、`percent`、`pixels` です。
- `angle`：`default` は角度の数値で、既定値は0です。16.16固定小数点で保存します。
- `checkbox`：`default` は真偽値で、既定値は `false` です。
- `colour`：`default` は0〜1のRGB配列です。既定値は `[0, 0, 0]` です。
- `point`、`point3d`：`default` はそれぞれ2要素・3要素の数値配列です。ソース寸法に対する百分率を指定し、各要素の既定値は0です。2Dは16.16固定小数点、3Dは倍精度浮動小数点で保存します。
- `layer`：`default` は0（None）または−1（Self）です。既定値は0です。任意のレイヤー番号は指定できません。
- `dropdown`：`items` に1〜32767個の項目名を指定します。項目名に `|` は使えません。`default` は1から始まる項目番号で、既定値は1です。
- `label`：値を持たない見出しです。値やアニメーションの属性は指定できません。
- `group`：`children` に子コントロールの配列を指定します。`open` は `true` が既定値です。値やアニメーションの属性は指定できません。

グループ階層は16段までです。グループ終端も含めたプロパティ数には上限があります。数値には有限値を指定してください。

16.16固定小数点の表現範囲は−32768〜32767.99998474121で、保存時に1/65536単位へ丸めます。

### エラー

例外には `code` と `path` を含みます。`path` は入力の位置が特定できる場合に設定します。

- `JSON`：JSON文字列の構文エラー。
- `INPUT`：型・値・属性・適用先が不正。
- `IO`：フォルダー作成、読み書き、置き換え、削除の失敗。
- `HOST`：必要なExtendScript／AE環境がない。
- `REGISTER`：FFXによる登録に失敗。
- `APPLY`：登録済みエフェクトの追加に失敗。

### 検証環境

対応目標はAfter Effects 2023以降のWindowsとmacOSです。実機で確認したバージョンと結果は、[制作記録](docs/development-log.md)に記載します。macOSでの動作は未検証です。

開発用の依存関係を `npm ci` で導入し、`npm test` で自動テスト30件と厳格なES3構文検査を実行します。これらは入力検証、バイナリー構造、ファイル操作、適用処理を代替オブジェクトで確認します。AE実機での検証とは区別してください。Node.jsとAcornは開発用であり、配布ライブラリの実行には不要です。

2026年10月19日、After Effects 26.5x89／Windowsで `tests/ae-validation.jsx` の20件すべてが成功しました。実機レポートと確認範囲は[制作記録](docs/development-log.md)に記載しています。

#### AEでの手動検証

1. AEでプロジェクトを開き、スクリプトによるファイルへの書き込みを許可します。
2. 「ファイル」→「スクリプト」→「スクリプトファイルを実行」から [tests/ae-validation.jsx](tests/ae-validation.jsx) を実行します。`tests` と `src` の相対位置を変えずに実行してください。
3. 完了ダイアログとレポートを確認します。Windowsの保存先は `%TEMP%/PseudoFXForge-validation.txt` です。macOSでは `Folder.temp` 配下の同名ファイルに保存します。実際のパスは完了ダイアログに表示します。

実機では、FFX生成・再利用、登録、全コントロール型の初期値、日本語の表示名、入れ子グループ、非表示項目への参照、アニメーション禁止、定義変更後の別登録を確認しました。

表示範囲・精度・単位・Dropdownの項目表示・グループの開閉状態を含む全UI属性の目視確認と、macOS・AEの他バージョンでの実機試験は未実施です。

### ライセンス

[MIT](LICENSE)

## English

An ExtendScript library for generating After Effects pseudo-effect FFX files from JSON. It saves files to a chosen directory, reuses matching files, and applies effects to a layer.

The library requires no Node.js, CEP, or external commands at runtime.

### Installation

Include the distributed `PseudoFXForge.jsxinc` in your script with `#include`. Enable script access to file writing in the After Effects preferences.

The source file is `src/PseudoFXForge.jsxinc`. It can be distributed and used on its own.

```javascript
#include 'src/PseudoFXForge.jsxinc'
var data = {
    name: 'Example',
    matchName: 'Pseudo/Demo',
    controls: [
        { id: 'amount', name: 'Amount', type: 'slider', 'default': 50,
          min: 0, max: 100, unit: 'percent' }
    ]
};
var saved = PseudoFXForge.writeFFX(data, new Folder('D:/Presets'));
```

Replace the Windows path with your chosen directory on macOS.

### API

- `PseudoFXForge.normalise(data)` validates and normalises a JSON string or object.
- `PseudoFXForge.writeFFX(data, outputDirectory, options)` writes an FFX file or reuses an identical existing file.
- `PseudoFXForge.applyPseudoEffect(data, effectsProp, options)` registers the definition when necessary, then adds the pseudo effect to the supplied Effects property group.

A deterministic identifier derived from the definition is appended to the requested `matchName`. Use the actual `matchName` returned by normalisation or generation in expressions and subsequent operations. Changing the definition also changes its identifier.

The suffix encodes the complete 64-bit fingerprint as 13 Base32 characters. With a base of at most 17 characters and an underscore separator, the actual match name remains within 31 characters. The `fingerprint` returned by `normalise` remains a 16-digit hexadecimal string.

The encoding version also contributes to the identifier. Version 2 prevents reuse of a match name belonging to a definition partially registered in AE before the corrections.

#### normalise(data)

Pass a JSON string or an object. JSON strings are parsed without `eval`. The result contains:

- `name`, `baseMatchName`, `matchName`: the display name, requested match name, and actual match name.
- `controls`: the normalised definition with defaults; `flat`: the property sequence, including group and label terminators.
- `properties[id]`: the control's one-based `index` and `matchName`.
- `fingerprint`, `canonical`: the deterministic identifier and canonical definition text.

Pass the original definition to the write and apply methods. Do not add internal normalisation fields to the input.

Group and label terminators also occupy property indices. Use `properties[id].index` instead of calculating an index from the input array position.

#### writeFFX(data, outputDirectory, options)

The directory accepts a path string or `Folder`. Missing directories are created. `options.fileName` selects a safe basename ending in `.ffx`; directory components are rejected. The default filename derives from the actual match name.

The result is `{ file: File, matchName: String, reused: Boolean }`. `reused` is `true` only when the complete existing contents match. Mismatching or damaged files are regenerated; a short identifier alone does not establish equality.

The writer verifies a temporary file before replacing the destination, retaining a backup during replacement. Failed file operations throw an exception.

#### applyPseudoEffect(data, effectsProp, options)

Supply the layer's `property('ADBE Effect Parade')`. The method returns the added `PropertyGroup`. Set `options.outputDirectory` and `options.fileName` to choose the cached file location. The default directory is `PseudoFXForge` within `Folder.userData`.

```javascript
var effect = PseudoFXForge.applyPseudoEffect(
    data,
    layer.property('ADBE Effect Parade'),
    { outputDirectory: new Folder('D:/Presets'), fileName: 'example.ffx' }
);
var info = PseudoFXForge.normalise(data);
effect.property(info.properties.amount.index).setValue(75);
```

If AE can already add the match name, the method adds it directly. Otherwise it prepares the FFX, registers it through a temporary composition, then adds the effect to the target. Temporary items are removed on success or failure, and selection is restored. An existing project is required.

When the match name is already registered, the method skips writing the FFX. Call `writeFFX` first if you require output or comparison at the chosen location regardless of registration. The directory above is a Windows example.

AE can invalidate existing property references when adding a property. Reacquire references from the layer as necessary when adding several effects.

### JSON definition

See the [complete control example](examples/all-controls.json), [write example](examples/basic.jsx), and [apply example](examples/apply.jsx). The [JSON Schema](schema/pseudo-effect.schema.json) provides editor assistance. The runtime additionally validates relationships between numeric bounds, UTF-8 byte lengths, duplicate IDs, and nesting depth.

The root requires `name`, `matchName`, and a non-empty `controls` array. The match name begins with `Pseudo/`, followed by ASCII letters, digits, `.`, `-`, or `_`, with a maximum of 17 characters including the prefix.

Every control requires `id`, `name`, and `type`. IDs begin with an ASCII letter and contain only ASCII letters, digits, and `_`. IDs must be unique across the whole definition, including nested groups. Control names are limited to 31 UTF-8 bytes. Names and item labels cannot contain control characters. Unknown types and attributes are rejected.

The common `invisible` attribute defaults to `false`. Value controls also accept `keyframes` and `hold`. `keyframes` defaults to `false` for Checkbox, Layer, and Dropdown, and `true` for other value controls. `hold` defaults to `false`.

- `slider`: `default` is 0; `min` is −1000000; `max` is 1000000; `precision` is 2, within 0–6. `sliderMin` defaults to `max(min, 0)` and `sliderMax` to `min(max, 100)`. Require `min <= sliderMin <= sliderMax <= max` and an initial value within the effective bounds. `unit` accepts `none` (default), `percent`, or `pixels`.
- `angle`: numeric angle, default 0, stored in 16.16 fixed-point format.
- `checkbox`: Boolean `default`, initially `false`.
- `colour`: RGB array with each channel in 0–1, initially `[0, 0, 0]`.
- `point`, `point3d`: arrays of two or three numbers respectively, expressed as percentages of the source dimensions and initially all zero. 2D values use 16.16 fixed-point format; 3D values use double-precision floating-point format.
- `layer`: `default` is 0 (None, the default) or −1 (Self). Arbitrary layer indices are rejected.
- `dropdown`: required `items` with 1–32767 labels; labels cannot contain `|`. `default` is a one-based item number, initially 1.
- `label`: a heading without a value; value and animation attributes are rejected.
- `group`: required `children` array; `open` defaults to `true`. Value and animation attributes are rejected.

Groups can nest up to 16 levels. There is also a property-count limit including group terminators. Numeric values must be finite.

The 16.16 fixed-point range is −32768 to 32767.99998474121. Values are rounded to increments of 1/65536 on writing.

### Errors

Exceptions contain `code` and `path`; the latter identifies an input location when applicable.

- `JSON`: invalid JSON syntax.
- `INPUT`: invalid type, value, attribute, or target.
- `IO`: directory creation, reading, writing, replacement, or removal failed.
- `HOST`: required ExtendScript or AE host is unavailable.
- `REGISTER`: registration through FFX failed.
- `APPLY`: adding the registered effect failed.

### Compatibility

The compatibility target is After Effects 2023 and later on Windows and macOS. Tested versions and results are recorded in the [development log](docs/development-log.md). Operation on macOS has not been verified.

Install development dependencies with `npm ci`, then run `npm test` for 30 automated tests and a strict ES3 syntax check. These check validation, binary structure, file operations, and application using host doubles. They do not establish compatibility with AE. Node.js and Acorn are development dependencies; the distributed library does not require them at run time.

On 19 October 2026, all 20 checks in `tests/ae-validation.jsx` passed in After Effects 26.5x89 on Windows. See the [development log](docs/development-log.md) for the tested scope.

#### Manual validation in AE

1. Open a project in AE and enable script access to file writing.
2. Choose File → Scripts → Run Script File and select [tests/ae-validation.jsx](tests/ae-validation.jsx). Preserve the relative locations of `tests` and `src`.
3. Read the completion dialogue and report. On Windows, the report is `%TEMP%/PseudoFXForge-validation.txt`. On macOS, the same filename is written within `Folder.temp`. The dialogue displays the actual path.

The native checks cover FFX generation and reuse, registration, initial values across the control types, Japanese display names, nested groups, access to invisible properties, disabled animation, and separate registration after a definition changes.

Visual inspection of every UI attribute, including display ranges, precision, units, Dropdown item labels, and group expansion, remains outstanding. macOS and other AE versions have not been tested on real machines.

### Licence

[MIT](LICENSE)
