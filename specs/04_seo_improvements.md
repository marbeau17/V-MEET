# 04: SEO / OGP / アクセシビリティ改善仕様書

## 概要

V-Meet ランディングページ (`index.html`) の検索エンジン最適化（SEO）、OGP（Open Graph Protocol）補完、およびアクセシビリティ（a11y）を改善する。
現状、基本的な meta description と一部 OGP タグは設定済みだが、canonical URL、og:url、og:image、robots meta、構造化データ（JSON-LD）、aria-label が未設定である。
本仕様ではこれらを追加し、検索順位・SNS シェア表示・スクリーンリーダー対応を向上させる。

**デプロイ先 URL:** `https://v-meet-kohl.vercel.app`

---

## 1. 現状の設定済みタグ

| タグ | 値 |
|---|---|
| `<meta name="description">` | V-Meet - 文字より、10分。ビデオ面談から始まる... |
| `<meta property="og:title">` | V-Meet \| 文字より、10分。会う前の違和感をゼロに。 |
| `<meta property="og:description">` | ビデオ面談から始まる新しい出会いのカタチ... |
| `<meta property="og:type">` | website |
| `<meta name="twitter:card">` | summary_large_image |
| `<title>` | V-Meet \| 文字より、10分。会う前の違和感をゼロに。 |

---

## 2. 追加するメタタグ一覧

以下のタグを `<head>` 内、既存の `<meta name="twitter:card">` の直後（12行目の後）に追加する。

### 2-1. Canonical URL

```html
<link rel="canonical" href="https://v-meet-kohl.vercel.app/">
```

**目的:** 重複コンテンツ防止。検索エンジンに正規 URL を明示する。

### 2-2. og:url

```html
<meta property="og:url" content="https://v-meet-kohl.vercel.app/">
```

**目的:** SNS シェア時に正規 URL を指定し、シェアカウントを集約する。

### 2-3. og:image

```html
<meta property="og:image" content="https://v-meet-kohl.vercel.app/images/hero_woman_1771638499937.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="V-Meet - ビデオ面談から始まる新しい出会いのカタチ">
```

**目的:** SNS シェア時にヒーロー画像をサムネイルとして表示する。Twitter の `summary_large_image` と連動して大きなプレビュー画像を提供する。

> **注意:** 理想的には OGP 専用の 1200x630px 画像を別途作成し `images/og-image.png` として配置することを推奨する。暫定的にヒーロー画像 `hero_woman_1771638499937.png` を使用する。

### 2-4. robots meta

```html
<meta name="robots" content="index, follow">
```

**目的:** 検索エンジンのクローラーにインデックスとリンク追跡を明示的に許可する。

### 2-5. 追加の Twitter Card タグ

```html
<meta name="twitter:title" content="V-Meet | 文字より、10分。会う前の違和感をゼロに。">
<meta name="twitter:description" content="ビデオ面談から始まる新しい出会いのカタチ。メッセージの駆け引きはもう終わり、まずはビデオで10分話してみよう。">
<meta name="twitter:image" content="https://v-meet-kohl.vercel.app/images/hero_woman_1771638499937.png">
```

**目的:** Twitter でシェアされた際にタイトル・説明・画像が正しく表示されるようにする。

---

## 3. 追加する全メタタグ（まとめ・挿入用コード）

既存の `<meta name="twitter:card" content="summary_large_image">` の直後に以下を挿入する。

```html
    <link rel="canonical" href="https://v-meet-kohl.vercel.app/">
    <meta property="og:url" content="https://v-meet-kohl.vercel.app/">
    <meta property="og:image" content="https://v-meet-kohl.vercel.app/images/hero_woman_1771638499937.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="V-Meet - ビデオ面談から始まる新しい出会いのカタチ">
    <meta name="robots" content="index, follow">
    <meta name="twitter:title" content="V-Meet | 文字より、10分。会う前の違和感をゼロに。">
    <meta name="twitter:description" content="ビデオ面談から始まる新しい出会いのカタチ。メッセージの駆け引きはもう終わり、まずはビデオで10分話してみよう。">
    <meta name="twitter:image" content="https://v-meet-kohl.vercel.app/images/hero_woman_1771638499937.png">
```

---

## 4. JSON-LD 構造化データ（WebSite スキーマ）

`</head>` の直前に以下の `<script>` タグを挿入する。

```html
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "V-Meet",
        "alternateName": "ブイミート",
        "url": "https://v-meet-kohl.vercel.app/",
        "description": "文字より、10分。ビデオ面談から始まる新しい出会いのカタチ。",
        "publisher": {
            "@type": "Organization",
            "name": "V-Meet",
            "logo": {
                "@type": "ImageObject",
                "url": "https://v-meet-kohl.vercel.app/images/hero_woman_1771638499937.png"
            }
        },
        "potentialAction": {
            "@type": "SearchAction",
            "target": "https://v-meet-kohl.vercel.app/?q={search_term_string}",
            "query-input": "required name=search_term_string"
        }
    }
    </script>
```

**目的:**
- Google 検索結果にリッチスニペット（サイト名表示）を出す可能性を高める。
- SearchAction により、Google 検索結果にサイト内検索ボックスが表示される可能性がある（大規模サイト向けだが、構造化データとしての信頼性向上に寄与する）。

---

## 5. アクセシビリティ改善

### 5-1. nav 要素に aria-label を追加

**変更箇所:** 82行目

**変更前:**
```html
<nav class="fixed w-full z-50 glass-card px-6 py-4 flex justify-between items-center border-b border-pink-50">
```

**変更後:**
```html
<nav aria-label="メインナビゲーション" class="fixed w-full z-50 glass-card px-6 py-4 flex justify-between items-center border-b border-pink-50">
```

### 5-2. フッター SNS リンクに aria-label を追加

**変更箇所:** 499-505行目

**変更前:**
```html
<a href="#"
    class="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-[#FF6B6B] hover:text-white transition-all"><i
        data-lucide="twitter" class="w-5 h-5"></i></a>
<a href="#"
    class="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-[#FF6B6B] hover:text-white transition-all"><i
        data-lucide="instagram" class="w-5 h-5"></i></a>
```

**変更後:**
```html
<a href="https://twitter.com/" target="_blank" rel="noopener noreferrer" aria-label="V-Meet公式Twitter"
    class="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-[#FF6B6B] hover:text-white transition-all"><i
        data-lucide="twitter" class="w-5 h-5"></i></a>
<a href="https://instagram.com/" target="_blank" rel="noopener noreferrer" aria-label="V-Meet公式Instagram"
    class="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-[#FF6B6B] hover:text-white transition-all"><i
        data-lucide="instagram" class="w-5 h-5"></i></a>
```

> **補足:** 実際のアカウント URL が確定したら `https://twitter.com/` と `https://instagram.com/` を正式な URL に差し替えること。`target="_blank"` に `rel="noopener noreferrer"` を付与し、セキュリティを確保する。

### 5-3. フッター「サポート」セクションの placeholder href="#" 改善

**変更箇所:** 492-493行目

**変更前:**
```html
<li><a href="#" class="hover:text-[#FF6B6B] transition-colors">安全への取り組み</a></li>
<li><a href="#" class="hover:text-[#FF6B6B] transition-colors">よくある質問</a></li>
```

**変更後:**
```html
<li><a href="/safety" class="hover:text-[#FF6B6B] transition-colors">安全への取り組み</a></li>
<li><a href="/faq" class="hover:text-[#FF6B6B] transition-colors">よくある質問</a></li>
```

> **補足:** `/safety` と `/faq` は将来のページ URL パスである。ページが未作成の場合は Vercel 側で 404 になるが、`href="#"` よりも SEO 的に意味のあるリンクとなる。ページが準備できるまで暫定的に `href="#safety"` `href="#faq"` としてアンカーリンクにする選択肢もある。

---

## 6. 実装手順

### Step 1: メタタグの追加
1. `index.html` を開く
2. 11行目 `<meta name="twitter:card" content="summary_large_image">` の直後に、セクション3のメタタグ一式を挿入する

### Step 2: JSON-LD 構造化データの追加
1. 76行目 `</style>` と `</head>` の間に、セクション4の `<script type="application/ld+json">` ブロックを挿入する

### Step 3: nav 要素の aria-label 追加
1. 82行目の `<nav>` タグに `aria-label="メインナビゲーション"` を追加する

### Step 4: フッター SNS リンクの改善
1. 499-505行目の SNS リンクに `aria-label`、`target="_blank"`、`rel="noopener noreferrer"` を追加する
2. `href="#"` をプレースホルダー URL に変更する

### Step 5: フッター「サポート」リンクの改善
1. 492-493行目の `href="#"` を `/safety` と `/faq` に変更する

### Step 6: 検証
1. ブラウザで表示確認（レイアウト崩れがないこと）
2. [Google リッチリザルトテスト](https://search.google.com/test/rich-results) で JSON-LD を検証
3. [Facebook シェアデバッガー](https://developers.facebook.com/tools/debug/) で OGP プレビューを確認
4. [Twitter Card Validator](https://cards-dev.twitter.com/validator) で Twitter Card を確認
5. Lighthouse のアクセシビリティスコアを確認

---

## 7. SEO 効果の期待値

| 改善項目 | 期待される効果 |
|---|---|
| canonical URL | 重複コンテンツによる評価分散を防止。www/non-www、末尾スラッシュ有無等のバリエーションを正規化 |
| og:url / og:image | SNS シェア時のクリック率（CTR）向上。画像付きシェアは画像なしに比べて約2-3倍のエンゲージメントが期待できる |
| robots meta | クローラーへの明示的なインデックス許可。デフォルト動作と同じだが、意図を明確化することで予期しないブロックを防止 |
| JSON-LD 構造化データ | Google 検索結果でのリッチスニペット表示の可能性。サイト名が検索結果に正しく表示されやすくなる |
| aria-label | Lighthouse アクセシビリティスコアの向上（現状推定 85-90 → 目標 95+）。スクリーンリーダー利用者の UX 改善 |
| フッターリンク改善 | `href="#"` の排除により、クローラーが不要なリンクを辿ることを防止。将来的な内部リンク構造の強化基盤 |
| twitter:title / twitter:description / twitter:image | Twitter でのシェア表示の完全制御。プラットフォーム固有のフォールバックに頼らず意図通りの表示を保証 |

### 総合的な改善見込み

- **Lighthouse SEO スコア:** 現状推定 80-85 → 目標 95-100
- **Lighthouse アクセシビリティスコア:** 現状推定 85-90 → 目標 95+
- **SNS シェア時の表示品質:** 画像・タイトル・説明文が全プラットフォームで正しく表示される
- **検索エンジン評価:** 構造化データにより、Google がサイトの目的・内容を正確に理解しやすくなる
