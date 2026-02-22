# WebRTC 基盤アーキテクチャ仕様書

## 概要

V-Meet のコア機能である「10分間ビデオ通話マッチング」を実現するための WebRTC 基盤アーキテクチャを定義する。本仕様書では、ブラウザ間のリアルタイム映像・音声通信を WebRTC API で実現し、シグナリングに Firebase Firestore のリアルタイムリスナーを活用する P2P 構成を採用する。

### 設計方針

- **P2P 通信**: 1対1のビデオ通話のため、メディアサーバー（SFU/MCU）は不要。WebRTC の P2P 接続を直接使用する
- **サーバーレスシグナリング**: Firebase Firestore のリアルタイムリスナー（`onSnapshot`）をシグナリングチャネルとして利用し、専用シグナリングサーバーの構築・運用を不要とする
- **既存スタックとの整合**: Firebase compat SDK（`firebase` グローバルオブジェクト）を使用する既存の認証基盤と統一的なコード規約を維持する
- **段階的実装**: まず基本的な映像・音声通話を実現し、将来的にチャットや画面共有などの拡張を可能とする

---

## 1. 技術選定

### WebRTC API

ブラウザネイティブの WebRTC API を直接使用する。外部ライブラリ（PeerJS, simple-peer 等）は導入しない。

| API | 用途 | 説明 |
|---|---|---|
| `navigator.mediaDevices.getUserMedia()` | メディア取得 | カメラ・マイクからの映像/音声ストリームを取得 |
| `RTCPeerConnection` | P2P 接続 | SDP ネゴシエーション、ICE 候補交換、メディアストリーム送受信 |
| `RTCDataChannel` | データ通信 | テキストチャット、タイマー同期、制御メッセージ用（将来拡張） |

**外部ライブラリを使用しない理由:**

1. V-Meet は 1対1通話のみ。WebRTC API を直接扱う複雑さは限定的
2. バンドルサイズを最小に保てる（CDN 依存の追加なし）
3. ブラウザ API の進化に直接追従できる
4. デバッグ時にライブラリの抽象化層を介さず問題を特定しやすい

### Firebase Firestore（シグナリング）

既にプロジェクトで使用中の Firebase（プロジェクト: `vmeetcore-777`）の Firestore をシグナリングサーバーとして利用する。

```
Firestore（シグナリング）の利点:
- 既存インフラの活用（追加コスト・運用なし）
- リアルタイムリスナー（onSnapshot）による低遅延な SDP/ICE 交換
- Firestore セキュリティルールによるアクセス制御
- オフライン時の自動再接続
```

---

## 2. シグナリング設計

### 2.1 Firestore データ構造

シグナリングデータは `calls` コレクションに格納する。

```
Firestore構造:
─────────────────────────────────────────────

calls/{callId}
├── offer            : RTCSessionDescription  (SDP offer)
├── answer           : RTCSessionDescription  (SDP answer)
├── callerUid        : string                 (発信者の Firebase UID)
├── calleeUid        : string                 (着信者の Firebase UID)
├── status           : string                 ("waiting" | "active" | "ended")
├── createdAt        : Timestamp              (通話開始時刻)
├── endedAt          : Timestamp | null       (通話終了時刻)
│
├── callerCandidates/{candidateId}            (サブコレクション)
│   ├── candidate    : string
│   ├── sdpMid       : string
│   ├── sdpMLineIndex: number
│   └── addedAt      : Timestamp
│
└── calleeCandidates/{candidateId}            (サブコレクション)
    ├── candidate    : string
    ├── sdpMid       : string
    ├── sdpMLineIndex: number
    └── addedAt      : Timestamp
```

**`callId` の生成:**

マッチングシステムが通話ペアを確定した時点で、Firestore の自動 ID（`doc().id`）で生成する。両者に `callId` を通知することでシグナリングルームを共有する。

### 2.2 SDP Offer/Answer 交換フロー

```
Caller（発信者）                 Firestore                    Callee（着信者）
     |                              |                              |
     |  1. createOffer()            |                              |
     |  2. setLocalDescription()    |                              |
     |                              |                              |
     |  3. offer を書き込み ──────→ |                              |
     |     calls/{callId}.offer     |                              |
     |                              |  4. onSnapshot で offer 受信  |
     |                              | ────────────────────────────→ |
     |                              |                              |
     |                              |  5. setRemoteDescription()   |
     |                              |  6. createAnswer()           |
     |                              |  7. setLocalDescription()    |
     |                              |                              |
     |                              | ←──────── answer を書き込み  |
     |                              |    calls/{callId}.answer     |
     |                              |                              |
     |  8. onSnapshot で answer 受信|                              |
     | ←─────────────────────────── |                              |
     |  9. setRemoteDescription()   |                              |
     |                              |                              |
     |  ========== SDP ネゴシエーション完了 ==========              |
```

### 2.3 ICE Candidate 交換フロー

ICE candidate は SDP 交換と並行して非同期に発生する。Trickle ICE 方式を採用し、候補が見つかり次第逐次送信する。

```
Caller                           Firestore                    Callee
     |                              |                              |
     |  onicecandidate 発火         |                              |
     |  candidate をサブコレクションに追加                           |
     |  ─────────────────────────→  |                              |
     |  callerCandidates/{id}       |                              |
     |                              |  onSnapshot で候補受信        |
     |                              | ────────────────────────────→ |
     |                              |  addIceCandidate()           |
     |                              |                              |
     |                              |         onicecandidate 発火   |
     |                              | ←──────────────────────────── |
     |                              |  calleeCandidates/{id}       |
     |  onSnapshot で候補受信       |                              |
     | ←─────────────────────────── |                              |
     |  addIceCandidate()           |                              |
```

### 2.4 シグナリング実装の主要コード構造

```javascript
/* === Caller 側の処理概要 === */

// 1. Firestore にコールドキュメントを作成
var callDoc = firebase.firestore().collection('calls').doc();
var callId = callDoc.id;

// 2. サブコレクション参照
var callerCandidates = callDoc.collection('callerCandidates');
var calleeCandidates = callDoc.collection('calleeCandidates');

// 3. ICE candidate をサブコレクションに追加
peerConnection.onicecandidate = function (event) {
    if (event.candidate) {
        callerCandidates.add(event.candidate.toJSON());
    }
};

// 4. SDP offer を作成・保存
var offerDescription = await peerConnection.createOffer();
await peerConnection.setLocalDescription(offerDescription);
await callDoc.set({
    offer: {
        type: offerDescription.type,
        sdp: offerDescription.sdp
    },
    callerUid: firebase.auth().currentUser.uid,
    status: 'waiting',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
});

// 5. answer のリスニング
callDoc.onSnapshot(function (snapshot) {
    var data = snapshot.data();
    if (data && data.answer && !peerConnection.currentRemoteDescription) {
        var answerDescription = new RTCSessionDescription(data.answer);
        peerConnection.setRemoteDescription(answerDescription);
    }
});

// 6. callee 側の ICE candidate をリスニング
calleeCandidates.onSnapshot(function (snapshot) {
    snapshot.docChanges().forEach(function (change) {
        if (change.type === 'added') {
            var candidate = new RTCIceCandidate(change.doc.data());
            peerConnection.addIceCandidate(candidate);
        }
    });
});
```

```javascript
/* === Callee 側の処理概要 === */

// 1. 既存のコールドキュメントを参照
var callDoc = firebase.firestore().collection('calls').doc(callId);
var callerCandidates = callDoc.collection('callerCandidates');
var calleeCandidates = callDoc.collection('calleeCandidates');

// 2. ICE candidate をサブコレクションに追加
peerConnection.onicecandidate = function (event) {
    if (event.candidate) {
        calleeCandidates.add(event.candidate.toJSON());
    }
};

// 3. offer を取得して answer を作成
var callData = (await callDoc.get()).data();
var offerDescription = new RTCSessionDescription(callData.offer);
await peerConnection.setRemoteDescription(offerDescription);

var answerDescription = await peerConnection.createAnswer();
await peerConnection.setLocalDescription(answerDescription);

await callDoc.update({
    answer: {
        type: answerDescription.type,
        sdp: answerDescription.sdp
    },
    calleeUid: firebase.auth().currentUser.uid,
    status: 'active'
});

// 4. caller 側の ICE candidate をリスニング
callerCandidates.onSnapshot(function (snapshot) {
    snapshot.docChanges().forEach(function (change) {
        if (change.type === 'added') {
            var candidate = new RTCIceCandidate(change.doc.data());
            peerConnection.addIceCandidate(candidate);
        }
    });
});
```

---

## 3. STUN/TURN サーバー

### 3.1 STUN サーバー

STUN（Session Traversal Utilities for NAT）サーバーは、クライアントのパブリック IP アドレスとポートを検出するために使用する。

**採用: Google 公開 STUN サーバー**

```javascript
var iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
];
```

| 項目 | 詳細 |
|---|---|
| プロバイダー | Google |
| コスト | 無料 |
| SLA | なし（ベストエフォート） |
| 用途 | NAT タイプ検出、Server Reflexive Candidate の取得 |

**注意:** Google の公開 STUN サーバーは本番利用を公式にサポートしていないが、多くの WebRTC サービスで実績がある。トラフィック増加時には自前 STUN サーバーの検討が必要。

### 3.2 TURN サーバー

TURN（Traversal Using Relays around NAT）サーバーは、Symmetric NAT 環境など P2P 直接接続が不可能な場合にメディアリレーとして機能する。

**TURN サーバーが必要なケース:**
- 企業ファイアウォール配下のユーザー
- Symmetric NAT 環境（モバイルキャリア網の一部）
- VPN 使用時
- 統計的に全体の約 10-20% の接続で TURN が必要

**TURN SaaS 比較:**

| サービス | 料金体系 | 特徴 | 推奨度 |
|---|---|---|---|
| **Metered.ca TURN** | 従量制（$0.40/GB） + 無料枠 500MB/月 | REST API でクレデンシャル発行、グローバル分散、簡単導入 | **推奨（初期）** |
| **Twilio Network Traversal** | 従量制（$0.40/GB） | Twilio エコシステムとの統合、高信頼性 | 中規模以降 |
| **Xirsys** | 従量制 + 無料枠あり | WebRTC 特化、ダッシュボード充実 | 代替選択肢 |
| **自前 coturn** | サーバー費用のみ | 完全制御可能だが運用負荷大 | スケール後の検討 |

**初期推奨構成: Metered.ca TURN**

理由:
1. 無料枠（500MB/月）でMVP検証が可能
2. REST API によるクレデンシャルの動的発行に対応
3. セットアップが容易（API キーのみ）
4. グローバルに分散された TURN サーバー群

### 3.3 ICE サーバー構成

```javascript
// RTCPeerConnection の ICE サーバー構成
var configuration = {
    iceServers: [
        // STUN サーバー（無料）
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },

        // TURN サーバー（Metered.ca の例）
        {
            urls: 'turn:a.relay.metered.ca:80',
            username: '<動的に取得>',
            credential: '<動的に取得>'
        },
        {
            urls: 'turn:a.relay.metered.ca:80?transport=tcp',
            username: '<動的に取得>',
            credential: '<動的に取得>'
        },
        {
            urls: 'turns:a.relay.metered.ca:443',
            username: '<動的に取得>',
            credential: '<動的に取得>'
        }
    ],
    iceCandidatePoolSize: 10
};
```

### 3.4 NAT 越え対策

```
NAT タイプと WebRTC 接続可否:

┌─────────────────────┬──────────┬───────────────────────────┐
│ NAT タイプ          │ P2P 接続 │ 必要なサーバー            │
├─────────────────────┼──────────┼───────────────────────────┤
│ Full Cone           │ 可       │ STUN のみ                 │
│ Restricted Cone     │ 可       │ STUN のみ                 │
│ Port Restricted     │ 可       │ STUN のみ                 │
│ Symmetric NAT       │ 不可     │ TURN（リレー）が必須      │
└─────────────────────┴──────────┴───────────────────────────┘
```

**ICE 候補の優先順位（自動）:**

1. **Host Candidate**: ローカルネットワークアドレス（LAN 内通信時に使用）
2. **Server Reflexive Candidate**: STUN で取得したパブリック IP（ほとんどの NAT で機能）
3. **Relay Candidate**: TURN サーバー経由のリレーアドレス（最終手段）

WebRTC エンジンが ICE 候補をペアリングし、接続性チェックを実行して最適な経路を自動選択する。

---

## 4. 接続フロー全体図

マッチング確定からビデオ通話終了までの全体フロー。

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         V-Meet 通話接続フロー全体図                       │
└──────────────────────────────────────────────────────────────────────────┘

ユーザーA                    Firebase                     ユーザーB
(Caller)               Firestore / Auth                  (Callee)
   │                         │                              │
   │  ① マッチング待機キュー登録                              │
   │  ──────────────────→    │                              │
   │                         │    ① マッチング待機キュー登録  │
   │                         │  ←────────────────────────── │
   │                         │                              │
   │        ② マッチング確定（サーバー/Cloud Functions）      │
   │  ←────── callId 通知 ── │ ── callId 通知 ────────────→ │
   │                         │                              │
   │  ③ getUserMedia()       │                              │
   │  カメラ/マイク取得      │         ③ getUserMedia()     │
   │                         │         カメラ/マイク取得     │
   │                         │                              │
   │  ④ RTCPeerConnection    │                              │
   │     作成                │                              │
   │  ⑤ createOffer()       │                              │
   │  ⑥ setLocalDescription │                              │
   │                         │                              │
   │  ⑦ offer を Firestore  │                              │
   │     に書き込み ────────→│                              │
   │                         │  ⑧ onSnapshot で offer 受信  │
   │                         │────────────────────────────→ │
   │                         │                              │
   │                         │  ⑨ RTCPeerConnection 作成    │
   │                         │  ⑩ setRemoteDescription     │
   │                         │  ⑪ createAnswer()           │
   │                         │  ⑫ setLocalDescription      │
   │                         │                              │
   │                         │←─── ⑬ answer を Firestore に │
   │                         │        書き込み               │
   │  ⑭ onSnapshot で       │                              │
   │     answer 受信         │                              │
   │←────────────────────── │                              │
   │  ⑮ setRemoteDescription│                              │
   │                         │                              │
   │  ═══ ICE Candidate 交換（⑦〜⑮と並行） ═══             │
   │  onicecandidate ──────→ │ ──────→ addIceCandidate     │
   │  addIceCandidate ←───── │ ←────── onicecandidate      │
   │                         │                              │
   │  ════════ P2P メディア接続確立 ════════                  │
   │  ⑯ ontrack イベントで相手の映像/音声を受信              │
   │←═══════════════════════════════════════════════════════→│
   │         映像・音声ストリーム（DTLS-SRTP 暗号化）         │
   │                         │                              │
   │  ⑰ 10分タイマー開始    │         ⑰ 10分タイマー開始   │
   │                         │                              │
   │  ... ビデオ通話中 ...   │                              │
   │                         │                              │
   │  ⑱ 通話終了            │                              │
   │  RTCPeerConnection.close()                             │
   │  Firestore status='ended'                              │
   │  シグナリングリスナー解除                                │
```

### フェーズ別の詳細

| フェーズ | 処理内容 | 所要時間（目安） |
|---|---|---|
| マッチング | 待機キューからペアを選出、callId 生成 | キュー状況に依存 |
| メディア取得 | getUserMedia でカメラ・マイク起動 | 0.5-2 秒（初回許可ダイアログ含む） |
| シグナリング | SDP offer/answer 交換 | 0.5-1 秒 |
| ICE 交換 | ICE candidate 収集・交換・接続性チェック | 1-5 秒（NAT 環境に依存） |
| メディア接続 | P2P 映像・音声ストリーム確立 | 上記完了後即時 |
| **合計** | マッチング確定〜映像表示 | **約 2-8 秒** |

---

## 5. ブラウザ互換性

### 対応ブラウザ

| ブラウザ | バージョン | getUserMedia | RTCPeerConnection | 備考 |
|---|---|---|---|---|
| **Chrome** | 56+ | 対応 | 対応 | WebRTC のリファレンス実装。最も安定 |
| **Firefox** | 44+ | 対応 | 対応 | 独自のメディアスタック。互換性良好 |
| **Safari** | 11+ | 対応 | 対応 | iOS Safari も同バージョンから対応。autoplay 制限あり |
| **Edge** | 79+ (Chromium) | 対応 | 対応 | Chromium ベースのため Chrome と同等 |
| **iOS Safari** | 14.5+ | 対応 | 対応 | 14.5 未満は WebRTC のバグが多く非推奨 |
| **Android Chrome** | 56+ | 対応 | 対応 | モバイル WebRTC の標準 |
| **Samsung Internet** | 7.0+ | 対応 | 対応 | Chromium ベース |

### ブラウザ固有の注意事項

**Safari / iOS:**
- `getUserMedia` は HTTPS 必須（localhost は例外）
- `autoplay` ポリシーにより、リモート映像の `<video>` 要素には `playsinline` 属性が必須
- `<video autoplay playsinline>` を設定しないと映像が表示されない
- iOS Safari では `RTCPeerConnection` のコンストラクタにプレフィックスは不要（現行バージョン）

**Firefox:**
- `getUserMedia` の制約（constraints）の指定形式が若干異なる場合がある
- `iceConnectionState` の遷移パターンが Chrome と異なる場合がある

**モバイル共通:**
- バックグラウンド時にカメラ/マイクが停止する（OS レベルの制限）
- 画面回転時のビデオレイアウト再計算が必要

### 互換性検出コード

```javascript
/**
 * ブラウザの WebRTC 対応状況を検出する
 * @returns {object} サポート状況
 */
function detectWebRTCSupport() {
    return {
        getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        peerConnection: !!(window.RTCPeerConnection),
        dataChannel: !!(window.RTCPeerConnection &&
            RTCPeerConnection.prototype.createDataChannel)
    };
}
```

---

## 6. メディア制約

### 6.1 getUserMedia 制約

```javascript
// 標準的なビデオ通話用のメディア制約
var mediaConstraints = {
    video: {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 24, max: 30 },
        facingMode: 'user'           // フロントカメラ優先
    },
    audio: {
        echoCancellation: true,      // エコーキャンセル
        noiseSuppression: true,      // ノイズ抑制
        autoGainControl: true        // 自動ゲイン調整
    }
};
```

**解像度設定の根拠:**
- `640x480` (VGA): モバイル回線でも安定した通信が可能。V-Meet のメイン利用シーンであるスマートフォンでのビデオ通話に最適
- `1280x720` (HD): Wi-Fi 環境でのデスクトップ利用時にはより高品質な映像を提供
- `ideal` / `max` の使い分け: ブラウザが最適な解像度を自動選択。デバイス性能や回線状況に応じて `ideal` に近づける

### 6.2 帯域幅制御

SDP マニピュレーション（`b=AS` 行の変更）による帯域幅上限設定を行う。

```javascript
/**
 * SDP の帯域幅を制限する
 * @param {string} sdp - 元の SDP 文字列
 * @param {number} bandwidth - 帯域幅上限 (kbps)
 * @returns {string} 修正後の SDP
 */
function setBandwidth(sdp, bandwidth) {
    // 既存の b=AS 行を除去
    sdp = sdp.replace(/b=AS:[^\r\n]*\r\n/g, '');

    // video セクションに帯域幅制限を追加
    sdp = sdp.replace(
        /m=video (.*)\r\n/,
        'm=video $1\r\nb=AS:' + bandwidth + '\r\n'
    );

    return sdp;
}

// 使用例: ビデオを 500kbps に制限
var offer = await peerConnection.createOffer();
offer.sdp = setBandwidth(offer.sdp, 500);
await peerConnection.setLocalDescription(offer);
```

**帯域幅の目安:**

| シーン | ビデオ帯域幅 | 合計（映像+音声） | 品質 |
|---|---|---|---|
| モバイル回線（節約） | 250 kbps | 約 300 kbps | 低〜中（会話には十分） |
| 標準品質 | 500 kbps | 約 550 kbps | 中（推奨デフォルト） |
| 高品質（Wi-Fi） | 1500 kbps | 約 1600 kbps | 高（HD相当） |

### 6.3 適応的ビットレート

WebRTC エンジンはデフォルトで適応的ビットレート制御（ABR）を実装しており、ネットワーク状況に応じてビットレートを自動調整する。追加実装なしで以下が機能する:

- **輻輳制御**: Google Congestion Control（GCC）アルゴリズム
- **パケットロス検知**: RTCP レポートに基づくビットレート調整
- **帯域推定**: REMB（Receiver Estimated Maximum Bitrate）

接続品質のモニタリングには `RTCPeerConnection.getStats()` を使用する:

```javascript
/**
 * 接続品質の統計情報を取得する
 */
async function getConnectionStats(peerConnection) {
    var stats = await peerConnection.getStats();
    var result = {};

    stats.forEach(function (report) {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
            result.packetsLost = report.packetsLost;
            result.packetsReceived = report.packetsReceived;
            result.bytesReceived = report.bytesReceived;
            result.framesDecoded = report.framesDecoded;
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            result.currentRoundTripTime = report.currentRoundTripTime;
            result.availableOutgoingBitrate = report.availableOutgoingBitrate;
        }
    });

    return result;
}
```

---

## 7. エラーハンドリング

### 7.1 カメラ/マイク権限

```javascript
/**
 * メディアデバイスを取得する（エラーハンドリング付き）
 * @returns {Promise<MediaStream|null>}
 */
async function acquireMedia() {
    try {
        var stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        return stream;
    } catch (error) {
        switch (error.name) {
            case 'NotAllowedError':
                // ユーザーがカメラ/マイクの使用を拒否
                showError('カメラとマイクの使用を許可してください。ブラウザの設定からアクセスを許可できます。');
                break;

            case 'NotFoundError':
                // カメラまたはマイクが見つからない
                showError('カメラまたはマイクが検出されませんでした。デバイスが接続されているか確認してください。');
                break;

            case 'NotReadableError':
                // デバイスがハードウェアエラーを返した（他アプリが使用中等）
                showError('カメラまたはマイクにアクセスできません。他のアプリが使用中でないか確認してください。');
                break;

            case 'OverconstrainedError':
                // 要求した制約を満たすデバイスがない
                // フォールバック: 制約を緩和して再取得
                try {
                    var fallbackStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: true
                    });
                    return fallbackStream;
                } catch (fallbackError) {
                    showError('カメラの初期化に失敗しました。');
                }
                break;

            default:
                showError('カメラの初期化中にエラーが発生しました。ページを再読み込みしてお試しください。');
        }
        return null;
    }
}
```

### 7.2 接続状態の監視

```javascript
/**
 * RTCPeerConnection の接続状態を監視する
 */
function monitorConnection(peerConnection, callbacks) {

    // ICE 接続状態の監視
    peerConnection.oniceconnectionstatechange = function () {
        var state = peerConnection.iceConnectionState;
        console.log('[WebRTC] ICE connection state:', state);

        switch (state) {
            case 'checking':
                // 接続確認中
                callbacks.onConnecting && callbacks.onConnecting();
                break;

            case 'connected':
            case 'completed':
                // 接続成功
                callbacks.onConnected && callbacks.onConnected();
                break;

            case 'disconnected':
                // 一時的な切断（ネットワーク不安定）
                // 自動再接続を待つ（通常数秒で回復）
                callbacks.onDisconnected && callbacks.onDisconnected();
                startReconnectTimer();
                break;

            case 'failed':
                // 接続失敗（回復不能）
                callbacks.onFailed && callbacks.onFailed();
                handleConnectionFailure();
                break;

            case 'closed':
                // 接続終了
                callbacks.onClosed && callbacks.onClosed();
                break;
        }
    };

    // 接続全体の状態監視（Chrome 72+）
    peerConnection.onconnectionstatechange = function () {
        var state = peerConnection.connectionState;
        console.log('[WebRTC] Connection state:', state);

        if (state === 'failed') {
            handleConnectionFailure();
        }
    };
}
```

### 7.3 切断検知と再接続

```javascript
var RECONNECT_TIMEOUT_MS = 15000;  // 15秒で再接続を諦める
var reconnectTimer = null;

/**
 * 切断検知後の再接続タイマーを開始する
 */
function startReconnectTimer() {
    if (reconnectTimer) return;  // 既にタイマー稼働中

    showNotification('接続が不安定です。再接続を試みています...');

    reconnectTimer = setTimeout(function () {
        if (peerConnection.iceConnectionState === 'disconnected' ||
            peerConnection.iceConnectionState === 'failed') {
            // 再接続タイムアウト: ICE restart を試行
            attemptIceRestart();
        }
        reconnectTimer = null;
    }, RECONNECT_TIMEOUT_MS);
}

/**
 * ICE restart による再接続を試行する
 */
async function attemptIceRestart() {
    try {
        var offer = await peerConnection.createOffer({ iceRestart: true });
        await peerConnection.setLocalDescription(offer);

        // 新しい offer を Firestore に書き込み
        await callDoc.update({
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        });

        showNotification('再接続中...');
    } catch (error) {
        console.error('[WebRTC] ICE restart failed:', error);
        showError('接続を回復できませんでした。通話が終了します。');
        endCall();
    }
}

/**
 * 接続失敗時の処理
 */
function handleConnectionFailure() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;

    showError('接続に失敗しました。ネットワーク環境を確認してください。');
    endCall();
}
```

### 7.4 エラーの分類と対応

| エラー種別 | 検知方法 | ユーザーへの通知 | 対応 |
|---|---|---|---|
| カメラ/マイク権限拒否 | `getUserMedia` の `NotAllowedError` | 権限許可の案内を表示 | ブラウザ設定リンク提示 |
| デバイス未接続 | `getUserMedia` の `NotFoundError` | デバイス確認を依頼 | 音声のみモードを提案 |
| 一時的切断 | `iceConnectionState: 'disconnected'` | 「再接続中...」表示 | 15秒待機後に ICE restart |
| 接続失敗 | `iceConnectionState: 'failed'` | 「接続失敗」表示 | ICE restart → 失敗なら通話終了 |
| Firestore 通信エラー | `onSnapshot` の error コールバック | 「通信エラー」表示 | リトライ後にマッチング画面へ戻す |
| TURN サーバー不達 | ICE gathering 完了後に relay 候補なし | （内部ログのみ） | STUN のみで接続試行（フォールバック） |

---

## 8. セキュリティ

### 8.1 通信の暗号化

WebRTC の通信は以下のプロトコルにより暗号化される。これはブラウザが自動的に処理するため、追加実装は不要。

```
暗号化レイヤー:

┌──────────────────────────────────────────┐
│  メディアストリーム（映像・音声）           │
│  暗号化: SRTP (Secure Real-time Transport)│
├──────────────────────────────────────────┤
│  DTLS (Datagram Transport Layer Security) │
│  鍵交換・認証                              │
├──────────────────────────────────────────┤
│  ICE / UDP or TCP                         │
│  NAT 越え・トランスポート                  │
└──────────────────────────────────────────┘
```

| プロトコル | 役割 | 備考 |
|---|---|---|
| **DTLS** | 鍵交換、ピア認証 | TLS の UDP 版。SDP の fingerprint で検証 |
| **SRTP** | メディア（映像・音声）の暗号化 | DTLS で交換した鍵で AES 暗号化 |
| **DTLS-SRTP** | 上記の統合 | WebRTC では必須（ブラウザが強制） |

**重要:** WebRTC のメディア通信は**エンドツーエンドで暗号化**される（P2P の場合）。TURN リレー経由の場合もリレーサーバーはメディアの内容を復号できない。

### 8.2 シグナリングデータの保護（Firestore セキュリティルール）

```javascript
// Firestore セキュリティルール
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // calls コレクション
    match /calls/{callId} {

      // 読み取り: 通話の参加者（caller または callee）のみ
      allow read: if request.auth != null &&
        (resource.data.callerUid == request.auth.uid ||
         resource.data.calleeUid == request.auth.uid);

      // 作成: 認証済みユーザーのみ。callerUid が自分自身であること
      allow create: if request.auth != null &&
        request.resource.data.callerUid == request.auth.uid;

      // 更新: 参加者のみ。callerUid は変更不可
      allow update: if request.auth != null &&
        (resource.data.callerUid == request.auth.uid ||
         resource.data.calleeUid == request.auth.uid) &&
        request.resource.data.callerUid == resource.data.callerUid;

      // 削除: 不可（管理者のみ Admin SDK 経由で）
      allow delete: if false;

      // ICE candidates サブコレクション
      match /callerCandidates/{candidateId} {
        allow read: if request.auth != null &&
          (get(/databases/$(database)/documents/calls/$(callId)).data.callerUid == request.auth.uid ||
           get(/databases/$(database)/documents/calls/$(callId)).data.calleeUid == request.auth.uid);
        allow create: if request.auth != null &&
          get(/databases/$(database)/documents/calls/$(callId)).data.callerUid == request.auth.uid;
      }

      match /calleeCandidates/{candidateId} {
        allow read: if request.auth != null &&
          (get(/databases/$(database)/documents/calls/$(callId)).data.callerUid == request.auth.uid ||
           get(/databases/$(database)/documents/calls/$(callId)).data.calleeUid == request.auth.uid);
        allow create: if request.auth != null &&
          get(/databases/$(database)/documents/calls/$(callId)).data.calleeUid == request.auth.uid;
      }
    }
  }
}
```

**ルールの設計ポイント:**
- 認証済みユーザーのみアクセス可能
- 通話の参加者（caller / callee）のみが該当ドキュメントを読み書き可能
- ICE candidate のサブコレクションは、該当ロール（caller → callerCandidates、callee → calleeCandidates）のユーザーのみ書き込み可能
- ドキュメント削除は禁止（終了時は `status` を `'ended'` に更新）

### 8.3 追加セキュリティ考慮事項

| 項目 | 対策 |
|---|---|
| **SDP の漏洩防止** | Firestore ルールで参加者のみアクセスに制限 |
| **IP アドレスの秘匿** | mDNS candidate（Chrome デフォルト有効）でローカル IP を秘匿 |
| **通話データの有効期限** | Cloud Functions で定期的に古い `calls` ドキュメントを削除（TTL: 24時間） |
| **レート制限** | Firestore ルールで短時間の大量通話作成を防止（将来実装） |
| **HTTPS 必須** | Vercel デプロイにより HTTPS が自動適用。`getUserMedia` は HTTPS が必須 |
| **TURN クレデンシャル** | 短寿命の一時クレデンシャルを使用（有効期限: 数時間） |

---

## 9. ファイル構成案

### 新規 JS ファイル

```
C:\home\V-MEET\
├── js/
│   ├── firebase-config.js       ← 既存（Firebase 初期化）
│   ├── auth-ui.js               ← 既存（認証 UI 制御）
│   ├── auth-modal.js            ← 既存（認証モーダル）
│   │
│   ├── webrtc-client.js         ← 【新規】WebRTC 接続管理
│   ├── webrtc-signaling.js      ← 【新規】Firestore シグナリング
│   ├── webrtc-media.js          ← 【新規】メディアデバイス管理
│   └── webrtc-ui.js             ← 【新規】通話 UI 制御
│
├── index.html                   ← 既存（ランディングページ）
├── call.html                    ← 【新規】ビデオ通話ページ
└── specs/
    └── 06-webrtc-architecture.md ← 本仕様書
```

### 各ファイルの責務

#### `js/webrtc-client.js` — WebRTC 接続管理（メインモジュール）

```javascript
/* =============================================
   WebRTC Client  –  V-MEET
   P2P ビデオ通話の接続管理
   ============================================= */

// 責務:
// - RTCPeerConnection の生成・管理
// - ICE サーバー構成
// - 接続状態の監視
// - ICE restart による再接続
// - 通話の開始・終了

// 公開 API（グローバルオブジェクト: VMeet.WebRTC）:
// - VMeet.WebRTC.startCall(callId, isCaller)  通話開始
// - VMeet.WebRTC.endCall()                    通話終了
// - VMeet.WebRTC.getStats()                   接続統計取得
// - VMeet.WebRTC.isSupported()                WebRTC 対応チェック
```

#### `js/webrtc-signaling.js` — Firestore シグナリング

```javascript
/* =============================================
   WebRTC Signaling  –  V-MEET
   Firestore を使用した SDP/ICE 交換
   ============================================= */

// 責務:
// - SDP offer/answer の送受信
// - ICE candidate の送受信
// - Firestore リアルタイムリスナーの管理
// - シグナリングリスナーのクリーンアップ

// 公開 API（グローバルオブジェクト: VMeet.Signaling）:
// - VMeet.Signaling.sendOffer(callId, offer)
// - VMeet.Signaling.sendAnswer(callId, answer)
// - VMeet.Signaling.listenForAnswer(callId, callback)
// - VMeet.Signaling.listenForOffer(callId, callback)
// - VMeet.Signaling.sendCandidate(callId, role, candidate)
// - VMeet.Signaling.listenForCandidates(callId, role, callback)
// - VMeet.Signaling.cleanup()
```

#### `js/webrtc-media.js` — メディアデバイス管理

```javascript
/* =============================================
   WebRTC Media  –  V-MEET
   カメラ・マイクのデバイス管理
   ============================================= */

// 責務:
// - getUserMedia によるストリーム取得
// - カメラ/マイクのオン・オフ切替
// - デバイス一覧の取得・切替
// - メディア制約（解像度・帯域幅）の管理

// 公開 API（グローバルオブジェクト: VMeet.Media）:
// - VMeet.Media.acquireStream(constraints)     メディアストリーム取得
// - VMeet.Media.toggleVideo(enabled)           カメラ ON/OFF
// - VMeet.Media.toggleAudio(enabled)           マイク ON/OFF
// - VMeet.Media.switchCamera()                 カメラ切替（モバイル）
// - VMeet.Media.stopAllTracks()                全トラック停止
// - VMeet.Media.getDevices()                   デバイス一覧取得
```

#### `js/webrtc-ui.js` — 通話 UI 制御

```javascript
/* =============================================
   WebRTC UI  –  V-MEET
   ビデオ通話画面の UI 制御
   ============================================= */

// 責務:
// - ローカル/リモートビデオの表示制御
// - 通話コントロール（ミュート、カメラ切替、終了）
// - 接続状態のインジケーター表示
// - 10分タイマーの表示・管理
// - エラーメッセージ・通知の表示

// 公開 API（グローバルオブジェクト: VMeet.CallUI）:
// - VMeet.CallUI.init()                       UI 初期化
// - VMeet.CallUI.setLocalStream(stream)       ローカル映像表示
// - VMeet.CallUI.setRemoteStream(stream)      リモート映像表示
// - VMeet.CallUI.showConnecting()             「接続中」表示
// - VMeet.CallUI.showConnected()              「通話中」表示
// - VMeet.CallUI.showError(message)           エラー表示
// - VMeet.CallUI.startTimer(durationSec)      タイマー開始
```

### グローバル名前空間

既存コードに合わせて IIFE パターンを使用し、`VMeet` グローバルオブジェクトに統合する。

```javascript
// 名前空間の初期化（firebase-config.js の後に読み込む）
var VMeet = VMeet || {};

// 各モジュールが VMeet.WebRTC, VMeet.Signaling 等を設定
// モジュール間の依存関係:
//   webrtc-media.js    → 依存なし
//   webrtc-signaling.js → firebase-config.js
//   webrtc-client.js    → webrtc-media.js, webrtc-signaling.js
//   webrtc-ui.js        → webrtc-client.js, webrtc-media.js
```

### HTML でのスクリプト読み込み順序（call.html）

```html
<!-- Firebase SDK（既存） -->
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>

<!-- Firebase 設定（既存） -->
<script src="js/firebase-config.js"></script>

<!-- WebRTC モジュール（新規・依存順） -->
<script src="js/webrtc-media.js"></script>
<script src="js/webrtc-signaling.js"></script>
<script src="js/webrtc-client.js"></script>
<script src="js/webrtc-ui.js"></script>
```

---

## 10. 通話ライフサイクル管理

### 10.1 通話の終了処理

通話終了時には以下のリソースを確実に解放する。

```javascript
/**
 * 通話を終了し、全リソースを解放する
 */
function endCall() {
    // 1. メディアトラックの停止
    if (localStream) {
        localStream.getTracks().forEach(function (track) {
            track.stop();
        });
        localStream = null;
    }

    // 2. RTCPeerConnection のクローズ
    if (peerConnection) {
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
        peerConnection = null;
    }

    // 3. Firestore リスナーの解除
    if (unsubscribeCallDoc) {
        unsubscribeCallDoc();
        unsubscribeCallDoc = null;
    }
    if (unsubscribeCandidates) {
        unsubscribeCandidates();
        unsubscribeCandidates = null;
    }

    // 4. Firestore の通話ステータスを更新
    if (callDoc) {
        callDoc.update({
            status: 'ended',
            endedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    // 5. タイマーの停止
    clearInterval(callTimer);
    callTimer = null;
}
```

### 10.2 10分タイマー

V-Meet のコア機能である 10分間ビデオ通話のタイマー管理。

```javascript
var CALL_DURATION_SEC = 600;  // 10分 = 600秒

/**
 * 通話タイマーを開始する
 * @param {function} onTick - 毎秒呼ばれるコールバック（残り秒数を受け取る）
 * @param {function} onExpire - タイマー期限切れ時のコールバック
 */
function startCallTimer(onTick, onExpire) {
    var remaining = CALL_DURATION_SEC;

    callTimer = setInterval(function () {
        remaining--;
        onTick(remaining);

        if (remaining <= 0) {
            clearInterval(callTimer);
            onExpire();
        }
    }, 1000);
}
```

**タイマーの同期について:**
- タイマーは各クライアントが独立して管理する（厳密な同期は不要）
- 通話開始時刻を Firestore の `serverTimestamp()` で記録し、大幅なズレを防止
- 将来的に RTCDataChannel でタイマー同期メッセージを送信する拡張が可能

---

## 11. 将来の拡張ポイント

| 拡張項目 | 実装方法 | 優先度 |
|---|---|---|
| テキストチャット | RTCDataChannel でメッセージ送受信 | 中 |
| 画面共有 | `getDisplayMedia()` API + 映像トラック差替え | 低 |
| 通話品質ダッシュボード | `getStats()` の定期取得 + UI 表示 | 中 |
| 録画（同意ベース） | MediaRecorder API | 低 |
| 背景ぼかし | Canvas/WebGL でのリアルタイム映像処理 | 低 |
| グループ通話 | SFU サーバー（mediasoup 等）の導入が必要 | 将来 |

---

## 付録 A: 用語集

| 用語 | 説明 |
|---|---|
| **SDP** | Session Description Protocol。メディアのコーデック、暗号化方式、ネットワーク情報を記述するプロトコル |
| **ICE** | Interactive Connectivity Establishment。NAT 越えのための候補収集・接続性チェックの仕組み |
| **STUN** | Session Traversal Utilities for NAT。パブリック IP/ポートを検出するプロトコル |
| **TURN** | Traversal Using Relays around NAT。P2P 不可時のメディアリレーサーバー |
| **DTLS** | Datagram Transport Layer Security。UDP 上での鍵交換・認証 |
| **SRTP** | Secure Real-time Transport Protocol。メディアの暗号化プロトコル |
| **Trickle ICE** | ICE 候補を収集次第逐次送信する方式（全候補収集を待たない） |
| **ICE Restart** | 接続断時に新しい ICE 候補で再ネゴシエーションを行う仕組み |
| **SFU** | Selective Forwarding Unit。グループ通話用のメディアサーバー方式 |
| **P2P** | Peer-to-Peer。サーバーを介さない端末間の直接通信 |

## 付録 B: 参考資料

- [WebRTC API - MDN Web Docs](https://developer.mozilla.org/ja/docs/Web/API/WebRTC_API)
- [Firebase Firestore を使った WebRTC シグナリング](https://webrtc.org/getting-started/firebase-rtc-codelab)
- [WebRTC のセキュリティアーキテクチャ（RFC 8827）](https://datatracker.ietf.org/doc/html/rfc8827)
- [ICE プロトコル（RFC 8445）](https://datatracker.ietf.org/doc/html/rfc8445)
