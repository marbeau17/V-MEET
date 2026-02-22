# Tailwind CSS 本番ビルド仕様書

## 概要

V-Meet ランディングページで使用している Tailwind CSS を、開発用 CDN (`cdn.tailwindcss.com`) から本番用のビルド済み CSS ファイルに移行する。これにより、未使用クラスの除去（パージ）による CSS ファイルサイズの大幅削減、ページ読み込み速度の向上、CDN 障害リスクの排除を実現する。

ビルドツールには **Tailwind CSS CLI (standalone)** を採用し、Node.js / npm に依存しない軽量な構成とする。

---

## 現状分析

### プロジェクト構成

```
C:\home\V-MEET\
├── index.html          ← 単一 HTML ファイル（全コンテンツ）
├── images/             ← 11 枚の画像アセット
├── .vercel/            ← Vercel デプロイ設定
└── .gitignore
```

### 現在の CSS 読み込み方法

```html
<script src="https://cdn.tailwindcss.com"></script>
```

- Tailwind CSS の開発用 CDN（JIT コンパイル版）
- ブラウザ側で JavaScript により全ユーティリティを動的生成
- 本番利用は非推奨（公式ドキュメントにも明記）
- 転送サイズ: スクリプト約 113 KB（gzip）+ ランタイム処理コスト

### 使用中の Tailwind ユーティリティクラス（主要分類）

| カテゴリ | 主要クラス |
|---|---|
| レイアウト | `flex`, `grid`, `grid-cols-2`, `md:grid-cols-3`, `md:grid-cols-4`, `flex-col`, `flex-1`, `items-center`, `justify-center`, `justify-between`, `gap-*` |
| スペーシング | `p-*`, `px-*`, `py-*`, `pt-*`, `pb-*`, `m-*`, `mx-auto`, `space-y-*` |
| サイズ | `w-full`, `w-10`, `w-12`, `w-14`, `w-16`, `w-24`, `w-[300px]`, `h-*`, `max-w-4xl`, `max-w-5xl`, `max-w-6xl`, `aspect-[3/4]` |
| タイポグラフィ | `text-xs`, `text-sm`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`, `text-4xl`, `text-5xl`, `text-6xl`, `font-bold`, `font-medium`, `font-normal`, `leading-tight`, `leading-relaxed`, `tracking-tight`, `tracking-widest`, `tracking-tighter`, `uppercase`, `italic` |
| 色 | `text-white`, `text-slate-*`, `text-pink-*`, `text-green-500`, `text-red-500`, `bg-white`, `bg-slate-*`, `bg-pink-*`, `bg-[#FF6B6B]`, `bg-[#FF8E8E]`, `border-slate-*`, `border-pink-*`, `border-white/*` |
| ボーダー / 角丸 | `rounded-full`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-[1.5rem]`, `rounded-[2rem]`, `rounded-[2.5rem]`, `rounded-[3rem]`, `rounded-[3.5rem]`, `rounded-[4rem]`, `border-*` |
| エフェクト | `shadow-lg`, `shadow-xl`, `shadow-2xl`, `opacity-*`, `blur-3xl`, `backdrop-blur`, `backdrop-blur-md`, `backdrop-blur-lg`, `backdrop-blur-xl`, `ring-2`, `ring-white` |
| 配置 / 表示 | `relative`, `absolute`, `fixed`, `inset-0`, `top-*`, `right-*`, `bottom-*`, `left-*`, `z-10`, `z-50`, `overflow-hidden`, `hidden`, `md:flex`, `inline-block`, `col-span-1` |
| トランジション | `transition-all`, `transition-colors`, `transition-transform`, `duration-700` |
| アニメーション | `animate-bounce`, `animate-pulse` |
| レスポンシブ | `md:flex-row`, `md:grid-cols-3`, `md:grid-cols-4`, `md:text-4xl`, `md:text-5xl`, `md:text-6xl`, `sm:flex-row`, `md:flex`, `md:grid-cols-2` |
| グラデーション | `bg-gradient-to-t`, `from-black/60`, `via-transparent`, `to-transparent`, `from-black/40` |
| その他 | `object-cover`, `flex-shrink-0`, `cursor-pointer`, `group`, `group-hover:*`, `hover:*`, `scale-105`, `scale-125`, `underline`, `decoration-*`, `underline-offset-4` |

### 任意値（Arbitrary Values）の使用

```
bg-[#FF6B6B]  bg-[#FF8E8E]  text-[#FF6B6B]
border-[#FF6B6B]/10  hover:border-[#FF6B6B]  hover:text-[#FF6B6B]  hover:bg-[#FF6B6B]  hover:bg-[#FF8E8E]
w-[300px]  rounded-[3.5rem]  rounded-[2.5rem]  rounded-[3rem]  rounded-[2rem]  rounded-[1.5rem]  rounded-[4rem]
text-[10px]  text-[11px]  text-[8px]
aspect-[3/4]
border-[12px]
bg-white/20  bg-white/90  bg-black/50  bg-black/40  bg-black/60
border-white/70  border-white/10  border-white/20
border-pink-400/30
```

### カスタム CSS（`<style>` タグ内）

以下の 7 つのカスタムクラスが定義されている。これらは Tailwind ユーティリティでは表現しきれない複合スタイルである。

| クラス名 | 用途 | 使用箇所数 |
|---|---|---|
| `.hero-gradient` | ヒーローセクション背景グラデーション | 1 |
| `.btn-primary` | プライマリボタン（グラデーション + ホバーエフェクト） | 3 |
| `.glass-card` | ガラスモーフィズムカード | 2 |
| `.step-number` | ステップ番号バッジ（丸形） | 3 |
| `.profile-card:hover img` | プロフィールカード画像ホバーズーム | 4 |
| `.anime-shadow` | ソフトシャドウエフェクト | 5 |
| `.badge-new` | NEWバッジ（**未使用** - HTML内に該当要素なし） | 0 |

### 外部依存

| リソース | URL | 用途 |
|---|---|---|
| Tailwind CSS CDN | `https://cdn.tailwindcss.com` | ユーティリティ CSS（**置換対象**） |
| Google Fonts | `fonts.googleapis.com` | Inter / Noto Sans JP フォント |
| Lucide Icons | `unpkg.com/lucide@0.263.1` | SVG アイコン |

---

## 採用アプローチ

### Tailwind CSS CLI (Standalone) を採用

**理由:**

1. **Node.js 不要** - 単一バイナリで動作。CI/CD 環境やチームメンバーの環境構築が不要
2. **プロジェクト構成との親和性** - 単一 HTML + 画像のみの構成に対して npm/package.json は過剰
3. **公式サポート** - Tailwind Labs が公式に提供するスタンドアロン CLI
4. **パージ（Tree-shaking）** - 使用クラスのみを出力するため、CSS サイズを数百 KB → 数 KB に削減

### バージョン

- Tailwind CSS CLI Standalone **v3.4.x**（最新安定版）

> **注意:** Tailwind v4 は設定体系が大幅に変更されている。現プロジェクトの規模では v3 系で十分であり、安定性を優先して v3.4.x を採用する。v4 への移行は将来の別タスクとする。

---

## 実装手順

### 1. Tailwind CLI Standalone のダウンロード

```bash
# Windows 用バイナリをダウンロード
curl -sLO https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-windows-x64.exe

# プロジェクトルートに配置（.gitignore に追加済み前提）
mv tailwindcss-windows-x64.exe C:\home\V-MEET\tailwindcss.exe
```

### 2. tailwind.config.js の作成

```js
// C:\home\V-MEET\tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

- `content` に `index.html` を指定し、使用クラスのスキャン対象とする
- テーマ拡張は不要（全て任意値 `[#FF6B6B]` 等で直接指定済み）

### 3. 入力 CSS ファイルの作成

```css
/* C:\home\V-MEET\src\input.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* === カスタム CSS（既存 <style> タグから移植） === */

body {
    font-family: 'Inter', 'Noto Sans JP', sans-serif;
    scroll-behavior: smooth;
}

.hero-gradient {
    background: linear-gradient(135deg, #fffafa 0%, #fff 100%);
}

.btn-primary {
    background: linear-gradient(90deg, #FF6B6B 0%, #FF8E8E 100%);
    transition: all 0.3s ease;
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px -10px rgba(255, 107, 107, 0.5);
}

.glass-card {
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.4);
}

.step-number {
    background: #FF6B6B;
    color: white;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-weight: bold;
}

.profile-card:hover img {
    transform: scale(1.05);
}

.anime-shadow {
    box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.1);
}

/* badge-new は未使用のため移植しない */
```

**カスタム CSS の扱い:**

- `<style>` タグから `src/input.css` の `@tailwind utilities;` の後に移植する
- Tailwind のディレクティブの後に配置することで、カスタムクラスが Tailwind ユーティリティを上書き可能
- 未使用の `.badge-new` は移植しない（不要コード削除）
- `body` のフォント指定と `scroll-behavior` も `input.css` に含める

### 4. CSS ビルドコマンド

```bash
# 開発時（ウォッチモード）
./tailwindcss.exe -i src/input.css -o dist/output.css --watch

# 本番ビルド（圧縮）
./tailwindcss.exe -i src/input.css -o dist/output.css --minify
```

### 5. index.html の修正

```html
<!-- 削除 -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- 削除: <style> タグ全体 -->

<!-- 追加: ビルド済み CSS の読み込み（Google Fonts の後に配置） -->
<link href="dist/output.css" rel="stylesheet">
```

変更箇所（index.html の `<head>` 内）:

```html
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="...">
    <meta property="og:title" content="...">
    <meta property="og:description" content="...">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <title>V-Meet | 文字より、10分。会う前の違和感をゼロに。</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
    <link href="dist/output.css" rel="stylesheet">
    <script src="https://unpkg.com/lucide@0.263.1"></script>
</head>
```

### 6. .gitignore の更新

```gitignore
# Tailwind CLI binary
tailwindcss.exe
tailwindcss-*

# OS files
.DS_Store
Thumbs.db
```

`dist/output.css` は **Git に含める**（ビルド成果物としてデプロイに必要なため）。CI/CD パイプラインが整備されるまではローカルビルド → コミットの運用とする。

### 7. ビルド検証

```bash
# 1. 本番ビルド実行
./tailwindcss.exe -i src/input.css -o dist/output.css --minify

# 2. ファイルサイズ確認（目標: 20KB 以下）
ls -lh dist/output.css

# 3. ブラウザで index.html を開き、全セクションの表示を目視確認
#    - ナビゲーション（glass-card エフェクト）
#    - ヒーロー（グラデーション背景、スマホモックアップ）
#    - プロフィールカード（ホバーエフェクト）
#    - 使い方ステップ（step-number バッジ）
#    - 料金プラン（ダークカード、スケール）
#    - セキュリティセクション
#    - CTA / フッター
#    - レスポンシブ（md ブレークポイント）
```

---

## ファイル構成

### 変更前

```
C:\home\V-MEET\
├── index.html              ← CDN script + <style> タグ内にカスタム CSS
├── images/
│   └── (11 画像ファイル)
├── .gitignore
└── .vercel/
```

### 変更後

```
C:\home\V-MEET\
├── index.html              ← CDN script 削除、<style> 削除、dist/output.css をリンク
├── src/
│   └── input.css           ← Tailwind ディレクティブ + カスタム CSS【新規】
├── dist/
│   └── output.css          ← ビルド済み CSS（minified）【新規・自動生成】
├── tailwind.config.js      ← Tailwind 設定ファイル【新規】
├── tailwindcss.exe         ← CLI バイナリ（.gitignore 対象）【新規】
├── images/
│   └── (11 画像ファイル)
├── .gitignore              ← tailwindcss.exe を追加
└── .vercel/
```

---

## 影響範囲・リスク

### 影響範囲

| 項目 | 影響 |
|---|---|
| index.html | `<script>` 1行削除、`<style>` ブロック削除、`<link>` 1行追加 |
| 新規ファイル | `src/input.css`, `dist/output.css`, `tailwind.config.js` の 3 ファイル |
| デプロイ | Vercel の設定変更は不要（静的ファイル配信のため） |
| 外部依存 | `cdn.tailwindcss.com` への依存を解消 |

### リスク と 対策

| リスク | 影響度 | 対策 |
|---|---|---|
| クラスのスキャン漏れ（パージで必要なクラスが削除される） | 高 | ビルド後に全セクション・全ブレークポイントで目視検証。特に任意値 `[#FF6B6B]` や `hover:` / `group-hover:` 系を重点チェック |
| カスタム CSS の優先順位が変わる | 中 | `input.css` 内での配置順序を `@tailwind utilities` の後にすることで、カスタムクラスの優先順位を維持 |
| Tailwind CLI バイナリのバージョン管理 | 低 | バイナリは `.gitignore` 対象とし、README またはビルドスクリプトにバージョンとダウンロード URL を明記 |
| Lucide Icons / Google Fonts は変更なし | - | 今回のスコープ外。別途最適化タスクとして検討可能 |
| ビルド忘れによるスタイル未反映 | 中 | 開発時は `--watch` モードを使用。将来的には CI/CD でのビルド自動化を検討 |

### 期待される効果

| 指標 | 変更前（CDN） | 変更後（ビルド済み） |
|---|---|---|
| CSS 関連の転送サイズ | 約 113 KB (gzip) + JS ランタイム | 推定 10-20 KB (minified, gzip 後は更に小さい) |
| レンダリングブロック | JS の実行完了まで CSS 未適用（FOUC リスク） | CSS ファイル読み込み即適用（FOUC なし） |
| CDN 障害時 | スタイル完全崩壊 | 影響なし（自己ホスト） |
| Lighthouse Performance | JS ベース CSS による減点 | 静的 CSS で改善見込み |
