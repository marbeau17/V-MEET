# Vercel カスタムドメイン設定ガイド

## 概要

現在 V-Meet ランディングページは `https://v-meet-kohl.vercel.app` でホストされている。独自ドメインを取得済みの場合、Vercel に紐付けることでブランディング強化・SEO 向上を実現する。本ドキュメントでは設定手順と、HTML 内の URL 更新箇所をまとめる。

---

## 前提条件

- Vercel アカウントにプロジェクト `v-meet-kohl` がデプロイ済み
- 独自ドメインを取得済み（例: `v-meet.jp`）
- ドメインレジストラの DNS 管理画面にアクセス可能

---

## 手順 1: Vercel ダッシュボードでドメインを追加

1. [Vercel Dashboard](https://vercel.com/dashboard) にログイン
2. プロジェクト `v-meet-kohl` を選択
3. **Settings** > **Domains** に移動
4. 入力欄にドメイン（例: `v-meet.jp`）を入力して **Add** をクリック
5. Vercel が推奨する DNS 設定が表示される

### www サブドメインの扱い

- `www.v-meet.jp` → `v-meet.jp` へのリダイレクトを推奨
- Vercel の Domains 画面で `www.v-meet.jp` も追加し、リダイレクト設定を選択

---

## 手順 2: DNS レコードの設定

Vercel が表示する指示に従い、ドメインレジストラの DNS 管理画面でレコードを追加する。

### パターン A: Vercel DNS を使用（推奨）

Vercel にネームサーバーを委譲する方法。レジストラ側でネームサーバーを以下に変更:

```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

**メリット:** SSL 自動発行、設定の一元管理、最速の反映

### パターン B: 外部 DNS を使用

レジストラの DNS をそのまま使う場合、以下のレコードを追加:

#### Apex ドメイン（`v-meet.jp`）

| タイプ | ホスト | 値 |
|--------|--------|-----|
| A | @ | `76.76.21.21` |

#### www サブドメイン（`www.v-meet.jp`）

| タイプ | ホスト | 値 |
|--------|--------|-----|
| CNAME | www | `cname.vercel-dns.com` |

> **注意:** A レコードの IP は Vercel の公式ドキュメントで最新値を確認すること。

---

## 手順 3: SSL 証明書の確認

- Vercel は DNS 検証完了後、Let's Encrypt による SSL 証明書を自動発行する
- Vercel Dashboard の **Settings** > **Domains** で証明書ステータスが「Valid Configuration」になれば完了
- 反映まで最大 48 時間かかる場合がある（通常は数分〜数時間）

---

## 手順 4: HTML 内の URL 更新

独自ドメインが有効になったら、`index.html` 内の以下の箇所を更新する必要がある。

### 更新対象一覧

以下は `v-meet-kohl.vercel.app` を含む全箇所（例として `v-meet.jp` に置換）:

| 行 | 要素 | 変更前 | 変更後 |
|----|------|--------|--------|
| 12 | `<link rel="canonical">` | `https://v-meet-kohl.vercel.app/` | `https://v-meet.jp/` |
| 13 | `<meta property="og:url">` | `https://v-meet-kohl.vercel.app/` | `https://v-meet.jp/` |
| 14 | `<meta property="og:image">` | `https://v-meet-kohl.vercel.app/images/...` | `https://v-meet.jp/images/...` |
| 21 | `<meta name="twitter:image">` | `https://v-meet-kohl.vercel.app/images/...` | `https://v-meet.jp/images/...` |
| 42 | JSON-LD `"url"` | `https://v-meet-kohl.vercel.app/` | `https://v-meet.jp/` |
| 49 | JSON-LD `logo.url` | `https://v-meet-kohl.vercel.app/images/...` | `https://v-meet.jp/images/...` |

### 置換コマンド（参考）

ドメイン確定後、以下の一括置換で対応可能:

```
検索:   v-meet-kohl.vercel.app
置換:   v-meet.jp
対象:   index.html
```

> **重要:** `specs/04_seo_improvements.md` 内にも同じ URL が記載されているが、こちらは仕様書（履歴）のため更新しなくてよい。

---

## 手順 5: Vercel CLI での操作（代替手段）

ダッシュボードの代わりに CLI でも設定可能:

```bash
# Vercel CLI のインストール（未導入の場合）
npm i -g vercel

# ログイン
vercel login

# プロジェクトにドメインを追加
vercel domains add v-meet.jp

# ドメインの確認
vercel domains ls

# DNS 設定の検証
vercel domains verify v-meet.jp
```

---

## 手順 6: 動作確認チェックリスト

ドメイン設定完了後、以下を確認:

- [ ] `https://v-meet.jp` でページが表示される
- [ ] `https://www.v-meet.jp` が `https://v-meet.jp` にリダイレクトされる
- [ ] SSL 証明書が有効（ブラウザのアドレスバーに鍵アイコン）
- [ ] `http://v-meet.jp` が `https://v-meet.jp` にリダイレクトされる（Vercel は自動で HTTPS リダイレクト）
- [ ] OGP デバッガーで og:url, og:image が新ドメインで正しく表示される
  - Facebook: https://developers.facebook.com/tools/debug/
  - Twitter: https://cards-dev.twitter.com/validator
- [ ] Google Search Console に新ドメインを登録（旧 URL からの移行通知）
- [ ] `v-meet-kohl.vercel.app` にアクセスした場合、新ドメインにリダイレクトされる（Vercel が自動処理）

---

## 旧 URL のリダイレクト

Vercel はカスタムドメイン設定後、`*.vercel.app` のサブドメインからカスタムドメインへ自動的に 308 リダイレクトを行う。追加設定は不要。

---

## 注意事項

- DNS 変更の反映には TTL に応じた時間がかかる（通常 1 時間以内、最大 48 時間）
- ドメイン移行前に Google Search Console でサイトマップを再送信するとインデックス更新が早まる
- SNS シェア済みの OGP キャッシュは各プラットフォームのデバッガーでキャッシュクリアが必要
