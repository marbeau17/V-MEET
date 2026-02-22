/* =============================================
   Call Controller  -  V-MEET
   call.html のメインオーケストレーター
   画面遷移・WebRTC接続・UIイベントを統合管理
   ============================================= */

(function () {
    'use strict';

    /* ---------- 内部状態 ---------- */
    var pc = null;                  // RTCPeerConnection
    var currentRoomId = null;       // 現在のルームID
    var currentRole = null;         // 'caller' | 'callee'
    var partnerInfo = null;         // { displayName, photoURL }
    var callStartTime = null;       // 通話開始時刻 (Date)
    var totalCallDurationSec = 0;   // 通話合計秒数
    var countdownTimer = null;      // マッチ後カウントダウン用 setInterval ID
    var currentScreen = null;       // 現在表示中のscreen ID
    var isMicOn = true;
    var isCameraOn = true;
    var extensionAlertShown = false;

    /* ---------- DOM キャッシュ ---------- */
    var dom = {};

    function cacheDom() {
        // Screens
        dom.screenWaiting = document.getElementById('screen-waiting');
        dom.screenMatched = document.getElementById('screen-matched');
        dom.screenCall    = document.getElementById('screen-call');
        dom.screenEnded   = document.getElementById('screen-ended');

        // Waiting screen
        dom.btnCancelQueue = document.getElementById('btn-cancel-queue');

        // Matched screen
        dom.myAvatar        = document.getElementById('my-avatar');
        dom.partnerAvatar   = document.getElementById('partner-avatar');
        dom.partnerName     = document.getElementById('partner-name');
        dom.matchCountdown  = document.getElementById('match-countdown');
        dom.btnStartCall    = document.getElementById('btn-start-call');

        // Call screen
        dom.localVideo       = document.getElementById('local-video');
        dom.remoteVideo      = document.getElementById('remote-video');
        dom.localVideoOff    = document.getElementById('local-video-off');
        dom.remoteVideoOff   = document.getElementById('remote-video-off');
        dom.timerDisplay     = document.getElementById('timer-display');
        dom.btnToggleMic     = document.getElementById('btn-toggle-mic');
        dom.btnToggleCamera  = document.getElementById('btn-toggle-camera');
        dom.btnEndCall       = document.getElementById('btn-end-call');
        dom.extensionAlert   = document.getElementById('extension-alert');
        dom.btnExtend        = document.getElementById('btn-extend');
        dom.btnExtendBar     = document.getElementById('btn-extend-bar');
        dom.btnDismissExtend = document.getElementById('btn-dismiss-extend');
        dom.reconnectBanner  = document.getElementById('reconnecting-banner');
        dom.partnerNameFallback = document.getElementById('partner-name-fallback');

        // Ended screen
        dom.endedPartnerAvatar = document.getElementById('ended-partner-avatar');
        dom.endedPartnerName   = document.getElementById('ended-partner-name');
        dom.callDuration       = document.getElementById('call-duration');
        dom.ratingSection      = document.getElementById('rating-section');
        dom.ratingThanks       = document.getElementById('rating-thanks');
        dom.btnNextPartner     = document.getElementById('btn-next-partner');

        // Modals
        dom.modalError       = document.getElementById('modal-error');
        dom.errorTitle       = document.getElementById('error-title');
        dom.errorMessage     = document.getElementById('error-message');
        dom.btnErrorRetry    = document.getElementById('btn-error-retry');
        dom.btnErrorHome     = document.getElementById('btn-error-home');
        dom.modalConfirmEnd  = document.getElementById('modal-confirm-end');
        dom.confirmRemaining = document.getElementById('confirm-remaining');
        dom.btnConfirmEnd    = document.getElementById('btn-confirm-end');
        dom.btnCancelEnd     = document.getElementById('btn-cancel-end');

        // Screen announcer
        dom.announcer = document.getElementById('screen-announcer');
    }

    /* ---------- 画面状態管理 ---------- */

    var SCREENS = ['screen-waiting', 'screen-matched', 'screen-call', 'screen-ended'];

    function showScreen(screenId) {
        for (var i = 0; i < SCREENS.length; i++) {
            var el = document.getElementById(SCREENS[i]);
            if (el) {
                if (SCREENS[i] === screenId) {
                    el.classList.remove('hidden');
                } else {
                    el.classList.add('hidden');
                }
            }
        }
        currentScreen = screenId;

        // Accessibility: announce screen change
        if (dom.announcer) {
            var labels = {
                'screen-waiting': 'パートナーを検索中です',
                'screen-matched': 'マッチングが成立しました',
                'screen-call':    'ビデオ通話中です',
                'screen-ended':   '通話が終了しました'
            };
            dom.announcer.textContent = labels[screenId] || '';
        }
    }

    /* ---------- ユーティリティ ---------- */

    function formatTime(sec) {
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    function formatDuration(sec) {
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        return m + '分' + (s < 10 ? '0' : '') + s + '秒';
    }

    function defaultAvatar() {
        return 'data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
            '<rect width="100" height="100" fill="%23475569"/>' +
            '<circle cx="50" cy="38" r="18" fill="%2394a3b8"/>' +
            '<ellipse cx="50" cy="80" rx="30" ry="22" fill="%2394a3b8"/>' +
            '</svg>'
        );
    }

    /* ---------- エラーモーダル ---------- */

    function showErrorModal(title, message, onRetry) {
        if (!dom.modalError) return;
        dom.errorTitle.textContent = title || '接続エラー';
        dom.errorMessage.textContent = message || '接続に問題が発生しました。';
        dom.modalError.classList.remove('hidden');

        // Retry button handler
        var retryHandler = function () {
            dom.modalError.classList.add('hidden');
            dom.btnErrorRetry.removeEventListener('click', retryHandler);
            if (typeof onRetry === 'function') {
                onRetry();
            }
        };
        dom.btnErrorRetry.addEventListener('click', retryHandler);

        // Home button
        dom.btnErrorHome.onclick = function () {
            dom.modalError.classList.add('hidden');
            window.location.href = 'index.html';
        };
    }

    function hideErrorModal() {
        if (dom.modalError) {
            dom.modalError.classList.add('hidden');
        }
    }

    /* =============================================
       1. 初期化 (DOMContentLoaded)
       ============================================= */

    function init() {
        cacheDom();

        firebase.auth().onAuthStateChanged(function (user) {
            if (!user) {
                window.location.href = 'index.html';
                return;
            }

            // 自分のアバター設定
            if (dom.myAvatar) {
                dom.myAvatar.src = user.photoURL || defaultAvatar();
            }

            // 画面表示
            showScreen('screen-waiting');

            // マッチングコールバック登録
            VMeet.Matching.onMatched(onMatchFound);

            // キューに参加
            VMeet.Matching.joinQueue();

            // イベントリスナー登録
            bindEvents();
        });
    }

    /* =============================================
       2. マッチング成立
       ============================================= */

    function onMatchFound(matchData) {
        currentRoomId = matchData.roomId;
        currentRole = matchData.role;
        partnerInfo = matchData.partner;

        // role を room ドキュメントから正式に判定
        resolveRole(matchData.roomId).then(function () {
            showScreen('screen-matched');

            // 相手情報表示
            if (dom.partnerName) {
                dom.partnerName.textContent = partnerInfo.displayName || '匿名';
            }
            if (dom.partnerAvatar) {
                dom.partnerAvatar.src = partnerInfo.photoURL || defaultAvatar();
            }

            // 5秒カウントダウン開始
            startMatchCountdown(5);
        });
    }

    /**
     * rooms/{roomId} から callerUid を取得し、自分の role を確定する
     */
    function resolveRole(roomId) {
        var user = firebase.auth().currentUser;
        if (!user) return Promise.resolve();

        return firebase.firestore().collection('rooms').doc(roomId).get()
            .then(function (doc) {
                if (doc.exists) {
                    var data = doc.data();
                    currentRole = (data.callerUid === user.uid) ? 'caller' : 'callee';
                }
            })
            .catch(function (err) {
                console.warn('[CallController] role 取得失敗, デフォルト callee:', err);
                currentRole = 'callee';
            });
    }

    function startMatchCountdown(seconds) {
        var remaining = seconds;
        if (dom.matchCountdown) {
            dom.matchCountdown.textContent = remaining;
        }

        countdownTimer = setInterval(function () {
            remaining--;
            if (dom.matchCountdown) {
                dom.matchCountdown.textContent = remaining;
            }
            if (remaining <= 0) {
                clearInterval(countdownTimer);
                countdownTimer = null;
                startCall();
            }
        }, 1000);
    }

    /* =============================================
       3. 通話開始
       ============================================= */

    function startCall() {
        // カウントダウン停止（ボタン押下で早期開始した場合）
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }

        showScreen('screen-call');

        // カメラ・マイク取得
        VMeet.Media.acquireStream()
            .then(function (stream) {
                // ローカル映像設定
                if (dom.localVideo) {
                    dom.localVideo.srcObject = stream;
                }

                // PeerConnection 作成
                setupPeerConnection(stream);

                // シグナリング開始
                return startSignaling();
            })
            .then(function () {
                // room の status を active に更新
                return firebase.firestore().collection('rooms').doc(currentRoomId).update({
                    status: 'active',
                    startedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            })
            .then(function () {
                // 通話開始時刻を記録
                callStartTime = new Date();
                totalCallDurationSec = 0;
                extensionAlertShown = false;

                // 10分タイマー開始
                VMeet.Matching.startTimer(600, onTimerTick, onTimerEnd);
            })
            .catch(function (err) {
                console.error('[CallController] 通話開始エラー:', err);
                showErrorModal(
                    'カメラ・マイクエラー',
                    err.message || 'カメラまたはマイクの取得に失敗しました。',
                    function () {
                        startCall();
                    }
                );
            });
    }

    function setupPeerConnection(stream) {
        pc = new RTCPeerConnection({
            iceServers: VMeet.Signaling.ICE_SERVERS
        });

        // ローカルトラック追加
        var tracks = stream.getTracks();
        for (var i = 0; i < tracks.length; i++) {
            pc.addTrack(tracks[i], stream);
        }

        // リモートストリーム受信
        pc.ontrack = function (event) {
            if (dom.remoteVideo && event.streams && event.streams[0]) {
                dom.remoteVideo.srcObject = event.streams[0];
            }
        };

        // ICE candidate 送信
        pc.onicecandidate = function (event) {
            if (event.candidate) {
                VMeet.Signaling.sendCandidate(currentRoomId, currentRole, event.candidate);
            }
        };

        // 接続状態監視
        pc.onconnectionstatechange = function () {
            var state = pc.connectionState;
            console.log('[CallController] connectionState:', state);

            if (state === 'connected') {
                hideReconnectBanner();
            } else if (state === 'disconnected') {
                showReconnectBanner();
            } else if (state === 'failed') {
                hideReconnectBanner();
                endCallFlow('partner_disconnected');
            }
        };

        // ICE接続状態監視
        pc.oniceconnectionstatechange = function () {
            var state = pc.iceConnectionState;
            console.log('[CallController] iceConnectionState:', state);

            if (state === 'disconnected') {
                showReconnectBanner();
            } else if (state === 'connected' || state === 'completed') {
                hideReconnectBanner();
            } else if (state === 'failed') {
                hideReconnectBanner();
                endCallFlow('partner_disconnected');
            }
        };
    }

    function startSignaling() {
        if (currentRole === 'caller') {
            return VMeet.Signaling.createOffer(currentRoomId, pc);
        } else {
            return VMeet.Signaling.joinRoom(currentRoomId, pc);
        }
    }

    /* ---------- 再接続バナー ---------- */

    function showReconnectBanner() {
        if (dom.reconnectBanner) {
            dom.reconnectBanner.classList.remove('hidden');
        }
    }

    function hideReconnectBanner() {
        if (dom.reconnectBanner) {
            dom.reconnectBanner.classList.add('hidden');
        }
    }

    /* =============================================
       4. 通話中イベント
       ============================================= */

    function onTimerTick(remaining) {
        totalCallDurationSec++;

        // タイマー表示更新
        if (dom.timerDisplay) {
            dom.timerDisplay.textContent = formatTime(remaining);
        }

        // 残り60秒で延長アラート表示
        if (remaining <= 60 && !extensionAlertShown) {
            extensionAlertShown = true;
            if (dom.extensionAlert) {
                dom.extensionAlert.classList.remove('hidden');
            }
            if (dom.btnExtendBar) {
                dom.btnExtendBar.classList.remove('hidden');
            }
        }
    }

    function onTimerEnd() {
        endCallFlow('timer_ended');
    }

    function handleToggleMic() {
        isMicOn = VMeet.Media.toggleAudio();
        updateMicButton();
    }

    function updateMicButton() {
        if (!dom.btnToggleMic) return;
        var icon = dom.btnToggleMic.querySelector('[data-lucide]');
        if (isMicOn) {
            dom.btnToggleMic.setAttribute('aria-pressed', 'false');
            dom.btnToggleMic.setAttribute('aria-label', 'マイクをOFFにする');
            dom.btnToggleMic.classList.remove('bg-red-500/80');
            dom.btnToggleMic.classList.add('bg-white/20');
            if (icon) {
                icon.setAttribute('data-lucide', 'mic');
            }
        } else {
            dom.btnToggleMic.setAttribute('aria-pressed', 'true');
            dom.btnToggleMic.setAttribute('aria-label', 'マイクをONにする');
            dom.btnToggleMic.classList.remove('bg-white/20');
            dom.btnToggleMic.classList.add('bg-red-500/80');
            if (icon) {
                icon.setAttribute('data-lucide', 'mic-off');
            }
        }
        // Re-render lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function handleToggleCamera() {
        isCameraOn = VMeet.Media.toggleVideo();
        updateCameraButton();
        // ローカルカメラOFFフォールバック表示
        if (dom.localVideoOff) {
            if (isCameraOn) {
                dom.localVideoOff.classList.add('hidden');
            } else {
                dom.localVideoOff.classList.remove('hidden');
            }
        }
    }

    function updateCameraButton() {
        if (!dom.btnToggleCamera) return;
        var icon = dom.btnToggleCamera.querySelector('[data-lucide]');
        if (isCameraOn) {
            dom.btnToggleCamera.setAttribute('aria-pressed', 'false');
            dom.btnToggleCamera.setAttribute('aria-label', 'カメラをOFFにする');
            dom.btnToggleCamera.classList.remove('bg-red-500/80');
            dom.btnToggleCamera.classList.add('bg-white/20');
            if (icon) {
                icon.setAttribute('data-lucide', 'video');
            }
        } else {
            dom.btnToggleCamera.setAttribute('aria-pressed', 'true');
            dom.btnToggleCamera.setAttribute('aria-label', 'カメラをONにする');
            dom.btnToggleCamera.classList.remove('bg-white/20');
            dom.btnToggleCamera.classList.add('bg-red-500/80');
            if (icon) {
                icon.setAttribute('data-lucide', 'video-off');
            }
        }
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function handleExtend() {
        if (!currentRoomId) return;

        VMeet.Matching.requestExtension(currentRoomId).then(function (success) {
            if (success) {
                // 延長アラート非表示
                if (dom.extensionAlert) {
                    dom.extensionAlert.classList.add('hidden');
                }
                if (dom.btnExtendBar) {
                    dom.btnExtendBar.classList.add('hidden');
                }

                // タイマーをリセット（+5分 = 300秒で再開）
                extensionAlertShown = false;
                VMeet.Matching.startTimer(300, onTimerTick, onTimerEnd);
            }
        });
    }

    /* =============================================
       5. 通話終了
       ============================================= */

    function showConfirmEndModal() {
        if (!dom.modalConfirmEnd) {
            endCallFlow('user_ended');
            return;
        }
        if (dom.confirmRemaining && dom.timerDisplay) {
            dom.confirmRemaining.textContent = dom.timerDisplay.textContent;
        }
        dom.modalConfirmEnd.classList.remove('hidden');
    }

    function hideConfirmEndModal() {
        if (dom.modalConfirmEnd) {
            dom.modalConfirmEnd.classList.add('hidden');
        }
    }

    function endCallFlow(reason) {
        // 確認モーダル非表示
        hideConfirmEndModal();

        // 通話時間を計算
        var durationSec = totalCallDurationSec;
        if (callStartTime) {
            durationSec = Math.floor((new Date() - callStartTime) / 1000);
        }

        // タイマー停止
        VMeet.Matching.stopTimer();

        // マッチング終了
        if (currentRoomId) {
            VMeet.Matching.endCall(currentRoomId);
        }

        // シグナリングクリーンアップ
        VMeet.Signaling.cleanup();

        // メディア停止
        VMeet.Media.stopAllTracks();

        // PeerConnection クローズ
        if (pc) {
            pc.close();
            pc = null;
        }

        // video要素のsrcObjectをクリア
        if (dom.localVideo)  dom.localVideo.srcObject = null;
        if (dom.remoteVideo) dom.remoteVideo.srcObject = null;

        // 終了画面表示
        showScreen('screen-ended');

        // 終了画面に情報反映
        if (dom.endedPartnerName) {
            dom.endedPartnerName.textContent = (partnerInfo && partnerInfo.displayName) ? partnerInfo.displayName : '匿名';
        }
        if (dom.endedPartnerAvatar) {
            dom.endedPartnerAvatar.src = (partnerInfo && partnerInfo.photoURL) ? partnerInfo.photoURL : defaultAvatar();
        }
        if (dom.callDuration) {
            dom.callDuration.textContent = formatDuration(durationSec);
        }

        // パートナー名フォールバックリセット
        if (dom.partnerNameFallback && partnerInfo) {
            dom.partnerNameFallback.textContent = partnerInfo.displayName || '相手';
        }

        // 評価UIリセット
        if (dom.ratingSection) dom.ratingSection.classList.remove('hidden');
        if (dom.ratingThanks)  dom.ratingThanks.classList.add('hidden');

        // 再接続バナー非表示
        hideReconnectBanner();

        // 延長アラート非表示
        if (dom.extensionAlert) dom.extensionAlert.classList.add('hidden');
        if (dom.btnExtendBar)   dom.btnExtendBar.classList.add('hidden');
    }

    /* =============================================
       6. 終了画面イベント
       ============================================= */

    function handleRating(ratingValue) {
        var user = firebase.auth().currentUser;
        if (!user || !currentRoomId) return;

        // Firestore にrating保存
        firebase.firestore().collection('ratings').add({
            roomId: currentRoomId,
            fromUid: user.uid,
            rating: ratingValue,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function (err) {
            console.warn('[CallController] rating保存失敗:', err);
        });

        // UI更新
        if (dom.ratingSection) dom.ratingSection.classList.add('hidden');
        if (dom.ratingThanks)  dom.ratingThanks.classList.remove('hidden');
    }

    function handleNextPartner() {
        // 状態リセット
        resetState();

        // 待機画面に戻る
        showScreen('screen-waiting');

        // マッチングコールバック再登録
        VMeet.Matching.onMatched(onMatchFound);

        // キューに再参加
        VMeet.Matching.joinQueue();
    }

    function resetState() {
        currentRoomId = null;
        currentRole = null;
        partnerInfo = null;
        callStartTime = null;
        totalCallDurationSec = 0;
        extensionAlertShown = false;
        isMicOn = true;
        isCameraOn = true;

        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
    }

    /* =============================================
       7. キャンセル処理
       ============================================= */

    function handleCancelQueue() {
        VMeet.Matching.leaveQueue().then(function () {
            window.location.href = 'index.html';
        }).catch(function () {
            window.location.href = 'index.html';
        });
    }

    /* =============================================
       イベントバインド
       ============================================= */

    function bindEvents() {
        // Waiting screen
        if (dom.btnCancelQueue) {
            dom.btnCancelQueue.addEventListener('click', handleCancelQueue);
        }

        // Matched screen
        if (dom.btnStartCall) {
            dom.btnStartCall.addEventListener('click', function () {
                if (countdownTimer) {
                    clearInterval(countdownTimer);
                    countdownTimer = null;
                }
                startCall();
            });
        }

        // Call screen - toggle controls
        if (dom.btnToggleMic) {
            dom.btnToggleMic.addEventListener('click', handleToggleMic);
        }
        if (dom.btnToggleCamera) {
            dom.btnToggleCamera.addEventListener('click', handleToggleCamera);
        }

        // Call screen - end call (show confirm modal)
        if (dom.btnEndCall) {
            dom.btnEndCall.addEventListener('click', function () {
                showConfirmEndModal();
            });
        }

        // Confirm end modal
        if (dom.btnConfirmEnd) {
            dom.btnConfirmEnd.addEventListener('click', function () {
                endCallFlow('user_ended');
            });
        }
        if (dom.btnCancelEnd) {
            dom.btnCancelEnd.addEventListener('click', hideConfirmEndModal);
        }

        // Extension buttons (both in alert and control bar)
        if (dom.btnExtend) {
            dom.btnExtend.addEventListener('click', handleExtend);
        }
        if (dom.btnExtendBar) {
            dom.btnExtendBar.addEventListener('click', handleExtend);
        }
        if (dom.btnDismissExtend) {
            dom.btnDismissExtend.addEventListener('click', function () {
                if (dom.extensionAlert) {
                    dom.extensionAlert.classList.add('hidden');
                }
            });
        }

        // Ended screen - rating buttons
        var ratingBtns = document.querySelectorAll('[data-rating]');
        for (var i = 0; i < ratingBtns.length; i++) {
            ratingBtns[i].addEventListener('click', function () {
                var rating = this.getAttribute('data-rating');
                handleRating(rating);
            });
        }

        // Ended screen - next partner
        if (dom.btnNextPartner) {
            dom.btnNextPartner.addEventListener('click', handleNextPartner);
        }

        // Error modal - home button fallback
        if (dom.btnErrorHome) {
            dom.btnErrorHome.addEventListener('click', function () {
                window.location.href = 'index.html';
            });
        }

        // Page unload cleanup
        window.addEventListener('beforeunload', function () {
            if (currentScreen === 'screen-call' && currentRoomId) {
                VMeet.Matching.endCall(currentRoomId);
                VMeet.Signaling.cleanup();
                VMeet.Media.stopAllTracks();
                if (pc) {
                    pc.close();
                    pc = null;
                }
            }
            VMeet.Matching.cleanup();
        });
    }

    /* =============================================
       エントリーポイント
       ============================================= */

    document.addEventListener('DOMContentLoaded', init);

})();
