// ============================================================================
// PROVIDER — Provider dashboard logic (agenda, patients, stats)
// ============================================================================

(function() {
  'use strict';

  var state = {
    providerId: null,
    weekOffset: 0,
    todayBookings: [],
    weekData: [],
    recentPatients: [],
  };

  function init() {
    var session = AuthSession.get();
    if (session === null) {
      window.location.href = 'index.html';
      return;
    }

    if (session.role !== 'provider') {
      AuthSession.redirectByRole(session.role);
      return;
    }

    loadUserInfo(session);
    loadProviderId(session.user_id);
    setupEventListeners();
    setupLogout();
  }

  function loadUserInfo(session) {
    var nameEl = document.getElementById('user-name');
    var roleEl = document.getElementById('user-role');
    var avatarEl = document.getElementById('user-avatar');

    if (nameEl) nameEl.textContent = session.full_name;
    if (roleEl) roleEl.textContent = getRoleLabel(session.role);
    if (avatarEl) avatarEl.textContent = getInitials(session.full_name);
  }

  function loadProviderId(userId) {
    apiCall('provider_me', { user_id: userId }).then(function(data) {
      if (data.data === null) return;
      state.providerId = data.data.provider_id;
      loadTodayAgenda(data.data.provider_id);
      loadWeekOverview(data.data.provider_id);
      loadRecentPatients(data.data.provider_id);
    }).catch(function(err) {
      console.error('Failed to load provider info:', err.message);
      showAlert('provider-alert', 'Error al cargar información del profesional', 'error');
    });
  }

  function loadTodayAgenda(providerId) {
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var dd = String(today.getDate()).padStart(2, '0');
    var todayStr = yyyy + '-' + mm + '-' + dd;

    apiCall('provider_agenda', {
      provider_id: providerId,
      date_from: todayStr,
      date_to: todayStr,
      include_patient_details: true,
    }).then(function(data) {
      if (data.data === null) return;
      var days = data.data.days;
      if (!Array.isArray(days) || days.length === 0) return;

      var todayData = days[0];
      if (todayData === undefined) return;
      var bookings = todayData.bookings;
      if (!Array.isArray(bookings)) bookings = [];

      state.todayBookings = bookings;
      renderTodayAgenda(bookings, todayStr);
      updateTodayStat(bookings);
    }).catch(function(err) {
      console.error('Failed to load today agenda:', err.message);
    });
  }

  function renderTodayAgenda(bookings, dateStr) {
    var container = document.getElementById('agenda-list');
    var emptyEl = document.getElementById('agenda-empty');
    var badgeEl = document.getElementById('today-date-badge');

    if (badgeEl) badgeEl.textContent = formatDate(dateStr);

    if (!container) return;

    if (bookings.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    container.innerHTML = '';

    for (var i = 0; i < bookings.length; i++) {
      var b = bookings[i];
      if (b === undefined) continue;
      var row = document.createElement('div');
      row.className = 'flex items-center justify-between p-4';
      row.style.borderBottom = '1px solid var(--border)';

      var actions = '';
      var statusStr = typeof b.status === 'string' ? b.status : '';
      if (statusStr === 'confirmed') {
        actions = '<button class="btn btn-success btn-sm" data-complete="' + b.booking_id + '">Completar</button>';
      } else if (statusStr === 'pending') {
        actions = '<button class="btn btn-outline btn-sm" data-confirm="' + b.booking_id + '">Confirmar</button>';
      }

      row.innerHTML =
        '<div class="flex items-center gap-4">' +
          '<div class="avatar">' + escapeHtml(getInitials(String(b.patient_name || 'P'))) + '</div>' +
          '<div>' +
            '<div style="font-weight:600;">' + escapeHtml(String(b.patient_name || 'Paciente')) + '</div>' +
            '<div class="text-small text-muted">' + escapeHtml(String(b.service_name || '')) + ' — ' + formatTime(String(b.start_time || '')) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-2">' +
          getStatusBadge(statusStr) +
          actions +
        '</div>';

      container.appendChild(row);
    }

    setupAgendaActions();
  }

  function updateTodayStat(bookings) {
    var countEl = document.getElementById('stat-today-count');
    if (countEl) countEl.textContent = String(bookings.length);

    var now = new Date().toISOString();
    var nextBooking = null;
    for (var i = 0; i < bookings.length; i++) {
      var b = bookings[i];
      if (b === undefined) continue;
      if (String(b.start_time || '') > now) {
        nextBooking = b;
        break;
      }
    }

    var nextTimeEl = document.getElementById('stat-next-time');
    var nextPatientEl = document.getElementById('stat-next-patient');

    if (nextBooking !== null) {
      if (nextTimeEl) nextTimeEl.textContent = formatTime(String(nextBooking.start_time || ''));
      if (nextPatientEl) nextPatientEl.textContent = String(nextBooking.patient_name || '');
    } else {
      if (nextTimeEl) nextTimeEl.textContent = '—';
      if (nextPatientEl) nextPatientEl.textContent = 'Sin citas próximas';
    }
  }

  function loadWeekOverview(providerId) {
    var today = new Date();
    var monday = new Date(today);
    var dayOfWeek = monday.getDay();
    var diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(monday.getDate() + diffToMonday + (state.weekOffset * 7));

    var sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    var fromStr = monday.toISOString().split('T')[0];
    var toStr = sunday.toISOString().split('T')[0];

    if (fromStr === undefined || toStr === undefined) return;

    apiCall('provider_agenda', {
      provider_id: providerId,
      date_from: fromStr,
      date_to: toStr,
      include_patient_details: false,
    }).then(function(data) {
      if (data.data === null) return;
      var days = data.data.days;
      if (!Array.isArray(days)) return;

      state.weekData = days;
      renderWeekOverview(days);
      updateWeekStats(days);
    }).catch(function(err) {
      console.error('Failed to load week overview:', err.message);
    });
  }

  function renderWeekOverview(days) {
    var tbody = document.getElementById('week-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    var dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    for (var i = 0; i < days.length; i++) {
      var d = days[i];
      if (d === undefined) continue;
      var tr = document.createElement('tr');
      var bookingCount = typeof d.total_bookings === 'number' ? d.total_bookings : 0;
      var badge = bookingCount > 0 ? getStatusBadge('confirmed') : '<span class="text-muted">Sin citas</span>';
      tr.innerHTML =
        '<td>' + dayNames[typeof d.day_of_week === 'number' ? d.day_of_week : 0] + '</td>' +
        '<td>' + formatDate(d.date) + '</td>' +
        '<td>' + bookingCount + '</td>' +
        '<td>' + badge + '</td>';
      tbody.appendChild(tr);
    }
  }

  function updateWeekStats(days) {
    var total = 0;
    for (var i = 0; i < days.length; i++) {
      var d = days[i];
      if (d === undefined) continue;
      total += typeof d.total_bookings === 'number' ? d.total_bookings : 0;
    }

    var weekTotalEl = document.getElementById('stat-week-total');
    if (weekTotalEl) weekTotalEl.textContent = String(total);
  }

  function loadRecentPatients(providerId) {
    apiCall('provider_patients', { provider_id: providerId, limit: 10 }).then(function(data) {
      if (data.data === null) return;
      var patients = data.data.patients;
      if (!Array.isArray(patients)) return;

      state.recentPatients = patients;
      renderRecentPatients(patients);
    }).catch(function(err) {
      console.error('Failed to load recent patients:', err.message);
    });
  }

  function renderRecentPatients(patients) {
    var container = document.getElementById('patients-list');
    var emptyEl = document.getElementById('patients-empty');
    if (!container) return;

    if (patients.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    container.innerHTML = '';

    for (var i = 0; i < patients.length; i++) {
      var p = patients[i];
      if (p === undefined) continue;
      var row = document.createElement('div');
      row.className = 'flex items-center justify-between p-4';
      row.style.borderBottom = '1px solid var(--border)';
      row.innerHTML =
        '<div class="flex items-center gap-4">' +
          '<div class="avatar">' + escapeHtml(getInitials(String(p.name || 'P'))) + '</div>' +
          '<div>' +
            '<div style="font-weight:600;">' + escapeHtml(String(p.name || 'Paciente')) + '</div>' +
            '<div class="text-small text-muted">' + escapeHtml(String(p.email || '')) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="text-small text-muted">' + (typeof p.total_visits === 'number' ? p.total_visits + ' visitas' : '') + '</div>';
      container.appendChild(row);
    }
  }

  function setupAgendaActions() {
    var completeBtns = document.querySelectorAll('[data-complete]');
    for (var i = 0; i < completeBtns.length; i++) {
      completeBtns[i].addEventListener('click', function(e) {
        var bookingId = e.currentTarget.getAttribute('data-complete');
        if (bookingId === null) return;
        updateBookingStatus(bookingId, 'completed');
      });
    }

    var confirmBtns = document.querySelectorAll('[data-confirm]');
    for (var j = 0; j < confirmBtns.length; j++) {
      confirmBtns[j].addEventListener('click', function(e) {
        var bookingId = e.currentTarget.getAttribute('data-confirm');
        if (bookingId === null) return;
        updateBookingStatus(bookingId, 'confirmed');
      });
    }
  }

  function updateBookingStatus(bookingId, newStatus) {
    apiCall('booking_update_status', {
      provider_id: state.providerId,
      booking_id: bookingId,
      new_status: newStatus,
    }).then(function(data) {
      if (data.data === null) {
        showAlert('provider-alert', data.error_message || 'Error al actualizar', 'error');
        return;
      }
      showAlert('provider-alert', 'Estado actualizado a ' + newStatus, 'success');
      if (state.providerId !== null) loadTodayAgenda(state.providerId);
    }).catch(function(err) {
      showAlert('provider-alert', 'Error: ' + err.message, 'error');
    });
  }

  function setupEventListeners() {
    var weekPrev = document.getElementById('week-prev');
    if (weekPrev) {
      weekPrev.addEventListener('click', function() {
        state.weekOffset--;
        if (state.providerId !== null) loadWeekOverview(state.providerId);
      });
    }

    var weekNext = document.getElementById('week-next');
    if (weekNext) {
      weekNext.addEventListener('click', function() {
        state.weekOffset++;
        if (state.providerId !== null) loadWeekOverview(state.providerId);
      });
    }

    var modalClose = document.getElementById('action-modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', function() {
        document.getElementById('action-modal').classList.remove('active');
      });
    }

    var modalCancel = document.getElementById('action-modal-cancel');
    if (modalCancel) {
      modalCancel.addEventListener('click', function() {
        document.getElementById('action-modal').classList.remove('active');
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
