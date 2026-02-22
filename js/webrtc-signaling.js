/* =============================================
   WebRTC Signaling  -  V-MEET
   Firestore を使用した SDP/ICE 交換
   ============================================= */

(function () {
    'use strict';

    window.VMeet = window.VMeet || {};

    /* ---------- STUN/TURN サーバー設定 ---------- */
    var ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    /* ---------- 内部状態 ---------- */
    var unsubscribers = [];

    /* ---------- ユーティリティ ---------- */
    function db() {
        return firebase.firestore();
    }

    function roomRef(roomId) {
        return db().collection('rooms').doc(roomId);
    }

    function addUnsubscriber(unsub) {
        if (typeof unsub === 'function') {
            unsubscribers.push(unsub);
        }
    }

    /* ---------- 公開 API ---------- */

    /**
     * Caller: offer を作成して Firestore に保存し、answer と calleeCandidates をリッスンする
     * @param {string} roomId - ルームID
     * @param {RTCPeerConnection} pc - PeerConnection
     * @returns {Promise<void>}
     */
    function createOffer(roomId, pc) {
        var doc = roomRef(roomId);

        return pc.createOffer().then(function (offer) {
            return pc.setLocalDescription(offer);
        }).then(function () {
            var offerDesc = pc.localDescription;
            return doc.set({
                offer: { type: offerDesc.type, sdp: offerDesc.sdp }
            }, { merge: true });
        }).then(function () {
            // answer をリッスン
            var unsubAnswer = doc.onSnapshot(function (snapshot) {
                var data = snapshot.data();
                if (data && data.answer && !pc.currentRemoteDescription) {
                    var answerDesc = new RTCSessionDescription(data.answer);
                    pc.setRemoteDescription(answerDesc);
                }
            });
            addUnsubscriber(unsubAnswer);

            // calleeCandidates をリッスン
            var unsubCandidates = doc.collection('calleeCandidates')
                .onSnapshot(function (snapshot) {
                    snapshot.docChanges().forEach(function (change) {
                        if (change.type === 'added') {
                            var candidate = new RTCIceCandidate(change.doc.data());
                            pc.addIceCandidate(candidate);
                        }
                    });
                });
            addUnsubscriber(unsubCandidates);
        });
    }

    /**
     * Callee: offer を受け取り answer を作成して Firestore に保存し、callerCandidates をリッスンする
     * @param {string} roomId - ルームID
     * @param {RTCPeerConnection} pc - PeerConnection
     * @returns {Promise<void>}
     */
    function joinRoom(roomId, pc) {
        var doc = roomRef(roomId);

        return doc.get().then(function (snapshot) {
            var data = snapshot.data();
            if (!data || !data.offer) {
                throw new Error('ルームが見つからないか、offer が存在しません。');
            }
            var offerDesc = new RTCSessionDescription(data.offer);
            return pc.setRemoteDescription(offerDesc);
        }).then(function () {
            return pc.createAnswer();
        }).then(function (answer) {
            return pc.setLocalDescription(answer);
        }).then(function () {
            var answerDesc = pc.localDescription;
            return doc.update({
                answer: { type: answerDesc.type, sdp: answerDesc.sdp }
            });
        }).then(function () {
            // callerCandidates をリッスン
            var unsubCandidates = doc.collection('callerCandidates')
                .onSnapshot(function (snapshot) {
                    snapshot.docChanges().forEach(function (change) {
                        if (change.type === 'added') {
                            var candidate = new RTCIceCandidate(change.doc.data());
                            pc.addIceCandidate(candidate);
                        }
                    });
                });
            addUnsubscriber(unsubCandidates);
        });
    }

    /**
     * ICE candidate を Firestore に送信する
     * @param {string} roomId - ルームID
     * @param {string} role - 'caller' または 'callee'
     * @param {RTCIceCandidate} candidate - ICE candidate
     * @returns {Promise<void>}
     */
    function sendCandidate(roomId, role, candidate) {
        var collectionName = (role === 'caller') ? 'callerCandidates' : 'calleeCandidates';
        return roomRef(roomId).collection(collectionName).add(candidate.toJSON());
    }

    /**
     * 全リスナーを解除しクリーンアップする
     */
    function cleanup() {
        for (var i = 0; i < unsubscribers.length; i++) {
            unsubscribers[i]();
        }
        unsubscribers = [];
    }

    /* ---------- 名前空間に公開 ---------- */
    VMeet.Signaling = {
        ICE_SERVERS: ICE_SERVERS,
        createOffer: createOffer,
        joinRoom: joinRoom,
        sendCandidate: sendCandidate,
        cleanup: cleanup
    };

})();
