// ============================================================================
// WAITLIST — Waitlist page logic (join, leave, check position, history)
// ============================================================================

(function() {
  'use strict';

  var state = {
    providers: [],
    services: [],
    currentWaitlistEntry: null,
    waitlistHistory: [],
  };

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
    loadProviders();
    loadWaitlistStatus(session.user_id);
    loadWaitlistHistory(session.user_id);
    setupEventListeners(session);
    setupLogout();
    setupMinDate();
  }

  function loadUserInfo(session) {
    var nameEl = document.getElementById('user-name');
    var roleEl = document.getElementById('user-role');
    var avatarEl = document.getElementById('user-avatar');

    if (nameEl) nameEl.textContent = session.full_name;
    if (roleEl) roleEl.textContent = getRoleLabel(session.role);
    if (avatarEl) avatarEl.textContent = getInitials(session.full_name);
  }

  function setupMinDate() {
    var dateInput = document.getElementById('waitlist-date');
    if (dateInput) {
      var today = new Date();
      var yyyy = today.getFullYear();
      var mm = String(today.getMonth() + 1).padStart(2, '0');
      var dd = String(today.getDate()).padStart(2, '0');
      dateInput.min = yyyy + '-' + mm + '-' + dd;
    }
  }

  function loadProviders() {
    apiCall('provider_search', { query: '', specialty: '', is_active: true }).then(function(data) {
      if (data.data === null) return;
      var providers = data.data.providers;
      if (!Array.isArray(providers)) return;
      state.providers = providers;
      populateProviderSelect(providers);
    }).catch(function(err) {
      console.error('Failed to load providers:', err.message);
    });
  }

  function populateProviderSelect(providers) {
    var select = document.getElementById('waitlist-provider');
    if (!select) return;

    select.innerHTML = '<option value="">Selecciona un profesional</option>';

    for (var i = 0; i < providers.length; i++) {
      var p = providers[i];
      if (p === undefined) continue;
      var opt = document.createElement('option');
      opt.value = p.provider_id;
      opt.textContent = p.name + ' — ' + p.specialty;
      select.appendChild(opt);
    }
  }

  function loadServicesForProvider(providerId) {
    apiCall('provider_services', { provider_id: providerId }).then(function(data) {
      if (data.data === null) return;
      var services = data.data.services;
      if (!Array.isArray(services)) return;
      state.services = services;
      populateServiceSelect(services);
    }).catch(function(err) {
      console.error('Failed to load services:', err.message);
    });
  }

  function populateServiceSelect(services) {
    var select = document.getElementById('waitlist-service');
    if (!select) return;

    select.innerHTML = '<option value="">Selecciona un servicio</option>';

    for (var i = 0; i < services.length; i++) {
      var s = services[i];
      if (s === undefined) continue;
      var opt = document.createElement('option');
      opt.value = s.service_id;
      opt.textContent = s.name + ' (' + s.duration_minutes + ' min)';
      select.appendChild(opt);
    }
  }

  function loadWaitlistStatus(userId) {
    apiCall('waitlist_status', { patient_user_id: userId }).then(function(data) {
      if (data.data === null) return;
      state.currentWaitlistEntry = data.data;
      renderWaitlistStatus(data.data);
    }).catch(function(err) {
      console.error('Failed to load waitlist status:', err.message);
    });
  }

  function renderWaitlistStatus(entry) {
    var content = document.getElementById('waitlist-status-content');
    var emptyEl = document.getElementById('waitlist-empty');
    if (!content) return;

    if (entry === null || entry.entry === null) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    var e = entry.entry;
    var positionText = e.position !== undefined && e.position !== null ? 'Posición #' + e.position : 'En espera';
    var statusBadge = getStatusBadge(e.status || 'waiting');

    content.innerHTML =
      '<div class="flex items-center justify-between mb-4">' +
        '<div>' +
          '<div style="font-weight:600; font-size: 1.125rem;">' + escapeHtml(e.provider_name || '') + '</div>' +
          '<div class="text-small text-muted">' + escapeHtml(e.service_name || '') + '</div>' +
        '</div>' +
        '<div>' + statusBadge + '</div>' +
      '</div>' +
      '<div class="stat-card mb-4">' +
        '<div class="stat-label">Tu posición</div>' +
        '<div class="stat-value">' + positionText + '</div>' +
        '<div class="stat-change">Fecha preferida: ' + (e.preferred_date ? formatDate(e.preferred_date) : 'Flexible') + '</div>' +
      '</div>' +
      '<div class="flex gap-2">' +
        '<button class="btn btn-danger btn-sm" id="leave-waitlist-btn">Salir de la Lista</button>' +
      '</div>';

    var leaveBtn = document.getElementById('leave-waitlist-btn');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', function() { leaveWaitlist(); });
    }
  }

  function loadWaitlistHistory(userId) {
    apiCall('waitlist_history', { patient_user_id: userId, limit: 20 }).then(function(data) {
      if (data.data === null) return;
      var entries = data.data.entries;
      if (!Array.isArray(entries)) return;
      state.waitlistHistory = entries;
      renderWaitlistHistory(entries);
    }).catch(function(err) {
      console.error('Failed to load waitlist history:', err.message);
    });
  }

  function renderWaitlistHistory(entries) {
    var container = document.getElementById('waitlist-history');
    var emptyEl = document.getElementById('waitlist-history-empty');
    if (!container) return;

    if (entries.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    container.innerHTML = '';

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e === undefined) continue;
      var row = document.createElement('div');
      row.className = 'flex items-center justify-between p-4';
      row.style.borderBottom = '1px solid var(--border)';
      row.innerHTML =
        '<div>' +
          '<div style="font-weight:600;">' + escapeHtml(e.provider_name || '') + '</div>' +
          '<div class="text-small text-muted">' + escapeHtml(e.service_name || '') + ' — ' + formatDateTime(e.created_at || '') + '</div>' +
        '</div>' +
        '<div>' + getStatusBadge(e.status || 'waiting') + '</div>';
      container.appendChild(row);
    }
  }

  function leaveWaitlist() {
    var session = AuthSession.get();
    if (session === null) return;

    if (state.currentWaitlistEntry === null || state.currentWaitlistEntry.entry === null) return;

    var entryId = state.currentWaitlistEntry.entry.waitlist_id;
    if (entryId === undefined || entryId === null) return;

    apiCall('waitlist_leave', { patient_user_id: session.user_id, waitlist_id: entryId }).then(function(data) {
      if (data.data === null) {
        showAlert('waitlist-alert', data.error_message || 'Error al salir de la lista', 'error');
        return;
      }
      showAlert('waitlist-alert', 'Has salido de la lista de espera', 'success');
      state.currentWaitlistEntry = null;
      loadWaitlistStatus(session.user_id);
    }).catch(function(err) {
      showAlert('waitlist-alert', 'Error: ' + err.message, 'error');
    });
  }

  function setupEventListeners(session) {
    var providerSelect = document.getElementById('waitlist-provider');
    if (providerSelect) {
      providerSelect.addEventListener('change', function() {
        var providerId = providerSelect.value;
        if (providerId !== '') {
          loadServicesForProvider(providerId);
        } else {
          var serviceSelect = document.getElementById('waitlist-service');
          if (serviceSelect) serviceSelect.innerHTML = '<option value="">Selecciona un servicio</option>';
        }
      });
    }

    var joinBtn = document.getElementById('join-waitlist-btn');
    if (joinBtn) {
      joinBtn.addEventListener('click', function() {
        handleJoinWaitlist(session);
      });
    }
  }

  function handleJoinWaitlist(session) {
    var providerId = document.getElementById('waitlist-provider').value;
    var serviceId = document.getElementById('waitlist-service').value;
    var preferredDate = document.getElementById('waitlist-date').value;
    var notes = document.getElementById('waitlist-notes').value.trim();

    if (providerId === '') {
      showAlert('waitlist-alert', 'Selecciona un profesional', 'error');
      return;
    }

    if (serviceId === '') {
      showAlert('waitlist-alert', 'Selecciona un servicio', 'error');
      return;
    }

    setLoading('join-waitlist-btn', 'join-waitlist-btn-text', 'join-waitlist-btn-loading', true);

    apiCall('waitlist_join', {
      patient_user_id: session.user_id,
      provider_id: providerId,
      service_id: serviceId,
      preferred_date: preferredDate !== '' ? preferredDate : null,
      notes: notes !== '' ? notes : null,
    }).then(function(data) {
      if (data.data === null) {
        showAlert('waitlist-alert', data.error_message || 'Error al unirse', 'error');
        return;
      }
      showAlert('waitlist-alert', '¡Te has unido a la lista de espera!', 'success');
      loadWaitlistStatus(session.user_id);
      loadWaitlistHistory(session.user_id);
      document.getElementById('waitlist-provider').value = '';
      document.getElementById('waitlist-service').innerHTML = '<option value="">Selecciona un servicio</option>';
      document.getElementById('waitlist-date').value = '';
      document.getElementById('waitlist-notes').value = '';
    }).catch(function(err) {
      showAlert('waitlist-alert', 'Error: ' + err.message, 'error');
    }).finally(function() {
      setLoading('join-waitlist-btn', 'join-waitlist-btn-text', 'join-waitlist-btn-loading', false);
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
