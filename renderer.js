// ============ STATE ============
let SERVER_URL = 'http://localhost:3000';
let token = null;
let currentUser = null;
let refreshInterval = null;
let coinsTimer = null;
let myBots = []; // Lista de boți a userului (din backend)

// ============ INIT ============
(async function init() {
  try {
    const cfg = await window.electronAPI.getConfig();
    SERVER_URL = cfg.serverUrl || 'http://localhost:3000';
    document.getElementById('server-url').value = SERVER_URL;
  } catch(e) {}

  // Listener pentru status boți (din main.js)
  window.electronAPI.onBotStatus((data) => {
    // Raportează la backend când se schimbă status
    api('POST', '/api/bots/' + data.botId + '/status', {
      isOnline: data.isOnline,
      status: data.status
    });
  });

  const savedToken = localStorage.getItem('token');
  if (savedToken) {
    token = savedToken;
    const me = await api('GET', '/api/me');
    if (me && !me.error) {
      currentUser = me;
      enterApp();
      return;
    }
    localStorage.removeItem('token');
  }
})();

// ============ HELPER API ============
async function api(method, endpoint, body) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(SERVER_URL + endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    try { return JSON.parse(text); }
    catch (e) { return { error: 'Server raspuns invalid' }; }
  } catch (e) {
    return { error: 'Nu pot conecta la server: ' + e.message };
  }
}

function saveServerUrl() {
  const url = document.getElementById('server-url').value.trim();
  if (!url) return;
  SERVER_URL = url;
  window.electronAPI.saveConfig({ serverUrl: url });
  alert('Server URL salvat!');
}

// ============ LOGIN / REGISTER ============
function showLogin() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('login-subtitle').textContent = 'Conecteaza-te la cont';
  document.getElementById('login-alert').innerHTML = '';
}
function showRegister() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
  document.getElementById('login-subtitle').textContent = 'Trimite cerere de inregistrare';
  document.getElementById('login-alert').innerHTML = '';
}
function showAlert(msg, type) {
  var klass = type === 'success' ? 'alert-success' : 'alert-error';
  document.getElementById('login-alert').innerHTML = '<div class="alert ' + klass + '">' + msg + '</div>';
}

document.getElementById('login-username').addEventListener('input', function(e) {
  var adminNames = ['Dragositu23', 'cont1', 'cont10'];
  var show = adminNames.includes(e.target.value.trim());
  document.getElementById('login-password-group').style.display = show ? 'block' : 'none';
});

async function doLogin() {
  var username = document.getElementById('login-username').value.trim();
  var pinCode = document.getElementById('login-pin').value.trim();
  var password = document.getElementById('login-password').value;
  if (!username || !pinCode) return showAlert('Completeaza toate campurile');
  var result = await api('POST', '/api/login', { username, pinCode, password });
  if (result.error) return showAlert(result.error);
  token = result.token;
  currentUser = result.user;
  localStorage.setItem('token', token);
  enterApp();
}

async function doRegister() {
  var username = document.getElementById('reg-username').value.trim();
  var pinCode = document.getElementById('reg-pin').value.trim();
  if (!username || !pinCode) return showAlert('Completeaza toate campurile');
  if (!/^\d{6}$/.test(pinCode)) return showAlert('Codul PIN trebuie sa aiba exact 6 cifre');
  var result = await api('POST', '/api/register', { username, pinCode });
  if (result.error) return showAlert(result.error);
  showAlert(result.message, 'success');
  document.getElementById('reg-username').value = '';
  document.getElementById('reg-pin').value = '';
  setTimeout(showLogin, 2000);
}

async function logout() {
  if (refreshInterval) clearInterval(refreshInterval);
  if (coinsTimer) clearInterval(coinsTimer);
  await window.electronAPI.stopBots();
  await api('POST', '/api/bots/session-stop');
  token = null; currentUser = null;
  localStorage.removeItem('token');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

// ============ APP MAIN ============
function enterApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-name').textContent = currentUser.username;
  document.getElementById('user-role').textContent = currentUser.role.toUpperCase();
  if (currentUser.role === 'admin') {
    document.getElementById('nav-admin').classList.remove('hidden');
  }
  refreshDashboard();
  loadDiscord();
  loadInfo();
  if (currentUser.role === 'admin') refreshAdminBadge();
  refreshInterval = setInterval(function() {
    refreshDashboard();
    if (currentUser && currentUser.role === 'admin') refreshAdminBadge();
  }, 5000);
}

document.querySelectorAll('.nav-item').forEach(function(item) {
  item.addEventListener('click', function() {
    if (item.classList.contains('hidden')) return;
    document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
    item.classList.add('active');
    var tab = item.dataset.tab;
    document.querySelectorAll('[id^="tab-"]').forEach(function(t) { t.classList.add('hidden'); });
    document.getElementById('tab-' + tab).classList.remove('hidden');
    if (tab === 'admin') loadAdminTab('requests');
  });
});

// ============ DASHBOARD ============
async function refreshDashboard() {
  var data = await api('GET', '/api/me');
  if (data.error) return;
  currentUser.coins = data.coins;
  document.getElementById('stat-coins').textContent = Math.floor(data.coins);
  document.getElementById('stat-bots').textContent = data.totalBots;
  document.getElementById('stat-online-info').textContent = data.onlineBots + ' online acum';
  if (data.isRunning) {
    document.getElementById('stat-status').textContent = '▶️ Activ';
    document.getElementById('stat-status-sub').textContent = data.onlineBots + '/' + data.totalBots + ' boti online';
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-stop').disabled = false;
  } else {
    document.getElementById('stat-status').textContent = '⏸️ Oprit';
    document.getElementById('stat-status-sub').textContent = 'apasa Start';
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-stop').disabled = true;
  }
  var botList = document.getElementById('bot-list-content');
  if (!data.bots || data.bots.length === 0) {
    botList.innerHTML = '<p style="color:#888;">Niciun bot atribuit. Cere unui admin.</p>';
  } else {
    botList.innerHTML = data.bots.map(function(b) {
      var dotClass = b.online ? 'online' : (b.status === 'connecting' || b.status === 'logged_in' ? 'connecting' : (b.status === 'error' ? 'error' : ''));
      return '<div class="bot-row"><span class="status-dot ' + dotClass + '"></span><span class="bot-name">' + b.username + '</span><span class="bot-status-text">' + translateStatus(b.status) + '</span></div>';
    }).join('');
  }
}

function translateStatus(s) {
  var map = { 'offline': 'Offline', 'online': 'Online ✓', 'connecting': 'Conectare...', 'logged_in': 'Logat...', 'error': 'Eroare' };
  return map[s] || s || 'Offline';
}

async function startBots() {
  // 1. Cere lista de boți de la backend (cu parolele MC)
  var bots = await api('GET', '/api/my-bots');
  if (bots.error) return alert(bots.error);
  if (!bots || bots.length === 0) return alert('Nu ai niciun bot atribuit. Cere unui admin.');

  // 2. Filtrează după numărul ales
  var countEl = document.getElementById('bot-count-select');
  var botCount = countEl ? parseInt(countEl.value) : 0;
  if (botCount > 0 && botCount < bots.length) {
    bots = bots.slice(0, botCount);
  }

  // 3. Pornește boții LOCAL (pe calculatorul tău)
  var r = await window.electronAPI.startBots(bots);
  if (r.error) return alert('Eroare: ' + r.error);

  // 4. Anunță backend-ul că a pornit sesiunea
  await api('POST', '/api/bots/session-start');

  // 5. Pornește timer-ul pentru coinși (la fiecare 100 min)
  if (coinsTimer) clearInterval(coinsTimer);
  coinsTimer = setInterval(async function() {
    var onlineCount = await window.electronAPI.getOnlineCount();
    if (onlineCount > 0) {
      await api('POST', '/api/bots/award-coins', { onlineBotsCount: onlineCount });
    }
  }, 100 * 60 * 1000); // 100 minute

  refreshDashboard();
}

async function stopBots() {
  await window.electronAPI.stopBots();
  await api('POST', '/api/bots/session-stop');
  if (coinsTimer) { clearInterval(coinsTimer); coinsTimer = null; }
  refreshDashboard();
}

// ============ DISCORD / INFO ============
async function loadDiscord() {
  var link = await api('GET', '/api/content/discord_link');
  var text = await api('GET', '/api/content/discord_text');
  document.getElementById('discord-link').href = link.value || '#';
  document.getElementById('discord-text').textContent = text.value || '';
}
async function loadInfo() {
  var text = await api('GET', '/api/content/info_text');
  document.getElementById('info-text').textContent = text.value || '';
}

// ============ ADMIN ============
document.querySelectorAll('.admin-tab').forEach(function(t) {
  t.addEventListener('click', function() {
    document.querySelectorAll('.admin-tab').forEach(function(x) { x.classList.remove('active'); });
    t.classList.add('active');
    loadAdminTab(t.dataset.admintab);
  });
});

async function refreshAdminBadge() {
  var requests = await api('GET', '/api/admin/requests');
  var badge = document.getElementById('admin-badge');
  if (requests && requests.length > 0) {
    badge.textContent = requests.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function loadAdminTab(tab) {
  document.querySelectorAll('[id^="admintab-"]').forEach(function(x) { x.classList.add('hidden'); });
  var el = document.getElementById('admintab-' + tab);
  el.classList.remove('hidden');
  if (tab === 'requests') loadRequests();
  if (tab === 'users') loadUsers();
  if (tab === 'bots') loadBots();
  if (tab === 'content') loadContentEditor();
}

async function loadRequests() {
  var reqs = await api('GET', '/api/admin/requests');
  var el = document.getElementById('admintab-requests');
  if (!reqs || reqs.length === 0) {
    el.innerHTML = '<p style="color:#888;">Nicio cerere in asteptare.</p>';
    return;
  }
  var html = '<table><thead><tr><th>Username</th><th>Data</th><th>Actiuni</th></tr></thead><tbody>';
  reqs.forEach(function(r) {
    html += '<tr><td><b>' + r.username + '</b></td><td>' + new Date(r.created_at * 1000).toLocaleString('ro-RO') + '</td><td><button class="btn btn-success btn-sm" onclick="approveReq(' + r.id + ')">✓ Approve</button> <button class="btn btn-danger btn-sm" onclick="rejectReq(' + r.id + ')">✗ Reject</button></td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

async function approveReq(id) { await api('POST', '/api/admin/requests/' + id + '/approve'); loadRequests(); refreshAdminBadge(); }
async function rejectReq(id) { if (!confirm('Sigur respingi?')) return; await api('POST', '/api/admin/requests/' + id + '/reject'); loadRequests(); refreshAdminBadge(); }

async function loadUsers() {
  var users = await api('GET', '/api/admin/users');
  var el = document.getElementById('admintab-users');
  var html = '<table><thead><tr><th>Username</th><th>Rol</th><th>Status</th><th>Boti</th><th>Coinsi</th><th>Actiuni</th></tr></thead><tbody>';
  users.forEach(function(u) {
    html += '<tr><td><b>' + u.username + '</b></td><td>' + u.role + '</td><td>' + u.status + '</td><td>' + u.bot_count + '/5</td><td><b style="color:#feca57;">' + Math.floor(u.coins) + '+</b></td><td>';
    if (u.coins > 0) html += '<button class="btn btn-success btn-sm" onclick="payUser(' + u.id + ',\'' + u.username + '\',' + u.coins + ')">💸 Platit</button> ';
    if (u.role !== 'admin') html += '<button class="btn btn-danger btn-sm" onclick="deleteUser(' + u.id + ',\'' + u.username + '\')">🗑️ Sterge</button>';
    html += '</td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

async function payUser(id, name, coins) {
  if (!confirm('Marchezi ' + name + ' ca platit pentru ' + Math.floor(coins) + ' coinsi?')) return;
  await api('POST', '/api/admin/users/' + id + '/pay');
  loadUsers();
}

async function deleteUser(id, name) {
  if (!confirm('Sigur stergi contul "' + name + '"?')) return;
  var r = await api('DELETE', '/api/admin/users/' + id);
  if (r.error) return alert(r.error);
  loadUsers();
}

async function loadBots() {
  var bots = await api('GET', '/api/admin/bots');
  var users = await api('GET', '/api/admin/users');
  window._allUsers = users.filter(function(u) { return u.status === 'approved'; });
  var el = document.getElementById('admintab-bots');
  var html = '<button class="btn btn-success btn-sm" onclick="openBotModal()" style="margin-bottom:14px;">+ Adauga bot</button>';
  html += '<table><thead><tr><th>MC Username</th><th>MC Password</th><th>Atribuit</th><th>Status</th><th>Actiuni</th></tr></thead><tbody>';
  bots.forEach(function(b) {
    html += '<tr><td><b>' + b.mc_username + '</b></td><td><code style="font-size:11px;">' + b.mc_password + '</code></td><td>' + (b.owner_username || '<i style="color:#888;">neatribuit</i>') + '</td><td>' + (b.is_online ? '🟢 Online' : '⚪ Offline') + '</td><td><button class="btn btn-secondary btn-sm" onclick="editBot(' + b.id + ',\'' + b.mc_username + '\',\'' + b.mc_password + '\',' + (b.owner_user_id || 'null') + ')">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteBot(' + b.id + ')">Sterge</button></td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function openBotModal(id, username, password, ownerId) {
  var isEdit = !!id;
  var userOptions = '<option value="">-- neatribuit --</option>';
  window._allUsers.forEach(function(u) {
    var sel = (ownerId && ownerId === u.id) ? ' selected' : '';
    userOptions += '<option value="' + u.id + '"' + sel + '>' + u.username + ' (' + u.bot_count + '/5)</option>';
  });
  var html = '<div class="modal-overlay" id="bot-modal"><div class="modal"><h3>' + (isEdit ? 'Editeaza bot' : 'Adauga bot nou') + '</h3>';
  html += '<div class="input-group"><label>Minecraft Username</label><input type="text" id="m-username" value="' + (username || '') + '"></div>';
  html += '<div class="input-group"><label>Minecraft Password</label><input type="text" id="m-password" value="' + (password || '') + '"></div>';
  html += '<div class="input-group"><label>Atribuit user-ului</label><select id="m-owner">' + userOptions + '</select></div>';
  html += '<div class="modal-actions"><button class="btn" onclick="saveBot(' + (id || 'null') + ')">Salveaza</button><button class="btn btn-secondary" onclick="closeBotModal()">Anuleaza</button></div>';
  html += '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function editBot(id, username, password, ownerId) { openBotModal(id, username, password, ownerId); }
function closeBotModal() { var m = document.getElementById('bot-modal'); if (m) m.remove(); }

async function saveBot(id) {
  var mc_username = document.getElementById('m-username').value.trim();
  var mc_password = document.getElementById('m-password').value.trim();
  var owner_user_id = document.getElementById('m-owner').value || null;
  if (!mc_username || !mc_password) return alert('Completeaza username si password');
  var r;
  if (id) r = await api('PUT', '/api/admin/bots/' + id, { mc_username, mc_password, owner_user_id });
  else r = await api('POST', '/api/admin/bots', { mc_username, mc_password, owner_user_id });
  if (r.error) return alert(r.error);
  closeBotModal();
  loadBots();
}

async function deleteBot(id) { if (!confirm('Sigur stergi?')) return; await api('DELETE', '/api/admin/bots/' + id); loadBots(); }

async function loadContentEditor() {
  var el = document.getElementById('admintab-content');
  var link = await api('GET', '/api/content/discord_link');
  var dtext = await api('GET', '/api/content/discord_text');
  var itext = await api('GET', '/api/content/info_text');
  var html = '<h3 style="margin-bottom:14px;">Editor Continut</h3>';
  html += '<div class="input-group"><label>Link Discord</label><input type="text" id="ed-discord-link" value="' + ((link.value || '').replace(/"/g, '&quot;')) + '"></div>';
  html += '<div class="input-group"><label>Text Discord</label><textarea id="ed-discord-text">' + (dtext.value || '') + '</textarea></div>';
  html += '<button class="btn btn-success btn-sm" onclick="saveDiscordContent()" style="margin-bottom:24px;">Salveaza Discord</button>';
  html += '<hr style="border-color:rgba(255,255,255,0.1);margin:20px 0;">';
  html += '<div class="input-group"><label>Text Info</label><textarea id="ed-info-text">' + (itext.value || '') + '</textarea></div>';
  html += '<button class="btn btn-success btn-sm" onclick="saveInfoContent()">Salveaza Info</button>';
  el.innerHTML = html;
}

async function saveDiscordContent() {
  await saveContent('discord_link', document.getElementById('ed-discord-link').value);
  await saveContent('discord_text', document.getElementById('ed-discord-text').value);
}
async function saveInfoContent() {
  await saveContent('info_text', document.getElementById('ed-info-text').value);
}

async function saveContent(key, value) {
  var r = await api('PUT', '/api/content/' + key, { value });
  if (r.error) return alert(r.error);
  loadDiscord(); loadInfo();
  var note = document.createElement('div');
  note.textContent = '✓ Salvat!';
  note.style.cssText = 'position:fixed;top:20px;right:20px;background:#1dd1a1;color:#1a1a2e;padding:10px 16px;border-radius:8px;z-index:200;font-weight:600;';
  document.body.appendChild(note);
  setTimeout(function() { note.remove(); }, 2000);
}
