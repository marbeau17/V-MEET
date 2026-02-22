# ビデオ通話 UI/UX 仕様書

## 概要

V-Meet のコア機能であるビデオ通話の専用画面 `call.html` を新規作成する。マッチング待機 → マッチング成立 → ビデオ通話 → 通話終了の 4 つの状態を単一ページ内で遷移させ、シームレスな通話体験を実現する。

既存のデザインシステム（ダークグラデーション背景、glass-card、ブランドカラー `#FF6B6B`、Inter + Noto Sans JP フォント）を踏襲し、`index.html` のヒーローセクションに表示されているモックアップ UI をベースにした実装とする。

---

## 技術スタック

| 項目 | 仕様 |
|---|---|
| ファイル | `call.html`（新規） |
| CSS | Tailwind CSS 3.4.17 (standalone CLI) + `src/input.css` カスタムクラス |
| アイコン | Lucide Icons v0.263.1 |
| フォント | Inter + Noto Sans JP (Google Fonts) |
| レスポンシブ | モバイルファースト（`sm:` / `md:` / `lg:` ブレークポイント） |
| JavaScript | WebRTC 接続は別仕様（07-webrtc-architecture.md）、本仕様は UI レイヤーのみ |

---

## ページ構成

### ファイル配置

```
C:\home\V-MEET\
├── call.html               ← 通話専用ページ【新規】
├── index.html
├── safety.html
├── faq.html
├── src/
│   └── input.css           ← 通話画面用カスタム CSS を追記
├── dist/
│   └── output.css
├── js/
│   ├── firebase-config.js
│   ├── auth-modal.js
│   ├── auth-ui.js
│   └── call.js             ← 通話画面の状態管理・UI 制御【新規】
├── tailwind.config.js      ← content に call.html を追加
└── images/
```

### tailwind.config.js 変更

```js
module.exports = {
  content: [
    "./index.html",
    "./safety.html",
    "./faq.html",
    "./call.html",        // 追加
    "./js/**/*.js",
  ],
  // ...
}
```

### ページ全体構造

`call.html` は 4 つの画面状態を持ち、JavaScript で表示/非表示を切り替える。

```html
<body class="bg-slate-900 text-white min-h-screen overflow-hidden">
  <!-- 状態 1: マッチング待機画面 -->
  <div id="screen-waiting" class="screen active">...</div>

  <!-- 状態 2: マッチング成立画面 -->
  <div id="screen-matched" class="screen hidden">...</div>

  <!-- 状態 3: ビデオ通話画面 -->
  <div id="screen-call" class="screen hidden">...</div>

  <!-- 状態 4: 通話終了画面 -->
  <div id="screen-ended" class="screen hidden">...</div>

  <!-- エラーモーダル（オーバーレイ） -->
  <div id="modal-error" class="modal hidden">...</div>
</body>
```

画面遷移: `waiting` → `matched` → `call` → `ended`

---

## 画面 1: マッチング待機画面

### ワイヤーフレーム

```
┌─────────────────────────────┐
│         V-Meet ロゴ          │
│                             │
│       ┌───────────┐         │
│       │  パルス    │         │
│       │ アニメ     │         │
│       │  ーション  │         │
│       └───────────┘         │
│                             │
│   パートナーを探しています...  │
│                             │
│     推定待ち時間: 約2分       │
│                             │
│   ┌───────────────────┐     │
│   │  検索をキャンセル   │     │
│   └───────────────────┘     │
│                             │
│    現在のオンライン: 128人    │
└─────────────────────────────┘
```

### 構成要素

| 要素 | 説明 |
|---|---|
| V-Meet ロゴ | ヘッダー左上。`index.html` と同一デザイン |
| パルスアニメーション | 中央にブランドカラーの円形パルスエフェクト。ユーザーのアバターを中心に配置 |
| 検索中テキスト | 「パートナーを探しています...」（ドットアニメーション付き） |
| 推定待ち時間 | サーバーから取得した推定値を表示。「約 X 分」形式 |
| キャンセルボタン | 押下でホーム（`index.html`）に遷移。確認ダイアログなし |
| オンライン人数 | リアルタイム更新。信頼感の向上に寄与 |

### Tailwind クラス例

```html
<!-- 待機画面コンテナ -->
<div id="screen-waiting" class="screen flex flex-col items-center justify-center min-h-screen px-6">

  <!-- ロゴ（上部固定） -->
  <div class="absolute top-6 left-6 flex items-center gap-2">
    <div class="w-10 h-10 bg-[#FF6B6B] rounded-xl flex items-center justify-center text-white shadow-lg">
      <i data-lucide="video"></i>
    </div>
    <span class="text-2xl font-bold tracking-tight text-white">V-Meet</span>
  </div>

  <!-- パルスアニメーション -->
  <div class="relative mb-8">
    <!-- 外側パルスリング -->
    <div class="absolute inset-0 w-32 h-32 rounded-full bg-[#FF6B6B]/20 animate-ping"></div>
    <div class="absolute inset-2 w-28 h-28 rounded-full bg-[#FF6B6B]/30 animate-pulse"></div>
    <!-- ユーザーアバター -->
    <div class="relative w-32 h-32 rounded-full bg-[#FF6B6B] flex items-center justify-center text-white text-4xl font-bold shadow-2xl ring-4 ring-[#FF6B6B]/30">
      <i data-lucide="search" class="w-12 h-12"></i>
    </div>
  </div>

  <!-- 検索中テキスト -->
  <h2 class="text-2xl font-bold mb-2">パートナーを探しています</h2>
  <p class="text-slate-400 text-sm mb-8">
    推定待ち時間: <span id="estimated-wait" class="text-[#FF6B6B] font-bold">約2分</span>
  </p>

  <!-- キャンセルボタン -->
  <button id="btn-cancel-search"
    class="px-8 py-3 rounded-full border-2 border-slate-600 text-slate-300 font-bold hover:border-[#FF6B6B] hover:text-[#FF6B6B] transition-all">
    検索をキャンセル
  </button>

  <!-- オンライン人数 -->
  <p class="absolute bottom-8 text-slate-500 text-xs">
    現在のオンライン: <span id="online-count" class="text-slate-300 font-bold">128</span>人
  </p>
</div>
```

### アニメーション CSS（`src/input.css` に追記）

```css
/* === 通話画面用カスタム CSS === */

/* 画面切り替え */
.screen {
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.screen.hidden {
  display: none;
}

/* パルスリング（検索アニメーション） */
@keyframes pulse-ring {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.animate-pulse-ring {
  animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* ドットアニメーション（検索中テキスト） */
@keyframes dot-blink {
  0%, 20% { opacity: 0; }
  50% { opacity: 1; }
  100% { opacity: 0; }
}

.dot-anim span:nth-child(1) { animation: dot-blink 1.4s infinite 0s; }
.dot-anim span:nth-child(2) { animation: dot-blink 1.4s infinite 0.2s; }
.dot-anim span:nth-child(3) { animation: dot-blink 1.4s infinite 0.4s; }
```

---

## 画面 2: マッチング成立画面

### ワイヤーフレーム

```
┌─────────────────────────────┐
│                             │
│       マッチング成立！        │
│                             │
│    ┌──────┐   ┌──────┐      │
│    │ 自分 │ ♥ │ 相手 │      │
│    │アバタ│   │アバタ│      │
│    └──────┘   └──────┘      │
│                             │
│       けんた さん (28)       │
│       エンジニア             │
│                             │
│    ┌───────────────────┐    │
│    │   通話を開始する    │    │
│    └───────────────────┘    │
│                             │
│      自動開始まで: 5秒       │
│                             │
└─────────────────────────────┘
```

### 構成要素

| 要素 | 説明 |
|---|---|
| 成立テキスト | 「マッチング成立！」大見出し + ブランドカラーのハートアイコン |
| アバターペア | 左: 自分のアバター、右: 相手のアバター。中央にハートアイコン |
| 相手プロフィール | 名前、年齢、職業を表示 |
| 通話開始ボタン | `btn-primary` スタイル。押下で即座に通話画面へ遷移 |
| カウントダウン | 5 秒カウントダウン。0 になると自動で通話画面へ遷移。ボタン押下で即開始も可能 |

### Tailwind クラス例

```html
<div id="screen-matched" class="screen hidden flex flex-col items-center justify-center min-h-screen px-6">

  <!-- 成立テキスト -->
  <div class="text-center mb-8">
    <div class="inline-block bg-[#FF6B6B]/20 text-[#FF6B6B] px-4 py-1 rounded-full text-sm font-bold mb-4">
      Match!
    </div>
    <h2 class="text-3xl md:text-4xl font-bold">マッチング成立！</h2>
  </div>

  <!-- アバターペア -->
  <div class="flex items-center gap-6 mb-8">
    <!-- 自分のアバター -->
    <div class="w-24 h-24 rounded-full bg-slate-700 border-4 border-[#FF6B6B]/30 overflow-hidden shadow-2xl">
      <img id="my-avatar" src="" alt="自分のアバター" class="w-full h-full object-cover">
    </div>
    <!-- ハートアイコン -->
    <div class="w-12 h-12 bg-[#FF6B6B] rounded-full flex items-center justify-center text-white shadow-lg animate-pulse">
      <i data-lucide="heart" class="w-6 h-6"></i>
    </div>
    <!-- 相手のアバター -->
    <div class="w-24 h-24 rounded-full bg-slate-700 border-4 border-[#FF6B6B]/30 overflow-hidden shadow-2xl">
      <img id="partner-avatar" src="" alt="相手のアバター" class="w-full h-full object-cover">
    </div>
  </div>

  <!-- 相手プロフィール -->
  <div class="text-center mb-8">
    <h3 class="text-xl font-bold">
      <span id="partner-name">けんた</span> さん
      <span class="text-slate-400 text-base font-normal">(<span id="partner-age">28</span>)</span>
    </h3>
    <p id="partner-occupation" class="text-slate-400 text-sm mt-1">エンジニア</p>
  </div>

  <!-- 通話開始ボタン -->
  <button id="btn-start-call"
    class="btn-primary text-white px-10 py-4 rounded-2xl text-lg font-bold shadow-xl flex items-center gap-2 mb-4">
    <i data-lucide="video" class="w-5 h-5"></i>
    通話を開始する
  </button>

  <!-- カウントダウン -->
  <p class="text-slate-500 text-sm">
    自動開始まで: <span id="match-countdown" class="text-[#FF6B6B] font-bold text-lg">5</span>秒
  </p>
</div>
```

### 動作仕様

| 項目 | 仕様 |
|---|---|
| カウントダウン開始 | 画面表示と同時に 5 秒カウントダウン開始 |
| 自動開始 | カウントダウン 0 で `screen-call` に自動遷移 |
| 手動開始 | 「通話を開始する」ボタン押下で即遷移（カウントダウン停止） |
| 相手が離脱した場合 | 「相手が離脱しました」エラーモーダル表示 → 待機画面に戻る |

---

## 画面 3: ビデオ通話画面

### ワイヤーフレーム（モバイル）

```
┌─────────────────────────────┐
│  ┌─────────┐     ┌───────┐  │
│  │ 09:41   │     │ 自分  │  │
│  │ タイマー │     │ 映像  │  │
│  └─────────┘     │ (小窓)│  │
│                   └───────┘  │
│                              │
│                              │
│     相手の映像（全画面）       │
│                              │
│                              │
│                              │
│                              │
│  ┌──────────────────────┐   │
│  │ まもなく10分です！     │   │
│  │ 延長しますか？         │   │
│  └──────────────────────┘   │
│                              │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐       │
│  │mic│ │cam│ │延長│ │end│    │
│  └──┘ └──┘ └──┘ └──┘       │
└─────────────────────────────┘
```

### ワイヤーフレーム（デスクトップ）

```
┌──────────────────────────────────────────────┐
│              ┌──────────┐                     │
│              │  09:41   │                     │
│              │  タイマー │                     │
│              └──────────┘          ┌────────┐ │
│                                    │ 自分   │ │
│                                    │ 映像   │ │
│        相手の映像（全画面）          │ (小窓) │ │
│                                    └────────┘ │
│                                               │
│                                               │
│   ┌─────────────────────────────────────┐     │
│   │ まもなく10分です！延長しますか？      │     │
│   └─────────────────────────────────────┘     │
│                                               │
│     ┌──┐   ┌──┐   ┌────┐   ┌──┐              │
│     │mic│   │cam│   │ 延長 │   │end│           │
│     └──┘   └──┘   └────┘   └──┘              │
└──────────────────────────────────────────────┘
```

### 構成要素

#### 3-1. 相手の映像（メインビデオ）

| 項目 | 仕様 |
|---|---|
| 表示領域 | 画面全体（`fixed inset-0`） |
| 映像ソース | `<video>` 要素に WebRTC リモートストリームを割り当て |
| フィット | `object-cover` で画面いっぱいに表示（アスペクト比維持、余白なし） |
| オーバーレイ | 下部に `bg-gradient-to-t from-black/40 to-transparent` のグラデーション |
| カメラ OFF 時 | 映像の代わりに相手のアバター + 名前を中央表示（ダーク背景） |

```html
<!-- メインビデオ -->
<div class="fixed inset-0 bg-slate-900">
  <video id="remote-video" autoplay playsinline
    class="w-full h-full object-cover">
  </video>
  <!-- 下部グラデーションオーバーレイ -->
  <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none"></div>

  <!-- 相手カメラOFF時のフォールバック -->
  <div id="remote-video-off" class="hidden absolute inset-0 flex flex-col items-center justify-center bg-slate-800">
    <div class="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 mb-4">
      <i data-lucide="video-off" class="w-10 h-10"></i>
    </div>
    <p class="text-slate-400 font-bold"><span id="partner-name-fallback">相手</span>さんのカメラがOFFです</p>
  </div>
</div>
```

#### 3-2. 自分の映像（小窓 / PiP）

| 項目 | 仕様 |
|---|---|
| サイズ | モバイル: `w-24 h-32`（96x128px）、デスクトップ: `w-40 h-56`（160x224px） |
| 位置 | デフォルト: 右上（`top-6 right-4`） |
| ドラッグ | JavaScript による自由ドラッグ対応（画面四隅にスナップ） |
| 角丸 | `rounded-2xl` |
| ボーダー | `border-2 border-white/70` |
| シャドウ | `shadow-2xl` |
| カメラ OFF 時 | 映像の代わりに自分のアバターイニシャルを表示 |

```html
<!-- 自分の映像（小窓） -->
<div id="local-video-container"
  class="absolute top-6 right-4 w-24 h-32 md:w-40 md:h-56 rounded-2xl border-2 border-white/70 overflow-hidden shadow-2xl bg-slate-800 z-20 cursor-grab active:cursor-grabbing"
  role="img"
  aria-label="自分のカメラ映像">
  <video id="local-video" autoplay playsinline muted
    class="w-full h-full object-cover mirror">
  </video>
  <!-- カメラOFF時のフォールバック -->
  <div id="local-video-off" class="hidden absolute inset-0 flex items-center justify-center bg-slate-700">
    <span id="my-initial" class="text-2xl font-bold text-slate-400">Y</span>
  </div>
</div>
```

ミラー用 CSS:

```css
.mirror {
  transform: scaleX(-1);
}
```

#### ドラッグ移動の動作仕様

| 項目 | 仕様 |
|---|---|
| 操作 | タッチ / マウスドラッグ |
| スナップ | ドラッグ終了時、最も近い四隅（top-left, top-right, bottom-left, bottom-right）にアニメーション付きでスナップ |
| 制約 | 画面外にはみ出さない（`Math.min / Math.max` でクランプ） |
| 通話コントロールバーとの干渉 | 下端は通話コントロールバーの上部まで（`bottom: 120px` 以上） |

#### 3-3. タイマー表示

| 項目 | 仕様 |
|---|---|
| 位置 | 上部中央 |
| 形式 | `MM:SS`（例: `09:41`） |
| スタイル | pill 型バッジ。`bg-black/50 backdrop-blur-lg` で映像上でも視認性確保 |
| 残り 1 分 | テキスト色が `text-[#FF6B6B]` に変化 + `animate-pulse` 追加 |
| 時間超過（延長時） | 延長分は `+MM:SS` 形式で表示。色は通常に戻る |

```html
<!-- タイマー -->
<div class="absolute top-6 left-1/2 -translate-x-1/2 z-30">
  <div id="call-timer"
    class="bg-black/50 backdrop-blur-lg px-6 py-2 rounded-full text-white text-sm font-bold border border-white/20 flex items-center gap-2">
    <i data-lucide="clock" class="w-4 h-4"></i>
    <span id="timer-display">10:00</span>
  </div>
</div>
```

#### タイマー状態遷移

| 残り時間 | 表示 | スタイル変化 |
|---|---|---|
| 10:00 - 1:01 | `MM:SS` | 通常（白文字） |
| 1:00 - 0:01 | `MM:SS` | `text-[#FF6B6B] animate-pulse` |
| 0:00 到達 | `00:00` | 延長未選択なら通話自動終了 |
| 延長中 | `+MM:SS` | 通常（白文字）、延長残り 1 分で再び赤 |

#### 3-4. 延長アラート

残り 1 分（`01:00`）になった時点で表示される通知バナー。

```html
<!-- 延長アラート（残り1分で表示） -->
<div id="extension-alert"
  class="hidden absolute bottom-28 left-1/2 -translate-x-1/2 z-30 w-[90%] max-w-sm">
  <div class="bg-white/90 backdrop-blur px-5 py-3 rounded-2xl text-slate-800 shadow-lg border border-pink-200 text-center animate-pulse">
    <p class="text-sm font-bold mb-2">まもなく10分です！延長しますか？</p>
    <div class="flex gap-3 justify-center">
      <button id="btn-extend"
        class="btn-primary text-white px-6 py-2 rounded-full text-sm font-bold flex items-center gap-1">
        <i data-lucide="repeat" class="w-4 h-4"></i>
        5分延長する (¥300)
      </button>
      <button id="btn-dismiss-extend"
        class="px-4 py-2 rounded-full text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">
        閉じる
      </button>
    </div>
  </div>
</div>
```

| 項目 | 仕様 |
|---|---|
| 表示タイミング | 残り 1:00 |
| 非表示条件 | 「延長する」押下 / 「閉じる」押下 / タイマー 0:00 到達 |
| 延長効果 | タイマーに +5:00 追加。残り 1:00 で再度アラート表示（繰り返し延長可能） |
| 料金表示 | `¥300 / 5分`（料金はサーバーから取得。女性ユーザーは「無料」と表示） |

#### 3-5. 通話コントロールバー

画面下部に固定表示。`index.html` のモックアップデザインを踏襲。

```html
<!-- 通話コントロールバー -->
<div class="absolute bottom-0 left-0 right-0 z-30 pb-8 pt-4">
  <div class="flex justify-center items-center gap-4 md:gap-6">

    <!-- マイク ON/OFF -->
    <button id="btn-mic" aria-label="マイクをOFFにする" aria-pressed="false"
      class="w-12 h-12 md:w-14 md:h-14 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all">
      <i data-lucide="mic" class="w-5 h-5 md:w-6 md:h-6"></i>
    </button>

    <!-- カメラ ON/OFF -->
    <button id="btn-camera" aria-label="カメラをOFFにする" aria-pressed="false"
      class="w-12 h-12 md:w-14 md:h-14 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all">
      <i data-lucide="video" class="w-5 h-5 md:w-6 md:h-6"></i>
    </button>

    <!-- 延長ボタン（残り1分で表示） -->
    <button id="btn-extend-bar" aria-label="通話を5分延長する"
      class="hidden w-14 h-14 md:w-16 md:h-16 bg-[#FF6B6B] rounded-full flex flex-col items-center justify-center text-white shadow-lg ring-2 ring-white hover:scale-105 transition-all">
      <i data-lucide="repeat" class="w-4 h-4 md:w-5 md:h-5"></i>
      <span class="text-[8px] font-bold">延長</span>
    </button>

    <!-- 通話終了 -->
    <button id="btn-end-call" aria-label="通話を終了する"
      class="w-14 h-14 md:w-16 md:h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-2xl hover:bg-red-600 hover:scale-105 transition-all">
      <i data-lucide="phone-off" class="w-6 h-6 md:w-7 md:h-7"></i>
    </button>

  </div>
</div>
```

#### コントロールボタンの状態

| ボタン | デフォルト | OFF 状態 |
|---|---|---|
| マイク | `bg-white/20` + `mic` アイコン | `bg-red-500/80` + `mic-off` アイコン |
| カメラ | `bg-white/20` + `video` アイコン | `bg-red-500/80` + `video-off` アイコン |
| 延長 | `hidden`（残り 1 分で `flex` に切り替え） | - |
| 通話終了 | `bg-red-500` + `phone-off` アイコン | - |

#### 操作仕様

| 操作 | 動作 |
|---|---|
| マイク ON/OFF | ローカル音声トラックの `enabled` を切り替え。アイコン・背景色変更 |
| カメラ ON/OFF | ローカル映像トラックの `enabled` を切り替え。自分の小窓にフォールバック表示 |
| 延長 | サーバーに延長リクエスト送信。承認後タイマーに +5:00。料金が発生する旨の確認ダイアログを表示 |
| 通話終了 | 確認ダイアログ「通話を終了しますか？」→ 承認で `screen-ended` に遷移 |

---

## 画面 4: 通話終了画面

### ワイヤーフレーム

```
┌─────────────────────────────┐
│                             │
│      通話が終了しました       │
│                             │
│       ┌──────────┐          │
│       │ 相手の   │          │
│       │ アバター  │          │
│       └──────────┘          │
│       けんた さん            │
│                             │
│      通話時間: 12分30秒      │
│                             │
│    この人との印象は？         │
│    ┌──┐  ┌──┐  ┌──┐        │
│    │ 😊│  │ 😐│  │ 😔│       │
│    │良い│  │普通│  │合わな│    │
│    └──┘  └──┘  │  い │     │
│                 └──┘        │
│                             │
│  ┌───────────────────────┐  │
│  │  次のパートナーを探す   │  │
│  └───────────────────────┘  │
│                             │
│    ┌──────────────────┐     │
│    │  ホームに戻る     │     │
│    └──────────────────┘     │
│                             │
└─────────────────────────────┘
```

### 構成要素

| 要素 | 説明 |
|---|---|
| 終了テキスト | 「通話が終了しました」 |
| 相手アバター | マッチング成立画面と同じアバター |
| 通話時間 | 実際の通話時間を `XX分XX秒` 形式で表示（延長分含む合計） |
| 評価 UI | 3 段階の印象評価。送信後はお礼メッセージを表示 |
| 次のパートナーボタン | `btn-primary` スタイル。押下で `screen-waiting` に遷移（再マッチング） |
| ホームに戻るボタン | セカンダリスタイル（ボーダーのみ）。押下で `index.html` に遷移 |

### Tailwind クラス例

```html
<div id="screen-ended" class="screen hidden flex flex-col items-center justify-center min-h-screen px-6">

  <!-- 終了テキスト -->
  <h2 class="text-2xl md:text-3xl font-bold mb-6">通話が終了しました</h2>

  <!-- 相手アバター -->
  <div class="w-20 h-20 rounded-full bg-slate-700 border-4 border-slate-600 overflow-hidden shadow-2xl mb-3">
    <img id="ended-partner-avatar" src="" alt="相手のアバター" class="w-full h-full object-cover">
  </div>
  <p class="text-lg font-bold mb-6">
    <span id="ended-partner-name">けんた</span> さん
  </p>

  <!-- 通話時間 -->
  <div class="bg-slate-800 px-6 py-3 rounded-2xl mb-8">
    <p class="text-slate-400 text-xs mb-1">通話時間</p>
    <p class="text-2xl font-bold text-white">
      <i data-lucide="clock" class="w-5 h-5 inline-block mr-1 text-[#FF6B6B]"></i>
      <span id="total-duration">12分30秒</span>
    </p>
  </div>

  <!-- 評価 UI -->
  <div id="rating-section" class="mb-8 text-center">
    <p class="text-slate-400 text-sm mb-4">この人との印象は？</p>
    <div class="flex gap-4 justify-center">
      <button data-rating="good"
        class="rating-btn flex flex-col items-center gap-1 px-5 py-3 rounded-2xl bg-slate-800 hover:bg-green-500/20 hover:ring-2 hover:ring-green-500 transition-all">
        <i data-lucide="thumbs-up" class="w-6 h-6 text-green-400"></i>
        <span class="text-xs font-bold text-slate-300">良かった</span>
      </button>
      <button data-rating="neutral"
        class="rating-btn flex flex-col items-center gap-1 px-5 py-3 rounded-2xl bg-slate-800 hover:bg-yellow-500/20 hover:ring-2 hover:ring-yellow-500 transition-all">
        <i data-lucide="minus-circle" class="w-6 h-6 text-yellow-400"></i>
        <span class="text-xs font-bold text-slate-300">普通</span>
      </button>
      <button data-rating="bad"
        class="rating-btn flex flex-col items-center gap-1 px-5 py-3 rounded-2xl bg-slate-800 hover:bg-red-500/20 hover:ring-2 hover:ring-red-500 transition-all">
        <i data-lucide="thumbs-down" class="w-6 h-6 text-red-400"></i>
        <span class="text-xs font-bold text-slate-300">合わなかった</span>
      </button>
    </div>
  </div>

  <!-- 評価送信後メッセージ -->
  <div id="rating-thanks" class="hidden mb-8 text-center">
    <div class="bg-[#FF6B6B]/10 px-6 py-3 rounded-2xl">
      <p class="text-[#FF6B6B] text-sm font-bold">フィードバックありがとうございます！</p>
    </div>
  </div>

  <!-- アクションボタン -->
  <div class="flex flex-col gap-3 w-full max-w-xs">
    <button id="btn-next-partner"
      class="btn-primary text-white py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-2">
      <i data-lucide="search" class="w-5 h-5"></i>
      次のパートナーを探す
    </button>
    <a href="index.html"
      class="py-4 rounded-2xl font-bold text-slate-400 border-2 border-slate-700 hover:border-slate-500 transition-all text-center">
      ホームに戻る
    </a>
  </div>
</div>
```

### 評価の動作仕様

| 項目 | 仕様 |
|---|---|
| 選択 | ボタン押下で選択状態になる（`ring-2` + 背景色変化） |
| 送信 | 選択時に即送信（サーバーに POST）。`rating-section` を非表示にし、`rating-thanks` を表示 |
| スキップ | 評価せずに「次のパートナーを探す」「ホームに戻る」を押下可能 |
| データ | `{ sessionId, rating: "good" | "neutral" | "bad", timestamp }` をサーバーに送信 |

---

## レスポンシブデザイン

### ブレークポイント定義

| ブレークポイント | Tailwind プレフィックス | 対象デバイス |
|---|---|---|
| `< 640px` | (デフォルト) | モバイル |
| `>= 640px` | `sm:` | 大型スマートフォン |
| `>= 768px` | `md:` | タブレット |
| `>= 1024px` | `lg:` | デスクトップ |

### 画面ごとのレスポンシブ対応

#### 待機画面

| 項目 | モバイル | タブレット / デスクトップ |
|---|---|---|
| パルスアニメーション | `w-32 h-32` | `md:w-40 md:h-40` |
| テキストサイズ | `text-2xl` | `md:text-3xl` |
| キャンセルボタン | フルワイド（`w-full max-w-xs`） | `w-auto px-8` |

#### マッチング成立画面

| 項目 | モバイル | タブレット / デスクトップ |
|---|---|---|
| アバターサイズ | `w-24 h-24` | `md:w-32 md:h-32` |
| 見出し | `text-3xl` | `md:text-4xl` |
| レイアウト | 縦積み | 変わらず縦積み（中央揃え） |

#### ビデオ通話画面

| 項目 | モバイル | タブレット / デスクトップ |
|---|---|---|
| 自分の小窓サイズ | `w-24 h-32` | `md:w-40 md:h-56` |
| コントロールボタン | `w-12 h-12` / `gap-4` | `md:w-14 md:h-14` / `md:gap-6` |
| 終了 / 延長ボタン | `w-14 h-14` | `md:w-16 md:h-16` |
| 延長アラート幅 | `w-[90%]` | `max-w-sm`（中央固定） |

#### 通話終了画面

| 項目 | モバイル | タブレット / デスクトップ |
|---|---|---|
| 見出し | `text-2xl` | `md:text-3xl` |
| 評価ボタン | `gap-4`（横並び） | `gap-6` |
| アクションボタン | `max-w-xs`（フルワイド） | `max-w-sm` |

### 横向き（ランドスケープ）対応

通話画面のみ横向き対応を考慮する。

```css
@media (orientation: landscape) and (max-height: 500px) {
  /* コントロールバーを小さくする */
  #screen-call .control-bar {
    padding-bottom: 1rem;
  }

  /* 自分の小窓を小さくする */
  #local-video-container {
    width: 5rem;
    height: 6.5rem;
  }
}
```

---

## アクセシビリティ

### ARIA 属性

```html
<!-- 通話画面のランドマーク -->
<main role="main" aria-label="ビデオ通話">

  <!-- タイマー: ライブリージョン（残り時間を読み上げ） -->
  <div id="call-timer" role="timer" aria-live="polite" aria-label="通話残り時間">
    <span id="timer-display">10:00</span>
  </div>

  <!-- マイクボタン: トグル状態 -->
  <button id="btn-mic"
    aria-label="マイクをOFFにする"
    aria-pressed="false"
    role="switch">
  </button>

  <!-- カメラボタン: トグル状態 -->
  <button id="btn-camera"
    aria-label="カメラをOFFにする"
    aria-pressed="false"
    role="switch">
  </button>

  <!-- 通話終了ボタン -->
  <button id="btn-end-call" aria-label="通話を終了する">
  </button>

  <!-- 延長アラート: ライブリージョン -->
  <div id="extension-alert" role="alert" aria-live="assertive">
  </div>

  <!-- 画面遷移のアナウンス -->
  <div id="screen-announcer" class="sr-only" aria-live="assertive" role="status"></div>
</main>
```

### キーボード操作

| キー | 動作 |
|---|---|
| `M` | マイク ON/OFF トグル |
| `V` | カメラ ON/OFF トグル |
| `E` | 延長する（延長アラート表示中のみ） |
| `Escape` | 通話終了確認ダイアログ表示 |
| `Tab` | コントロールバー内のフォーカス移動 |
| `Enter` / `Space` | フォーカスされたボタンの実行 |

### スクリーンリーダー対応

| シーン | 読み上げ内容 |
|---|---|
| 待機画面表示 | 「パートナーを検索中です。推定待ち時間は約 X 分です」 |
| マッチング成立 | 「マッチング成立。相手は [名前] さん、[年齢] 歳、[職業] です。5秒後に通話が開始されます」 |
| 通話開始 | 「ビデオ通話が開始されました。残り時間は 10 分です」 |
| 残り 1 分 | 「残り 1 分です。延長しますか？」 |
| 通話終了 | 「通話が終了しました。通話時間は [XX分XX秒] です」 |
| マイク OFF | 「マイクをOFFにしました」 |
| マイク ON | 「マイクをONにしました」 |
| カメラ OFF | 「カメラをOFFにしました」 |
| カメラ ON | 「カメラをONにしました」 |

### スクリーンリーダー用非表示テキスト

```html
<span class="sr-only">通話残り時間</span>
```

Tailwind の `sr-only` クラスを使用（`position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0);`）。

---

## エラー状態

### エラーモーダル（共通コンポーネント）

```html
<div id="modal-error" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
  <div class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
  <div class="relative glass-card rounded-[2rem] p-8 max-w-sm w-full text-center space-y-4 bg-slate-900/90 border border-slate-700">
    <div id="error-icon" class="w-16 h-16 mx-auto rounded-full flex items-center justify-center bg-red-500/20 text-red-400">
      <i data-lucide="alert-triangle" class="w-8 h-8"></i>
    </div>
    <h3 id="error-title" class="text-xl font-bold text-white">接続エラー</h3>
    <p id="error-message" class="text-slate-400 text-sm">接続に問題が発生しました。再試行してください。</p>
    <div id="error-actions" class="flex flex-col gap-3">
      <button id="btn-error-retry" class="btn-primary text-white py-3 rounded-xl font-bold">再試行</button>
      <button id="btn-error-home" class="py-3 rounded-xl font-bold text-slate-400 border border-slate-600 hover:border-slate-400 transition-all">ホームに戻る</button>
    </div>
  </div>
</div>
```

### エラーパターン一覧

| エラー | トリガー | タイトル | メッセージ | アクション |
|---|---|---|---|---|
| カメラ権限拒否 | `getUserMedia` で `NotAllowedError` | カメラの使用が許可されていません | ブラウザの設定からカメラへのアクセスを許可してください。 | 「設定を開く」「音声のみで参加」 |
| マイク権限拒否 | `getUserMedia` で `NotAllowedError` (audio) | マイクの使用が許可されていません | ブラウザの設定からマイクへのアクセスを許可してください。 | 「設定を開く」「ホームに戻る」 |
| デバイス未検出 | `getUserMedia` で `NotFoundError` | カメラ/マイクが見つかりません | カメラまたはマイクが接続されていることを確認してください。 | 「再試行」「ホームに戻る」 |
| 接続失敗 | WebRTC `iceConnectionState === "failed"` | 接続できませんでした | ネットワーク環境を確認してから再試行してください。 | 「再試行」「ホームに戻る」 |
| 接続断 | WebRTC `iceConnectionState === "disconnected"` (10秒以上) | 接続が切れました | ネットワーク環境を確認しています... | 「再接続中...」（自動再試行）「ホームに戻る」 |
| 相手の切断 | サーバーから相手離脱通知 | 相手が通話を終了しました | - | 「次のパートナーを探す」「ホームに戻る」 |
| サーバーエラー | マッチングAPI / 延長API のエラー | サーバーエラー | 時間をおいて再度お試しください。 | 「再試行」「ホームに戻る」 |

### カメラ/マイク権限フロー

```
call.html 読み込み
    ↓
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    ↓
┌─ 成功 → ローカルストリーム取得 → 待機画面表示
│
└─ 失敗
    ├─ NotAllowedError → 権限拒否モーダル表示
    │   ├─「音声のみで参加」→ getUserMedia({ audio: true }) で再試行
    │   └─「設定を開く」→ ブラウザ設定への案内テキスト表示
    │
    ├─ NotFoundError → デバイス未検出モーダル表示
    │
    └─ その他 → 汎用エラーモーダル表示
```

### 接続断時の自動再接続

| 項目 | 仕様 |
|---|---|
| 検知 | `iceConnectionState` が `disconnected` に変化 |
| 猶予 | 10 秒間は自動で再接続試行（画面上部に「接続を復旧中...」バナー表示） |
| 再接続成功 | バナー非表示。通話継続 |
| 再接続失敗（10秒超過） | エラーモーダル表示。「再接続」ボタンで ICE restart を試行 |
| 30 秒超過 | 通話終了画面に遷移 |

再接続中バナー:

```html
<div id="reconnecting-banner"
  class="hidden absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-yellow-500/90 backdrop-blur px-4 py-2 rounded-full text-slate-900 text-xs font-bold flex items-center gap-2">
  <i data-lucide="wifi-off" class="w-4 h-4 animate-pulse"></i>
  接続を復旧しています...
</div>
```

---

## 画面遷移フロー

```
index.html
  │
  │ 「今すぐパートナーを探す」ボタン押下
  │ ※ 要ログイン（未ログイン時は auth-modal 表示）
  ↓
call.html
  │
  ├─ [screen-waiting] マッチング待機
  │   │
  │   ├─ キャンセル → index.html に遷移
  │   │
  │   └─ マッチング成立通知（サーバーから）
  │       ↓
  ├─ [screen-matched] マッチング成立
  │   │
  │   ├─「通話を開始する」ボタン or カウントダウン 0
  │   │   ↓
  │   └─ 相手離脱 → エラーモーダル → [screen-waiting] に戻る
  │       ↓
  ├─ [screen-call] ビデオ通話
  │   │
  │   ├─「通話終了」ボタン → 確認 → [screen-ended]
  │   ├─ タイマー 0:00（延長なし） → [screen-ended]
  │   ├─ 相手の切断 → [screen-ended]（相手が終了した旨を表示）
  │   └─ 接続エラー → エラーモーダル → 再接続 or [screen-ended]
  │       ↓
  └─ [screen-ended] 通話終了
      │
      ├─「次のパートナーを探す」→ [screen-waiting] に遷移
      └─「ホームに戻る」→ index.html に遷移
```

---

## call.html の `<head>` セクション

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="robots" content="noindex, nofollow">
  <title>V-Meet | ビデオ通話</title>
  <!-- Favicon -->
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png">
  <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
  <!-- CSS -->
  <link href="dist/output.css" rel="stylesheet">
  <!-- Icons -->
  <script src="https://unpkg.com/lucide@0.263.1"></script>
</head>
```

注意点:
- `maximum-scale=1.0, user-scalable=no`: 通話中のピンチズーム誤操作を防止
- `noindex, nofollow`: 通話ページは検索エンジンにインデックスさせない
- `index.html` と同じ外部リソース（フォント、アイコン、CSS）を使用

---

## src/input.css への追記

以下のカスタム CSS を既存の `src/input.css` 末尾に追記する。

```css
/* ==============================
   通話画面用 CSS
   ============================== */

/* ローカル映像のミラーリング */
.mirror {
  transform: scaleX(-1);
}

/* パルスリング（検索アニメーション） */
@keyframes pulse-ring {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.5); opacity: 0; }
}

.animate-pulse-ring {
  animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* タイマー警告の点滅 */
.timer-warning {
  color: #FF6B6B;
  animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* 評価ボタン選択状態 */
.rating-btn.selected {
  ring: 2px;
  transform: scale(1.05);
}

.rating-btn.selected[data-rating="good"] {
  background: rgba(34, 197, 94, 0.2);
  box-shadow: 0 0 0 2px rgb(34, 197, 94);
}

.rating-btn.selected[data-rating="neutral"] {
  background: rgba(234, 179, 8, 0.2);
  box-shadow: 0 0 0 2px rgb(234, 179, 8);
}

.rating-btn.selected[data-rating="bad"] {
  background: rgba(239, 68, 68, 0.2);
  box-shadow: 0 0 0 2px rgb(239, 68, 68);
}

/* ランドスケープモード対応 */
@media (orientation: landscape) and (max-height: 500px) {
  #local-video-container {
    width: 5rem;
    height: 6.5rem;
  }

  #screen-call .control-bar {
    padding-bottom: 0.5rem;
  }
}
```

---

## JavaScript 状態管理（`js/call.js`）

### 画面状態の型定義（参考）

```javascript
/**
 * 通話画面の状態管理
 *
 * screenState: 'waiting' | 'matched' | 'call' | 'ended'
 *
 * callState: {
 *   sessionId: string | null,
 *   partnerId: string | null,
 *   partnerName: string,
 *   partnerAge: number,
 *   partnerOccupation: string,
 *   partnerAvatarUrl: string,
 *   isMicOn: boolean,
 *   isCameraOn: boolean,
 *   timerSeconds: number,        // 残り秒数
 *   extensionCount: number,      // 延長回数
 *   totalDurationSeconds: number, // 合計通話秒数
 *   rating: 'good' | 'neutral' | 'bad' | null,
 * }
 */
```

### 画面切り替え関数

```javascript
function switchScreen(screenId) {
  document.querySelectorAll('.screen').forEach(function(el) {
    el.classList.add('hidden');
  });
  var target = document.getElementById('screen-' + screenId);
  if (target) {
    target.classList.remove('hidden');
    // スクリーンリーダーへの通知
    announceScreen(screenId);
  }
}

function announceScreen(screenId) {
  var announcer = document.getElementById('screen-announcer');
  var messages = {
    waiting: 'パートナーを検索中です',
    matched: 'マッチングが成立しました',
    call: 'ビデオ通話が開始されました',
    ended: '通話が終了しました'
  };
  if (announcer && messages[screenId]) {
    announcer.textContent = messages[screenId];
  }
}
```

---

## 通話終了確認ダイアログ

通話中に「通話終了」ボタンを押した際の確認ダイアログ。

```html
<div id="modal-confirm-end" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="通話終了確認">
  <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
  <div class="relative bg-slate-900/95 border border-slate-700 rounded-[2rem] p-8 max-w-xs w-full text-center space-y-4">
    <div class="w-14 h-14 mx-auto rounded-full flex items-center justify-center bg-red-500/20 text-red-400">
      <i data-lucide="phone-off" class="w-7 h-7"></i>
    </div>
    <h3 class="text-lg font-bold text-white">通話を終了しますか？</h3>
    <p class="text-slate-400 text-sm">
      残り <span id="confirm-remaining">3:24</span>
    </p>
    <div class="flex gap-3">
      <button id="btn-confirm-end"
        class="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600 transition-all">
        終了する
      </button>
      <button id="btn-cancel-end"
        class="flex-1 py-3 rounded-xl font-bold text-slate-400 border border-slate-600 hover:border-slate-400 transition-all">
        戻る
      </button>
    </div>
  </div>
</div>
```

---

## 延長確認ダイアログ

料金が発生する延長時の確認ダイアログ（男性ユーザーのみ表示）。

```html
<div id="modal-confirm-extend" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="延長確認">
  <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
  <div class="relative bg-slate-900/95 border border-slate-700 rounded-[2rem] p-8 max-w-xs w-full text-center space-y-4">
    <div class="w-14 h-14 mx-auto rounded-full flex items-center justify-center bg-[#FF6B6B]/20 text-[#FF6B6B]">
      <i data-lucide="repeat" class="w-7 h-7"></i>
    </div>
    <h3 class="text-lg font-bold text-white">5分延長しますか？</h3>
    <p class="text-slate-400 text-sm">延長料金: <span class="text-[#FF6B6B] font-bold">¥300</span></p>
    <div class="flex gap-3">
      <button id="btn-confirm-extend"
        class="flex-1 btn-primary text-white py-3 rounded-xl font-bold">
        延長する
      </button>
      <button id="btn-cancel-extend"
        class="flex-1 py-3 rounded-xl font-bold text-slate-400 border border-slate-600 hover:border-slate-400 transition-all">
        キャンセル
      </button>
    </div>
    <p class="text-slate-500 text-[10px]">※ 料金は後払いで精算されます</p>
  </div>
</div>
```

女性ユーザーの場合は確認ダイアログをスキップし、即座に延長を実行する（料金が無料のため）。

---

## 影響範囲・リスク

### 影響範囲

| 項目 | 影響 |
|---|---|
| 新規ファイル | `call.html`, `js/call.js` |
| 変更ファイル | `tailwind.config.js`（content に `call.html` 追加）、`src/input.css`（通話用 CSS 追記） |
| index.html | 変更なし（CTA ボタンのリンク先を将来的に `call.html` に変更） |
| Vercel デプロイ | 追加設定不要（静的ファイル配信） |

### リスク と 対策

| リスク | 影響度 | 対策 |
|---|---|---|
| ブラウザのカメラ/マイク権限 API の差異 | 高 | `navigator.mediaDevices` の存在チェック。非対応ブラウザにはフォールバック画面表示 |
| モバイルブラウザでの `autoplay` 制限 | 中 | `playsinline` 属性付与。ユーザーインタラクション後に `play()` 呼び出し |
| 通話中のブラウザバック/リロード | 高 | `beforeunload` イベントで「通話中です。ページを離れますか？」確認。WebRTC 接続をクリーンアップ |
| iOS Safari の全画面ビデオ自動化 | 中 | `playsinline` と `webkit-playsinline` 属性で inline 再生を強制 |
| 自分の小窓ドラッグが通話コントロールと重なる | 低 | ドラッグ範囲を制限（下端はコントロールバー上部まで） |
| 延長料金の二重課金 | 高 | サーバー側でべき等性を保証。クライアント側はボタンを一時無効化（loading 状態） |

---

## ブラウザ対応

| ブラウザ | 最低バージョン | 備考 |
|---|---|---|
| Chrome | 80+ | フル対応 |
| Safari | 14.1+ | `playsinline` 必須 |
| Firefox | 78+ | フル対応 |
| Edge | 80+ | Chromium ベースのため Chrome と同等 |
| iOS Safari | 14.5+ | WebRTC 対応。`playsinline` + `webkit-playsinline` |
| Android Chrome | 80+ | フル対応 |

---

## パフォーマンス考慮

| 項目 | 対策 |
|---|---|
| 映像レンダリング | GPU アクセラレーション活用（`will-change: transform` を映像要素に付与） |
| タイマー更新 | `setInterval` 1 秒間隔。DOM 更新は変更がある場合のみ |
| メモリリーク | 画面遷移時に不要な `MediaStream` トラックを `stop()` で解放 |
| バッテリー消費 | カメラ OFF 時はビデオトラックを `stop()` して物理カメラを解放 |
