// ============================================================================
// UTILS — Helpers (formatters, validators, RUT validation)
// ============================================================================

function validateRut(rut) {
  const clean = rut.replace(/[.\-]/g, '').toUpperCase();
  if (clean.length < 2) return false;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  if (!/^\d+$/.test(body)) return false;
  if (!/^[\dK]$/.test(dv)) return false;

  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body.charAt(i), 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const expectedDv = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);

  return dv === expectedDv;
}

function formatRut(rut) {
  const clean = rut.replace(/[.\-]/g, '').toUpperCase();
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return formatted + '-' + dv;
}

function validatePassword(password) {
  if (password.length < 8) return 'Mínimo 8 caracteres';
  if (!/[A-Z]/.test(password)) return 'Debe contener una mayúscula';
  if (!/[0-9]/.test(password)) return 'Debe contener un número';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Debe contener un carácter especial';
  return null;
}

function showElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function hideElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function setError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (input) input.classList.add('error');
  if (error) {
    error.textContent = message;
    error.classList.remove('hidden');
  }
}

function clearError(inputId, errorId) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (input) input.classList.remove('error');
  if (error) {
    error.textContent = '';
    error.classList.add('hidden');
  }
}

function clearAllErrors(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  const errors = form.querySelectorAll('.form-error');
  const inputs = form.querySelectorAll('.form-input');
  errors.forEach(function(e) { e.textContent = ''; e.classList.add('hidden'); });
  inputs.forEach(function(i) { i.classList.remove('error'); });
}

function showAlert(containerId, message, type) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = message;
  el.className = 'alert alert-' + type;
  el.classList.remove('hidden');
}

function hideAlert(containerId) {
  hideElement(containerId);
}

function setLoading(btnId, textId, loadingId, loading) {
  const btn = document.getElementById(btnId);
  const text = document.getElementById(textId);
  const spinner = document.getElementById(loadingId);
  if (btn) btn.disabled = loading;
  if (text) text.classList.toggle('hidden', loading);
  if (spinner) spinner.classList.toggle('hidden', !loading);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr) {
  return formatDate(dateStr) + ' ' + formatTime(dateStr);
}

function getInitials(name) {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function getStatusBadge(status) {
  const labels = {
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    in_service: 'En atención',
    completed: 'Completada',
    cancelled: 'Cancelada',
    no_show: 'No asistió',
    rescheduled: 'Reagendada',
    waiting: 'En espera',
    notified: 'Notificado',
    assigned: 'Asignado',
  };
  return '<span class="badge badge-' + status + '">' + (labels[status] || status) + '</span>';
}

function getRoleLabel(role) {
  const labels = { patient: 'Paciente', provider: 'Proveedor', admin: 'Administrador' };
  return labels[role] || role;
}
