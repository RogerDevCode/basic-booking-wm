// ============================================================================
// PATIENT — Patient dashboard logic
// ============================================================================

(function() {
  'use strict';

  function init() {
    var session = AuthSession.get();
    if (session === null) {
      window.location.href = 'index.html';
      return;
    }

    if (session.role !== 'patient') {
      AuthSession.redirectByRole(session.role);
      return;
    }

    loadUserInfo(session);
    loadBookings(session.user_id);
    setupLogout();
  }

  function loadUserInfo(session) {
    var nameEl = document.getElementById('user-name');
    var roleEl = document.getElementById('user-role');
    var avatarEl = document.getElementById('user-avatar');
    var welcomeEl = document.getElementById('welcome-title');

    if (nameEl) nameEl.textContent = session.full_name;
    if (roleEl) roleEl.textContent = getRoleLabel(session.role);
    if (avatarEl) avatarEl.textContent = getInitials(session.full_name);
    if (welcomeEl) welcomeEl.textContent = 'Bienvenido, ' + session.full_name.split(' ')[0];
  }

  function loadBookings(userId) {
    apiCall('web_patient_bookings', {
      patient_user_id: userId,
      status: 'all',
      limit: 50,
      offset: 0,
    }).then(function(data) {
      if (data.data === null) return;
      renderStats(data.data);
      renderUpcoming(data.data.upcoming);
      renderHistory(data.data.past);
    }).catch(function(err) {
      console.error('Failed to load bookings:', err.message);
    });
  }

  function renderStats(data) {
    var totalEl = document.getElementById('stat-total');
    var nextEl = document.getElementById('stat-next-appointment');
    var nextDetailEl = document.getElementById('stat-next-detail');

    if (totalEl) totalEl.textContent = String(data.total);

    if (data.upcoming.length > 0) {
      var next = data.upcoming[0];
      if (next !== undefined) {
        if (nextEl) nextEl.textContent = formatDate(next.start_time);
        if (nextDetailEl) {
          nextDetailEl.textContent = next.service_name + ' — ' + next.provider_name;
          nextDetailEl.className = 'stat-change positive';
        }
      }
    } else {
      if (nextEl) nextEl.textContent = '—';
      if (nextDetailEl) nextDetailEl.textContent = 'Sin citas próximas';
    }
  }

  function renderUpcoming(bookings) {
    var container = document.getElementById('upcoming-list');
    var emptyEl = document.getElementById('upcoming-empty');
    if (!container) return;

    if (bookings.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    for (var i = 0; i < bookings.length; i++) {
      var b = bookings[i];
      if (b === undefined) continue;
      var card = document.createElement('div');
      card.className = 'flex items-center justify-between p-4';
      card.style.borderBottom = '1px solid var(--border)';
      card.innerHTML =
        '<div>' +
          '<div style="font-weight:600;">' + escapeHtml(b.provider_name) + '</div>' +
          '<div class="text-small text-muted">' + escapeHtml(b.service_name) + ' — ' + formatDateTime(b.start_time) + '</div>' +
        '</div>' +
        '<div class="flex items-center gap-2">' +
          getStatusBadge(b.status) +
          (b.can_cancel ? '<button class="btn btn-ghost btn-sm text-error" data-cancel="' + b.booking_id + '">Cancelar</button>' : '') +
          (b.can_reschedule ? '<button class="btn btn-ghost btn-sm" data-reschedule="' + b.booking_id + '">Reagendar</button>' : '') +
        '</div>';
      container.appendChild(card);
    }

    setupCancelButtons();
  }

  function renderHistory(bookings) {
    var container = document.getElementById('history-list');
    var emptyEl = document.getElementById('history-empty');
    if (!container) return;

    if (bookings.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    for (var i = 0; i < bookings.length; i++) {
      var b = bookings[i];
      if (b === undefined) continue;
      var card = document.createElement('div');
      card.className = 'flex items-center justify-between p-4';
      card.style.borderBottom = '1px solid var(--border)';
      card.innerHTML =
        '<div>' +
          '<div style="font-weight:600;">' + escapeHtml(b.provider_name) + '</div>' +
          '<div class="text-small text-muted">' + escapeHtml(b.service_name) + ' — ' + formatDateTime(b.start_time) + '</div>' +
        '</div>' +
        '<div>' + getStatusBadge(b.status) + '</div>';
      container.appendChild(card);
    }
  }

  function setupCancelButtons() {
    var buttons = document.querySelectorAll('[data-cancel]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function(e) {
        var bookingId = e.currentTarget.getAttribute('data-cancel');
        if (bookingId === null) return;
        var modal = document.getElementById('cancel-modal');
        if (modal) {
          modal.classList.add('active');
          modal.setAttribute('data-booking-id', bookingId);
        }
      });
    }
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
