# PseudoFXForge

[日本語](#日本語) | [English](#english)

## 日本語

JSONからAfter Effectsの疑似エフェクト用FFXを生成するExtendScriptライブラリです。FFXを指定フォルダーへ保存し、同じ定義のファイルを再利用してレイヤーへ適用できます。

[導入](#導入) | [API](#api) | [JSON仕様](#json仕様) | [エラー](#エラー) | [検証環境](#検証環境) | [開発](#開発)

### 導入

#### ExtendScript

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

#### TypeScript

[module/PseudoFXForge.js](module/PseudoFXForge.js) と [module/PseudoFXForge.d.ts](module/PseudoFXForge.d.ts) を、TSプロジェクト内の同じフォルダーへコピーします。`.js` が実装、`.d.ts` が型定義です。

```ts
import PseudoFXForge, { type PseudoEffectDefinition } from './PseudoFXForge';

const data: PseudoEffectDefinition = {
    name: 'My Effect',
    matchName: 'Pseudo/MyEffect',
    controls: [{ id: 'amount', name: 'Amount', type: 'slider', default: 50 }]
};

PseudoFXForge.writeFFX(data, 'D:/presets');
```

AEの型はプロジェクト側の `types-for-adobe` を使用します。既存のRollup等のビルドで、import/exportが残らないExtendScript形式へまとめてください。[extendscript-ts-template](https://github.com/YukiWorks432/extendscript-ts-template) のような構成で利用できます。適用まで含む例は [examples/typescript.ts](examples/typescript.ts) にあります。

### API

| 関数 | 処理 | 戻り値 |
| --- | --- | --- |
| `normalise(data)` | JSON文字列またはオブジェクトを検証・正規化 | 正規化した定義とプロパティー参照情報 |
| `writeFFX(data, outputDirectory, options)` | FFXを保存。一致する既存ファイルは再利用 | `{ file, matchName, reused }` |
| `applyPseudoEffect(data, effectsProp, options)` | 必要な登録を済ませ、エフェクトを追加 | 追加した `PropertyGroup` |

各関数は `PseudoFXForge` 名前空間から呼び出します。

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

#### matchNameの識別子

入力の `matchName` には定義から生成した識別子が付加されます。式や後続の処理では、正規化結果または生成結果に含まれる実際の `matchName` を使用してください。定義を変更すると、識別子も変わります。

識別子は64ビットのハッシュ値をBase32の13文字で表します。入力の17文字に `_` と13文字を付けても、実際のmatchNameは31文字以内です。`normalise` が返す `fingerprint` は16桁の16進文字列です。

エンコード形式のバージョンも識別子に含まれます。現在の形式は第4版です。

### JSON仕様

[JSON Schema](schema/pseudo-effect.schema.json) はエディターでの入力補助に使えます。全型を含む入力例は [examples/all-controls.json](examples/all-controls.json)、保存と適用の例は [examples/basic.jsx](examples/basic.jsx) と [examples/apply.jsx](examples/apply.jsx) を参照してください。

#### ルート属性

すべて必須です。

| 属性 | 型 | 内容・制約 |
| --- | --- | --- |
| `name` | 文字列 | エフェクトの表示名。空文字列・制御文字は不可 |
| `matchName` | 文字列 | `Pseudo/` で始まる識別名。続けてASCIIの英数字、`.`、`-`、`_` を使用。接頭辞を含めて17文字まで |
| `controls` | コントロールの配列 | 1個以上。グループは `children` で階層化 |

#### コントロールの共通属性

| 属性 | 型 | 必須 | 既定値・制約 |
| --- | --- | --- | --- |
| `id` | 文字列 | 必須 | ASCII英字で始め、英数字と `_` を使用。入れ子を含む定義全体で重複不可 |
| `name` | 文字列 | 必須 | 表示名。空文字列・制御文字は不可。UTF-8で31バイトまで |
| `type` | 文字列 | 必須 | 下表の型名を指定 |
| `invisible` | 真偽値 | 任意 | `false`。すべての型で指定可能 |
| `keyframes` | 真偽値 | 任意 | 値を持つ型のみ。Checkbox・Layer・Dropdownは `false`、それ以外は `true` |
| `hold` | 真偽値 | 任意 | 値を持つ型のみ。`false` |

`default` の型と既定値はコントロール型によって異なります。LabelとGroupには、値やアニメーションの属性を指定できません。

#### コントロール型

| `type` | `default` の型 | 既定値 | 型固有の属性・制約 |
| --- | --- | --- | --- |
| `slider` | 数値 | `0` | 有効範囲・表示範囲・精度・単位は下表を参照 |
| `angle` | 数値 | `0` | 角度。16.16固定小数点で保存 |
| `checkbox` | 真偽値 | `false` | 型固有の追加属性なし |
| `colour` | 数値3要素の配列 | `[0, 0, 0]` | RGB。各要素は0〜1 |
| `point` | 数値2要素の配列 | `[0, 0]` | ソース寸法に対する百分率。16.16固定小数点で保存 |
| `point3d` | 数値3要素の配列 | `[0, 0, 0]` | ソース寸法に対する百分率。倍精度浮動小数点で保存 |
| `layer` | 数値 | `0` | `0` はNone、`-1` はSelf。任意のレイヤー番号は指定不可 |
| `dropdown` | 整数 | `1` | 必須の `items` に1〜32767個の項目名を指定。項目名に `\|` は使用不可。初期値は1から始まる項目番号 |
| `label` | 指定不可 | なし | 値を持たない見出し |
| `group` | 指定不可 | なし | 必須の `children` に子コントロールの配列を指定。`open` は真偽値で、既定値は `true` |

#### Slider設定

| 属性 | 型 | 既定値 | 内容・制約 |
| --- | --- | --- | --- |
| `min` | 数値 | `-1000000` | 有効範囲の下限 |
| `max` | 数値 | `1000000` | 有効範囲の上限 |
| `sliderMin` | 数値 | `max(min, 0)` | 表示範囲の下限 |
| `sliderMax` | 数値 | `min(max, 100)` | 表示範囲の上限 |
| `precision` | 整数 | `2` | 0〜6 |
| `unit` | 文字列 | `none` | `none`、`percent`、`pixels` |

`min <= sliderMin <= sliderMax <= max` を満たし、`default` を有効範囲内にします。

#### 定義全体の制約

未知の属性・型、重複ID、不正な値はエラーになります。名前と項目名には制御文字を含められず、数値は有限値に限ります。数値間の大小関係、UTF-8のバイト数、IDの重複、階層の深さは実行時にも検証します。

グループ階層は16段までです。グループ終端を含めたプロパティー数にも上限があります。

16.16固定小数点の表現範囲は−32768〜32767.99998474121です。保存時に1/65536単位へ丸めます。

### エラー

例外には `code` と `path` を含みます。`path` は入力の位置が特定できる場合に設定します。

| コード | 内容 |
| --- | --- |
| `JSON` | JSON文字列の構文エラー。 |
| `INPUT` | 型・値・属性・適用先が不正。 |
| `IO` | フォルダー作成、読み書き、置き換え、削除の失敗。 |
| `HOST` | 必要なExtendScript／AE環境がない。 |
| `REGISTER` | FFXによる登録に失敗。 |
| `APPLY` | 追加可否の判定、エフェクトの追加に失敗。 |

### 検証環境

対応目標はAfter Effects 2023以降のWindowsとmacOSです。実機で確認したバージョンと結果は、[制作記録](docs/development-log.md)に記載しています。macOSでの動作は未検証です。

2026年10月19日、After Effects 26.5x89／Windowsで `tests/ae-validation.jsx` の20件すべてが成功しました。

実機ではFFX生成・再利用、登録、全コントロール型の初期値、日本語の表示名、入れ子グループ、非表示項目への参照、アニメーション禁止、定義変更後の別登録を確認しました。

Windows／AE 26のUIは手動確認済みで、現時点で問題は報告されていません。macOS・AEの他バージョンでの実機試験は未実施です。

#### AEでの手動検証

1. AEでプロジェクトを開き、スクリプトによるファイルへの書き込みを許可します。
2. 「ファイル」→「スクリプト」→「スクリプトファイルを実行」から [tests/ae-validation.jsx](tests/ae-validation.jsx) を実行します。`tests` と `src` の相対位置を変えずに実行してください。
3. 完了ダイアログとレポートを確認します。Windowsの保存先は `%TEMP%/PseudoFXForge-validation.txt` です。macOSでは `Folder.temp` 配下の同名ファイルに保存します。実際のパスは完了ダイアログに表示します。

### 開発

| コマンド | 処理 |
| --- | --- |
| `npm ci` | 開発用の依存関係を導入 |
| `npm test` | 自動テスト30件、厳格なES3構文検査、モジュール版との実装一致・import・型定義を検査 |
| `npm run sync:module` | JSXINCからモジュール版の実装を同期 |

自動テストは入力検証、バイナリー構造、ファイル操作、適用処理を代替オブジェクトで確認します。AE実機での検証とは区別してください。

JSXINCの本体を変更した後は、モジュール版も同期してください。型検査にはTypeScript 4.9.5とtypes-for-adobe 7.2.6を使用しています。

### ライセンス

[MIT](LICENSE)

## English

An ExtendScript library for generating After Effects pseudo-effect FFX files from JSON. It saves files to a chosen directory, reuses matching files, and applies effects to a layer.

[Installation](#installation) | [API](#api-1) | [JSON definition](#json-definition) | [Errors](#errors) | [Compatibility](#compatibility) | [Development](#development)

### Installation

#### ExtendScript

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

#### TypeScript

Copy [module/PseudoFXForge.js](module/PseudoFXForge.js) and [module/PseudoFXForge.d.ts](module/PseudoFXForge.d.ts) into the same folder in your TS project. The `.js` file contains the implementation; the `.d.ts` file supplies its types.

```ts
import PseudoFXForge, { type PseudoEffectDefinition } from './PseudoFXForge';

const data: PseudoEffectDefinition = {
    name: 'My Effect',
    matchName: 'Pseudo/MyEffect',
    controls: [{ id: 'amount', name: 'Amount', type: 'slider', default: 50 }]
};

PseudoFXForge.writeFFX(data, 'D:/presets');
```

Use your project's `types-for-adobe` definitions for AE types. Bundle with your existing Rollup or equivalent build so that the final ExtendScript contains no import/export statements. This fits configurations such as [extendscript-ts-template](https://github.com/YukiWorks432/extendscript-ts-template). See [examples/typescript.ts](examples/typescript.ts) for an application example.

### API

| Method | Purpose | Result |
| --- | --- | --- |
| `normalise(data)` | Validate and normalise a JSON string or object | Normalised definition and property references |
| `writeFFX(data, outputDirectory, options)` | Write an FFX or reuse an identical file | `{ file, matchName, reused }` |
| `applyPseudoEffect(data, effectsProp, options)` | Register as necessary and add an effect | Added `PropertyGroup` |

Call these methods through `PseudoFXForge`.

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

#### matchName identifiers

A deterministic identifier derived from the definition is appended to the requested `matchName`. Use the actual `matchName` returned by normalisation or generation in expressions and subsequent operations. Changing the definition also changes its identifier.

The suffix encodes the complete 64-bit fingerprint as 13 Base32 characters. With a base of at most 17 characters and an underscore separator, the actual match name remains within 31 characters. The `fingerprint` returned by `normalise` remains a 16-digit hexadecimal string.

The encoding version also contributes to the identifier. The current format is version 4.

### JSON definition

The [JSON Schema](schema/pseudo-effect.schema.json) provides editor assistance. See [examples/all-controls.json](examples/all-controls.json) for every control type, and [examples/basic.jsx](examples/basic.jsx) and [examples/apply.jsx](examples/apply.jsx) for writing and application examples.

#### Root attributes

All three attributes are required.

| Attribute | Type | Meaning and constraints |
| --- | --- | --- |
| `name` | String | Effect display name. Empty strings and control characters are rejected |
| `matchName` | String | Identifier beginning with `Pseudo/`, followed by ASCII letters, digits, `.`, `-`, or `_`. At most 17 characters including the prefix |
| `controls` | Control array | At least one control. Groups nest through `children` |

#### Common control attributes

| Attribute | Type | Required | Default and constraints |
| --- | --- | --- | --- |
| `id` | String | Yes | Begins with an ASCII letter; contains only ASCII letters, digits, and `_`. Unique across the definition, including nested groups |
| `name` | String | Yes | Display name. Non-empty, without control characters, and at most 31 UTF-8 bytes |
| `type` | String | Yes | One of the types below |
| `invisible` | Boolean | No | `false`. Available for every type |
| `keyframes` | Boolean | No | Value controls only. `false` for Checkbox, Layer, and Dropdown; `true` for other value controls |
| `hold` | Boolean | No | Value controls only. `false` |

The type and initial value of `default` depend on the control type. Label and Group reject value and animation attributes.

#### Control types

| `type` | Type of `default` | Default | Additional attributes and constraints |
| --- | --- | --- | --- |
| `slider` | Number | `0` | See the table below for effective bounds, display bounds, precision, and units |
| `angle` | Number | `0` | Angle stored in 16.16 fixed-point format |
| `checkbox` | Boolean | `false` | No additional type-specific attributes |
| `colour` | Three-number array | `[0, 0, 0]` | RGB channels, each within 0–1 |
| `point` | Two-number array | `[0, 0]` | Percentages of the source dimensions, stored in 16.16 fixed-point format |
| `point3d` | Three-number array | `[0, 0, 0]` | Percentages of the source dimensions, stored in double-precision floating-point format |
| `layer` | Number | `0` | `0` selects None; `-1` selects Self. Arbitrary layer indices are rejected |
| `dropdown` | Integer | `1` | Required `items` array with 1–32767 labels. Labels cannot contain `\|`. The initial value is a one-based item number |
| `label` | Not accepted | None | Heading without a value |
| `group` | Not accepted | None | Required `children` array. Boolean `open` defaults to `true` |

#### Slider settings

| Attribute | Type | Default | Meaning and constraints |
| --- | --- | --- | --- |
| `min` | Number | `-1000000` | Lower effective bound |
| `max` | Number | `1000000` | Upper effective bound |
| `sliderMin` | Number | `max(min, 0)` | Lower display bound |
| `sliderMax` | Number | `min(max, 100)` | Upper display bound |
| `precision` | Integer | `2` | 0–6 |
| `unit` | String | `none` | `none`, `percent`, or `pixels` |

Require `min <= sliderMin <= sliderMax <= max` and an initial `default` within the effective bounds.

#### Definition constraints

Unknown attributes or types, duplicate IDs, and invalid values are rejected. Names and item labels cannot contain control characters. Numeric values must be finite. Relationships between numeric bounds, UTF-8 byte lengths, duplicate IDs, and nesting depth are also checked at run time.

Groups can nest up to 16 levels. There is also a property-count limit including group terminators.

The 16.16 fixed-point range is −32768 to 32767.99998474121. Values are rounded to increments of 1/65536 on writing.

### Errors

Exceptions contain `code` and `path`; the latter identifies an input location when applicable.

| Code | Meaning |
| --- | --- |
| `JSON` | invalid JSON syntax. |
| `INPUT` | invalid type, value, attribute, or target. |
| `IO` | directory creation, reading, writing, replacement, or removal failed. |
| `HOST` | required ExtendScript or AE host is unavailable. |
| `REGISTER` | registration through FFX failed. |
| `APPLY` | checking whether the effect can be added, or adding it, failed. |

### Compatibility

The compatibility target is After Effects 2023 and later on Windows and macOS. Tested versions and results are recorded in the [development log](docs/development-log.md). Operation on macOS has not been verified.

On 19 October 2026, all 20 checks in `tests/ae-validation.jsx` passed in After Effects 26.5x89 on Windows.

The native checks cover FFX generation and reuse, registration, initial values across the control types, Japanese display names, nested groups, access to invisible properties, disabled animation, and separate registration after a definition changes.

Manual UI checks on Windows with AE 26 have not identified any issues so far. macOS and other AE versions have not been tested on real machines.

#### Manual validation in AE

1. Open a project in AE and enable script access to file writing.
2. Choose File → Scripts → Run Script File and select [tests/ae-validation.jsx](tests/ae-validation.jsx). Preserve the relative locations of `tests` and `src`.
3. Read the completion dialogue and report. On Windows, the report is `%TEMP%/PseudoFXForge-validation.txt`. On macOS, the same filename is written within `Folder.temp`. The dialogue displays the actual path.

### Development

| Command | Purpose |
| --- | --- |
| `npm ci` | Install development dependencies |
| `npm test` | Run 30 automated tests, strict ES3 syntax checks, and module consistency, import, and type checks |
| `npm run sync:module` | Synchronise the module implementation from JSXINC |

The automated tests check input validation, binary structure, file operations, and application using host doubles. They do not establish compatibility with AE.

Synchronise the module after changing the JSXINC implementation. Type checks use TypeScript 4.9.5 and types-for-adobe 7.2.6.

### Licence

[MIT](LICENSE)
