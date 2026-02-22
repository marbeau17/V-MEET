/* =============================================
   Matching Queue Client  –  V-MEET
   キュー登録・マッチング検知・タイマー・通話管理
   ============================================= */

(function () {
    'use strict';

    var db = firebase.firestore();
    var auth = firebase.auth();
    var FieldValue = firebase.firestore.FieldValue;

    /* ---------- 内部状態 ---------- */
    var unsubscribeQueue = null;   // queue onSnapshot リスナー解除関数
    var timerInterval = null;      // setInterval ID
    var onMatchedCallback = null;  // マッチング成立コールバック

    /* ---------- ヘルパー ---------- */

    /**
     * 現在ログイン中のユーザーを返す。未ログインなら例外。
     */
    function requireUser() {
        var user = auth.currentUser;
        if (!user) {
            throw new Error('ログインが必要です');
        }
        return user;
    }

    /* ======================
       joinQueue
       ====================== */

    /**
     * 待機キューに参加する。
     * 1. queue/{uid} ドキュメントを作成
     * 2. onSnapshot でステータス監視開始
     * 3. クライアントサイドマッチングを試行（Cloud Functions 未実装時のフォールバック）
     *
     * @return {Promise<void>}
     */
    function joinQueue() {
        var user = requireUser();
        var uid = user.uid;
        var queueRef = db.collection('queue').doc(uid);

        var data = {
            uid: uid,
            displayName: user.displayName || '匿名',
            photoURL: user.photoURL || null,
            enqueuedAt: FieldValue.serverTimestamp(),
            status: 'waiting',
            matchedWith: null,
            roomId: null
        };

        return queueRef.set(data).then(function () {
            // onSnapshot でマッチング検知
            listenQueue(uid);

            // クライアントサイドマッチング試行 (MVP フォールバック)
            tryClientSideMatch(uid, user);
        });
    }

    /**
     * queue/{uid} を onSnapshot で監視。
     * status が 'matched' に変わったら onMatchedCallback を呼ぶ。
     */
    function listenQueue(uid) {
        // 既存リスナーがあれば解除
        if (unsubscribeQueue) {
            unsubscribeQueue();
            unsubscribeQueue = null;
        }

        unsubscribeQueue = db.collection('queue').doc(uid)
            .onSnapshot(function (doc) {
                if (!doc.exists) return;

                var d = doc.data();
                if (d.status === 'matched' && d.roomId) {
                    // リスナー解除
                    if (unsubscribeQueue) {
                        unsubscribeQueue();
                        unsubscribeQueue = null;
                    }

                    // コールバック呼び出し
                    if (typeof onMatchedCallback === 'function') {
                        var myUid = auth.currentUser ? auth.currentUser.uid : uid;
                        onMatchedCallback({
                            roomId: d.roomId,
                            role: (d.matchedWith && d.matchedWith !== myUid) ?
                                determineRole(d, myUid) : 'callee',
                            partner: {
                                displayName: d.partnerDisplayName || null,
                                photoURL: d.partnerPhotoURL || null
                            }
                        });
                    }
                }
            });
    }

    /**
     * role を判定する。
     * キューに先にいた方 (caller) か後から来た方 (callee) かを
     * roomドキュメントから取得するのが正確だが、ここでは roomId 取得後に
     * rooms ドキュメントの callerUid と照合する簡易版を使う。
     */
    function determineRole(queueData, myUid) {
        // クライアントサイドマッチング時は room 作成側で role を設定しているので
        // room ドキュメントから取得する方が正確。
        // ここでは暫定で callee を返し、call-controller 側で room ドキュメントから
        // 正式に判定する想定。
        return 'callee';
    }

    /* ======================
       クライアントサイドマッチング (MVP)
       ====================== */

    /**
     * Cloud Functions が未実装のMVP段階でのフォールバック。
     * queue コレクションから status='waiting' かつ自分以外のユーザーを検索し、
     * トランザクションで両者を matched に更新して room を作成する。
     */
    function tryClientSideMatch(myUid, myUser) {
        var queueCol = db.collection('queue');

        return queueCol
            .where('status', '==', 'waiting')
            .orderBy('enqueuedAt', 'asc')
            .limit(10)
            .get()
            .then(function (snapshot) {
                var matchDoc = null;
                snapshot.forEach(function (doc) {
                    if (!matchDoc && doc.id !== myUid) {
                        matchDoc = doc;
                    }
                });

                if (!matchDoc) {
                    // 相手がいない — 待機を続ける
                    return;
                }

                var partner = matchDoc.data();
                var partnerUid = matchDoc.id;

                // トランザクションでアトミックにマッチング
                return db.runTransaction(function (tx) {
                    var myRef = queueCol.doc(myUid);
                    var partnerRef = queueCol.doc(partnerUid);

                    return tx.get(myRef).then(function (mySnap) {
                        return tx.get(partnerRef).then(function (partnerSnap) {
                            // どちらかが既に matched / 削除されていたら中止
                            if (!mySnap.exists || !partnerSnap.exists) return;
                            if (mySnap.data().status !== 'waiting') return;
                            if (partnerSnap.data().status !== 'waiting') return;

                            // room 作成
                            var roomRef = db.collection('rooms').doc();
                            var roomId = roomRef.id;
                            var now = FieldValue.serverTimestamp();

                            tx.set(roomRef, {
                                participants: [partnerUid, myUid],
                                status: 'waiting',
                                createdAt: now,
                                startedAt: null,
                                endedAt: null,
                                baseDurationSec: 600,
                                extensions: 0,
                                callerUid: partnerUid,
                                calleeUid: myUid
                            });

                            // 両者の queue を matched に更新
                            tx.update(myRef, {
                                status: 'matched',
                                matchedWith: partnerUid,
                                roomId: roomId,
                                partnerDisplayName: partner.displayName || null,
                                partnerPhotoURL: partner.photoURL || null
                            });

                            tx.update(partnerRef, {
                                status: 'matched',
                                matchedWith: myUid,
                                roomId: roomId,
                                partnerDisplayName: myUser.displayName || '匿名',
                                partnerPhotoURL: myUser.photoURL || null
                            });
                        });
                    });
                });
            })
            .catch(function (err) {
                console.warn('[Matching] クライアントサイドマッチング失敗:', err);
            });
    }

    /* ======================
       leaveQueue
       ====================== */

    /**
     * キューから離脱する。
     * 1. queue/{uid} ドキュメント削除
     * 2. リスナー解除
     *
     * @return {Promise<void>}
     */
    function leaveQueue() {
        var user = requireUser();
        var uid = user.uid;

        // リスナー解除
        if (unsubscribeQueue) {
            unsubscribeQueue();
            unsubscribeQueue = null;
        }

        return db.collection('queue').doc(uid).delete();
    }

    /* ======================
       onMatched
       ====================== */

    /**
     * マッチング成立時に呼ばれるコールバックを登録する。
     *
     * @param {function} callback - { roomId, role, partner: { displayName, photoURL } }
     */
    function onMatched(callback) {
        onMatchedCallback = callback;
    }

    /* ======================
       タイマー
       ====================== */

    /**
     * カウントダウンタイマーを開始する。
     *
     * @param {number} durationSec  - 合計秒数（例: 600）
     * @param {function} onTick     - 毎秒呼ばれる。引数は残り秒数。
     * @param {function} onEnd      - タイマー終了時に呼ばれる。
     */
    function startTimer(durationSec, onTick, onEnd) {
        // 既存タイマーがあれば停止
        stopTimer();

        var remaining = durationSec;

        timerInterval = setInterval(function () {
            remaining--;

            if (typeof onTick === 'function') {
                onTick(remaining);
            }

            if (remaining <= 0) {
                clearInterval(timerInterval);
                timerInterval = null;

                if (typeof onEnd === 'function') {
                    onEnd();
                }
            }
        }, 1000);
    }

    /**
     * タイマーを停止する。
     */
    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    /* ======================
       requestExtension
       ====================== */

    /**
     * 通話時間の延長をリクエストする。
     * rooms/{roomId} の baseDurationSec を +300 し、extensions をインクリメント。
     *
     * @param {string} roomId
     * @return {Promise<boolean>} 成功したら true
     */
    function requestExtension(roomId) {
        var roomRef = db.collection('rooms').doc(roomId);

        return roomRef.update({
            baseDurationSec: FieldValue.increment(300),
            extensions: FieldValue.increment(1)
        }).then(function () {
            return true;
        }).catch(function (err) {
            console.error('[Matching] 延長リクエスト失敗:', err);
            return false;
        });
    }

    /* ======================
       endCall
       ====================== */

    /**
     * 通話を終了する。
     * rooms/{roomId} の status を 'ended' に更新し、endedAt を記録する。
     *
     * @param {string} roomId
     * @return {Promise<void>}
     */
    function endCall(roomId) {
        return db.collection('rooms').doc(roomId).update({
            status: 'ended',
            endedAt: FieldValue.serverTimestamp()
        });
    }

    /* ======================
       cleanup
       ====================== */

    /**
     * 全リソースをクリーンアップする。
     * タイマー停止、リスナー解除。
     */
    function cleanup() {
        stopTimer();

        if (unsubscribeQueue) {
            unsubscribeQueue();
            unsubscribeQueue = null;
        }
    }

    /* ---------- グローバル公開 ---------- */
    window.VMeet = window.VMeet || {};
    window.VMeet.Matching = {
        joinQueue: joinQueue,
        leaveQueue: leaveQueue,
        onMatched: onMatched,
        startTimer: startTimer,
        stopTimer: stopTimer,
        requestExtension: requestExtension,
        endCall: endCall,
        cleanup: cleanup
    };
})();
