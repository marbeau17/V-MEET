# 03 - モバイルハンバーガーメニュー仕様書

## 1. 概要

768px (Tailwind `md`) 以下のブレークポイントで、ナビゲーションリンク（ユーザー例 / 使い方 / 料金）が `hidden md:flex` により非表示になっている。モバイルユーザーがこれらのリンクにアクセスできるよう、ハンバーガーアイコンによる開閉式メニューを追加する。

- **対象ブレークポイント**: `< 768px`（md未満）
- **技術制約**: vanilla JS のみ（外部ライブラリ不使用）
- **デザイン方針**: 既存の `glass-card` スタイルを踏襲し、ブランド統一感を維持

---

## 2. UI 設計

### 2.1 閉じた状態（デフォルト）

```
[ロゴ]                    [ハンバーガー ☰] [無料登録]
```

- ハンバーガーアイコン（三本線）は `md` 未満でのみ表示（`md:hidden`）
- ナビリンク群（`hidden md:flex`）は引き続き非表示
- 「無料登録」ボタンは従来通り常時表示

### 2.2 開いた状態

```
[ロゴ]                    [  X  ] [無料登録]
┌──────────────────────────────────────────┐
│  ユーザー例                               │
│  使い方                                   │
│  料金                                     │
└──────────────────────────────────────────┘
```

- ハンバーガーアイコンが X（閉じるアイコン）に変化
- ナビバー直下にドロップダウンパネルが `glass-card` 風デザインで表示
- ドロップダウン背後に半透明オーバーレイ（`bg-black/30`）がビューポート全体を覆う

---

## 3. HTML 構造

### 3.1 変更対象

`index.html` の `<nav>` 要素（line 82-97）を修正する。

### 3.2 追加する要素

#### ハンバーガーボタン（nav 内、無料登録ボタンの直前に挿入）

```html
<!-- Mobile Menu Toggle -->
<button
  id="mobile-menu-toggle"
  class="md:hidden flex flex-col justify-center items-center w-10 h-10 gap-1.5"
  aria-label="メニューを開く"
  aria-expanded="false"
  aria-controls="mobile-menu"
>
  <span class="hamburger-line block w-6 h-0.5 bg-slate-700 rounded-full transition-all duration-300 origin-center"></span>
  <span class="hamburger-line block w-6 h-0.5 bg-slate-700 rounded-full transition-all duration-300 origin-center"></span>
  <span class="hamburger-line block w-6 h-0.5 bg-slate-700 rounded-full transition-all duration-300 origin-center"></span>
</button>
```

#### ドロップダウンメニュー（`</nav>` の直後に挿入）

```html
<!-- Mobile Menu Overlay -->
<div
  id="mobile-menu-overlay"
  class="fixed inset-0 bg-black/30 z-40 opacity-0 pointer-events-none transition-opacity duration-300"
  aria-hidden="true"
></div>

<!-- Mobile Menu Dropdown -->
<div
  id="mobile-menu"
  class="fixed top-[72px] left-0 right-0 z-50 overflow-hidden transition-all duration-300 ease-out"
  style="max-height: 0;"
  role="navigation"
  aria-label="モバイルメニュー"
>
  <div class="glass-card border-b border-pink-50 px-6 py-6 flex flex-col gap-4">
    <a href="#samples" class="mobile-menu-link text-lg font-medium text-slate-700 hover:text-[#FF6B6B] transition-colors py-2">
      ユーザー例
    </a>
    <a href="#how-it-works" class="mobile-menu-link text-lg font-medium text-slate-700 hover:text-[#FF6B6B] transition-colors py-2">
      使い方
    </a>
    <a href="#pricing" class="mobile-menu-link text-lg font-medium text-slate-700 hover:text-[#FF6B6B] transition-colors py-2">
      料金
    </a>
  </div>
</div>
```

### 3.3 nav 要素全体の修正後構造

```html
<nav class="fixed w-full z-50 glass-card px-6 py-4 flex justify-between items-center border-b border-pink-50">
  <!-- ロゴ（変更なし） -->
  <div class="flex items-center gap-2">
    <div class="w-10 h-10 bg-[#FF6B6B] rounded-xl flex items-center justify-center text-white shadow-lg">
      <i data-lucide="video"></i>
    </div>
    <span class="text-2xl font-bold tracking-tight text-slate-800">V-Meet</span>
  </div>

  <!-- デスクトップ用ナビリンク（変更なし） -->
  <div class="hidden md:flex gap-8 font-medium text-slate-600">
    <a href="#samples" class="hover:text-[#FF6B6B] transition-colors">ユーザー例</a>
    <a href="#how-it-works" class="hover:text-[#FF6B6B] transition-colors">使い方</a>
    <a href="#pricing" class="hover:text-[#FF6B6B] transition-colors">料金</a>
  </div>

  <!-- 右側：ハンバーガー + 無料登録 -->
  <div class="flex items-center gap-3">
    <!-- ハンバーガーボタン（md以下のみ表示） -->
    <button
      id="mobile-menu-toggle"
      class="md:hidden flex flex-col justify-center items-center w-10 h-10 gap-1.5"
      aria-label="メニューを開く"
      aria-expanded="false"
      aria-controls="mobile-menu"
    >
      <span class="hamburger-line block w-6 h-0.5 bg-slate-700 rounded-full transition-all duration-300 origin-center"></span>
      <span class="hamburger-line block w-6 h-0.5 bg-slate-700 rounded-full transition-all duration-300 origin-center"></span>
      <span class="hamburger-line block w-6 h-0.5 bg-slate-700 rounded-full transition-all duration-300 origin-center"></span>
    </button>

    <!-- 無料登録ボタン（変更なし） -->
    <button class="btn-primary text-white px-6 py-2 rounded-full font-bold shadow-lg">
      無料登録
    </button>
  </div>
</nav>
```

**注意**: 「無料登録」ボタンとハンバーガーアイコンを `<div class="flex items-center gap-3">` で包む。これにより、デスクトップでは `justify-between` の右端に「無料登録」のみが表示され、モバイルではハンバーガー + 無料登録が並ぶ。

---

## 4. CSS（追加するスタイル）

`<style>` タグ内に以下を追加する。

```css
/* ===========================
   Mobile Hamburger Menu
   =========================== */

/* ハンバーガー → X アニメーション */
#mobile-menu-toggle.is-open .hamburger-line:nth-child(1) {
  transform: translateY(8px) rotate(45deg);
}

#mobile-menu-toggle.is-open .hamburger-line:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}

#mobile-menu-toggle.is-open .hamburger-line:nth-child(3) {
  transform: translateY(-8px) rotate(-45deg);
}

/* メニューリンクのスタガーアニメーション */
.mobile-menu-link {
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.25s ease, transform 0.25s ease;
}

#mobile-menu.is-open .mobile-menu-link {
  opacity: 1;
  transform: translateY(0);
}

#mobile-menu.is-open .mobile-menu-link:nth-child(1) { transition-delay: 0.05s; }
#mobile-menu.is-open .mobile-menu-link:nth-child(2) { transition-delay: 0.10s; }
#mobile-menu.is-open .mobile-menu-link:nth-child(3) { transition-delay: 0.15s; }

/* オーバーレイ表示状態 */
#mobile-menu-overlay.is-open {
  opacity: 1;
  pointer-events: auto;
}
```

### 4.1 スタイル補足

| プロパティ | 値 | 説明 |
|---|---|---|
| ドロップダウン背景 | `glass-card` クラス（既存） | `rgba(255,255,255,0.85)` + `backdrop-filter: blur(12px)` |
| 展開時 max-height | `300px`（JS で制御） | 3リンク + パディングに十分な高さ |
| オーバーレイ | `bg-black/30` | 半透明黒、z-index: 40（nav の z-50 より下） |
| アニメーション duration | `300ms` | `ease-out` カーブで自然な開閉感 |

---

## 5. JavaScript（イベントハンドリングロジック）

`</body>` 直前（`lucide.createIcons()` の後）に以下を追加する。

```javascript
// ===========================
// Mobile Menu Controller
// ===========================
(function () {
  const toggle = document.getElementById('mobile-menu-toggle');
  const menu = document.getElementById('mobile-menu');
  const overlay = document.getElementById('mobile-menu-overlay');
  const links = menu.querySelectorAll('.mobile-menu-link');

  let isOpen = false;

  function openMenu() {
    isOpen = true;
    toggle.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'メニューを閉じる');

    menu.classList.add('is-open');
    menu.style.maxHeight = menu.scrollHeight + 'px';

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeMenu() {
    isOpen = false;
    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'メニューを開く');

    menu.classList.remove('is-open');
    menu.style.maxHeight = '0';

    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  // トグルボタン
  toggle.addEventListener('click', function () {
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // オーバーレイタップで閉じる
  overlay.addEventListener('click', closeMenu);

  // メニュー内リンクタップで閉じる
  links.forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  // Escape キーで閉じる
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) {
      closeMenu();
      toggle.focus();
    }
  });

  // ウィンドウリサイズで md 以上になったら閉じる
  window.addEventListener('resize', function () {
    if (window.innerWidth >= 768 && isOpen) {
      closeMenu();
    }
  });
})();
```

### 5.1 ロジック一覧

| トリガー | アクション |
|---|---|
| ハンバーガーボタンタップ | `isOpen` を反転し `openMenu()` or `closeMenu()` を実行 |
| オーバーレイタップ | `closeMenu()` |
| メニュー内リンクタップ | `closeMenu()`（スムーススクロールが自然に発動） |
| `Escape` キー押下 | `closeMenu()` + トグルボタンへフォーカス移動 |
| ウィンドウ幅が 768px 以上にリサイズ | `closeMenu()`（デスクトップ表示への切り替え時） |

---

## 6. アクセシビリティ対応

### 6.1 ARIA 属性

| 属性 | 要素 | 閉じた状態 | 開いた状態 |
|---|---|---|---|
| `aria-expanded` | `#mobile-menu-toggle` | `"false"` | `"true"` |
| `aria-label` | `#mobile-menu-toggle` | `"メニューを開く"` | `"メニューを閉じる"` |
| `aria-controls` | `#mobile-menu-toggle` | `"mobile-menu"` | `"mobile-menu"` |
| `aria-hidden` | `#mobile-menu-overlay` | `"true"` | `"false"` |
| `role` | `#mobile-menu` | `"navigation"` | `"navigation"` |
| `aria-label` | `#mobile-menu` | `"モバイルメニュー"` | `"モバイルメニュー"` |

### 6.2 キーボード操作

- `Tab` キー: メニュー開閉ボタンにフォーカス可能
- `Enter` / `Space`: ボタンのネイティブ動作でメニュー開閉
- `Escape`: メニューを閉じ、トグルボタンにフォーカスを戻す

### 6.3 スクリーンリーダー対応

- ボタンの `aria-label` が状態に応じて動的に切り替わるため、現在の操作が音声で伝わる
- `aria-expanded` により、メニューの開閉状態が通知される

---

## 7. インタラクション定義

### 7.1 開くアニメーション

```
時間: 300ms
イージング: ease-out

1. ハンバーガーアイコン → X アイコン変形（CSS transform）
   - 上線: translateY(8px) + rotate(45deg)
   - 中線: opacity → 0, scaleX → 0
   - 下線: translateY(-8px) + rotate(-45deg)

2. オーバーレイ: opacity 0 → 1（300ms）

3. ドロップダウンパネル: max-height 0 → scrollHeight（300ms ease-out）

4. メニューリンク: スタガーフェードイン
   - 各リンクが 50ms ずつ遅延して opacity 0→1, translateY(-8px)→0
```

### 7.2 閉じるアニメーション

```
時間: 300ms
イージング: ease-out

1. X アイコン → ハンバーガーアイコン復帰（CSS transform 解除）
2. オーバーレイ: opacity 1 → 0（300ms）
3. ドロップダウンパネル: max-height → 0（300ms ease-out）
4. メニューリンク: 即座に opacity 0 に戻る（is-open 解除で transition-delay なし）
```

### 7.3 トリガー条件まとめ

| 条件 | 結果 |
|---|---|
| ビューポート幅 < 768px | ハンバーガーボタン表示 |
| ビューポート幅 >= 768px | ハンバーガーボタン非表示、デスクトップナビ表示 |
| ハンバーガーボタンタップ（閉じた状態） | メニュー展開 |
| ハンバーガーボタンタップ（開いた状態） | メニュー収納 |
| オーバーレイタップ | メニュー収納 |
| メニューリンクタップ | メニュー収納 → 該当セクションへスクロール |
| Escape キー押下 | メニュー収納 → ボタンへフォーカス |
| リサイズで 768px 以上へ | メニュー収納（デスクトップ表示に自動切替） |

---

## 8. 実装時の注意事項

1. **z-index 階層**: nav(`z-50`) > mobile-menu(`z-50`, nav直下に配置) > overlay(`z-40`)
2. **top 値**: `#mobile-menu` の `top: 72px` はナビバーの実際の高さに合わせること（`px-6 py-4` + ボーダー = 約72px）。実装時に `nav.offsetHeight` で動的に算出することも検討。
3. **scroll-behavior**: `body` に `scroll-behavior: smooth` が既に設定されているため、リンクタップ後のスクロールは自動でスムーズになる。
4. **Tailwind CDN**: プロジェクトは Tailwind CDN を使用しているため、カスタムクラスは `<style>` タグ内に記述する。
5. **lucide アイコン**: ハンバーガーアイコンは CSS の `<span>` で構成し、lucide アイコンは使用しない。これにより、アニメーション制御が容易になる。
