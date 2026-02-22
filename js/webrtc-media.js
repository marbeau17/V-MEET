/* =============================================
   WebRTC Media  -  V-MEET
   カメラ・マイクのデバイス管理
   ============================================= */

(function () {
    'use strict';

    window.VMeet = window.VMeet || {};

    /* ---------- 内部状態 ---------- */
    var localStream = null;

    /* ---------- デフォルトメディア制約 ---------- */
    var DEFAULT_CONSTRAINTS = {
        video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
        },
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    };

    /* ---------- エラーメッセージ日本語マッピング ---------- */
    var MEDIA_ERROR_MESSAGES = {
        'NotAllowedError': 'カメラとマイクの使用を許可してください。ブラウザの設定からアクセスを許可できます。',
        'NotFoundError': 'カメラまたはマイクが検出されませんでした。デバイスが接続されているか確認してください。',
        'NotReadableError': 'カメラまたはマイクにアクセスできません。他のアプリが使用中でないか確認してください。',
        'OverconstrainedError': 'カメラの初期化に失敗しました。',
        'default': 'カメラの初期化中にエラーが発生しました。ページを再読み込みしてお試しください。'
    };

    /* ---------- ユーティリティ ---------- */
    function getMediaErrorMessage(error) {
        var name = error && error.name ? error.name : '';
        return MEDIA_ERROR_MESSAGES[name] || MEDIA_ERROR_MESSAGES['default'];
    }

    /* ---------- 公開 API ---------- */

    /**
     * カメラ・マイクのストリームを取得する
     * @param {MediaStreamConstraints} [constraints] - メディア制約（省略時はデフォルト）
     * @returns {Promise<MediaStream>}
     */
    function acquireStream(constraints) {
        var mediaConstraints = constraints || DEFAULT_CONSTRAINTS;

        return navigator.mediaDevices.getUserMedia(mediaConstraints)
            .then(function (stream) {
                localStream = stream;
                return stream;
            })
            .catch(function (error) {
                console.error('[VMeet.Media] getUserMedia error:', error.name, error.message);
                var friendlyMessage = getMediaErrorMessage(error);
                var wrappedError = new Error(friendlyMessage);
                wrappedError.originalError = error;
                throw wrappedError;
            });
    }

    /**
     * ビデオトラックの ON/OFF を切り替える
     * @param {boolean} [enabled] - 明示的に指定する場合。省略時はトグル
     * @returns {boolean} 切替後の状態
     */
    function toggleVideo(enabled) {
        if (!localStream) return false;

        var videoTracks = localStream.getVideoTracks();
        if (videoTracks.length === 0) return false;

        var newState = (typeof enabled === 'boolean') ? enabled : !videoTracks[0].enabled;
        for (var i = 0; i < videoTracks.length; i++) {
            videoTracks[i].enabled = newState;
        }
        return newState;
    }

    /**
     * オーディオトラックの ON/OFF を切り替える
     * @param {boolean} [enabled] - 明示的に指定する場合。省略時はトグル
     * @returns {boolean} 切替後の状態
     */
    function toggleAudio(enabled) {
        if (!localStream) return false;

        var audioTracks = localStream.getAudioTracks();
        if (audioTracks.length === 0) return false;

        var newState = (typeof enabled === 'boolean') ? enabled : !audioTracks[0].enabled;
        for (var i = 0; i < audioTracks.length; i++) {
            audioTracks[i].enabled = newState;
        }
        return newState;
    }

    /**
     * 全トラックを停止し、ストリームを解放する
     */
    function stopAllTracks() {
        if (!localStream) return;

        var tracks = localStream.getTracks();
        for (var i = 0; i < tracks.length; i++) {
            tracks[i].stop();
        }
        localStream = null;
    }

    /**
     * 現在のローカルストリームを取得する
     * @returns {MediaStream|null}
     */
    function getLocalStream() {
        return localStream;
    }

    /* ---------- 名前空間に公開 ---------- */
    VMeet.Media = {
        acquireStream: acquireStream,
        toggleVideo: toggleVideo,
        toggleAudio: toggleAudio,
        stopAllTracks: stopAllTracks,
        getLocalStream: getLocalStream
    };

})();
