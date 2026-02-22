# V-Meet Favicon 仕様書

## 1. 概要

V-Meetプロジェクトにブランド認知を高めるfaviconを追加する。モダンブラウザ向けのSVG favicon、レガシーブラウザ向けのPNG fallback、およびiOS/Android向けのタッチアイコンを包括的に定義する。

---

## 2. デザイン方針

### 2.1 モチーフ

ナビゲーション及びフッターで使用されているロゴ要素を踏襲する。

- **主モチーフ**: ビデオカメラアイコン（Lucide "video" アイコンの簡略化）
- **形状**: 角丸正方形（`rounded-xl` = 12px相当の角丸）の背景 + 白抜きのビデオカメラシルエット
- **コンセプト**: ナビバーのロゴ（`w-10 h-10 bg-[#FF6B6B] rounded-xl` にビデオアイコン）をそのままfaviconに落とし込み、ブランドの一貫性を保つ

### 2.2 カラーパレット

| 用途 | カラーコード | 説明 |
|------|-------------|------|
| 背景 | `#FF6B6B` | ブランドプライマリカラー（ピンク/レッド系） |
| アイコン | `#FFFFFF` | 白抜きビデオカメラ |
| ダークモード背景 | `#FF6B6B` | ダークモードでも同色（視認性が高いため変更不要） |

### 2.3 デザイン原則

- **16x16でも識別可能**: ビデオカメラのシルエットはシンプルに保ち、極小サイズでも潰れない形状にする
- **ブランド一貫性**: サイト内ロゴと同じ色・形状比率を維持
- **背景付き**: 透明背景ではなく、角丸正方形の`#FF6B6B`背景を採用し、ブラウザタブ上での視認性を確保

---

## 3. SVG Favicon コード

以下のSVGをインラインで定義する。ナビバーのロゴデザイン（角丸正方形 + ビデオカメラアイコン）を忠実に再現している。

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <!-- 角丸正方形の背景 (#FF6B6B) -->
  <rect width="32" height="32" rx="8" ry="8" fill="#FF6B6B"/>
  <!-- ビデオカメラアイコン（白抜き） -->
  <!-- 本体部分: 角丸長方形 -->
  <rect x="5" y="9" width="16" height="14" rx="2" ry="2" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- レンズ部分: 三角形（polygon） -->
  <polygon points="21,12 27,8.5 27,23.5 21,20" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### 3.1 デザイン解説

- **viewBox**: `0 0 32 32` - 32x32の座標系で定義
- **背景**: `rx="8"` の角丸正方形。32pxの25%で、サイトのロゴ（`rounded-xl`）と同等の比率
- **カメラ本体**: 左側に配置された角丸長方形（`5,9` から `21,23`）
- **レンズ部分**: 右側の三角形（ポリゴン）。Lucide "video" アイコンのデザインを踏襲
- **ストロークスタイル**: `stroke-width="2"` で小サイズでの視認性を確保。`stroke-linecap="round"` と `stroke-linejoin="round"` で柔らかい印象を維持

---

## 4. 必要なファイル一覧

| ファイル名 | サイズ | 用途 | 配置場所 |
|-----------|--------|------|---------|
| `favicon.svg` | - (ベクター) | モダンブラウザ向けSVG favicon | `/favicon.svg` |
| `favicon-32x32.png` | 32x32 px | レガシーブラウザ向けPNG | `/favicon-32x32.png` |
| `favicon-16x16.png` | 16x16 px | レガシーブラウザ向けPNG（小） | `/favicon-16x16.png` |
| `apple-touch-icon.png` | 180x180 px | iOS Safari ホーム画面追加用 | `/apple-touch-icon.png` |
| `favicon.ico` | 32x32 px | 最終フォールバック（IE等） | `/favicon.ico` |

### 4.1 各ファイルの詳細仕様

#### favicon.svg
- 上記セクション3のSVGコードをそのままファイルとして保存
- ファイルサイズ: 約500バイト以下

#### favicon-32x32.png / favicon-16x16.png
- SVGからラスタライズして生成
- 背景色: `#FF6B6B`
- アイコン色: `#FFFFFF`
- アンチエイリアス有効
- 透過なし（背景色を維持）

#### apple-touch-icon.png
- サイズ: 180x180 px
- SVGと同じデザインだが、以下を調整:
  - パディング: 周囲に約20pxのマージンを追加（iOSがアイコンを角丸にクリップするため）
  - 背景: `#FF6B6B` で全面塗りつぶし
  - アイコン部分を中央に配置し、140x140px程度のサイズで描画

#### favicon.ico
- 32x32 PNG をICO形式に変換
- レガシーブラウザの最終フォールバック用

---

## 5. HTMLに追加するタグ

`index.html` の `<head>` セクション内、`<title>` タグの直後に以下を追加する:

```html
<!-- Favicon -->
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png">
<link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<link rel="shortcut icon" href="/favicon.ico">
```

### 5.1 タグの順序と優先度

1. **SVG** (`type="image/svg+xml"`): モダンブラウザ（Chrome, Firefox, Edge, Safari 15+）が優先的に使用
2. **PNG 32x32**: SVG非対応ブラウザ向け
3. **PNG 16x16**: 小さいタブ表示領域向け
4. **apple-touch-icon**: iOS Safari でホーム画面に追加した際に使用
5. **favicon.ico**: 最終フォールバック

---

## 6. 実装手順

### Step 1: SVG ファイルの作成

セクション3のSVGコードを `C:\home\V-MEET\favicon.svg` として保存する。

### Step 2: PNG ファイルの生成

SVGファイルから各サイズのPNGを生成する。以下のいずれかの方法を使用:

**方法A: オンラインツール**
- [RealFaviconGenerator](https://realfavicongenerator.net/) にSVGをアップロード
- 全サイズが自動生成される

**方法B: コマンドライン（Inkscape）**
```bash
# 32x32 PNG
inkscape favicon.svg --export-type=png --export-filename=favicon-32x32.png -w 32 -h 32

# 16x16 PNG
inkscape favicon.svg --export-type=png --export-filename=favicon-16x16.png -w 16 -h 16

# 180x180 apple-touch-icon
inkscape favicon.svg --export-type=png --export-filename=apple-touch-icon.png -w 180 -h 180
```

**方法C: コマンドライン（ImageMagick）**
```bash
# 32x32 PNG
magick convert -background none -resize 32x32 favicon.svg favicon-32x32.png

# 16x16 PNG
magick convert -background none -resize 16x16 favicon.svg favicon-16x16.png

# 180x180 apple-touch-icon（パディング付き）
magick convert -background "#FF6B6B" -resize 140x140 -gravity center -extent 180x180 favicon.svg apple-touch-icon.png

# ICO生成
magick convert favicon-32x32.png favicon.ico
```

### Step 3: ファイルの配置

生成した全ファイルをプロジェクトルート（`C:\home\V-MEET\`）に配置する:

```
C:\home\V-MEET\
  favicon.svg
  favicon-32x32.png
  favicon-16x16.png
  apple-touch-icon.png
  favicon.ico
  index.html
  images/
    ...
```

### Step 4: HTMLの更新

`index.html` の `<head>` セクション内、`<title>` タグの直後に favicon用の `<link>` タグを追加する（セクション5参照）。

### Step 5: 動作確認

以下のブラウザ/環境でfaviconの表示を確認する:

| 確認項目 | 確認環境 |
|---------|---------|
| SVG favicon表示 | Chrome, Firefox, Edge（最新版） |
| PNG fallback表示 | Safari 14以前、または開発者ツールでSVGを無効化 |
| apple-touch-icon | iOS Safari「ホーム画面に追加」 |
| favicon.ico | IE11（必要に応じて） |
| タブでの視認性 | 複数タブ開設時に他サイトと区別できるか |
| ダークモード | OS/ブラウザのダークモード設定時の視認性 |

---

## 7. ブラウザ対応表

| ブラウザ | SVG | PNG | ICO | apple-touch-icon |
|---------|-----|-----|-----|-----------------|
| Chrome 80+ | o | o | o | - |
| Firefox 41+ | o | o | o | - |
| Edge 80+ | o | o | o | - |
| Safari 15+ | o | o | o | o |
| Safari 9-14 | x | o | o | o |
| iOS Safari | - | - | - | o |
| IE11 | x | o | o | - |

---

## 8. 将来の拡張

- **Web App Manifest**: PWA対応時に `manifest.json` を追加し、192x192 および 512x512 のアイコンを定義
- **Microsoft Tile**: Windows ピン留め用の `browserconfig.xml` と `mstile-150x150.png`
- **ダークモード対応SVG**: `prefers-color-scheme` メディアクエリをSVG内に埋め込み、ダークモード時に背景色を調整する（現状の `#FF6B6B` は十分に視認性が高いため、初期実装では不要）
