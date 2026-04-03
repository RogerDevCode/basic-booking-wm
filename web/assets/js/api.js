// ============================================================================
// API — HTTP client for Windmill endpoints
// ============================================================================

var API_BASE = (window.WINDMILL_API_BASE || '');

function apiCall(scriptName, payload) {
  var url = API_BASE + '/api/w/workspace/scripts/' + scriptName;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(function(res) {
    if (!res.ok) {
      return res.json().then(function(data) {
        throw new Error(data.message || data.error || 'HTTP ' + res.status);
      });
    }
    return res.json();
  }).then(function(data) {
    if (data.error_message !== null && data.error_message !== undefined) {
      throw new Error(data.error_message);
    }
    return data;
  });
}

function login(email, password) {
  return apiCall('web_auth_login', { email: email, password: password });
}

function register(fullName, rut, email, address, phone, password, passwordConfirm) {
  return apiCall('web_auth_register', {
    full_name: fullName,
    rut: rut,
    email: email,
    address: address,
    phone: phone,
    password: password,
    password_confirm: passwordConfirm,
  });
}

function completeProfile(chatId, rut, email, address, phone, password, passwordConfirm) {
  return apiCall('web_auth_complete_profile', {
    chat_id: chatId,
    rut: rut,
    email: email,
    address: address,
    phone: phone,
    password: password,
    password_confirm: passwordConfirm,
  });
}

function getUserProfile(userId) {
  return apiCall('web_auth_me', { user_id: userId });
}

function changeRole(adminUserId, targetUserId, newRole) {
  return apiCall('web_auth_change_role', {
    admin_user_id: adminUserId,
    target_user_id: targetUserId,
    new_role: newRole,
  });
}

function telegramAutoRegister(chatId, firstName, lastName) {
  var payload = { chat_id: chatId, first_name: firstName };
  if (lastName) payload.last_name = lastName;
  return apiCall('telegram_auto_register', payload);
}
