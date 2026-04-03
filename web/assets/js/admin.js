// ============================================================================
// ADMIN — Admin dashboard logic (user management, KPIs, role change)
// ============================================================================

(function() {
  'use strict';

  function init() {
    var session = AuthSession.get();
    if (session === null) {
      window.location.href = 'index.html';
      return;
    }

    if (session.role !== 'admin') {
      AuthSession.redirectByRole(session.role);
      return;
    }

    loadUserInfo(session);
    loadDashboard();
    setupLogout();
    setupUserForm();
  }

  function loadUserInfo(session) {
    var nameEl = document.getElementById('user-name');
    var roleEl = document.getElementById('user-role');
    var avatarEl = document.getElementById('user-avatar');

    if (nameEl) nameEl.textContent = session.full_name;
    if (roleEl) roleEl.textContent = getRoleLabel(session.role);
    if (avatarEl) avatarEl.textContent = getInitials(session.full_name);
  }

  function loadDashboard() {
    loadKPIs();
    loadUsers();
  }

  function loadKPIs() {
    apiCall('web_admin_dashboard', { admin_user_id: getSessionUserId() }).then(function(data) {
      if (data.data === null) return;
      var kpis = data.data;
      setText('kpi-users', kpis.total_users);
      setText('kpi-bookings', kpis.total_bookings);
      setText('kpi-revenue', formatCurrency(kpis.total_revenue_cents));
      setText('kpi-noshow', kpis.no_show_rate + '%');
    }).catch(function(err) {
      console.error('Failed to load KPIs:', err.message);
    });
  }

  function loadUsers() {
    apiCall('web_admin_users', { admin_user_id: getSessionUserId(), action: 'list' }).then(function(data) {
      if (data.data === null) return;
      renderUsers(data.data.users || []);
    }).catch(function(err) {
      console.error('Failed to load users:', err.message);
    });
  }

  function renderUsers(users) {
    var container = document.getElementById('users-table-body');
    if (!container) return;

    container.innerHTML = '';

    if (users.length === 0) {
      container.innerHTML = '<tr><td colspan="7" class="text-center text-muted p-6">No hay usuarios registrados</td></tr>';
      return;
    }

    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (u === undefined) continue;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><div class="flex items-center gap-3">' +
          '<div class="avatar">' + getInitials(u.full_name) + '</div>' +
          '<div><div style="font-weight:500;">' + escapeHtml(u.full_name) + '</div>' +
          '<div class="text-small text-muted">' + escapeHtml(u.email || '—') + '</div></div>' +
        '</div></td>' +
        '<td class="mono">' + escapeHtml(u.rut || '—') + '</td>' +
        '<td>' + getStatusBadge(u.role === 'admin' ? 'confirmed' : u.role === 'provider' ? 'notified' : 'pending') + ' ' + getRoleLabel(u.role) + '</td>' +
        '<td>' + (u.is_active ? '<span class="badge badge-completed">Activo</span>' : '<span class="badge badge-cancelled">Inactivo</span>') + '</td>' +
        '<td class="mono">' + (u.telegram_chat_id ? 'Sí' : 'No') + '</td>' +
        '<td>' + (u.last_login ? formatDateTime(u.last_login) : 'Nunca') + '</td>' +
        '<td>' +
          '<button class="btn btn-ghost btn-sm" data-role-change="' + u.user_id + '" data-current-role="' + u.role + '">Cambiar Rol</button>' +
        '</td>';
      container.appendChild(tr);
    }

    setupRoleChangeButtons();
  }

  function setupRoleChangeButtons() {
    var buttons = document.querySelectorAll('[data-role-change]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function(e) {
        var userId = e.currentTarget.getAttribute('data-role-change');
        var currentRole = e.currentTarget.getAttribute('data-current-role');
        if (userId === null || currentRole === null) return;
        showRoleModal(userId, currentRole);
      });
    }
  }

  function showRoleModal(userId, currentRole) {
    var modal = document.getElementById('role-modal');
    var select = document.getElementById('role-select');
    var targetId = document.getElementById('role-target-id');

    if (modal) modal.classList.add('active');
    if (select) select.value = currentRole;
    if (targetId) targetId.value = userId;
  }

  function hideRoleModal() {
    var modal = document.getElementById('role-modal');
    if (modal) modal.classList.remove('active');
  }

  function setupUserForm() {
    var closeBtn = document.getElementById('role-modal-close');
    var cancelBtn = document.getElementById('role-modal-cancel');
    var confirmBtn = document.getElementById('role-modal-confirm');

    if (closeBtn) closeBtn.addEventListener('click', hideRoleModal);
    if (cancelBtn) cancelBtn.addEventListener('click', hideRoleModal);

    if (confirmBtn) confirmBtn.addEventListener('click', function() {
      var targetId = document.getElementById('role-target-id');
      var select = document.getElementById('role-select');
      if (targetId === null || select === null) return;

      var userId = targetId.value;
      var newRole = select.value;

      if (userId === '' || newRole === '') return;

      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Guardando...';

      apiCall('web_auth_change_role', {
        admin_user_id: getSessionUserId(),
        target_user_id: userId,
        new_role: newRole,
      }).then(function(data) {
        if (data.data === null) {
          showAlert('role-modal-error', data.error_message || 'Error al cambiar rol', 'error');
          return;
        }
        hideRoleModal();
        loadUsers();
      }).catch(function(err) {
        showAlert('role-modal-error', err.message, 'error');
      }).finally(function() {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Guardar';
      });
    });
  }

  function setupLogout() {
    var btn = document.getElementById('logout-btn');
    if (btn) {
      btn.addEventListener('click', function() {
        AuthSession.clear();
        window.location.href = 'index.html';
      });
    }
  }

  function getSessionUserId() {
    var session = AuthSession.get();
    if (session === null) return '';
    return session.user_id;
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function formatCurrency(cents) {
    return '$' + Number(cents).toLocaleString('es-CL');
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
