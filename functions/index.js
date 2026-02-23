"use strict";

var admin = require("firebase-admin");
var functions = require("firebase-functions/v2");
var firestoreFn = require("firebase-functions/v2/firestore");
var scheduler = require("firebase-functions/v2/scheduler");
var https = require("firebase-functions/v2/https");

admin.initializeApp();

var db = admin.firestore();

// ============================================================
// onQueueWrite - queue/{uid} の onCreate トリガー
// 新しいドキュメントが 'waiting' で作成されたとき、マッチング相手を検索
// ============================================================
exports.onQueueWrite = firestoreFn.onDocumentCreated(
  {
    document: "queue/{uid}",
    region: "asia-northeast1",
    memory: "256MiB"
  },
  function (event) {
    var snapshot = event.data;
    if (!snapshot) return null;

    var newEntry = snapshot.data();
    var uid = event.params.uid;

    // waiting ステータス以外は無視
    if (newEntry.status !== "waiting") {
      return null;
    }

    console.log("onQueueWrite triggered for uid:", uid);

    // status='waiting' の別ユーザーを検索（orderBy不要 — 複合インデックス不要に）
    return db
      .collection("queue")
      .where("status", "==", "waiting")
      .limit(10)
      .get()
      .then(function (querySnapshot) {
        var matchedDoc = null;

        querySnapshot.forEach(function (doc) {
          if (matchedDoc) return;
          if (doc.id === uid) return; // 自分自身はスキップ
          matchedDoc = doc;
        });

        if (!matchedDoc) {
          console.log("No match found for uid:", uid);
          return null;
        }

        var partnerUid = matchedDoc.id;
        var roomRef = db.collection("rooms").doc();
        var roomId = roomRef.id;
        var now = admin.firestore.FieldValue.serverTimestamp();

        console.log("Match found:", uid, "<->", partnerUid, "roomId:", roomId);

        // トランザクションで安全にマッチング処理
        return db.runTransaction(function (transaction) {
          // 両方のキュードキュメントを再読込して状態確認
          var myRef = db.collection("queue").doc(uid);
          var partnerRef = db.collection("queue").doc(partnerUid);

          return Promise.all([
            transaction.get(myRef),
            transaction.get(partnerRef)
          ]).then(function (docs) {
            var myDoc = docs[0];
            var partnerDoc = docs[1];

            // どちらかが既にマッチ済み or 削除済みならキャンセル
            if (!myDoc.exists || !partnerDoc.exists) {
              console.log("One of the queue docs no longer exists, aborting match");
              return null;
            }
            if (myDoc.data().status !== "waiting" || partnerDoc.data().status !== "waiting") {
              console.log("One of the queue docs is no longer waiting, aborting match");
              return null;
            }

            // 相手の表示名・アバターを取得
            var myData = myDoc.data();
            var partnerData = partnerDoc.data();

            // rooms コレクションに新しいルームを作成
            transaction.set(roomRef, {
              participants: [uid, partnerUid],
              callerUid: partnerUid,
              calleeUid: uid,
              status: "waiting",
              createdAt: now,
              startedAt: null,
              endedAt: null,
              baseDurationSec: 600,
              extensions: 0,
              totalDurationSec: 0,
              endReason: null,
              ticketsConsumed: 0,
              extensionChargeYen: 0
            });

            // 両方のqueueドキュメントの status を 'matched' に更新（相手情報も設定）
            transaction.update(myRef, {
              status: "matched",
              matchedWith: partnerUid,
              roomId: roomId,
              partnerDisplayName: partnerData.displayName || null,
              partnerPhotoURL: partnerData.photoURL || null
            });

            transaction.update(partnerRef, {
              status: "matched",
              matchedWith: uid,
              roomId: roomId,
              partnerDisplayName: myData.displayName || null,
              partnerPhotoURL: myData.photoURL || null
            });

            console.log("Match committed:", roomId);
            return null;
          });
        });
      })
      .catch(function (error) {
        console.log("Error in onQueueWrite:", error);
        return null;
      });
  }
);

// ============================================================
// scheduledCleanup - 5分ごとの定期実行
// - 5分以上前の status='waiting' のqueueドキュメントを削除
// - status='ended' かつ 1時間以上前のroomドキュメントを削除
// ============================================================
exports.scheduledCleanup = scheduler.onSchedule(
  {
    schedule: "every 5 minutes",
    region: "asia-northeast1",
    timeZone: "Asia/Tokyo",
    memory: "256MiB"
  },
  function () {
    var now = Date.now();
    var fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
    var oneHourAgo = new Date(now - 60 * 60 * 1000);
    var batch = db.batch();
    var deleteCount = 0;

    console.log("scheduledCleanup started");

    // 1. 5分以上前の status='waiting' のqueueドキュメントを削除
    return db
      .collection("queue")
      .where("status", "==", "waiting")
      .where("enqueuedAt", "<", admin.firestore.Timestamp.fromDate(fiveMinutesAgo))
      .limit(200)
      .get()
      .then(function (queueSnapshot) {
        queueSnapshot.forEach(function (doc) {
          batch.delete(doc.ref);
          deleteCount++;
        });

        console.log("Expired queue entries found:", queueSnapshot.size);

        // 2. status='ended' かつ 1時間以上前のroomドキュメントを削除
        return db
          .collection("rooms")
          .where("status", "==", "ended")
          .where("endedAt", "<", admin.firestore.Timestamp.fromDate(oneHourAgo))
          .limit(200)
          .get();
      })
      .then(function (roomSnapshot) {
        roomSnapshot.forEach(function (doc) {
          batch.delete(doc.ref);
          deleteCount++;
        });

        console.log("Expired room entries found:", roomSnapshot.size);

        if (deleteCount > 0) {
          return batch.commit().then(function () {
            console.log("scheduledCleanup completed:", deleteCount, "items deleted");
          });
        }

        console.log("scheduledCleanup completed: nothing to clean");
        return null;
      })
      .catch(function (error) {
        console.log("Error in scheduledCleanup:", error);
        return null;
      });
  }
);

// ============================================================
// endCall - HTTPS callable
// roomId を受け取り、status を 'ended' に更新、endedAt を設定
// ============================================================
exports.endCall = https.onCall(
  {
    region: "asia-northeast1"
  },
  function (request) {
    if (!request.auth) {
      throw new https.HttpsError("unauthenticated", "Authentication required.");
    }

    var uid = request.auth.uid;
    var roomId = request.data.roomId;

    if (!roomId || typeof roomId !== "string") {
      throw new https.HttpsError("invalid-argument", "roomId is required.");
    }

    console.log("endCall called by uid:", uid, "roomId:", roomId);

    var roomRef = db.collection("rooms").doc(roomId);

    return roomRef
      .get()
      .then(function (roomDoc) {
        if (!roomDoc.exists) {
          throw new https.HttpsError("not-found", "Room not found.");
        }

        var room = roomDoc.data();

        // 参加者チェック
        if (!room.participants || room.participants.indexOf(uid) === -1) {
          throw new https.HttpsError("permission-denied", "Not a participant of this room.");
        }

        // 既に終了済み
        if (room.status === "ended") {
          return { success: true, message: "Already ended." };
        }

        var now = admin.firestore.FieldValue.serverTimestamp();

        // status を 'ended' に更新し endedAt を設定
        return roomRef
          .update({
            status: "ended",
            endedAt: now
          })
          .then(function () {
            console.log("Room ended:", roomId);
            return { success: true, roomId: roomId };
          });
      })
      .catch(function (error) {
        if (error instanceof https.HttpsError) {
          throw error;
        }
        console.log("Error in endCall:", error);
        throw new https.HttpsError("internal", "Failed to end call.");
      });
  }
);
