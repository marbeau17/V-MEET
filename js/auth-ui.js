/* =============================================
   Auth UI  –  V-MEET
   認証状態によるUI切替
   ============================================= */

(function () {
    'use strict';

    /* ---------- 認証状態の監視 ---------- */
    firebase.auth().onAuthStateChanged(function (user) {
        var authButton = document.getElementById('btn-open-auth');
        var userMenu = document.getElementById('user-menu');

        if (user) {
            /* ログイン済み */
            if (authButton) {
                authButton.classList.add('hidden');
                authButton.classList.add('auth-ready');
            }
            if (userMenu) {
                userMenu.classList.remove('hidden');
                userMenu.classList.add('auth-ready');

                var name = user.displayName || user.email.split('@')[0];
                var nameEl = document.getElementById('user-display-name');
                var avatarEl = document.getElementById('user-avatar');
                var emailEl = document.getElementById('user-email-display');

                if (nameEl) nameEl.textContent = name;
                if (emailEl) emailEl.textContent = user.email;
                if (avatarEl) {
                    if (user.photoURL) {
                        avatarEl.textContent = '';
                        var img = document.createElement('img');
                        img.src = user.photoURL;
                        img.className = 'w-8 h-8 rounded-full object-cover';
                        img.alt = '';
                        avatarEl.appendChild(img);
                    } else {
                        avatarEl.textContent = name.charAt(0).toUpperCase();
                    }
                }
            }

            var callLink = document.getElementById('nav-call-link');
            if (callLink) {
                callLink.classList.remove('hidden');
                callLink.classList.add('auth-ready');
            }
            var mobileCallLink = document.getElementById('mobile-nav-call-link');
            if (mobileCallLink) {
                mobileCallLink.classList.remove('hidden');
            }

            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        } else {
            /* 未ログイン */
            if (authButton) {
                authButton.classList.remove('hidden');
                authButton.classList.add('auth-ready');
            }
            if (userMenu) {
                userMenu.classList.add('hidden');
                userMenu.classList.add('auth-ready');
            }
            var callLink = document.getElementById('nav-call-link');
            if (callLink) {
                callLink.classList.add('hidden');
            }
            var mobileCallLink = document.getElementById('mobile-nav-call-link');
            if (mobileCallLink) {
                mobileCallLink.classList.add('hidden');
            }
        }
    });

    /* ---------- ボタンイベント ---------- */
    document.addEventListener('click', function (e) {
        /* 新規登録ボタン */
        var registerBtn = e.target.closest('[data-auth-action="register"]');
        if (registerBtn) {
            e.preventDefault();
            window.openAuthModal('register');
            return;
        }

        /* ログインボタン */
        var loginBtn = e.target.closest('[data-auth-action="login"]');
        if (loginBtn) {
            e.preventDefault();
            window.openAuthModal('login');
            return;
        }
    });

    /* ログアウト */
    var btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', function (e) {
            e.preventDefault();
            firebase.auth().signOut();
        });
    }

    /* ユーザーメニュードロップダウン */
    var menuToggle = document.getElementById('user-menu-toggle');
    var dropdown = document.getElementById('user-dropdown');

    if (menuToggle && dropdown) {
        menuToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', function (e) {
            if (!menuToggle.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    }
})();
