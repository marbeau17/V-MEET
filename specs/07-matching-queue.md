# 07 - マッチング・待機キューシステム仕様書

| 項目 | 内容 |
|------|------|
| ステータス | Draft |
| 作成日 | 2026-02-22 |
| 対象PJ | V-MEET (vmeetcore-777) |
| 前提 | Firebase Auth 実装済み / Firestore 利用 / Firebase compat SDK (v9 compat) |

---

## 1. 概要

ユーザーが「パートナーを探す」ボタンを押すと待機キューに登録され、サーバーサイド（Cloud Functions）が FIFO ベースでマッチングを行い、成立したペアに対してビデオ通話ルームを生成するシステム。

**基本フロー:**
```
ボタン押下 → キュー登録 → マッチング待機 → マッチング成立 → 通話ルーム生成 → ビデオ通話開始（10分）
```

---

## 2. マッチングフロー詳細

### 2.1 全体シーケンス

```
User A (Client)          Firestore           Cloud Functions         User B (Client)
    |                        |                      |                      |
    |-- 1. "探す" 押下 ------>|                      |                      |
    |   queue/{A} 書込み ---->|                      |                      |
    |                        |-- 2. onCreate ------->|                      |
    |                        |                      |-- 3. キュー検索       |
    |                        |                      |   (FIFO順)            |
    |                        |                      |                      |
    |                        |   (User B が先に     |                      |
    |                        |    キューにいた場合)  |                      |
    |                        |                      |                      |
    |                        |<-- 4. トランザクション |                      |
    |                        |   queue/{A} 削除      |                      |
    |                        |   queue/{B} 削除      |                      |
    |                        |   rooms/{R} 作成      |                      |
    |                        |                      |                      |
    |<-- 5. onSnapshot -------|                      |-------- 5. --------->|
    |   rooms/{R} 検知        |                      |   rooms/{R} 検知     |
    |                        |                      |                      |
    |<================ 6. WebRTC 通話開始 ========================>|
```

### 2.2 ステップ詳細

| ステップ | 処理内容 | 実行者 |
|----------|----------|--------|
| 1 | プラン制限チェック → `queue` に自分を登録 | クライアント |
| 2 | `queue` コレクションの `onCreate` トリガー発火 | Cloud Functions |
| 3 | 待機中の他ユーザーを `enqueuedAt` 昇順で検索 | Cloud Functions |
| 4 | トランザクションで両者の `queue` を削除 + `rooms` を作成 | Cloud Functions |
| 5 | `rooms` コレクションの `onSnapshot` でマッチング検知 | クライアント |
| 6 | WebRTC シグナリング開始 → ビデオ通話 | クライアント |

---

## 3. Firestore データモデル

### 3.1 `queue` コレクション（待機中ユーザー）

パス: `queue/{userId}`

```javascript
// queue/{userId}
{
  uid: "firebase-auth-uid",         // Firebase Auth UID
  displayName: "ユーザー名",         // 表示名
  photoURL: "https://...",          // プロフィール画像URL（nullable）
  plan: "free",                     // "free" | "premium" | "vip"
  priority: 0,                      // マッチング優先度（VIP: 100, Premium: 50, Free: 0）
  enqueuedAt: Timestamp,            // キュー登録時刻（FIFO順序キー）
  status: "waiting",                // "waiting" | "matched"
  matchedWith: null,                // マッチング相手UID（matched時に設定）
  roomId: null,                     // マッチング成立後のルームID（matched時に設定）
  clientTimestamp: Timestamp,       // クライアント側タイムスタンプ（デバッグ用）
}
```

**Firestoreインデックス:**
```
コレクション: queue
フィールド: status ASC, priority DESC, enqueuedAt ASC
```

### 3.2 `rooms` コレクション（通話ルーム）

パス: `rooms/{roomId}`

```javascript
// rooms/{roomId}
{
  roomId: "auto-generated-id",      // ドキュメントID
  participants: {
    caller: {
      uid: "user-a-uid",
      displayName: "ユーザーA",
      joinedAt: Timestamp,          // 入室時刻
      connected: true,              // WebRTC接続状態
      lastHeartbeat: Timestamp,     // 最終ハートビート
    },
    callee: {
      uid: "user-b-uid",
      displayName: "ユーザーB",
      joinedAt: Timestamp,
      connected: true,
      lastHeartbeat: Timestamp,
    }
  },
  status: "waiting",                // "waiting" | "active" | "ended" | "expired"
  createdAt: Timestamp,             // ルーム作成時刻
  callStartedAt: null,              // 通話開始時刻（両者接続後）
  callEndedAt: null,                // 通話終了時刻
  duration: 600,                    // 通話制限秒数（デフォルト600秒=10分）
  extended: false,                  // 延長済みフラグ
  extensionRequestedBy: null,       // 延長リクエスト者UID
  extensionApprovedBy: null,        // 延長承認者UID
  endReason: null,                  // "timeout" | "user_left" | "reported" | "extended_timeout"
  reportedBy: null,                 // 通報者UID（nullable）
}
```

### 3.3 `userStats` コレクション（利用回数管理）

パス: `userStats/{userId}`

```javascript
// userStats/{userId}
{
  uid: "firebase-auth-uid",
  plan: "free",                     // 現在のプラン
  dailyMatchCount: 2,              // 本日のマッチング回数
  dailyMatchDate: "2026-02-22",    // カウント対象の日付（JST）
  totalMatchCount: 45,             // 累計マッチング回数
  lastMatchAt: Timestamp,          // 最終マッチング時刻
  consecutiveCancels: 0,           // 連続キャンセル回数
  isBanned: false,                 // BAN状態
  banUntil: null,                  // BAN解除時刻
}
```

### 3.4 `signals` サブコレクション（WebRTCシグナリング）

パス: `rooms/{roomId}/signals/{signalId}`

```javascript
// rooms/{roomId}/signals/{signalId}
{
  type: "offer",                    // "offer" | "answer" | "ice-candidate"
  from: "user-a-uid",
  to: "user-b-uid",
  payload: { /* SDP or ICE candidate */ },
  createdAt: Timestamp,
}
```

---

## 4. マッチングロジック

### 4.1 Cloud Functions によるサーバーサイドマッチング

マッチングはすべてサーバーサイド（Cloud Functions）で行う。クライアントサイドマッチングは以下の理由で不採用:

- **レース条件**: 複数クライアントが同時に同じ相手を取り合う問題が発生する
- **不正操作**: クライアント側で相手を選別する不正が可能になる
- **一貫性**: サーバー側で単一の権限でマッチングすることで整合性を保証

### 4.2 マッチング関数（Cloud Functions）

```javascript
// functions/src/matching.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * queue コレクションに新規ドキュメントが作成されたとき発火
 */
exports.onQueueCreate = functions
  .region("asia-northeast1")
  .firestore.document("queue/{userId}")
  .onCreate(async (snap, context) => {
    const newUser = snap.data();
    const newUserId = context.params.userId;

    // トランザクションでマッチング実行
    try {
      await db.runTransaction(async (transaction) => {
        // 1. 待機中ユーザーを検索（自分以外、優先度DESC → 登録時刻ASC）
        const queueRef = db
          .collection("queue")
          .where("status", "==", "waiting")
          .orderBy("priority", "desc")
          .orderBy("enqueuedAt", "asc")
          .limit(10);

        const queueSnap = await transaction.get(queueRef);

        // マッチング候補を探す（自分以外の最初のユーザー）
        let matchedDoc = null;
        for (const doc of queueSnap.docs) {
          if (doc.id !== newUserId) {
            matchedDoc = doc;
            break;
          }
        }

        if (!matchedDoc) {
          // マッチング相手がいない → 待機を続行
          console.log(`No match found for ${newUserId}, staying in queue.`);
          return;
        }

        const matchedUser = matchedDoc.data();
        const matchedUserId = matchedDoc.id;

        // 2. 通話ルームを作成
        const roomRef = db.collection("rooms").doc();
        const roomId = roomRef.id;
        const now = admin.firestore.FieldValue.serverTimestamp();

        transaction.set(roomRef, {
          roomId: roomId,
          participants: {
            caller: {
              uid: matchedUserId,    // 先に待っていた方が caller
              displayName: matchedUser.displayName,
              joinedAt: null,
              connected: false,
              lastHeartbeat: null,
            },
            callee: {
              uid: newUserId,
              displayName: newUser.displayName,
              joinedAt: null,
              connected: false,
              lastHeartbeat: null,
            },
          },
          status: "waiting",
          createdAt: now,
          callStartedAt: null,
          callEndedAt: null,
          duration: 600,
          extended: false,
          extensionRequestedBy: null,
          extensionApprovedBy: null,
          endReason: null,
          reportedBy: null,
        });

        // 3. 両者の queue ドキュメントを更新（matched + roomId 付与）
        transaction.update(db.collection("queue").doc(matchedUserId), {
          status: "matched",
          matchedWith: newUserId,
          roomId: roomId,
        });
        transaction.update(db.collection("queue").doc(newUserId), {
          status: "matched",
          matchedWith: matchedUserId,
          roomId: roomId,
        });

        // 4. 両者の dailyMatchCount をインクリメント
        const todayJST = getTodayJST();

        for (const uid of [matchedUserId, newUserId]) {
          const statsRef = db.collection("userStats").doc(uid);
          const statsSnap = await transaction.get(statsRef);

          if (statsSnap.exists && statsSnap.data().dailyMatchDate === todayJST) {
            transaction.update(statsRef, {
              dailyMatchCount: admin.firestore.FieldValue.increment(1),
              totalMatchCount: admin.firestore.FieldValue.increment(1),
              lastMatchAt: now,
            });
          } else {
            transaction.set(statsRef, {
              uid: uid,
              dailyMatchCount: 1,
              dailyMatchDate: todayJST,
              totalMatchCount: admin.firestore.FieldValue.increment(1),
              lastMatchAt: now,
              consecutiveCancels: 0,
              isBanned: false,
              banUntil: null,
            }, { merge: true });
          }
        }

        console.log(`Matched ${newUserId} with ${matchedUserId} in room ${roomId}`);
      });
    } catch (error) {
      console.error("Matching transaction failed:", error);
    }
  });

function getTodayJST() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
}
```

### 4.3 レース条件対策

**問題:** 複数の `onCreate` が同時に発火し、同一の待機ユーザーに対して重複マッチングが行われる可能性がある。

**対策:**

1. **Firestore トランザクション**: `runTransaction` により、読み取った queue ドキュメントが書き込み時に変更されていた場合は自動リトライされる。
2. **status フィールド**: マッチング済みユーザーは `status: "matched"` に更新されるため、次のトランザクションでは検索対象から除外される。
3. **トランザクション内での一貫性**: queue の読み取り・更新・rooms 作成をすべて同一トランザクション内で実行する。

```
Transaction A: User X を読み取り → User X を matched に更新 → commit
Transaction B: User X を読み取り → (commit 時に conflict 検出) → 自動リトライ → User X は matched → skip
```

---

## 5. クライアント側実装

### 5.1 キュー登録

```javascript
async function startSearching() {
  const user = firebase.auth().currentUser;
  if (!user) {
    alert("ログインが必要です");
    return;
  }

  // 1. プラン制限チェック
  const canMatch = await checkDailyLimit(user.uid);
  if (!canMatch) {
    alert("本日のマッチング回数上限に達しました。プレミアムプランにアップグレードしてください。");
    return;
  }

  // 2. 既にキューまたは通話中でないかチェック
  const existingQueue = await firebase.firestore()
    .collection("queue").doc(user.uid).get();
  if (existingQueue.exists) {
    console.warn("Already in queue");
    return;
  }

  // 3. キューに登録
  const userPlan = await getUserPlan(user.uid);
  const priority = getPriority(userPlan);

  await firebase.firestore().collection("queue").doc(user.uid).set({
    uid: user.uid,
    displayName: user.displayName || "匿名",
    photoURL: user.photoURL || null,
    plan: userPlan,
    priority: priority,
    enqueuedAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: "waiting",
    matchedWith: null,
    roomId: null,
    clientTimestamp: new Date(),
  });

  // 4. マッチング監視開始
  listenForMatch(user.uid);
  showWaitingScreen();
}

function getPriority(plan) {
  switch (plan) {
    case "vip":     return 100;
    case "premium": return 50;
    default:        return 0;
  }
}
```

### 5.2 マッチング検知（onSnapshot）

```javascript
let unsubscribeQueue = null;

function listenForMatch(userId) {
  unsubscribeQueue = firebase.firestore()
    .collection("queue")
    .doc(userId)
    .onSnapshot((doc) => {
      if (!doc.exists) {
        // ドキュメントが削除された（エラーケース）
        handleMatchError();
        return;
      }

      const data = doc.data();
      if (data.status === "matched" && data.roomId) {
        // マッチング成立
        unsubscribeQueue();
        enterRoom(data.roomId, userId);
      }
    });
}
```

### 5.3 キャンセル処理

```javascript
async function cancelSearch() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  // キューから削除
  await firebase.firestore().collection("queue").doc(user.uid).delete();

  // 連続キャンセルをカウント
  await firebase.firestore().collection("userStats").doc(user.uid).update({
    consecutiveCancels: firebase.firestore.FieldValue.increment(1),
  });

  if (unsubscribeQueue) {
    unsubscribeQueue();
    unsubscribeQueue = null;
  }

  hideWaitingScreen();
}
```

---

## 6. 待機画面 UX

### 6.1 画面構成

```
┌─────────────────────────────┐
│                             │
│     🔍 パートナーを        │
│       検索中...             │
│                             │
│    [パルスアニメーション]    │
│                             │
│   推定待ち時間: 約30秒      │
│                             │
│   現在の待機人数: 12人      │
│                             │
│   ┌───────────────────┐     │
│   │   キャンセル       │     │
│   └───────────────────┘     │
│                             │
│   ヒント: プレミアムなら    │
│   優先マッチング！          │
│                             │
└─────────────────────────────┘
```

### 6.2 推定待ち時間の計算

```javascript
/**
 * 直近のマッチング速度から待ち時間を推定
 * Firestore の stats/matching ドキュメントから取得
 */
async function getEstimatedWaitTime() {
  const statsDoc = await firebase.firestore()
    .collection("stats").doc("matching").get();

  if (!statsDoc.exists) return "不明";

  const data = statsDoc.data();
  // 直近1時間のマッチング成立数
  const matchesPerHour = data.recentMatchesPerHour || 0;

  if (matchesPerHour === 0) return "数分";

  const avgSeconds = Math.round(3600 / matchesPerHour);

  if (avgSeconds < 30) return "約30秒以内";
  if (avgSeconds < 60) return "約1分";
  if (avgSeconds < 180) return "約2-3分";
  return "数分以上";
}
```

### 6.3 アニメーション仕様

| 要素 | アニメーション | CSS |
|------|--------------|-----|
| 検索アイコン | パルス拡縮 | `animation: pulse 2s infinite` |
| 待機人数 | フェードイン更新 | `transition: opacity 0.3s` |
| 背景 | グラデーション回転 | `animation: gradient-rotate 8s linear infinite` |
| マッチング成立 | バウンス + 紙吹雪 | Lottie アニメーション |

### 6.4 タイムアウト処理

待機が **3分** を超えた場合:
1. 「もう少しお待ちください」メッセージ表示
2. **5分** を超えた場合: 「マッチング相手が見つかりませんでした」→ 自動キャンセル → デイリーカウントは消費しない

```javascript
const QUEUE_TIMEOUT_MS = 5 * 60 * 1000; // 5分

function startQueueTimeout() {
  queueTimer = setTimeout(async () => {
    await cancelSearch();
    showTimeoutMessage();
  }, QUEUE_TIMEOUT_MS);
}
```

---

## 7. 10分タイマーシステム

### 7.1 通話開始とタイマー起動

```javascript
async function startCall(roomId) {
  const roomRef = firebase.firestore().collection("rooms").doc(roomId);

  // 両者が connected になった時点で通話開始
  await roomRef.update({
    callStartedAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: "active",
  });

  // クライアント側カウントダウン開始
  startCountdown(600); // 600秒 = 10分
}

function startCountdown(totalSeconds) {
  let remaining = totalSeconds;
  const timerDisplay = document.getElementById("call-timer");

  callInterval = setInterval(() => {
    remaining--;
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    timerDisplay.textContent = `${min}:${sec.toString().padStart(2, "0")}`;

    // 残り2分で延長提案
    if (remaining === 120) {
      showExtensionPrompt();
    }

    // 残り30秒で警告
    if (remaining === 30) {
      showTimeWarning();
    }

    if (remaining <= 0) {
      clearInterval(callInterval);
      endCall("timeout");
    }
  }, 1000);
}
```

### 7.2 サーバーサイドのタイマー強制終了

クライアント側タイマーは信頼できないため、Cloud Functions のスケジュールジョブで強制終了する。

```javascript
// functions/src/roomCleanup.js
exports.cleanupExpiredRooms = functions
  .region("asia-northeast1")
  .pubsub.schedule("every 1 minutes")
  .onRun(async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    // active 状態で callStartedAt から duration 秒以上経過したルームを検索
    const activeRooms = await db
      .collection("rooms")
      .where("status", "==", "active")
      .get();

    const batch = db.batch();
    let count = 0;

    activeRooms.forEach((doc) => {
      const data = doc.data();
      if (!data.callStartedAt) return;

      const elapsed = now.seconds - data.callStartedAt.seconds;
      if (elapsed > data.duration + 30) { // 30秒の猶予
        batch.update(doc.ref, {
          status: "ended",
          callEndedAt: now,
          endReason: "timeout",
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`Cleaned up ${count} expired rooms.`);
    }
  });
```

### 7.3 延長リクエスト

プレミアム/VIPユーザーのみ利用可能。

```javascript
async function requestExtension(roomId) {
  const user = firebase.auth().currentUser;
  const roomRef = firebase.firestore().collection("rooms").doc(roomId);

  await roomRef.update({
    extensionRequestedBy: user.uid,
  });
}

// 相手側で承認
async function approveExtension(roomId) {
  const user = firebase.auth().currentUser;
  const roomRef = firebase.firestore().collection("rooms").doc(roomId);

  await roomRef.update({
    extensionApprovedBy: user.uid,
    extended: true,
    duration: 1200, // 10分 → 20分に延長
  });
}
```

| プラン | 通話時間 | 延長 |
|--------|----------|------|
| Free | 10分 | 不可 |
| Premium | 10分 | +10分（1回） |
| VIP | 10分 | +10分（無制限） |

---

## 8. 同時接続管理

### 8.1 1ユーザー1通話制限

キュー登録時と通話開始時に既存セッションをチェックする。

```javascript
async function checkExistingSession(userId) {
  const db = firebase.firestore();

  // 1. キューに残っていないかチェック
  const queueDoc = await db.collection("queue").doc(userId).get();
  if (queueDoc.exists && queueDoc.data().status === "waiting") {
    throw new Error("ALREADY_IN_QUEUE");
  }

  // 2. active な通話がないかチェック
  const callerRooms = await db.collection("rooms")
    .where("participants.caller.uid", "==", userId)
    .where("status", "in", ["waiting", "active"])
    .limit(1)
    .get();

  const calleeRooms = await db.collection("rooms")
    .where("participants.callee.uid", "==", userId)
    .where("status", "in", ["waiting", "active"])
    .limit(1)
    .get();

  if (!callerRooms.empty || !calleeRooms.empty) {
    throw new Error("ALREADY_IN_CALL");
  }
}
```

### 8.2 ハートビート（接続維持確認）

```javascript
const HEARTBEAT_INTERVAL = 15000; // 15秒ごと

function startHeartbeat(roomId, role) {
  heartbeatTimer = setInterval(async () => {
    const field = `participants.${role}.lastHeartbeat`;
    await firebase.firestore().collection("rooms").doc(roomId).update({
      [field]: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }, HEARTBEAT_INTERVAL);
}
```

### 8.3 切断検知とゴーストユーザー対策

Cloud Functions のスケジュールジョブでゴーストユーザーを検知・除去する。

```javascript
// functions/src/ghostCleanup.js

// 1. キューのゴーストユーザー除去（5分以上ハングしたキュー）
exports.cleanupGhostQueue = functions
  .region("asia-northeast1")
  .pubsub.schedule("every 2 minutes")
  .onRun(async () => {
    const db = admin.firestore();
    const fiveMinAgo = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 5 * 60 * 1000)
    );

    const staleQueue = await db.collection("queue")
      .where("status", "==", "waiting")
      .where("enqueuedAt", "<", fiveMinAgo)
      .get();

    const batch = db.batch();
    staleQueue.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    console.log(`Removed ${staleQueue.size} ghost queue entries.`);
  });

// 2. 通話中のゴーストユーザー検知（ハートビート途絶）
exports.cleanupGhostRooms = functions
  .region("asia-northeast1")
  .pubsub.schedule("every 1 minutes")
  .onRun(async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const threshold = 45; // 45秒ハートビート途絶で切断とみなす

    const activeRooms = await db.collection("rooms")
      .where("status", "==", "active")
      .get();

    const batch = db.batch();
    let count = 0;

    activeRooms.forEach((doc) => {
      const data = doc.data();
      const callerHB = data.participants?.caller?.lastHeartbeat;
      const calleeHB = data.participants?.callee?.lastHeartbeat;

      const callerDead = callerHB && (now.seconds - callerHB.seconds > threshold);
      const calleeDead = calleeHB && (now.seconds - calleeHB.seconds > threshold);

      if (callerDead || calleeDead) {
        batch.update(doc.ref, {
          status: "ended",
          callEndedAt: now,
          endReason: "user_left",
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`Ended ${count} rooms due to ghost users.`);
    }
  });
```

### 8.4 ブラウザ離脱時のクリーンアップ

```javascript
// beforeunload でキューから自身を削除
window.addEventListener("beforeunload", () => {
  const user = firebase.auth().currentUser;
  if (user) {
    // sendBeacon で確実にリクエストを送信
    navigator.sendBeacon(
      "/api/cleanup",
      JSON.stringify({ uid: user.uid })
    );
  }
});

// visibilitychange でも検知
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    // ハートビート停止（ゴースト検知に任せる）
    clearInterval(heartbeatTimer);
  } else {
    // 復帰時にハートビート再開
    if (currentRoomId) {
      startHeartbeat(currentRoomId, currentRole);
    }
  }
});
```

---

## 9. プラン別制限

### 9.1 制限一覧

| 機能 | Free | Premium | VIP |
|------|------|---------|-----|
| 1日のマッチング回数 | 3回 | 無制限 | 無制限 |
| 通話時間 | 10分 | 10分（+10分延長可） | 10分（+10分延長 無制限） |
| マッチング優先度 | 標準 (0) | 高 (50) | 最高 (100) |
| 推定待ち時間表示 | なし | あり | あり |
| マッチング履歴閲覧 | 直近3件 | 直近30件 | 無制限 |

### 9.2 デイリー制限チェック

```javascript
async function checkDailyLimit(userId) {
  const statsDoc = await firebase.firestore()
    .collection("userStats").doc(userId).get();

  if (!statsDoc.exists) return true; // 初回ユーザー

  const stats = statsDoc.data();
  const todayJST = getTodayJST();

  // 日付が変わっていればリセット
  if (stats.dailyMatchDate !== todayJST) return true;

  // プラン別チェック
  if (stats.plan === "premium" || stats.plan === "vip") return true;

  // Free プランは1日3回まで
  return stats.dailyMatchCount < 3;
}

function getTodayJST() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
}
```

### 9.3 優先度マッチングの仕組み

キュー検索時に `priority DESC, enqueuedAt ASC` の順でソートする。これにより:

- VIP (priority: 100) が最優先でマッチングされる
- 同じ優先度内では FIFO（先着順）
- Free ユーザーは VIP/Premium が全員マッチング済みになってからマッチングされる

**注意:** 過度な優先度差はFreeユーザーの体験を損なうため、ピーク時以外は優先度の影響を軽減するロジックを将来検討する。

---

## 10. 不正利用防止

### 10.1 レート制限

| 制限項目 | 値 | 対象 |
|----------|----|------|
| キュー登録間隔 | 最低10秒 | 全ユーザー |
| 連続キャンセル制限 | 5回で15分BAN | 全ユーザー |
| 1時間あたりのマッチング | 最大10回 | Free |
| 通報回数 | 3回/日まで | 全ユーザー |

### 10.2 連続キャンセル防止

マッチング成立後30秒以内の切断を「キャンセル」とみなす。

```javascript
// Cloud Functions: 通話終了時にキャンセル判定
exports.onRoomUpdate = functions
  .region("asia-northeast1")
  .firestore.document("rooms/{roomId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // status が active 以外 → ended に変わった場合
    if (before.status !== "ended" && after.status === "ended") {
      const createdAt = after.createdAt?.toDate();
      const endedAt = after.callEndedAt?.toDate();

      if (createdAt && endedAt) {
        const durationSec = (endedAt - createdAt) / 1000;

        // 30秒以内の終了はキャンセルとみなす
        if (durationSec < 30 && after.endReason === "user_left") {
          const leaverUid = detectLeaver(before, after);
          if (leaverUid) {
            await incrementCancelCount(leaverUid);
          }
        }
      }
    }
  });

async function incrementCancelCount(uid) {
  const statsRef = admin.firestore().collection("userStats").doc(uid);
  const stats = await statsRef.get();
  const currentCancels = (stats.data()?.consecutiveCancels || 0) + 1;

  const updateData = {
    consecutiveCancels: currentCancels,
  };

  // 5回連続キャンセルで15分BAN
  if (currentCancels >= 5) {
    updateData.isBanned = true;
    updateData.banUntil = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 15 * 60 * 1000)
    );
  }

  await statsRef.update(updateData);
}
```

### 10.3 通報機能との連携

```javascript
async function reportUser(roomId, reportedUid, reason) {
  const user = firebase.auth().currentUser;

  // 1. rooms ドキュメントに通報記録
  await firebase.firestore().collection("rooms").doc(roomId).update({
    reportedBy: user.uid,
    status: "ended",
    endReason: "reported",
  });

  // 2. reports コレクションに詳細記録
  await firebase.firestore().collection("reports").add({
    reporterUid: user.uid,
    reportedUid: reportedUid,
    roomId: roomId,
    reason: reason, // "inappropriate" | "spam" | "harassment" | "other"
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    reviewed: false,
  });
}
```

### 10.4 BAN チェック

キュー登録前に BAN 状態を確認する。

```javascript
async function checkBanStatus(userId) {
  const stats = await firebase.firestore()
    .collection("userStats").doc(userId).get();

  if (!stats.exists) return false;

  const data = stats.data();
  if (!data.isBanned) return false;

  // BAN期限切れチェック
  if (data.banUntil && data.banUntil.toDate() < new Date()) {
    // BAN解除
    await firebase.firestore().collection("userStats").doc(userId).update({
      isBanned: false,
      banUntil: null,
      consecutiveCancels: 0,
    });
    return false;
  }

  return true; // まだBAN中
}
```

---

## 11. スケーラビリティ

### 11.1 Firestore の制限事項

| 制限 | 値 | 対策 |
|------|----|------|
| ドキュメント書き込み | 1回/秒/ドキュメント | queue は userId をキーにするため衝突しにくい |
| コレクション書き込み | 10,000回/秒 | 初期段階では十分 |
| トランザクション | 最大500ドキュメント | 1マッチングで4-6ドキュメントのため余裕あり |
| onSnapshot リスナー | 同時接続数制限なし（コスト注意） | 必要最小限のフィールドを監視 |

### 11.2 設計上の考慮

**queue コレクションのサイズ管理:**
- マッチング成立後、queue ドキュメントは `status: "matched"` に更新
- Cloud Functions のスケジュールジョブで古い matched / stale ドキュメントを定期削除（1時間ごと）
- queue ドキュメントには TTL（Time To Live）を設定し、Firestore TTL ポリシーでの自動削除も検討

```javascript
// キュー登録時にTTLフィールドを付与
await firebase.firestore().collection("queue").doc(user.uid).set({
  // ... other fields
  expireAt: new Date(Date.now() + 10 * 60 * 1000), // 10分後に自動削除
});
```

**rooms コレクションのアーカイブ:**
- ended 状態のルームは24時間後に `rooms_archive` コレクションに移動
- 直近の通話履歴表示は `rooms` から、過去データは `rooms_archive` から取得

**読み取りコスト最適化:**
- クライアントの `onSnapshot` は自分の `queue/{userId}` 1件のみ監視
- ルーム情報も `rooms/{roomId}` 1件のみ監視
- 待機人数やマッチング統計は集計ドキュメント `stats/matching` から取得（リアルタイム更新は不要、1分ごとに Cloud Functions で更新）

### 11.3 将来的なスケールアウト

ユーザー数が増加した場合の段階的対策:

| フェーズ | ユーザー規模 | 対策 |
|----------|------------|------|
| Phase 1 | ~1,000 DAU | 現行設計で十分 |
| Phase 2 | ~10,000 DAU | queue をシャード化（地域/性別で分割） |
| Phase 3 | ~100,000 DAU | マッチングロジックを Cloud Run に移行、Redis キュー導入検討 |

---

## 12. Firestore セキュリティルール

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // queue: 自分のドキュメントのみ作成・削除可能、更新は Cloud Functions のみ
    match /queue/{userId} {
      allow create: if request.auth != null
                    && request.auth.uid == userId
                    && request.resource.data.status == "waiting";
      allow read:   if request.auth != null
                    && request.auth.uid == userId;
      allow delete: if request.auth != null
                    && request.auth.uid == userId;
      allow update: if false; // Cloud Functions (admin SDK) のみ
    }

    // rooms: 参加者のみ読み取り可能、更新は限定的
    match /rooms/{roomId} {
      allow read: if request.auth != null
                  && (resource.data.participants.caller.uid == request.auth.uid
                      || resource.data.participants.callee.uid == request.auth.uid);
      allow update: if request.auth != null
                    && (resource.data.participants.caller.uid == request.auth.uid
                        || resource.data.participants.callee.uid == request.auth.uid)
                    && onlyAllowedFields();
      allow create, delete: if false; // Cloud Functions のみ

      // signals サブコレクション
      match /signals/{signalId} {
        allow read, create: if request.auth != null
                            && isRoomParticipant(roomId);
      }
    }

    // userStats: 自分のみ読み取り可能、更新は Cloud Functions のみ
    match /userStats/{userId} {
      allow read: if request.auth != null
                  && request.auth.uid == userId;
      allow write: if false; // Cloud Functions のみ
    }

    // reports: 認証済みユーザーのみ作成可能
    match /reports/{reportId} {
      allow create: if request.auth != null
                    && request.resource.data.reporterUid == request.auth.uid;
      allow read, update, delete: if false; // 管理者のみ
    }

    // ヘルパー関数
    function isRoomParticipant(roomId) {
      let room = get(/databases/$(database)/documents/rooms/$(roomId));
      return room.data.participants.caller.uid == request.auth.uid
             || room.data.participants.callee.uid == request.auth.uid;
    }

    function onlyAllowedFields() {
      // クライアントから更新可能なフィールドを制限
      let allowed = ['extensionRequestedBy', 'extensionApprovedBy', 'reportedBy'];
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly(allowed);
    }
  }
}
```

---

## 13. エラーハンドリング

| エラー | 原因 | 対処 |
|--------|------|------|
| `ALREADY_IN_QUEUE` | 二重キュー登録 | UIで「既に検索中です」表示 |
| `ALREADY_IN_CALL` | 通話中に再検索 | UIで「通話中です」表示 |
| `DAILY_LIMIT_REACHED` | 無料プランの回数制限 | アップグレード誘導 |
| `USER_BANNED` | 不正利用によるBAN | BAN解除時刻を表示 |
| `MATCH_TIMEOUT` | 5分以内に相手が見つからない | 再検索を促す |
| `ROOM_EXPIRED` | ルーム有効期限切れ | 再マッチングを促す |
| `HEARTBEAT_LOST` | 相手の接続途絶 | 「相手が退出しました」表示 |
| `TRANSACTION_FAILED` | Firestoreトランザクション失敗 | 自動リトライ（最大3回） |

---

## 14. 監視・運用

### 14.1 Cloud Functions ログ

すべての Cloud Functions にて以下をログ出力:
- マッチング成立: `Matched {userA} with {userB} in room {roomId}`
- ゴースト除去: `Removed {count} ghost queue entries`
- ルーム期限切れ: `Cleaned up {count} expired rooms`
- BAN発動: `Banned user {userId} until {banUntil}`

### 14.2 集計ドキュメント（stats/matching）

Cloud Functions のスケジュールジョブ（1分ごと）で更新:

```javascript
// stats/matching
{
  currentQueueSize: 12,          // 現在の待機人数
  recentMatchesPerHour: 45,      // 直近1時間のマッチング数
  avgWaitTimeSeconds: 28,        // 平均待ち時間（秒）
  activeRoomCount: 8,            // 現在のアクティブ通話数
  updatedAt: Timestamp,
}
```

---

## 付録: ファイル構成（想定）

```
functions/
  src/
    matching.js          # onQueueCreate マッチングロジック
    roomCleanup.js       # 期限切れルーム・ゴーストユーザー除去
    statsAggregator.js   # 集計ドキュメント更新
    index.js             # Cloud Functions エントリーポイント

js/
  matching/
    queue.js             # キュー登録・キャンセル・監視
    room.js              # ルーム入室・退室・ハートビート
    timer.js             # 10分タイマー・延長リクエスト
    waitingScreen.js     # 待機画面UI制御

firestore.rules          # セキュリティルール
firestore.indexes.json   # 複合インデックス定義
```
