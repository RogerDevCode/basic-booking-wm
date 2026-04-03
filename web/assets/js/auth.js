// ============================================================================
// AUTH — Login logic, session management, form handlers
// ============================================================================

(function() {
  'use strict';

  var SESSION_KEY = 'booking_titanium_session';

  // ─── Session Management ────────────────────────────────────────────────

  function saveSession(data) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  function getSession() {
    var raw = sessionStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function redirectByRole(role) {
    switch (role) {
      case 'admin':
        window.location.href = 'admin-dashboard.html';
        break;
      case 'provider':
        window.location.href = 'provider-dashboard.html';
        break;
      default:
        window.location.href = 'dashboard.html';
    }
  }

  function checkExistingSession() {
    var session = getSession();
    if (session !== null && session.user_id !== undefined) {
      redirectByRole(session.role);
      return true;
    }
    return false;
  }

  // ─── Form Toggle ───────────────────────────────────────────────────────

  function showSection(sectionId) {
    hideElement('login-section');
    hideElement('register-section');
    hideElement('complete-profile-section');
    showElement(sectionId);
    hideAlert('login-error');
    hideAlert('login-success');
    hideAlert('register-error');
    hideAlert('register-success');
    hideAlert('complete-profile-error');
    hideAlert('complete-profile-success');
  }

  // ─── Login Form ────────────────────────────────────────────────────────

  function handleLogin(e) {
    e.preventDefault();
    clearAllErrors('login-form');
    hideAlert('login-error');
    hideAlert('login-success');

    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    var valid = true;

    if (email === '') {
      setError('login-email', 'login-email-error', 'Email es requerido');
      valid = false;
    }

    if (password === '') {
      setError('login-password', 'login-password-error', 'Contraseña es requerida');
      valid = false;
    }

    if (!valid) return;

    setLoading('login-btn', 'login-btn-text', 'login-btn-loading', true);

    login(email, password).then(function(data) {
      var result = data.data;
      if (result === null) {
        showAlert('login-error', data.error_message || 'Error desconocido', 'error');
        return;
      }
      saveSession({
        user_id: result.user_id,
        email: result.email,
        full_name: result.full_name,
        role: result.role,
      });
      redirectByRole(result.role);
    }).catch(function(err) {
      showAlert('login-error', err.message, 'error');
    }).finally(function() {
      setLoading('login-btn', 'login-btn-text', 'login-btn-loading', false);
    });
  }

  // ─── Register Form ─────────────────────────────────────────────────────

  function handleRegister(e) {
    e.preventDefault();
    clearAllErrors('register-form');
    hideAlert('register-error');
    hideAlert('register-success');

    var fullName = document.getElementById('reg-name').value.trim();
    var rut = document.getElementById('reg-rut').value.trim();
    var email = document.getElementById('reg-email').value.trim();
    var address = document.getElementById('reg-address').value.trim();
    var phone = document.getElementById('reg-phone').value.trim();
    var password = document.getElementById('reg-password').value;
    var passwordConfirm = document.getElementById('reg-password-confirm').value;
    var valid = true;

    if (fullName.length < 3) {
      setError('reg-name', 'reg-name-error', 'Mínimo 3 caracteres');
      valid = false;
    }

    if (!validateRut(rut)) {
      setError('reg-rut', 'reg-rut-error', 'RUT inválido');
      valid = false;
    }

    if (email === '') {
      setError('reg-email', 'reg-email-error', 'Email es requerido');
      valid = false;
    }

    if (address === '') {
      setError('reg-address', 'reg-address-error', 'Dirección es requerida');
      valid = false;
    }

    if (phone === '') {
      setError('reg-phone', 'reg-phone-error', 'Teléfono es requerido');
      valid = false;
    }

    var pwError = validatePassword(password);
    if (pwError !== null) {
      setError('reg-password', 'reg-password-error', pwError);
      valid = false;
    }

    if (password !== passwordConfirm) {
      setError('reg-password-confirm', 'reg-password-confirm-error', 'Las contraseñas no coinciden');
      valid = false;
    }

    if (!valid) return;

    setLoading('register-btn', 'register-btn-text', 'register-btn-loading', true);

    register(fullName, rut, email, address, phone, password, passwordConfirm).then(function(data) {
      if (data.data === null) {
        showAlert('register-error', data.error_message || 'Error desconocido', 'error');
        return;
      }
      showAlert('register-success', '¡Cuenta creada exitosamente! Ya puedes iniciar sesión.', 'success');
      document.getElementById('register-form').reset();
      hideElement('reg-rut-success');
      setTimeout(function() {
        showSection('login-section');
      }, 2000);
    }).catch(function(err) {
      showAlert('register-error', err.message, 'error');
    }).finally(function() {
      setLoading('register-btn', 'register-btn-text', 'register-btn-loading', false);
    });
  }

  // ─── Complete Profile Form ─────────────────────────────────────────────

  function handleCompleteProfile(e) {
    e.preventDefault();
    clearAllErrors('complete-profile-form');
    hideAlert('complete-profile-error');
    hideAlert('complete-profile-success');

    var chatId = document.getElementById('cp-chat-id').value.trim();
    var rut = document.getElementById('cp-rut').value.trim();
    var email = document.getElementById('cp-email').value.trim();
    var address = document.getElementById('cp-address').value.trim();
    var phone = document.getElementById('cp-phone').value.trim();
    var password = document.getElementById('cp-password').value;
    var passwordConfirm = document.getElementById('cp-password-confirm').value;
    var valid = true;

    if (chatId === '') {
      setError('cp-chat-id', 'cp-chat-id-error', 'Telegram Chat ID es requerido');
      valid = false;
    }

    if (!validateRut(rut)) {
      setError('cp-rut', 'cp-rut-error', 'RUT inválido');
      valid = false;
    }

    if (email === '') {
      setError('cp-email', 'cp-email-error', 'Email es requerido');
      valid = false;
    }

    if (address === '') {
      setError('cp-address', 'cp-address-error', 'Dirección es requerida');
      valid = false;
    }

    if (phone === '') {
      setError('cp-phone', 'cp-phone-error', 'Teléfono es requerido');
      valid = false;
    }

    var pwError = validatePassword(password);
    if (pwError !== null) {
      setError('cp-password', 'cp-password-error', pwError);
      valid = false;
    }

    if (password !== passwordConfirm) {
      setError('cp-password-confirm', 'cp-password-confirm-error', 'Las contraseñas no coinciden');
      valid = false;
    }

    if (!valid) return;

    setLoading('complete-profile-btn', 'complete-profile-btn-text', 'complete-profile-btn-loading', true);

    completeProfile(chatId, rut, email, address, phone, password, passwordConfirm).then(function(data) {
      if (data.data === null) {
        showAlert('complete-profile-error', data.error_message || 'Error desconocido', 'error');
        return;
      }
      showAlert('complete-profile-success', '¡Perfil completado! Iniciando sesión...', 'success');
      setTimeout(function() {
        redirectByRole(data.data.role);
      }, 1500);
    }).catch(function(err) {
      showAlert('complete-profile-error', err.message, 'error');
    }).finally(function() {
      setLoading('complete-profile-btn', 'complete-profile-btn-text', 'complete-profile-btn-loading', false);
    });
  }

  // ─── RUT Auto-Format ───────────────────────────────────────────────────

  function setupRutFormatting(inputId, successId) {
    var input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('blur', function() {
      var val = input.value.trim();
      if (val.length > 1) {
        input.value = formatRut(val);
      }
      if (validateRut(val)) {
        if (successId) showElement(successId);
        input.classList.add('success');
        input.classList.remove('error');
        var errorEl = document.getElementById(inputId + '-error');
        if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
      } else {
        if (successId) hideElement(successId);
        input.classList.remove('success');
      }
    });

    input.addEventListener('input', function() {
      input.classList.remove('success');
      if (successId) hideElement(successId);
    });
  }

  // ─── Init ──────────────────────────────────────────────────────────────

  function init() {
    if (checkExistingSession()) return;

    var params = new URLSearchParams(window.location.search);
    var chatId = params.get('chat_id');

    if (chatId !== null && chatId !== '') {
      showSection('complete-profile-section');
      var cpInput = document.getElementById('cp-chat-id');
      if (cpInput) cpInput.value = chatId;
      var subtitle = document.getElementById('complete-profile-subtitle');
      if (subtitle) subtitle.textContent = 'Completa tu perfil para acceder desde la web';
    } else {
      showSection('login-section');
    }

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('complete-profile-form').addEventListener('submit', handleCompleteProfile);

    var showReg = document.getElementById('show-register');
    if (showReg) showReg.addEventListener('click', function(e) { e.preventDefault(); showSection('register-section'); });

    var showLogin = document.getElementById('show-login');
    if (showLogin) showLogin.addEventListener('click', function(e) { e.preventDefault(); showSection('login-section'); });

    var showRegFromCp = document.getElementById('show-register-from-cp');
    if (showRegFromCp) showRegFromCp.addEventListener('click', function(e) { e.preventDefault(); showSection('register-section'); });

    setupRutFormatting('reg-rut', 'reg-rut-success');
    setupRutFormatting('cp-rut', 'cp-rut-success');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AuthSession = {
    get: getSession,
    clear: clearSession,
    redirectByRole: redirectByRole,
  };
})();
