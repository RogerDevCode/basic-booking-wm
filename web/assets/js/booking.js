// ============================================================================
// BOOKING — Booking wizard logic (multi-step: provider → service → date/time → confirm)
// ============================================================================

(function() {
  'use strict';

  var state = {
    currentStep: 1,
    selectedProviderId: null,
    selectedProviderName: '',
    selectedServiceId: null,
    selectedServiceName: '',
    selectedServiceDuration: 0,
    selectedServicePrice: 0,
    selectedDate: null,
    selectedTime: null,
    providers: [],
    services: [],
    availableSlots: [],
    weekOffset: 0,
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

  function loadProviders() {
    apiCall('provider_search', { query: '', specialty: '', is_active: true }).then(function(data) {
      if (data.data === null) return;
      var providers = data.data.providers;
      if (!Array.isArray(providers)) return;
      state.providers = providers;
      renderProviders(providers);
    }).catch(function(err) {
      showAlert('booking-alert', 'Error al cargar profesionales: ' + err.message, 'error');
    });
  }

  function renderProviders(providers) {
    var grid = document.getElementById('providers-grid');
    var emptyEl = document.getElementById('providers-empty');
    if (!grid) return;

    if (providers.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    grid.innerHTML = '';

    for (var i = 0; i < providers.length; i++) {
      var p = providers[i];
      if (p === undefined) continue;
      var card = document.createElement('div');
      card.className = 'card provider-card';
      card.setAttribute('data-provider-id', p.provider_id);
      card.innerHTML =
        '<div class="flex items-center gap-4">' +
          '<div class="avatar avatar-lg">' + escapeHtml(getInitials(p.name)) + '</div>' +
          '<div>' +
            '<div style="font-weight:600;">' + escapeHtml(p.name) + '</div>' +
            '<div class="text-small text-muted">' + escapeHtml(p.specialty) + '</div>' +
          '</div>' +
        '</div>';
      card.addEventListener('click', (function(provider) {
        return function() {
          selectProvider(provider);
        };
      })(p));
      grid.appendChild(card);
    }
  }

  function selectProvider(provider) {
    state.selectedProviderId = provider.provider_id;
    state.selectedProviderName = provider.name;
    state.selectedServiceId = null;
    state.selectedServiceName = '';

    var cards = document.querySelectorAll('.provider-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.remove('selected');
    }
    var selectedCard = document.querySelector('.provider-card[data-provider-id="' + provider.provider_id + '"]');
    if (selectedCard) selectedCard.classList.add('selected');

    document.getElementById('step-1-next').disabled = false;
    loadServices(provider.provider_id);
  }

  function loadServices(providerId) {
    apiCall('provider_services', { provider_id: providerId }).then(function(data) {
      if (data.data === null) return;
      var services = data.data.services;
      if (!Array.isArray(services)) return;
      state.services = services;
      renderServices(services);
    }).catch(function(err) {
      showAlert('booking-alert', 'Error al cargar servicios: ' + err.message, 'error');
    });
  }

  function renderServices(services) {
    var container = document.getElementById('services-list');
    var emptyEl = document.getElementById('services-empty');
    if (!container) return;

    if (services.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    container.innerHTML = '';

    for (var i = 0; i < services.length; i++) {
      var s = services[i];
      if (s === undefined) continue;
      var card = document.createElement('div');
      card.className = 'card service-card mb-4';
      card.setAttribute('data-service-id', s.service_id);
      var priceText = s.price_cents > 0 ? '$' + (s.price_cents / 100).toLocaleString('es-CL') : 'Gratis';
      card.innerHTML =
        '<div class="flex items-center justify-between">' +
          '<div>' +
            '<div style="font-weight:600;">' + escapeHtml(s.name) + '</div>' +
            '<div class="text-small text-muted">' + s.duration_minutes + ' minutos</div>' +
          '</div>' +
          '<div class="text-right">' +
            '<div style="font-weight:600; color: var(--success);">' + priceText + '</div>' +
          '</div>' +
        '</div>';
      card.addEventListener('click', (function(service) {
        return function() {
          selectService(service);
        };
      })(s));
      container.appendChild(card);
    }
  }

  function selectService(service) {
    state.selectedServiceId = service.service_id;
    state.selectedServiceName = service.name;
    state.selectedServiceDuration = service.duration_minutes;
    state.selectedServicePrice = service.price_cents;
    state.selectedDate = null;
    state.selectedTime = null;

    var cards = document.querySelectorAll('.service-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.remove('selected');
    }
    var selectedCard = document.querySelector('.service-card[data-service-id="' + service.service_id + '"]');
    if (selectedCard) selectedCard.classList.add('selected');

    document.getElementById('step-2-next').disabled = false;
  }

  function loadAvailability() {
    if (state.selectedProviderId === null || state.selectedDate === null) return;

    var slotsContainer = document.getElementById('time-slots');
    var slotsEmpty = document.getElementById('slots-empty');
    var slotsGrid = document.getElementById('time-slots-grid');

    apiCall('availability_check', {
      provider_id: state.selectedProviderId,
      date: state.selectedDate,
      service_id: state.selectedServiceId,
    }).then(function(data) {
      if (data.data === null) return;
      var slots = data.data.available_slots;
      if (!Array.isArray(slots)) slots = [];
      state.availableSlots = slots;
      renderTimeSlots(slots);
    }).catch(function(err) {
      console.error('Failed to load availability:', err.message);
      if (slotsContainer) slotsContainer.innerHTML = '<p class="text-error">Error al cargar horarios</p>';
    });
  }

  function renderTimeSlots(slots) {
    var slotsContainer = document.getElementById('time-slots');
    var slotsEmpty = document.getElementById('slots-empty');
    var slotsGrid = document.getElementById('time-slots-grid');
    if (!slotsContainer) return;

    if (slots.length === 0) {
      slotsContainer.innerHTML = '';
      var emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.innerHTML =
        '<svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
        '<h4 class="empty-state-title">Sin horarios disponibles</h4>' +
        '<p class="empty-state-text">Intenta con otra fecha</p>';
      slotsContainer.appendChild(emptyDiv);
      return;
    }

    slotsContainer.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'flex flex-wrap gap-2';

    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (slot === undefined) continue;
      var btn = document.createElement('button');
      btn.className = 'btn btn-outline btn-sm time-slot-btn';
      btn.textContent = slot;
      btn.setAttribute('data-time', slot);
      btn.addEventListener('click', (function(time) {
        return function() {
          selectTime(time);
        };
      })(slot));
      grid.appendChild(btn);
    }

    slotsContainer.appendChild(grid);
  }

  function selectTime(time) {
    state.selectedTime = time;
    var btns = document.querySelectorAll('.time-slot-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.remove('btn-primary');
      btns[i].classList.add('btn-outline');
    }
    var selectedBtn = document.querySelector('.time-slot-btn[data-time="' + time + '"]');
    if (selectedBtn) {
      selectedBtn.classList.remove('btn-outline');
      selectedBtn.classList.add('btn-primary');
    }
    document.getElementById('step-3-next').disabled = false;
  }

  function updateConfirmation() {
    var providerEl = document.getElementById('confirm-provider');
    var serviceEl = document.getElementById('confirm-service');
    var dateEl = document.getElementById('confirm-date');
    var timeEl = document.getElementById('confirm-time');
    var durationEl = document.getElementById('confirm-duration');

    if (providerEl) providerEl.textContent = state.selectedProviderName;
    if (serviceEl) serviceEl.textContent = state.selectedServiceName;
    if (dateEl) dateEl.textContent = state.selectedDate ? formatDate(state.selectedDate) : '—';
    if (timeEl) timeEl.textContent = state.selectedTime || '—';
    if (durationEl) durationEl.textContent = state.selectedServiceDuration + ' minutos';
  }

  function createBooking(session) {
    var idempotencyKey = 'web-' + session.user_id + '-' + state.selectedProviderId + '-' + state.selectedServiceId + '-' + state.selectedDate + '-' + state.selectedTime + '-' + Date.now();

    setLoading('step-4-confirm', 'step-4-confirm-text', 'step-4-confirm-loading', true);

    apiCall('booking_create', {
      patient_user_id: session.user_id,
      provider_id: state.selectedProviderId,
      service_id: state.selectedServiceId,
      date: state.selectedDate,
      time: state.selectedTime,
      idempotency_key: idempotencyKey,
    }).then(function(data) {
      if (data.data === null) {
        showAlert('booking-alert', data.error_message || 'Error al crear la reserva', 'error');
        return;
      }
      hideElement('step-4');
      showElement('step-success');
      var successMsg = document.getElementById('success-message');
      if (successMsg) {
        successMsg.textContent = 'Tu cita ha sido confirmada exitosamente. ID: ' + (data.data.booking_id || 'N/A');
      }
    }).catch(function(err) {
      showAlert('booking-alert', 'Error al crear la reserva: ' + err.message, 'error');
    }).finally(function() {
      setLoading('step-4-confirm', 'step-4-confirm-text', 'step-4-confirm-loading', false);
    });
  }

  function goToStep(step) {
    for (var i = 1; i <= 4; i++) {
      var stepEl = document.getElementById('step-' + i);
      if (stepEl) stepEl.classList.toggle('hidden', i !== step);
    }

    var stepItems = document.querySelectorAll('.step-item');
    for (var j = 0; j < stepItems.length; j++) {
      var item = stepItems[j];
      var itemStep = parseInt(item.getAttribute('data-step'), 10);
      item.classList.remove('active', 'completed');
      if (itemStep === step) {
        item.classList.add('active');
      } else if (itemStep < step) {
        item.classList.add('completed');
      }
    }

    state.currentStep = step;

    if (step === 3) {
      var dateInput = document.getElementById('booking-date');
      if (dateInput && !dateInput.value) {
        var today = new Date();
        var yyyy = today.getFullYear();
        var mm = String(today.getMonth() + 1).padStart(2, '0');
        var dd = String(today.getDate()).padStart(2, '0');
        dateInput.min = yyyy + '-' + mm + '-' + dd;
      }
    }

    if (step === 4) {
      updateConfirmation();
    }
  }

  function setupEventListeners() {
    var step1Next = document.getElementById('step-1-next');
    if (step1Next) {
      step1Next.addEventListener('click', function() {
        if (state.selectedProviderId !== null) goToStep(2);
      });
    }

    var step2Back = document.getElementById('step-2-back');
    if (step2Back) {
      step2Back.addEventListener('click', function() { goToStep(1); });
    }

    var step2Next = document.getElementById('step-2-next');
    if (step2Next) {
      step2Next.addEventListener('click', function() {
        if (state.selectedServiceId !== null) goToStep(3);
      });
    }

    var step3Back = document.getElementById('step-3-back');
    if (step3Back) {
      step3Back.addEventListener('click', function() { goToStep(2); });
    }

    var step3Next = document.getElementById('step-3-next');
    if (step3Next) {
      step3Next.addEventListener('click', function() {
        if (state.selectedDate !== null && state.selectedTime !== null) goToStep(4);
      });
    }

    var step4Back = document.getElementById('step-4-back');
    if (step4Back) {
      step4Back.addEventListener('click', function() { goToStep(3); });
    }

    var step4Confirm = document.getElementById('step-4-confirm');
    if (step4Confirm) {
      step4Confirm.addEventListener('click', function() {
        var session = AuthSession.get();
        if (session !== null) createBooking(session);
      });
    }

    var dateInput = document.getElementById('booking-date');
    if (dateInput) {
      dateInput.addEventListener('change', function() {
        state.selectedDate = dateInput.value;
        state.selectedTime = null;
        document.getElementById('step-3-next').disabled = true;
        loadAvailability();
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
