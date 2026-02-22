# 09 Firebase バックエンド・セキュリティ仕様書

## 概要

V-Meet のビデオマッチングサービスにおける Firebase バックエンド設計の全体仕様。Firestore データモデル、Security Rules、Cloud Functions、課金連携、セキュリティ対策、監視・ログの設計を定義する。

### 前提

| 項目 | 値 |
|------|-----|
| Firebase プロジェクト | `vmeetcore-777` |
| 認証方式 | Firebase Auth（メール/パスワード + Google） |
| ビデオ通話 | WebRTC (P2P)、シグナリングに Firestore 使用 |
| ホスティング | フロントエンドは Vercel 静的デプロイ |
| Cloud Functions ランタイム | Node.js 20（第2世代） |
| リージョン | `asia-northeast1`（東京） |

### 料金プラン（現行）

| プラン | 月額 | 内容 |
|--------|------|------|
| Entry Plan（基本プラン） | 980 円 | プロフィール閲覧、AI マッチング |
| 10分面談チケット | 500 円/枚 | 1回の通話で1枚消費 |
| 延長料金 | 300 円/5分 | 通話中にワンタップ延長 |

> 女性ユーザーは全プラン無料・無制限（延長料金含む）。

---

## 1. Firestore データモデル

### 1.1 `users/{uid}` - ユーザープロフィール

```
users/{uid}
├── displayName: string           // 表示名
├── email: string                 // メールアドレス
├── photoURL: string | null       // アバター画像URL
├── gender: "male" | "female" | "other"  // 性別
├── birthDate: timestamp          // 生年月日
├── bio: string                   // 自己紹介（最大500文字）
├── plan: "free" | "entry"        // 現在のプラン
├── planExpiresAt: timestamp | null      // プラン有効期限
├── tickets: number               // 残りチケット枚数
├── totalCallCount: number        // 累計通話回数
├── totalCallMinutes: number      // 累計通話分数
├── dailyCallCount: number        // 当日の通話回数
├── dailyCallDate: string         // dailyCallCount の基準日 (YYYY-MM-DD)
├── isBanned: boolean             // BAN状態
├── banReason: string | null      // BAN理由
├── bannedAt: timestamp | null    // BAN日時
├── reportCount: number           // 被通報回数（累計）
├── stripeCustomerId: string | null  // Stripe顧客ID（将来用）
├── fcmToken: string | null       // プッシュ通知トークン
├── createdAt: timestamp          // アカウント作成日時
├── updatedAt: timestamp          // 最終更新日時
└── lastActiveAt: timestamp       // 最終アクティブ日時
```

**インデックス:**
- `gender` + `lastActiveAt`（マッチング用）
- `isBanned` + `plan`（管理画面フィルタ用）

### 1.2 `queue/{docId}` - マッチング待機キュー

ドキュメントID は `{uid}` と同一（1ユーザー1エントリ保証）。

```
queue/{uid}
├── uid: string                   // ユーザーUID
├── displayName: string           // 表示名（マッチング画面表示用）
├── gender: "male" | "female" | "other"  // 性別
├── preferredGender: "male" | "female" | "any"  // 希望相手の性別
├── plan: "free" | "entry"        // プラン（優先マッチング判定用）
├── joinedAt: timestamp           // キュー登録日時
├── status: "waiting" | "matched" // 状態
├── matchedWith: string | null    // マッチ相手のUID
├── roomId: string | null         // 割り当てられたルームID
└── expiresAt: timestamp          // 有効期限（5分後に自動削除）
```

**インデックス:**
- `status` + `gender` + `preferredGender` + `joinedAt`（マッチングクエリ用）

### 1.3 `rooms/{roomId}` - 通話ルーム

ドキュメントID は自動生成。

```
rooms/{roomId}
├── participants: string[]         // 参加者UID配列（2名固定）
├── status: "waiting" | "active" | "extending" | "ended"
├── createdAt: timestamp           // ルーム作成日時
├── startedAt: timestamp | null    // 通話開始日時（ICE接続完了時）
├── endedAt: timestamp | null      // 通話終了日時
├── baseDurationSec: number        // 基本通話時間（秒）= 600（10分）
├── extensions: number             // 延長回数
├── totalDurationSec: number       // 合計通話時間（秒）
├── endReason: "normal" | "timeout" | "disconnect" | "report"
├── ticketsConsumed: number        // 消費チケット数
├── extensionChargeYen: number     // 延長料金合計（円）
│
├── offer/                         // サブコレクション: SDP Offer
│   └── {participantUid}
│       ├── type: "offer"
│       ├── sdp: string
│       └── createdAt: timestamp
│
├── answer/                        // サブコレクション: SDP Answer
│   └── {participantUid}
│       ├── type: "answer"
│       ├── sdp: string
│       └── createdAt: timestamp
│
└── candidates/                    // サブコレクション: ICE Candidates
    └── {autoId}
        ├── uid: string            // 送信者UID
        ├── candidate: string      // ICE candidate文字列
        ├── sdpMid: string
        ├── sdpMLineIndex: number
        └── createdAt: timestamp
```

### 1.4 `reports/{reportId}` - 通報データ

```
reports/{reportId}
├── reporterUid: string            // 通報者UID
├── targetUid: string              // 被通報者UID
├── roomId: string | null          // 関連ルームID
├── reason: string                 // 通報理由カテゴリ
│   // "harassment" | "inappropriate" | "spam" | "underage" | "other"
├── description: string            // 詳細（最大1000文字）
├── status: "pending" | "reviewed" | "resolved"
├── reviewedBy: string | null      // 対応した管理者UID
├── action: "none" | "warn" | "ban" | null  // 取られた措置
├── createdAt: timestamp           // 通報日時
└── reviewedAt: timestamp | null   // 対応日時
```

**インデックス:**
- `targetUid` + `createdAt`（同一ユーザーへの通報履歴）
- `status` + `createdAt`（未対応通報一覧）

### 1.5 `payments/{paymentId}` - 決済履歴

```
payments/{paymentId}
├── uid: string                    // ユーザーUID
├── type: "ticket_purchase" | "extension" | "subscription"
├── amount: number                 // 金額（円）
├── quantity: number | null        // チケット枚数
├── roomId: string | null          // 関連ルームID（延長の場合）
├── stripePaymentIntentId: string | null  // Stripe決済ID
├── status: "pending" | "succeeded" | "failed" | "refunded"
├── createdAt: timestamp           // 決済日時
└── completedAt: timestamp | null  // 完了日時
```

---

## 2. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ========================================
    // ヘルパー関数
    // ========================================

    // 認証済みかどうか
    function isAuthenticated() {
      return request.auth != null;
    }

    // リクエスト送信者のUID
    function uid() {
      return request.auth.uid;
    }

    // 自分自身のドキュメントか
    function isOwner(userId) {
      return isAuthenticated() && uid() == userId;
    }

    // BANされていないか
    function isNotBanned() {
      return isAuthenticated()
        && get(/databases/$(database)/documents/users/$(uid())).data.isBanned != true;
    }

    // タイムスタンプの検証
    function isValidTimestamp(field) {
      return request.resource.data[field] is timestamp;
    }

    // ========================================
    // users コレクション
    // ========================================
    match /users/{userId} {
      // 自分のプロフィールのみ読み取り可
      // （マッチング画面での他ユーザー情報はCloud Functions経由で取得）
      allow read: if isOwner(userId);

      // 作成: 自分のドキュメントのみ、必須フィールド検証
      allow create: if isOwner(userId)
        && request.resource.data.keys().hasAll([
          'displayName', 'email', 'gender', 'plan',
          'tickets', 'totalCallCount', 'dailyCallCount',
          'isBanned', 'reportCount', 'createdAt', 'updatedAt'
        ])
        && request.resource.data.plan == 'free'
        && request.resource.data.tickets == 0
        && request.resource.data.isBanned == false
        && request.resource.data.reportCount == 0;

      // 更新: 自分のドキュメントのみ、書き込み禁止フィールドあり
      allow update: if isOwner(userId)
        && !request.resource.data.diff(resource.data).affectedKeys()
            .hasAny(['isBanned', 'banReason', 'bannedAt', 'reportCount',
                     'plan', 'planExpiresAt', 'tickets',
                     'totalCallCount', 'totalCallMinutes',
                     'dailyCallCount', 'dailyCallDate',
                     'stripeCustomerId']);
        // ↑ 課金・統計・BAN関連フィールドはCloud Functionsのみ更新可

      allow delete: if false;  // ユーザー削除はCloud Functions経由
    }

    // ========================================
    // queue コレクション
    // ========================================
    match /queue/{docId} {
      // 認証済みユーザーが自分のキューを読める
      allow read: if isAuthenticated() && docId == uid();

      // 自分のドキュメントのみ作成可（BAN済みは不可）
      allow create: if isNotBanned()
        && docId == uid()
        && request.resource.data.uid == uid()
        && request.resource.data.status == 'waiting'
        && request.resource.data.matchedWith == null
        && request.resource.data.roomId == null;

      // 更新は Cloud Functions のみ（マッチング処理）
      allow update: if false;

      // 自分のドキュメントのみ削除可（キャンセル用）
      allow delete: if isAuthenticated() && docId == uid();
    }

    // ========================================
    // rooms コレクション
    // ========================================
    match /rooms/{roomId} {
      // 参加者のみ読み取り可
      allow read: if isAuthenticated()
        && uid() in resource.data.participants;

      // ルーム作成は Cloud Functions のみ
      allow create: if false;

      // 参加者のみ更新可（ステータス変更は限定的）
      allow update: if isAuthenticated()
        && uid() in resource.data.participants
        && !request.resource.data.diff(resource.data).affectedKeys()
            .hasAny(['participants', 'createdAt', 'baseDurationSec',
                     'ticketsConsumed', 'extensionChargeYen']);

      allow delete: if false;

      // ----- サブコレクション: offer -----
      match /offer/{docId} {
        allow read: if isAuthenticated()
          && uid() in get(/databases/$(database)/documents/rooms/$(roomId)).data.participants;
        allow create: if isAuthenticated()
          && uid() in get(/databases/$(database)/documents/rooms/$(roomId)).data.participants
          && docId == uid();
        allow update, delete: if false;
      }

      // ----- サブコレクション: answer -----
      match /answer/{docId} {
        allow read: if isAuthenticated()
          && uid() in get(/databases/$(database)/documents/rooms/$(roomId)).data.participants;
        allow create: if isAuthenticated()
          && uid() in get(/databases/$(database)/documents/rooms/$(roomId)).data.participants
          && docId == uid();
        allow update, delete: if false;
      }

      // ----- サブコレクション: candidates -----
      match /candidates/{candidateId} {
        allow read: if isAuthenticated()
          && uid() in get(/databases/$(database)/documents/rooms/$(roomId)).data.participants;
        allow create: if isAuthenticated()
          && uid() in get(/databases/$(database)/documents/rooms/$(roomId)).data.participants
          && request.resource.data.uid == uid();
        allow update, delete: if false;
      }
    }

    // ========================================
    // reports コレクション
    // ========================================
    match /reports/{reportId} {
      // 自分が作成した通報のみ読み取り可
      allow read: if isAuthenticated()
        && resource.data.reporterUid == uid();

      // 認証済みユーザーのみ通報作成可
      allow create: if isNotBanned()
        && request.resource.data.reporterUid == uid()
        && request.resource.data.targetUid != uid()  // 自分自身は通報不可
        && request.resource.data.status == 'pending'
        && request.resource.data.reason in
            ['harassment', 'inappropriate', 'spam', 'underage', 'other'];

      allow update, delete: if false;  // 管理操作はCloud Functions経由
    }

    // ========================================
    // payments コレクション
    // ========================================
    match /payments/{paymentId} {
      // 自分の決済履歴のみ読み取り可
      allow read: if isAuthenticated()
        && resource.data.uid == uid();

      // 作成・更新・削除は Cloud Functions のみ
      allow create, update, delete: if false;
    }

    // ========================================
    // デフォルト: 全拒否
    // ========================================
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 3. Cloud Functions

### 3.1 アーキテクチャ概要

```
Cloud Functions（第2世代 / asia-northeast1）
├── triggers/
│   ├── onQueueWrite.ts      ← Firestore トリガー: queue 変更時
│   ├── onRoomCreate.ts      ← Firestore トリガー: room 作成時
│   └── onReportCreate.ts    ← Firestore トリガー: 通報作成時
├── callable/
│   ├── joinQueue.ts         ← クライアント呼び出し: キュー参加
│   ├── leaveQueue.ts        ← クライアント呼び出し: キュー離脱
│   ├── endCall.ts           ← クライアント呼び出し: 通話終了
│   ├── requestExtension.ts  ← クライアント呼び出し: 延長リクエスト
│   └── purchaseTickets.ts   ← クライアント呼び出し: チケット購入
├── scheduled/
│   └── scheduledCleanup.ts  ← 定期実行: ゴーストルーム・期限切れキュー削除
└── lib/
    ├── matching.ts          ← マッチングロジック
    ├── billing.ts           ← 課金処理
    └── moderation.ts        ← 通報・BAN処理
```

### 3.2 `onQueueWrite` - マッチング実行トリガー

キューにドキュメントが作成されたときにマッチング処理を実行する。

```typescript
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

export const onQueueWrite = onDocumentCreated(
  {
    document: "queue/{uid}",
    region: "asia-northeast1",
    memory: "256MiB",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const newEntry = snapshot.data();
    const uid = event.params.uid;

    // BANチェック
    const userDoc = await db.doc(`users/${uid}`).get();
    if (!userDoc.exists || userDoc.data()?.isBanned) {
      await snapshot.ref.delete();
      return;
    }

    // 無料ユーザーの通話回数制限チェック
    const userData = userDoc.data()!;
    const today = new Date().toISOString().slice(0, 10);
    if (userData.gender === "male" && userData.plan === "free") {
      if (userData.dailyCallDate === today && userData.dailyCallCount >= 3) {
        await snapshot.ref.delete();
        return;  // 1日3回制限到達
      }
    }

    // チケット残高チェック（男性 entry プランユーザー）
    if (userData.gender === "male" && userData.tickets <= 0 && userData.plan !== "free") {
      await snapshot.ref.delete();
      return;
    }

    // マッチング相手を検索
    const matchQuery = db
      .collection("queue")
      .where("status", "==", "waiting")
      .where("gender", "==", newEntry.preferredGender === "any"
        ? newEntry.gender === "male" ? "female" : "male"  // デフォルト異性
        : newEntry.preferredGender)
      .orderBy("joinedAt", "asc")
      .limit(10);

    const candidates = await matchQuery.get();

    let matchedPartner: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    for (const doc of candidates.docs) {
      const candidate = doc.data();
      if (candidate.uid === uid) continue;
      // 相手の希望性別もチェック
      if (candidate.preferredGender !== "any"
          && candidate.preferredGender !== newEntry.gender) {
        continue;
      }
      matchedPartner = doc;
      break;
    }

    if (!matchedPartner) return;  // マッチ相手なし → 待機継続

    // --- マッチング成立 ---
    const partnerUid = matchedPartner.data().uid;
    const roomRef = db.collection("rooms").doc();
    const roomId = roomRef.id;
    const now = Timestamp.now();

    const batch = db.batch();

    // ルーム作成
    batch.set(roomRef, {
      participants: [uid, partnerUid],
      status: "waiting",
      createdAt: now,
      startedAt: null,
      endedAt: null,
      baseDurationSec: 600,
      extensions: 0,
      totalDurationSec: 0,
      endReason: null,
      ticketsConsumed: 0,
      extensionChargeYen: 0,
    });

    // キュー更新（双方）
    batch.update(snapshot.ref, {
      status: "matched",
      matchedWith: partnerUid,
      roomId: roomId,
    });
    batch.update(matchedPartner.ref, {
      status: "matched",
      matchedWith: uid,
      roomId: roomId,
    });

    await batch.commit();
  }
);
```

### 3.3 `onRoomCreate` - ルーム初期化

```typescript
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

export const onRoomCreate = onDocumentCreated(
  {
    document: "rooms/{roomId}",
    region: "asia-northeast1",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const room = snapshot.data();
    const roomId = event.params.roomId;

    // 参加者にプッシュ通知を送信（FCMトークンがある場合）
    for (const uid of room.participants) {
      const userDoc = await db.doc(`users/${uid}`).get();
      const fcmToken = userDoc.data()?.fcmToken;
      if (fcmToken) {
        // TODO: FCM送信（messaging.send）
        // マッチング成立通知
      }
    }

    // ルームの自動タイムアウト設定（接続待ち: 60秒で未接続なら削除）
    // → scheduledCleanup で処理
  }
);
```

### 3.4 `endCall` - 通話終了処理

```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

export const endCall = onCall(
  {
    region: "asia-northeast1",
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です。");
    }

    const uid = request.auth.uid;
    const { roomId } = request.data;

    if (!roomId || typeof roomId !== "string") {
      throw new HttpsError("invalid-argument", "roomId が必要です。");
    }

    const roomRef = db.doc(`rooms/${roomId}`);
    const roomDoc = await roomRef.get();

    if (!roomDoc.exists) {
      throw new HttpsError("not-found", "ルームが見つかりません。");
    }

    const room = roomDoc.data()!;
    if (!room.participants.includes(uid)) {
      throw new HttpsError("permission-denied", "このルームの参加者ではありません。");
    }

    if (room.status === "ended") {
      return { success: true, message: "既に終了しています。" };
    }

    const now = Timestamp.now();
    const startedAt = room.startedAt?.toDate() || room.createdAt.toDate();
    const totalDurationSec = Math.floor(
      (now.toDate().getTime() - startedAt.getTime()) / 1000
    );

    // ルーム終了
    await roomRef.update({
      status: "ended",
      endedAt: now,
      totalDurationSec: totalDurationSec,
      endReason: "normal",
    });

    // 参加者の統計更新・チケット消費
    const batch = db.batch();
    const today = new Date().toISOString().slice(0, 10);

    for (const participantUid of room.participants) {
      const userRef = db.doc(`users/${participantUid}`);
      const userDoc = await userRef.get();
      const userData = userDoc.data()!;

      const updates: Record<string, any> = {
        totalCallCount: FieldValue.increment(1),
        totalCallMinutes: FieldValue.increment(Math.ceil(totalDurationSec / 60)),
        lastActiveAt: now,
        updatedAt: now,
      };

      // dailyCallCount の更新
      if (userData.dailyCallDate === today) {
        updates.dailyCallCount = FieldValue.increment(1);
      } else {
        updates.dailyCallCount = 1;
        updates.dailyCallDate = today;
      }

      // 男性ユーザーのチケット消費
      if (userData.gender === "male" && userData.plan === "entry") {
        updates.tickets = FieldValue.increment(-1);
      }

      batch.update(userRef, updates);
    }

    // チケット消費数をルームに記録
    batch.update(roomRef, {
      ticketsConsumed: 1,  // 基本1枚
    });

    await batch.commit();

    // キューのクリーンアップ
    for (const participantUid of room.participants) {
      const queueRef = db.doc(`queue/${participantUid}`);
      const queueDoc = await queueRef.get();
      if (queueDoc.exists) {
        await queueRef.delete();
      }
    }

    return { success: true, totalDurationSec };
  }
);
```

### 3.5 `requestExtension` - 通話延長

```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

const EXTENSION_DURATION_SEC = 300;   // 5分
const EXTENSION_PRICE_YEN = 300;      // 300円/5分

export const requestExtension = onCall(
  {
    region: "asia-northeast1",
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です。");
    }

    const uid = request.auth.uid;
    const { roomId } = request.data;

    const roomRef = db.doc(`rooms/${roomId}`);
    const roomDoc = await roomRef.get();

    if (!roomDoc.exists) {
      throw new HttpsError("not-found", "ルームが見つかりません。");
    }

    const room = roomDoc.data()!;
    if (!room.participants.includes(uid)) {
      throw new HttpsError("permission-denied", "参加者ではありません。");
    }

    if (room.status !== "active" && room.status !== "extending") {
      throw new HttpsError("failed-precondition", "通話がアクティブではありません。");
    }

    // ユーザーの性別チェック（女性は無料）
    const userDoc = await db.doc(`users/${uid}`).get();
    const userData = userDoc.data()!;
    const isFreeExtension = userData.gender === "female";

    // 延長料金の記録（実際の決済は後払い）
    const chargeAmount = isFreeExtension ? 0 : EXTENSION_PRICE_YEN;

    await roomRef.update({
      status: "extending",
      baseDurationSec: FieldValue.increment(EXTENSION_DURATION_SEC),
      extensions: FieldValue.increment(1),
      extensionChargeYen: FieldValue.increment(chargeAmount),
    });

    // 延長決済ログ（男性のみ）
    if (!isFreeExtension) {
      await db.collection("payments").add({
        uid: uid,
        type: "extension",
        amount: EXTENSION_PRICE_YEN,
        quantity: null,
        roomId: roomId,
        stripePaymentIntentId: null,  // 後払い処理で更新
        status: "pending",
        createdAt: Timestamp.now(),
        completedAt: null,
      });
    }

    return {
      success: true,
      newDurationSec: room.baseDurationSec + EXTENSION_DURATION_SEC,
      chargeAmount,
    };
  }
);
```

### 3.6 `scheduledCleanup` - 定期クリーンアップ

```typescript
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

export const scheduledCleanup = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "asia-northeast1",
    timeZone: "Asia/Tokyo",
    memory: "256MiB",
  },
  async () => {
    const now = Timestamp.now();
    const batch = db.batch();
    let deleteCount = 0;

    // 1. 期限切れキューエントリの削除
    const expiredQueue = await db
      .collection("queue")
      .where("expiresAt", "<", now)
      .limit(200)
      .get();

    for (const doc of expiredQueue.docs) {
      batch.delete(doc.ref);
      deleteCount++;
    }

    // 2. ゴーストルームの削除
    //    status=waiting で作成から60秒以上経過 → 接続未完了
    const ghostThreshold = new Date(Date.now() - 60 * 1000);
    const ghostRooms = await db
      .collection("rooms")
      .where("status", "==", "waiting")
      .where("createdAt", "<", Timestamp.fromDate(ghostThreshold))
      .limit(100)
      .get();

    for (const doc of ghostRooms.docs) {
      batch.update(doc.ref, {
        status: "ended",
        endedAt: now,
        endReason: "disconnect",
      });
      deleteCount++;
    }

    // 3. 長時間アクティブルームの強制終了（2時間以上）
    const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const staleRooms = await db
      .collection("rooms")
      .where("status", "in", ["active", "extending"])
      .where("startedAt", "<", Timestamp.fromDate(staleThreshold))
      .limit(50)
      .get();

    for (const doc of staleRooms.docs) {
      batch.update(doc.ref, {
        status: "ended",
        endedAt: now,
        endReason: "timeout",
      });
    }

    if (deleteCount > 0) {
      await batch.commit();
    }

    console.log(`Cleanup completed: ${deleteCount} items processed`);
  }
);
```

### 3.7 `onReportCreate` - 通報時の自動処理

```typescript
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();
const AUTO_BAN_THRESHOLD = 5;  // 5件以上の通報で自動BAN

export const onReportCreate = onDocumentCreated(
  {
    document: "reports/{reportId}",
    region: "asia-northeast1",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const report = snapshot.data();
    const targetUid = report.targetUid;

    // 被通報者の reportCount をインクリメント
    const userRef = db.doc(`users/${targetUid}`);
    await userRef.update({
      reportCount: FieldValue.increment(1),
      updatedAt: Timestamp.now(),
    });

    // 自動BAN判定
    const userDoc = await userRef.get();
    const userData = userDoc.data()!;

    if (userData.reportCount >= AUTO_BAN_THRESHOLD && !userData.isBanned) {
      await userRef.update({
        isBanned: true,
        banReason: `自動BAN: 通報${userData.reportCount}件`,
        bannedAt: Timestamp.now(),
      });

      // BAN対象がキューにいれば削除
      const queueRef = db.doc(`queue/${targetUid}`);
      const queueDoc = await queueRef.get();
      if (queueDoc.exists) {
        await queueRef.delete();
      }

      // BAN対象がアクティブルームにいれば強制終了
      const activeRooms = await db
        .collection("rooms")
        .where("participants", "array-contains", targetUid)
        .where("status", "in", ["waiting", "active", "extending"])
        .get();

      for (const roomDoc of activeRooms.docs) {
        await roomDoc.ref.update({
          status: "ended",
          endedAt: Timestamp.now(),
          endReason: "report",
        });
      }
    }
  }
);
```

### 3.8 `joinQueue` - キュー参加（Callable Function）

クライアントから直接 `queue` に書き込む代わりに、Callable Function を経由させることでサーバーサイドバリデーションを強化する。

```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();
const QUEUE_EXPIRY_MINUTES = 5;

export const joinQueue = onCall(
  {
    region: "asia-northeast1",
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です。");
    }

    const uid = request.auth.uid;

    // ユーザー情報取得・バリデーション
    const userDoc = await db.doc(`users/${uid}`).get();
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "ユーザーが見つかりません。");
    }

    const user = userDoc.data()!;

    if (user.isBanned) {
      throw new HttpsError("permission-denied", "アカウントが停止されています。");
    }

    // 無料ユーザーの1日3回制限（男性のみ）
    const today = new Date().toISOString().slice(0, 10);
    if (user.gender === "male" && user.plan === "free") {
      const currentCount = user.dailyCallDate === today ? user.dailyCallCount : 0;
      if (currentCount >= 3) {
        throw new HttpsError(
          "resource-exhausted",
          "本日の無料通話回数（3回）に達しました。"
        );
      }
    }

    // entry プランの男性はチケット残高チェック
    if (user.gender === "male" && user.plan === "entry" && user.tickets <= 0) {
      throw new HttpsError(
        "resource-exhausted",
        "チケットが不足しています。チケットを購入してください。"
      );
    }

    // 既にキューに入っていないかチェック
    const existingQueue = await db.doc(`queue/${uid}`).get();
    if (existingQueue.exists) {
      throw new HttpsError("already-exists", "既にマッチング待機中です。");
    }

    // アクティブルームがないかチェック
    const activeRooms = await db
      .collection("rooms")
      .where("participants", "array-contains", uid)
      .where("status", "in", ["waiting", "active", "extending"])
      .limit(1)
      .get();

    if (!activeRooms.empty) {
      throw new HttpsError("failed-precondition", "通話中はキューに参加できません。");
    }

    // キューに追加
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromDate(
      new Date(Date.now() + QUEUE_EXPIRY_MINUTES * 60 * 1000)
    );

    await db.doc(`queue/${uid}`).set({
      uid: uid,
      displayName: user.displayName || "匿名",
      gender: user.gender,
      preferredGender: request.data.preferredGender || "any",
      plan: user.plan,
      joinedAt: now,
      status: "waiting",
      matchedWith: null,
      roomId: null,
      expiresAt: expiresAt,
    });

    return { success: true, expiresAt: expiresAt.toDate().toISOString() };
  }
);
```

---

## 4. 課金連携

### 4.1 チケットモデル

| 操作 | 消費 | 対象 |
|------|------|------|
| 10分面談 | チケット1枚 | 男性 entry ユーザー |
| 5分延長 | 300円（後払い） | 男性ユーザー |
| 面談（女性） | 無料 | 女性ユーザー |
| 延長（女性） | 無料 | 女性ユーザー |

### 4.2 無料ユーザーの制限

- 男性無料ユーザーは1日3回まで通話可能
- `dailyCallCount` / `dailyCallDate` フィールドで管理
- カウントリセットは `joinQueue` 関数内で日付比較して実施
- 制限到達時は `resource-exhausted` エラーを返却

### 4.3 Stripe 連携設計（将来対応）

```
┌─────────────┐     ┌──────────────────┐     ┌─────────┐
│  クライアント  │────→│  Cloud Functions  │────→│  Stripe │
│  (フロント)    │←────│  purchaseTickets  │←────│  API    │
└─────────────┘     └──────────────────┘     └─────────┘
        │                    │
        │                    ▼
        │           ┌──────────────────┐
        │           │  Firestore       │
        │           │  users.tickets   │
        │           │  payments        │
        │           └──────────────────┘
        │
        │           ┌──────────────────┐
        └──────────→│  Stripe Webhook  │  ← Stripe からのコールバック
                    │  (Cloud Func)    │
                    └──────────────────┘
```

**フロー:**

1. クライアントが `purchaseTickets` Callable Function を呼び出し
2. Cloud Functions が Stripe PaymentIntent を作成
3. クライアントに `clientSecret` を返却
4. クライアントが Stripe.js でカード決済を完了
5. Stripe Webhook (`payment_intent.succeeded`) で Cloud Functions が受信
6. `users/{uid}.tickets` をインクリメント、`payments` に記録

**サブスクリプション（Entry Plan）:**

1. Stripe Checkout Session でサブスクリプション作成
2. Webhook `customer.subscription.created` → `users/{uid}.plan = "entry"` に更新
3. Webhook `customer.subscription.deleted` → `users/{uid}.plan = "free"` に戻す
4. 更新処理は全て Webhook 経由（冪等性を保証するため `stripeCustomerId` で照合）

---

## 5. セキュリティ

### 5.1 Firebase App Check

不正クライアント（ボット・スクレイパー）からの API アクセスを防止する。

```javascript
// フロントエンド初期化
firebase.appCheck().activate(
  new firebase.appCheck.ReCaptchaEnterpriseProvider(
    'RECAPTCHA_SITE_KEY'
  ),
  true  // トークン自動更新
);
```

**Cloud Functions 側:**
- 全 Callable Function で `enforceAppCheck: true` を設定
- Firestore Security Rules では App Check を直接強制しない（パフォーマンス影響のため）

### 5.2 レート制限

Cloud Functions 内でレート制限を実装する。

```typescript
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

interface RateLimitConfig {
  maxRequests: number;  // 最大リクエスト数
  windowSec: number;    // ウィンドウ期間（秒）
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  joinQueue:         { maxRequests: 10,  windowSec: 60 },
  endCall:           { maxRequests: 10,  windowSec: 60 },
  requestExtension:  { maxRequests: 5,   windowSec: 60 },
  purchaseTickets:   { maxRequests: 3,   windowSec: 60 },
  report:            { maxRequests: 5,   windowSec: 300 },
};

async function checkRateLimit(uid: string, action: string): Promise<boolean> {
  const config = RATE_LIMITS[action];
  if (!config) return true;

  const key = `rateLimit/${uid}_${action}`;
  const ref = db.doc(key);
  const doc = await ref.get();

  const now = Date.now();
  const windowStart = now - config.windowSec * 1000;

  if (!doc.exists) {
    await ref.set({ timestamps: [now] });
    return true;
  }

  const data = doc.data()!;
  const timestamps: number[] = (data.timestamps || [])
    .filter((t: number) => t > windowStart);

  if (timestamps.length >= config.maxRequests) {
    return false;  // レート制限超過
  }

  timestamps.push(now);
  await ref.update({ timestamps });
  return true;
}
```

**制限値:**

| エンドポイント | 上限 | ウィンドウ |
|---------------|------|-----------|
| `joinQueue` | 10回 | 60秒 |
| `endCall` | 10回 | 60秒 |
| `requestExtension` | 5回 | 60秒 |
| `purchaseTickets` | 3回 | 60秒 |
| 通報 | 5回 | 300秒 |

### 5.3 通報機能と自動BAN

```
通報フロー:
1. ユーザーが通報送信 → reports コレクションに作成
2. onReportCreate トリガー発火
3. targetUid の reportCount をインクリメント
4. reportCount >= 5 で自動BAN
   ├── isBanned = true に更新
   ├── アクティブルームを強制終了
   └── キューから削除
5. 管理者が手動レビュー → action フィールドを更新
```

**BAN 解除:**
- 管理者専用の Cloud Function（Admin SDK 使用）で対応
- `isBanned = false`, `reportCount` リセット

### 5.4 個人情報保護

| 方針 | 実装 |
|------|------|
| 最小限のデータ保持 | プロフィールは表示名・性別・自己紹介のみ。住所・電話番号は収集しない |
| 通話の非録画 | WebRTC P2P 通信をサーバーに中継しない。録画機能は提供しない |
| SDP/ICE の自動削除 | ルーム終了後に scheduledCleanup でサブコレクションを削除 |
| アカウント削除 | ユーザーリクエストに基づき Cloud Function で全関連データを削除（GDPR/個人情報保護法対応） |
| ログの匿名化 | Cloud Logging に UID のみ記録。メールアドレス等は出力しない |

---

## 6. 監視・ログ

### 6.1 Cloud Logging

Cloud Functions は自動的に Cloud Logging に出力される。構造化ログを使用して検索性を高める。

```typescript
import { logger } from "firebase-functions/v2";

// 構造化ログ例
logger.info("マッチング成立", {
  roomId: roomId,
  participant1: uid,
  participant2: partnerUid,
  matchDurationMs: Date.now() - startTime,
});

logger.warn("レート制限超過", {
  uid: uid,
  action: "joinQueue",
  severity: "WARNING",
});

logger.error("チケット消費失敗", {
  uid: uid,
  roomId: roomId,
  error: error.message,
  severity: "ERROR",
});
```

### 6.2 エラー監視

**Firebase Crashlytics 相当（Cloud Functions）:**

- Cloud Error Reporting を有効化（自動検出）
- 未処理例外は Cloud Functions ランタイムがキャプチャ
- 重大エラーは Cloud Monitoring のアラートポリシーで Slack/メール通知

**アラート設定:**

| 条件 | 通知先 | 優先度 |
|------|--------|--------|
| Cloud Functions エラー率 > 5% | Slack + メール | 高 |
| Firestore 読み書き > 100,000/分 | メール | 中 |
| 認証失敗 > 100回/5分 | Slack | 高 |
| 自動BAN発動 | Slack | 中 |

### 6.3 利用統計ダッシュボード

Firebase コンソールと Google Cloud Console を組み合わせて以下の KPI を監視する。

**リアルタイム指標（Firebase Console）:**

- 同時接続ユーザー数
- アクティブルーム数
- キュー待機人数

**日次指標（BigQuery Export + Looker Studio）:**

| 指標 | データソース | 集計方法 |
|------|-------------|----------|
| DAU / MAU | Firebase Auth | ログインイベント集計 |
| 新規登録数 | users コレクション | createdAt ベース |
| マッチング成立数 | rooms コレクション | createdAt ベース |
| 平均通話時間 | rooms.totalDurationSec | 日次平均 |
| 延長率 | rooms.extensions > 0 の割合 | 日次平均 |
| チケット購入数 | payments コレクション | type="ticket_purchase" |
| 売上 | payments コレクション | SUM(amount) |
| 通報件数 | reports コレクション | 日次集計 |
| BAN数 | users.isBanned | 日次変化 |

**Firestore → BigQuery エクスポート:**
- Firebase Extensions の「Export Collections to BigQuery」を使用
- `rooms`, `payments`, `reports` コレクションを対象
- 日次スケジュールでエクスポート

---

## 7. デプロイ・環境構成

### 7.1 ディレクトリ構成（Cloud Functions）

```
functions/
├── src/
│   ├── index.ts              ← エントリポイント（全Function export）
│   ├── triggers/
│   │   ├── onQueueWrite.ts
│   │   ├── onRoomCreate.ts
│   │   └── onReportCreate.ts
│   ├── callable/
│   │   ├── joinQueue.ts
│   │   ├── leaveQueue.ts
│   │   ├── endCall.ts
│   │   ├── requestExtension.ts
│   │   └── purchaseTickets.ts
│   ├── scheduled/
│   │   └── scheduledCleanup.ts
│   └── lib/
│       ├── matching.ts
│       ├── billing.ts
│       ├── moderation.ts
│       └── rateLimit.ts
├── package.json
├── tsconfig.json
└── .env.local               ← ローカル開発用環境変数
```

### 7.2 環境変数

```bash
# Firebase Functions 環境設定（Secret Manager 使用）
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase functions:secrets:set RECAPTCHA_SITE_KEY
```

### 7.3 デプロイコマンド

```bash
# 全Function デプロイ
firebase deploy --only functions

# 個別デプロイ
firebase deploy --only functions:onQueueWrite,functions:joinQueue

# Firestore Rules デプロイ
firebase deploy --only firestore:rules

# Firestore Indexes デプロイ
firebase deploy --only firestore:indexes
```

---

## 付録: Firestore Indexes（`firestore.indexes.json`）

```json
{
  "indexes": [
    {
      "collectionGroup": "queue",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "gender", "order": "ASCENDING" },
        { "fieldPath": "preferredGender", "order": "ASCENDING" },
        { "fieldPath": "joinedAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "gender", "order": "ASCENDING" },
        { "fieldPath": "lastActiveAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "isBanned", "order": "ASCENDING" },
        { "fieldPath": "plan", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "reports",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "targetUid", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "reports",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "rooms",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```
