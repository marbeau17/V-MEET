# V-Meet カスタムドメイン設定手順書

## 目次

1. [前提条件](#1-前提条件)
2. [ドメイン購入](#2-ドメイン購入)
3. [Vercelにドメインを追加](#3-vercelにドメインを追加)
4. [DNS設定](#4-dns設定)
5. [SSL証明書](#5-ssl証明書)
6. [コード内の更新箇所](#6-コード内の更新箇所)
7. [検証手順](#7-検証手順)

---

## 1. 前提条件

| 項目 | 内容 |
|------|------|
| Vercelアカウント | meetsc-deck |
| プロジェクト名 | v-meet |
| 現在のURL | https://v-meet-kohl.vercel.app |
| フレームワーク | 静的HTML + TailwindCSS |

### 必要なもの

- Vercelダッシュボードへのアクセス権限（Owner または Admin）
- 購入済みのカスタムドメイン
- ドメインレジストラのDNS管理画面へのアクセス

---

## 2. ドメイン購入

### 推奨レジストラ

| レジストラ | 特徴 | 備考 |
|-----------|------|------|
| **Vercel Domains** | Vercelと完全統合。DNS設定が自動化される | 最も簡単 |
| **Cloudflare Registrar** | 原価販売で安い。CDN・DDoS対策が無料 | コスパ重視 |
| **Google Domains** | シンプルなUI。Whois非公開が無料 | Google Workspace連携に便利 |
| **お名前.com** | `.jp` ドメインに強い。日本語サポート | 国内向け |

### ドメイン候補

| ドメイン | 用途・印象 |
|---------|-----------|
| `v-meet.jp` | 日本市場向け。信頼感がある |
| `v-meet.app` | グローバル対応。アプリ感がある |
| `vmeet.jp` | ハイフンなしで入力しやすい |
| `v-meet.com` | 定番。ブランド保護として取得推奨 |

### 購入時の注意点

- Whoisプライバシー保護を有効にすること
- 自動更新を有効にし、ドメイン失効を防ぐこと
- 可能であれば類似ドメイン（.com / .jp / .app）を複数取得してブランド保護する

---

## 3. Vercelにドメインを追加

### 方法A: Vercel CLI（推奨）

```bash
# Vercel CLIがインストールされていない場合
npm i -g vercel

# ログイン
vercel login

# ドメインを追加（例: v-meet.app）
vercel domains add v-meet.app

# プロジェクトにドメインを紐付け
vercel domains add v-meet.app --project v-meet
```

### 方法B: Vercelダッシュボード

1. [Vercelダッシュボード](https://vercel.com/dashboard) にログイン
2. プロジェクト「**v-meet**」を選択
3. 上部メニューから「**Settings**」をクリック
4. 左サイドバーの「**Domains**」をクリック
5. 入力欄にカスタムドメイン（例: `v-meet.app`）を入力
6. 「**Add**」ボタンをクリック
7. Vercelが表示するDNS設定情報をメモする

### wwwサブドメインの扱い

Vercelは `www.v-meet.app` と `v-meet.app` の両方を追加することを推奨する。
追加時に以下のリダイレクト設定を選択できる:

- **推奨**: `www.v-meet.app` → `v-meet.app` にリダイレクト（wwwなしに統一）

---

## 4. DNS設定

ドメインレジストラのDNS管理画面で以下のレコードを設定する。

### ルートドメイン（例: v-meet.app）

| タイプ | ホスト名 | 値 | TTL |
|--------|---------|-----|-----|
| **A** | `@` | `76.76.21.21` | 自動 または 300 |

### wwwサブドメイン（例: www.v-meet.app）

| タイプ | ホスト名 | 値 | TTL |
|--------|---------|-----|-----|
| **CNAME** | `www` | `cname.vercel-dns.com` | 自動 または 300 |

### 設定手順（レジストラ別）

#### Cloudflareの場合

1. ダッシュボードでドメインを選択
2. 「DNS」 > 「レコードを追加」
3. Aレコードを追加: 名前 `@`, IPv4 `76.76.21.21`, プロキシ状態 **DNSのみ（灰色雲）**
4. CNAMEレコードを追加: 名前 `www`, ターゲット `cname.vercel-dns.com`, プロキシ状態 **DNSのみ（灰色雲）**

> **重要**: Cloudflareのプロキシ（オレンジ色の雲）はオフにすること。Vercelとの競合を防ぐため。

#### お名前.comの場合

1. ドメインNaviにログイン
2. 「ドメイン設定」 > 「DNS設定/転送設定」
3. 該当ドメインの「DNS設定」をクリック
4. 「DNSレコード設定を利用する」を選択
5. 上記のA / CNAMEレコードをそれぞれ追加

#### Vercel Domainsの場合

Vercel Domainsで購入したドメインは、DNS設定が**自動的に構成される**ため、手動設定は不要。

### DNS反映の確認

```bash
# Aレコードの確認
dig v-meet.app A +short
# 期待値: 76.76.21.21

# CNAMEレコードの確認
dig www.v-meet.app CNAME +short
# 期待値: cname.vercel-dns.com.
```

> DNS反映には最大48時間かかる場合があるが、通常は数分〜数時間で反映される。

---

## 5. SSL証明書

### Vercelの自動SSL

Vercelはカスタムドメインが追加されると、**Let's Encryptを使用してSSL証明書を自動発行**する。

- 手動での設定は**一切不要**
- 証明書は自動的に更新される（有効期限切れの心配なし）
- HTTP → HTTPS のリダイレクトも自動設定される
- ワイルドカード証明書ではなく、ドメインごとの証明書が発行される

### SSL発行の前提条件

- DNSレコードが正しく設定されていること
- DNS伝播が完了していること
- ドメインがVercelプロジェクトに正しく紐付けされていること

### SSL証明書の状態確認

1. Vercelダッシュボード > プロジェクト > Settings > Domains
2. ドメイン名の横に表示されるステータスを確認:
   - **Valid Configuration**: 正常（SSL有効）
   - **Pending Verification**: DNS反映待ち
   - **Invalid Configuration**: DNS設定に問題あり

---

## 6. コード内の更新箇所

ドメイン変更後、`index.html` 内の以下のURLを新ドメインに更新する必要がある。

> 以下の例では `https://v-meet-kohl.vercel.app` を `https://v-meet.app` に変更する場合を示す。
> 実際に取得したドメインに読み替えること。

### 更新箇所一覧

| # | 行番号 | 要素 | 現在の値 | 変更後 |
|---|--------|------|---------|--------|
| 1 | 12行目 | `<link rel="canonical">` | `https://v-meet-kohl.vercel.app/` | `https://v-meet.app/` |
| 2 | 13行目 | `<meta property="og:url">` | `https://v-meet-kohl.vercel.app/` | `https://v-meet.app/` |
| 3 | 14行目 | `<meta property="og:image">` | `https://v-meet-kohl.vercel.app/images/hero_woman_1771638499937.png` | `https://v-meet.app/images/hero_woman_1771638499937.png` |
| 4 | 21行目 | `<meta name="twitter:image">` | `https://v-meet-kohl.vercel.app/images/hero_woman_1771638499937.png` | `https://v-meet.app/images/hero_woman_1771638499937.png` |
| 5 | 42行目 | JSON-LD `url` | `https://v-meet-kohl.vercel.app/` | `https://v-meet.app/` |
| 6 | 49行目 | JSON-LD `logo` > `url` | `https://v-meet-kohl.vercel.app/images/hero_woman_1771638499937.png` | `https://v-meet.app/images/hero_woman_1771638499937.png` |

**合計: 6箇所**

### 一括置換コマンド（参考）

```bash
# index.html 内の旧URLを一括置換
sed -i 's|https://v-meet-kohl.vercel.app|https://v-meet.app|g' index.html
```

### 更新後の該当コード

```html
<!-- 12行目: canonical URL -->
<link rel="canonical" href="https://v-meet.app/">

<!-- 13行目: og:url -->
<meta property="og:url" content="https://v-meet.app/">

<!-- 14行目: og:image -->
<meta property="og:image" content="https://v-meet.app/images/hero_woman_1771638499937.png">

<!-- 21行目: twitter:image -->
<meta name="twitter:image" content="https://v-meet.app/images/hero_woman_1771638499937.png">

<!-- 42行目: JSON-LD url -->
"url": "https://v-meet.app/"

<!-- 49行目: JSON-LD logo url -->
"url": "https://v-meet.app/images/hero_woman_1771638499937.png"
```

---

## 7. 検証手順

### 7-1. ドメイン反映確認

```bash
# ドメインがVercelに向いているか確認
curl -I https://v-meet.app
# "server: Vercel" が含まれていればOK

# リダイレクト確認（wwwからの転送）
curl -I https://www.v-meet.app
# 301リダイレクトで https://v-meet.app に転送されればOK
```

ブラウザで以下のURLにアクセスし、正常に表示されることを確認:

- [ ] `https://v-meet.app` -- サイトが表示される
- [ ] `https://www.v-meet.app` -- ルートドメインにリダイレクトされる
- [ ] `http://v-meet.app` -- HTTPSにリダイレクトされる

### 7-2. SSL証明書確認

```bash
# SSL証明書の詳細確認
openssl s_client -connect v-meet.app:443 -servername v-meet.app </dev/null 2>/dev/null | openssl x509 -noout -dates -subject
```

ブラウザで確認:

- [ ] アドレスバーに鍵アイコンが表示される
- [ ] 証明書の発行元が「Let's Encrypt」である
- [ ] 「混在コンテンツ（Mixed Content）」の警告が出ない

### 7-3. OGPプレビュー確認

以下のツールで、OGP画像・タイトル・説明文が正しく表示されるか確認する:

| ツール | URL |
|--------|-----|
| **Facebook シェアデバッガー** | https://developers.facebook.com/tools/debug/ |
| **Twitter Card Validator** | https://cards-dev.twitter.com/validator |
| **OGP確認ツール** | https://ogp.me/ |

確認項目:

- [ ] `og:title` が「V-Meet | 文字より、10分。会う前の違和感をゼロに。」と表示される
- [ ] `og:description` が正しく表示される
- [ ] `og:image` のプレビュー画像が表示される（hero_woman画像）
- [ ] `og:url` が新ドメインになっている
- [ ] Twitter Cardのプレビューが `summary_large_image` 形式で表示される

### 7-4. 構造化データ確認

- [ ] [Google リッチリザルトテスト](https://search.google.com/test/rich-results) で新URLを検証
- [ ] JSON-LDの `url` と `logo` が新ドメインを指していることを確認

### 7-5. 旧URLのリダイレクト確認

Vercelは `v-meet-kohl.vercel.app` へのアクセスを自動的に新ドメインへリダイレクトする設定が可能。

1. Vercelダッシュボード > Settings > Domains
2. `v-meet-kohl.vercel.app` の横にある設定で「Redirect to [新ドメイン]」を選択

```bash
# 旧URLからのリダイレクト確認
curl -I https://v-meet-kohl.vercel.app
# 307/308リダイレクトで新ドメインに転送されればOK
```

---

## 補足: 作業チェックリスト

作業を進める際は、以下の順序で実施すること:

- [ ] 1. ドメインを購入する
- [ ] 2. Vercelにドメインを追加する
- [ ] 3. DNS設定を行う
- [ ] 4. DNS反映を待つ（数分〜最大48時間）
- [ ] 5. SSL証明書が自動発行されたことを確認する
- [ ] 6. `index.html` の6箇所のURLを更新する
- [ ] 7. 変更をデプロイする
- [ ] 8. ドメイン反映・SSL・OGP・構造化データを検証する
- [ ] 9. 旧URLからのリダイレクトを設定・確認する
