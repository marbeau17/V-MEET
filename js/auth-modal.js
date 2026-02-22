/* =============================================
   Auth Modal  –  V-MEET
   モーダル開閉・タブ切替・認証処理
   ============================================= */

(function () {
    'use strict';

    /* ---------- エラーメッセージ日本語マッピング ---------- */
    var ERROR_MESSAGES = {
        'auth/email-already-in-use': 'このメールアドレスは既に登録されています。',
        'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
        'auth/weak-password': 'パスワードは8文字以上で設定してください。',
        'auth/user-not-found': 'このメールアドレスは登録されていません。',
        'auth/wrong-password': 'パスワードが正しくありません。',
        'auth/invalid-credential': 'メールアドレスまたはパスワードが正しくありません。',
        'auth/too-many-requests': 'ログイン試行回数が多すぎます。しばらくお待ちください。',
        'auth/popup-closed-by-user': 'ログインがキャンセルされました。',
        'auth/network-request-failed': 'ネットワークエラーが発生しました。'
    };

    /* ---------- DOM 参照 ---------- */
    var modal = document.getElementById('auth-modal');
    var tabLogin = document.getElementById('tab-login');
    var tabRegister = document.getElementById('tab-register');
    var panelLogin = document.getElementById('panel-login');
    var panelRegister = document.getElementById('panel-register');
    var panelReset = document.getElementById('panel-reset');
    var showReset = document.getElementById('show-reset');
    var backToLogin = document.getElementById('back-to-login');
    var formLogin = document.getElementById('form-login');
    var formRegister = document.getElementById('form-register');
    var formReset = document.getElementById('form-reset');
    var btnGoogle = document.getElementById('btn-google-login');

    /* ---------- ユーティリティ ---------- */
    var ACTIVE_TAB_CLASSES = ['bg-[#FF6B6B]', 'text-white'];
    var INACTIVE_TAB_CLASSES = ['text-slate-500', 'bg-transparent'];

    function setTabActive(tab) {
        var i;
        for (i = 0; i < INACTIVE_TAB_CLASSES.length; i++) {
            tab.classList.remove(INACTIVE_TAB_CLASSES[i]);
        }
        for (i = 0; i < ACTIVE_TAB_CLASSES.length; i++) {
            tab.classList.add(ACTIVE_TAB_CLASSES[i]);
        }
    }

    function setTabInactive(tab) {
        var i;
        for (i = 0; i < ACTIVE_TAB_CLASSES.length; i++) {
            tab.classList.remove(ACTIVE_TAB_CLASSES[i]);
        }
        for (i = 0; i < INACTIVE_TAB_CLASSES.length; i++) {
            tab.classList.add(INACTIVE_TAB_CLASSES[i]);
        }
    }

    function showPanel(panel) {
        if (panel) panel.classList.remove('hidden');
    }

    function hidePanel(panel) {
        if (panel) panel.classList.add('hidden');
    }

    function showError(containerId, message) {
        var el = document.getElementById(containerId);
        if (el) el.textContent = message;
    }

    function clearErrors() {
        var errorEls = modal ? modal.querySelectorAll('[id$="-error"]') : [];
        for (var i = 0; i < errorEls.length; i++) {
            errorEls[i].textContent = '';
        }
    }

    function friendlyError(error) {
        var code = error && error.code ? error.code : '';
        return ERROR_MESSAGES[code] || error.message || '予期しないエラーが発生しました。';
    }

    /* ---------- モーダル開閉 ---------- */
    function openAuthModal(tab) {
        if (!modal) return;
        clearErrors();

        if (tab === 'register') {
            switchToRegister();
        } else {
            switchToLogin();
        }

        modal.classList.remove('hidden');
        requestAnimationFrame(function () {
            modal.classList.add('is-visible');
        });

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    function closeAuthModal() {
        if (!modal) return;
        modal.classList.remove('is-visible');

        var handler = function () {
            modal.classList.add('hidden');
            modal.removeEventListener('transitionend', handler);
        };
        modal.addEventListener('transitionend', handler);
    }

    /* グローバル公開 */
    window.openAuthModal = openAuthModal;

    /* ---------- タブ切替 ---------- */
    function switchToLogin() {
        if (tabLogin) setTabActive(tabLogin);
        if (tabRegister) setTabInactive(tabRegister);
        showPanel(panelLogin);
        hidePanel(panelRegister);
        hidePanel(panelReset);
    }

    function switchToRegister() {
        if (tabRegister) setTabActive(tabRegister);
        if (tabLogin) setTabInactive(tabLogin);
        showPanel(panelRegister);
        hidePanel(panelLogin);
        hidePanel(panelReset);
    }

    function switchToReset() {
        if (tabLogin) setTabInactive(tabLogin);
        if (tabRegister) setTabInactive(tabRegister);
        hidePanel(panelLogin);
        hidePanel(panelRegister);
        showPanel(panelReset);
    }

    if (tabLogin) {
        tabLogin.addEventListener('click', function () {
            clearErrors();
            switchToLogin();
        });
    }

    if (tabRegister) {
        tabRegister.addEventListener('click', function () {
            clearErrors();
            switchToRegister();
        });
    }

    if (showReset) {
        showReset.addEventListener('click', function (e) {
            e.preventDefault();
            clearErrors();
            switchToReset();
        });
    }

    if (backToLogin) {
        backToLogin.addEventListener('click', function (e) {
            e.preventDefault();
            clearErrors();
            switchToLogin();
        });
    }

    /* ---------- Escape / オーバーレイ ---------- */
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeAuthModal();
    });

    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeAuthModal();
        });
    }

    /* ---------- 認証処理: ログイン ---------- */
    if (formLogin) {
        formLogin.addEventListener('submit', function (e) {
            e.preventDefault();
            clearErrors();
            var email = formLogin.querySelector('[name="email"]').value;
            var password = formLogin.querySelector('[name="password"]').value;

            firebase.auth().signInWithEmailAndPassword(email, password)
                .then(function () {
                    closeAuthModal();
                })
                .catch(function (error) {
                    showError('login-error', friendlyError(error));
                });
        });
    }

    /* ---------- 認証処理: 新規登録 ---------- */
    if (formRegister) {
        formRegister.addEventListener('submit', function (e) {
            e.preventDefault();
            clearErrors();
            var email = formRegister.querySelector('[name="email"]').value;
            var password = formRegister.querySelector('[name="password"]').value;
            var confirm = formRegister.querySelector('[name="password-confirm"]').value;

            if (password !== confirm) {
                showError('register-error', 'パスワードが一致しません。');
                return;
            }

            firebase.auth().createUserWithEmailAndPassword(email, password)
                .then(function () {
                    closeAuthModal();
                })
                .catch(function (error) {
                    showError('register-error', friendlyError(error));
                });
        });
    }

    /* ---------- 認証処理: Googleログイン ---------- */
    if (btnGoogle) {
        btnGoogle.addEventListener('click', function () {
            clearErrors();
            var provider = new firebase.auth.GoogleAuthProvider();

            firebase.auth().signInWithPopup(provider)
                .then(function () {
                    closeAuthModal();
                })
                .catch(function (error) {
                    showError('login-error', friendlyError(error));
                });
        });
    }

    /* ---------- 認証処理: パスワードリセット ---------- */
    if (formReset) {
        formReset.addEventListener('submit', function (e) {
            e.preventDefault();
            clearErrors();
            var email = formReset.querySelector('[name="email"]').value;

            firebase.auth().sendPasswordResetEmail(email)
                .then(function () {
                    showError('reset-error', 'パスワードリセットメールを送信しました。メールをご確認ください。');
                })
                .catch(function (error) {
                    showError('reset-error', friendlyError(error));
                });
        });
    }
})();
