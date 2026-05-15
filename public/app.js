let currentPage = 'dashboard';
let settings = {};
let refreshTimer = null;
let charts = {};
let isMuted = false;
let audioCtx = null;
let sirenInterval = null;

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupNav();
  setupClock();
  setupAudio();
  navigateTo('dashboard');
  startAutoRefresh();
  pollAlarms();
  
  // Resume AudioContext on first click (browser requirement)
  document.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }, { once: true });
});

function setupAudio() {
  const muteBtn = document.getElementById('muteBtn');
  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    document.getElementById('muteIcon').className = isMuted ? 'ri-volume-mute-line' : 'ri-volume-up-line';
    if (isMuted) stopSiren();
    toast(isMuted ? 'Alarm muted' : 'Alarm unmuted', 'info');
  });
}

function startSiren() {
  if (isMuted || sirenInterval) return;
  
  // If custom file exists, use HTML5 Audio
  if (settings.alarm_file_path) {
    const audio = document.getElementById('alarmSound');
    if (audio) {
      audio.src = settings.alarm_file_path;
      audio.play().catch(e => console.error('Audio play failed:', e));
      sirenInterval = setInterval(() => audio.play().catch(() => {}), 2000);
      return;
    }
  }

  // Fallback to Synthesized sound
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  const playBeep = () => {
    if (isMuted) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  };
  
  playBeep();
  sirenInterval = setInterval(playBeep, 1000);
}

function stopSiren() {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
  const audio = document.getElementById('alarmSound');
  if (audio) { audio.pause(); audio.currentTime = 0; }
}

// ============ API HELPER ============
async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return res.json();
}

// ============ SETTINGS ============
async function loadSettings() {
  settings = await api('/api/settings');
  document.getElementById('appTitle').textContent = settings.app_name || 'PingMon';
  document.getElementById('companyName').textContent = settings.company_name || '';
  document.title = (settings.app_name || 'PingMon') + ' - Network Monitor';
  const logo = document.getElementById('sidebarLogo');
  const fallback = document.getElementById('sidebarLogoFallback');
  if (settings.logo_path) { logo.src = settings.logo_path; logo.style.display = 'block'; fallback.style.display = 'none'; }
  else { logo.style.display = 'none'; fallback.style.display = 'flex'; }
}

// ============ NAVIGATION ============
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); navigateTo(el.dataset.page); toggleSidebar(false); });
  });
  document.getElementById('sidebarToggle').addEventListener('click', () => toggleSidebar());
}

function toggleSidebar(force) {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  const isOpen = force !== undefined ? force : !sb.classList.contains('open');
  sb.classList.toggle('open', isOpen);
  ov.classList.toggle('open', isOpen);
}

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.getElementById('sidebar').classList.remove('open');
  const container = document.getElementById('pageContainer');
  const pages = { dashboard: renderDashboard, devices: renderDevices, reports: renderReports, alarms: renderAlarms, settings: renderSettings };
  if (pages[page]) pages[page](container);
}

// ============ CLOCK ============
function setupClock() {
  const el = document.getElementById('liveClock');
  const tick = () => { el.textContent = new Date().toLocaleString('id-ID', { weekday:'short', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' }); };
  tick(); setInterval(tick, 1000);
}

// ============ AUTO REFRESH ============
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  // UI data check every 10 seconds to keep statuses fresh
  refreshTimer = setInterval(async () => {
    if (currentPage === 'dashboard') {
      await updateDashboardData();
    } else if (currentPage === 'devices') {
      await updateDevicesData();
    }
  }, 10000);
}

async function updateDashboardData() {
  try {
    const data = await api('/api/dashboard');
    // Update stats
    const cards = document.querySelectorAll('.stat-value');
    if (cards.length >= 4) {
      cards[0].textContent = data.total;
      cards[1].textContent = data.up;
      cards[2].textContent = data.down;
      cards[3].textContent = data.unknown;
    }
    
    // Update grid
    const grid = document.getElementById('dashDeviceGrid');
    if (!grid) return;
    
    // Instead of full clear, we could update individual cards, 
    // but for simplicity and to handle additions/removals, we re-render grid content 
    // only if data changed or periodically.
    renderDashboardGrid(data.devices);
    
    // Update alarms if present
    const alarmDiv = document.getElementById('dashAlarms');
    if (alarmDiv && data.recentAlarms.length) {
      alarmDiv.innerHTML = '';
      data.recentAlarms.slice(0, 5).forEach(a => alarmDiv.innerHTML += renderAlarmItem(a));
    }
  } catch(e) { console.error('Refresh error:', e); }
}

async function updateDevicesData() {
  try {
    const devices = await api('/api/devices');
    const tbody = document.getElementById('deviceTableBody');
    if (!tbody) return;
    
    // Save current search value
    const q = document.getElementById('deviceSearch')?.value.toLowerCase() || '';
    
    tbody.innerHTML = '';
    if (!devices.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No devices yet</p></td></tr>'; return; }
    
    devices.forEach(d => {
      const status = getDeviceStatus(d);
      const ms = d.last_ping_ms !== null ? d.last_ping_ms + ' ms' : '—';
      const tr = document.createElement('tr');
      tr.dataset.search = (d.name+d.ip_address+d.location+d.group_name).toLowerCase();
      if (q && !tr.dataset.search.includes(q)) tr.style.display = 'none';
      
      tr.innerHTML = `
        <td><span class="status-badge ${status}"><span class="device-status-dot ${status}"></span>${status.toUpperCase()}</span></td>
        <td><strong>${esc(d.name)}</strong></td><td style="font-family:monospace">${esc(d.ip_address)}</td>
        <td>${esc(d.location||'—')}</td><td>${esc(d.group_name)}</td><td>${ms}</td>
        <td><div class="device-actions">
          <button title="Ping" onclick="manualPing(${d.id})"><i class="ri-radar-line"></i></button>
          <button title="${d.is_muted ? 'Unmute' : 'Mute'}" onclick="toggleMute(${d.id}, ${d.is_muted})"><i class="ri-volume-${d.is_muted ? 'up' : 'mute'}-line"></i></button>
          <button title="Edit" onclick="openDeviceForm(${d.id})"><i class="ri-edit-line"></i></button>
          <button title="Delete" onclick="deleteDevice(${d.id},'${esc(d.name)}')"><i class="ri-delete-bin-line" style="color:var(--danger)"></i></button>
        </div></td>`;
      tbody.appendChild(tr);
    });
  } catch(e) {}
}

// ============ ALARM POLLING ============
async function pollAlarms() {
  try {
    // 1. Update Badge Count (Historical unread alarms)
    const alarmData = await api('/api/alarms?limit=20&unread_only=true');
    const count = alarmData.unread_count || 0;
    ['alarmBadge','alarmBadgeTop'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = count; el.style.display = count > 0 ? '' : 'none'; }
    });
    
    // 2. Siren Logic (Current real-time status)
    // We check if ANY active, non-muted device is currently 'down'
    const dashboardData = await api('/api/dashboard');
    const hasActiveDown = dashboardData.devices.some(d => d.status === 'down' && d.is_active === 1 && d.is_muted === 0);
    
    if (hasActiveDown && settings.alarm_sound === '1') {
      startSiren();
    } else {
      stopSiren();
    }
  } catch(e) { console.error('Poll error:', e); }
  setTimeout(pollAlarms, 10000);
}

// ============ TOAST ============
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="ri-${type==='success'?'check':'error'?'error-warning':type==='info'?'information':''}-line"></i>${msg}`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ============ MODAL ============
function openModal(title, html) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalOverlay').style.display = 'flex';
}
function closeModal() { document.getElementById('modalOverlay').style.display = 'none'; }

// ============ UTILITIES ============
function getDeviceStatus(d) {
  if (d.status === 'down') return 'down';
  const thresh = parseInt(settings.latency_threshold) || 200;
  if (d.status === 'up' && d.last_ping_ms > thresh) return 'warning';
  return d.status;
}

// ============ DASHBOARD PAGE ============
async function renderDashboard(container) {
  const data = await api('/api/dashboard');
  container.innerHTML = `
    <div class="page-header"><h2><i class="ri-dashboard-3-line"></i> Dashboard Monitor</h2><p>Real-time network monitoring overview</p></div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon blue"><i class="ri-server-line"></i></div><div class="stat-value">${data.total}</div><div class="stat-label">Total Devices</div></div>
      <div class="stat-card up"><div class="stat-icon green"><i class="ri-wifi-line"></i></div><div class="stat-value">${data.up}</div><div class="stat-label">Online</div></div>
      <div class="stat-card down"><div class="stat-icon red"><i class="ri-wifi-off-line"></i></div><div class="stat-value">${data.down}</div><div class="stat-label">Offline</div></div>
      <div class="stat-card warning"><div class="stat-icon yellow"><i class="ri-question-line"></i></div><div class="stat-value">${data.unknown}</div><div class="stat-label">Unknown</div></div>
    </div>
    <div class="device-grid" id="dashDeviceGrid"></div>
    ${data.recentAlarms.length ? `<div style="margin-top:24px"><h3 style="margin-bottom:12px"><i class="ri-alarm-warning-line"></i> Recent Alarms</h3><div id="dashAlarms"></div></div>` : ''}
  `;
  renderDashboardGrid(data.devices);
}

function renderDashboardGrid(devices) {
  const grid = document.getElementById('dashDeviceGrid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!devices.length) { grid.innerHTML = '<div class="empty-state"><i class="ri-server-line"></i><p>No devices added yet. Go to Devices to add one.</p></div>'; return; }
  
  devices.forEach(d => {
    const status = getDeviceStatus(d);
    const ms = d.last_ping_ms !== null ? d.last_ping_ms + ' ms' : '—';
    const lastCheck = d.last_check ? timeAgo(d.last_check) : 'Never';
    const card = document.createElement('div');
    card.className = `device-card ${d.is_muted ? 'muted' : ''}`;
    card.onclick = () => { navigateTo('reports'); setTimeout(()=>showDeviceReport(d.id), 100); };
    
    card.innerHTML = `
        <div class="device-card-header">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="device-status-dot ${status}"></div>
            <div>
              <div class="device-name">${esc(d.name)} ${d.is_muted ? '<i class="ri-volume-mute-fill" style="color:var(--text-muted);font-size:0.9rem"></i>' : ''}</div>
              <div class="device-ip">${esc(d.ip_address)}</div>
            </div>
          </div>
          <div class="device-ping-value ${status}">${ms}</div>
        </div>
        <div class="device-meta">
          <span><i class="ri-map-pin-line"></i> ${esc(d.location || '—')}</span>
          <span><i class="ri-time-line"></i> ${lastCheck}</span>
        </div>
        <div style="margin-top:12px; display:flex; justify-content:flex-end;">
          <button class="btn btn-secondary btn-sm btn-icon mute-btn-toggle" title="${d.is_muted ? 'Unmute Alarm' : 'Mute Alarm'}">
            <i class="ri-volume-${d.is_muted ? 'up' : 'mute'}-line"></i>
          </button>
        </div>`;
        
    const muteBtn = card.querySelector('.mute-btn-toggle');
    muteBtn.onclick = (e) => {
      e.stopPropagation();
      toggleMute(d.id, d.is_muted);
    };
    
    grid.appendChild(card);
  });
}

// ============ DEVICES PAGE ============
async function renderDevices(container) {
  const devices = await api('/api/devices');
  container.innerHTML = `
    <div class="page-header"><h2><i class="ri-server-line"></i> Devices</h2><p>Manage monitored network devices</p></div>
    <div class="toolbar"><div class="toolbar-left"><input type="text" class="search-input" id="deviceSearch" placeholder="Search devices..." oninput="filterDevices()"></div>
    <div class="toolbar-right"><button class="btn btn-primary" onclick="openDeviceForm()"><i class="ri-add-line"></i> Add Device</button></div></div>
    <div class="table-wrapper"><table><thead><tr><th>Status</th><th>Name</th><th>IP Address</th><th>Location</th><th>Group</th><th>Last Ping</th><th>Actions</th></tr></thead><tbody id="deviceTableBody"></tbody></table></div>`;
  const tbody = document.getElementById('deviceTableBody');
  if (!devices.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="ri-server-line"></i><p>No devices yet</p></td></tr>'; return; }
  devices.forEach(d => {
    const status = getDeviceStatus(d);
    const ms = d.last_ping_ms !== null ? d.last_ping_ms + ' ms' : '—';
    const tr = document.createElement('tr');
    tr.dataset.search = (d.name+d.ip_address+d.location+d.group_name).toLowerCase();
    tr.innerHTML = `
      <td><span class="status-badge ${status}"><span class="device-status-dot ${status}"></span>${status.toUpperCase()}</span></td>
      <td><strong>${esc(d.name)}</strong></td><td style="font-family:monospace">${esc(d.ip_address)}</td>
      <td>${esc(d.location||'—')}</td><td>${esc(d.group_name)}</td><td>${ms}</td>
      <td><div class="device-actions">
        <button title="Ping" class="btn-ping"><i class="ri-radar-line"></i></button>
        <button title="${d.is_muted ? 'Unmute' : 'Mute'}" class="btn-mute"><i class="ri-volume-${d.is_muted ? 'up' : 'mute'}-line"></i></button>
        <button title="Edit" class="btn-edit"><i class="ri-edit-line"></i></button>
        <button title="Delete" class="btn-delete"><i class="ri-delete-bin-line" style="color:var(--danger)"></i></button>
      </div></td>`;
    
    tr.querySelector('.btn-ping').onclick = () => manualPing(d.id);
    tr.querySelector('.btn-mute').onclick = () => toggleMute(d.id, d.is_muted);
    tr.querySelector('.btn-edit').onclick = () => openDeviceForm(d.id);
    tr.querySelector('.btn-delete').onclick = () => deleteDevice(d.id, d.name);
    
    tbody.appendChild(tr);
  });
}

function filterDevices() {
  const q = document.getElementById('deviceSearch').value.toLowerCase();
  document.querySelectorAll('#deviceTableBody tr').forEach(tr => {
    tr.style.display = (tr.dataset.search || '').includes(q) ? '' : 'none';
  });
}

function openDeviceForm(id) {
  const isEdit = !!id;
  const title = isEdit ? 'Edit Device' : 'Add New Device';
  openModal(title, `
    <form id="deviceForm" onsubmit="saveDevice(event, ${id||'null'})">
      <div class="form-row">
        <div class="form-group"><label>Device Name *</label><input id="df_name" required placeholder="e.g. Router Utama"></div>
        <div class="form-group"><label>IP Address *</label><input id="df_ip" required placeholder="e.g. 192.168.1.1"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Location</label><input id="df_loc" placeholder="e.g. Ruang Server"></div>
        <div class="form-group"><label>Group</label><input id="df_group" placeholder="e.g. Core Network" value="Default"></div>
      </div>
      <div class="form-group"><label>Description</label><textarea id="df_desc" placeholder="Optional description"></textarea></div>
      ${isEdit ? '<div class="form-group"><label>Active</label><select id="df_active"><option value="1">Active</option><option value="0">Inactive</option></select></div>' : ''}
      <div class="form-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Add Device'}</button></div>
    </form>`);
  if (isEdit) {
    api(`/api/devices/${id}`).then(d => {
      document.getElementById('df_name').value = d.name;
      document.getElementById('df_ip').value = d.ip_address;
      document.getElementById('df_loc').value = d.location || '';
      document.getElementById('df_group').value = d.group_name || 'Default';
      document.getElementById('df_desc').value = d.description || '';
      if (document.getElementById('df_active')) document.getElementById('df_active').value = d.is_active;
    });
  }
}

async function saveDevice(e, id) {
  e.preventDefault();
  const body = JSON.stringify({
    name: document.getElementById('df_name').value,
    ip_address: document.getElementById('df_ip').value,
    location: document.getElementById('df_loc').value,
    group_name: document.getElementById('df_group').value,
    description: document.getElementById('df_desc').value,
    is_active: document.getElementById('df_active')?.value ?? 1
  });
  await api(id ? `/api/devices/${id}` : '/api/devices', { method: id ? 'PUT' : 'POST', body });
  closeModal(); toast(id ? 'Device updated!' : 'Device added!', 'success'); navigateTo('devices');
}

async function deleteDevice(id, name) {
  if (!confirm(`Delete device "${name}"?`)) return;
  await api(`/api/devices/${id}`, { method: 'DELETE' });
  toast('Device deleted', 'success'); navigateTo('devices');
}

async function manualPing(id) {
  toast('Pinging...', 'info');
  const res = await api(`/api/ping/${id}`, { method: 'POST' });
  toast(res.alive ? `Online: ${res.time}ms` : 'Device is OFFLINE!', res.alive ? 'success' : 'error');
  if (currentPage === 'devices') navigateTo('devices');
  else if (currentPage === 'dashboard') updateDashboardData();
}

async function toggleMute(id, currentMute) {
  const nextMute = currentMute ? 0 : 1;
  await api(`/api/devices/${id}/mute`, { method: 'PUT', body: JSON.stringify({ is_muted: nextMute }) });
  toast(nextMute ? 'Device muted' : 'Device unmuted', 'info');
  if (currentPage === 'dashboard') updateDashboardData();
  else if (currentPage === 'devices') navigateTo('devices');
}

// ============ REPORTS PAGE ============
async function renderReports(container) {
  const devices = await api('/api/devices');
  container.innerHTML = `
    <div class="page-header"><h2><i class="ri-bar-chart-box-line"></i> Uptime Reports</h2><p>View uptime statistics and response graphs</p></div>
    <div class="toolbar"><div class="toolbar-left">
      <select id="reportHours" onchange="refreshReports()" style="width:180px"><option value="1">Last 1 Hour</option><option value="6">Last 6 Hours</option><option value="24" selected>Last 24 Hours</option><option value="168">Last 7 Days</option><option value="720">Last 30 Days</option></select>
    </div><div class="toolbar-right"><a class="btn btn-secondary btn-sm" id="exportCsvBtn" href="/api/reports/export?hours=24" target="_blank"><i class="ri-download-line"></i> Export CSV</a></div></div>
    <div id="reportsList"></div>`;
  if (!devices.length) { document.getElementById('reportsList').innerHTML = '<div class="empty-state"><i class="ri-bar-chart-box-line"></i><p>No devices to report on</p></div>'; return; }
  await refreshReports();
}

async function refreshReports() {
  const hours = document.getElementById('reportHours')?.value || 24;
  document.getElementById('exportCsvBtn').href = `/api/reports/export?hours=${hours}`;
  const devices = await api('/api/devices');
  const list = document.getElementById('reportsList');
  list.innerHTML = '';
  // Destroy old charts
  Object.values(charts).forEach(c => c.destroy()); charts = {};

  for (const d of devices) {
    const uptime = await api(`/api/devices/${d.id}/uptime?hours=${hours}`);
    const pct = uptime.uptime_percent || 0;
    const color = pct >= 99 ? 'var(--success)' : pct >= 95 ? 'var(--warning)' : 'var(--danger)';
    list.innerHTML += `
      <div class="card report-device-card">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="device-status-dot ${d.status}"></div>
            <div><strong>${esc(d.name)}</strong><div style="font-size:0.85rem;color:var(--text-secondary)">${esc(d.ip_address)} — ${esc(d.location||'')}</div></div>
          </div>
          <div style="display:flex;gap:20px;font-size:0.85rem;color:var(--text-secondary)">
            <span>Avg: <strong>${uptime.avg_response ? uptime.avg_response.toFixed(1) + 'ms' : '—'}</strong></span>
            <span>Min: <strong>${uptime.min_response ? uptime.min_response.toFixed(1) + 'ms' : '—'}</strong></span>
            <span>Max: <strong>${uptime.max_response ? uptime.max_response.toFixed(1) + 'ms' : '—'}</strong></span>
            <span>Checks: <strong>${uptime.total_checks}</strong></span>
          </div>
        </div>
        <div class="uptime-bar-container">
          <span style="font-size:0.85rem;color:var(--text-secondary)">Uptime</span>
          <div class="uptime-bar"><div class="uptime-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <div class="uptime-percent" style="color:${color}">${pct}%</div>
        </div>
        <div class="chart-container"><canvas id="chart_${d.id}"></canvas></div>
      </div>`;
  }

  // Render charts
  for (const d of devices) {
    const graphData = await api(`/api/devices/${d.id}/graph?hours=${hours}`);
    if (!graphData.length) continue;
    const ctx = document.getElementById(`chart_${d.id}`);
    if (!ctx) continue;
    charts[d.id] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: graphData.map(p => new Date(p.timestamp).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'})),
        datasets: [{
          label: 'Response Time (ms)',
          data: graphData.map(p => p.is_alive ? p.response_time : null),
          borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2
        },{
          label: 'Down',
          data: graphData.map(p => p.is_alive ? null : 0),
          borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.3)',
          pointRadius: 4, pointBackgroundColor: '#ef4444', showLine: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#64748b', maxTicksLimit: 12, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { beginAtZero: true, ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'ms', color: '#64748b' } }
        }
      }
    });
  }
}

window.showDeviceReport = function(id) {
  // Scroll to the specific device report
  const el = document.getElementById(`chart_${id}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ============ ALARMS PAGE ============
async function renderAlarms(container) {
  const data = await api('/api/alarms?limit=100');
  container.innerHTML = `
    <div class="page-header"><h2><i class="ri-alarm-warning-line"></i> Alarm Log</h2><p>Device status change notifications</p></div>
    <div class="toolbar"><div class="toolbar-left"><span style="color:var(--text-secondary)">${data.unread_count} unread alarm(s)</span></div>
    <div class="toolbar-right"><button class="btn btn-secondary btn-sm" onclick="markAllRead()"><i class="ri-check-double-line"></i> Mark All Read</button></div></div>
    <div id="alarmList"></div>`;
  const list = document.getElementById('alarmList');
  if (!data.alarms.length) { list.innerHTML = '<div class="empty-state"><i class="ri-alarm-warning-line"></i><p>No alarms yet</p></div>'; return; }
  data.alarms.forEach(a => list.innerHTML += renderAlarmItem(a));
}

function renderAlarmItem(a) {
  const isDown = a.type === 'down';
  const isWarn = a.type === 'warning';
  const icon = isDown ? 'error-warning' : isWarn ? 'alert' : 'checkbox-circle';
  const colorClass = isDown ? 'down' : isWarn ? 'warning' : 'up';
  
  return `<div class="alarm-item ${a.is_read ? '' : 'unread'} ${colorClass}-alarm" onclick="markRead(${a.id})">
    <div class="alarm-icon ${colorClass}"><i class="ri-${icon}-fill"></i></div>
    <div><div class="alarm-message">${esc(a.message)}</div>
    <div class="alarm-time">${a.device_name || ''} • ${formatDate(a.created_at)}</div></div></div>`;
}

async function markRead(id) { await api(`/api/alarms/${id}/read`, { method: 'PUT' }); if (currentPage === 'alarms') navigateTo('alarms'); }
async function markAllRead() { await api('/api/alarms/read-all', { method: 'PUT' }); toast('All marked as read', 'success'); navigateTo('alarms'); }

// ============ SETTINGS PAGE ============
async function renderSettings(container) {
  const s = await api('/api/settings');
  container.innerHTML = `
    <div class="page-header"><h2><i class="ri-settings-3-line"></i> Settings</h2><p>Configure application and company information</p></div>
    <form id="settingsForm" onsubmit="saveSettings(event)">
      <div class="card settings-section">
        <h3><i class="ri-apps-line"></i> Application</h3>
        <div class="form-row">
          <div class="form-group"><label>App Name</label><input id="s_app_name" value="${esc(s.app_name || '')}"></div>
          <div class="form-group"><label>Ping Interval (seconds)</label><input type="number" id="s_ping_interval" value="${s.ping_interval || 30}" min="5" max="3600"></div>
          <div class="form-group"><label>Latency Threshold (ms)</label><input type="number" id="s_latency_threshold" value="${s.latency_threshold || 200}" min="10" max="5000"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Alarm Sound Control</label><select id="s_alarm_sound"><option value="1" ${s.alarm_sound==='1'?'selected':''}>Enabled</option><option value="0" ${s.alarm_sound==='0'?'selected':''}>Disabled</option></select></div>
          <div class="form-group"><label>Custom Alarm Sound (.wav)</label>
            <div style="display:flex;gap:8px">
              <input type="file" id="alarmFile" accept=".wav" style="font-size:0.85rem">
              <button type="button" class="btn btn-secondary btn-sm" onclick="uploadAlarmSound()"><i class="ri-upload-2-line"></i> Upload</button>
              <button type="button" class="btn btn-info btn-sm" onclick="testAlarm()"><i class="ri-play-line"></i> Test</button>
            </div>
            ${s.alarm_file_path ? `<p style="font-size:0.75rem;color:var(--success);margin-top:4px">Custom sound active: ${s.alarm_file_path.split('/').pop()}</p>` : '<p style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">Using default siren sound</p>'}
          </div>
        </div>
        <div class="form-group"><label>Logo</label>
          <div class="logo-preview" id="logoPreview">${s.logo_path ? `<img src="${s.logo_path}">` : '<i class="ri-image-add-line" style="font-size:1.5rem;color:var(--text-muted)"></i>'}</div>
          <input type="file" id="logoFile" accept="image/*" onchange="uploadLogo()" style="font-size:0.85rem">
        </div>
      </div>
      <div class="card settings-section">
        <h3><i class="ri-building-line"></i> Company Information</h3>
        <div class="form-row">
          <div class="form-group"><label>Company Name</label><input id="s_company_name" value="${esc(s.company_name || '')}"></div>
          <div class="form-group"><label>Phone</label><input id="s_company_phone" value="${esc(s.company_phone || '')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Email</label><input id="s_company_email" value="${esc(s.company_email || '')}"></div>
          <div class="form-group"><label>Address</label><input id="s_company_address" value="${esc(s.company_address || '')}"></div>
        </div>
      </div>
      <div class="card settings-section">
        <h3><i class="ri-database-2-line"></i> Data Management</h3>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <a href="/api/backup" class="btn btn-secondary"><i class="ri-download-cloud-line"></i> Download Backup (.db)</a>
          <div style="flex:1;min-width:200px">
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:4px">Restore from Backup File</label>
            <div style="display:flex;gap:8px">
              <input type="file" id="restoreFile" accept=".db" style="font-size:0.85rem;padding:6px">
              <button type="button" class="btn btn-danger btn-sm" onclick="restoreBackup()"><i class="ri-upload-cloud-line"></i> Restore</button>
            </div>
          </div>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:10px"><i class="ri-information-line"></i> Restoring will overwrite all current data, settings, and logs.</p>
      </div>
      <div class="form-actions"><button type="submit" class="btn btn-primary"><i class="ri-save-line"></i> Save Settings</button></div>
    </form>`;
}

async function restoreBackup() {
  const file = document.getElementById('restoreFile').files[0];
  if (!file) return toast('Please select a .db file first', 'error');
  if (!confirm('Are you sure? This will replace all current data and settings!')) return;
  
  toast('Restoring...', 'info');
  const fd = new FormData(); fd.append('db', file);
  const res = await fetch('/api/restore', { method: 'POST', body: fd }).then(r => r.json());
  
  if (res.success) {
    toast('Restore successful! Reloading...', 'success');
    setTimeout(() => location.reload(), 2000);
  } else {
    toast('Restore failed: ' + res.error, 'error');
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const body = {
    app_name: document.getElementById('s_app_name').value,
    ping_interval: document.getElementById('s_ping_interval').value,
    latency_threshold: document.getElementById('s_latency_threshold').value,
    alarm_sound: document.getElementById('s_alarm_sound').value,
    max_log_days: document.getElementById('s_max_log_days').value,
    company_name: document.getElementById('s_company_name').value,
    company_phone: document.getElementById('s_company_phone').value,
    company_email: document.getElementById('s_company_email').value,
    company_address: document.getElementById('s_company_address').value
  };
  await api('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
  await api('/api/settings/restart-ping', { method: 'POST' });
  await loadSettings();
  toast('Settings saved!', 'success');
  startAutoRefresh();
}

async function uploadAlarmSound() {
  const fileInput = document.getElementById('alarmFile');
  const file = fileInput.files[0];
  if (!file) return toast('Select a .wav file first', 'error');
  
  toast('Uploading sound...', 'info');
  const fd = new FormData(); fd.append('alarm', file);
  
  try {
    const res = await fetch('/api/settings/alarm-file', { method: 'POST', body: fd }).then(r => r.json());
    if (res.success) { 
      await loadSettings(); 
      navigateTo('settings'); 
      toast('Alarm sound uploaded successfully!', 'success'); 
    } else {
      toast('Upload failed: ' + (res.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    toast('Upload error: ' + e.message, 'error');
  }
}

function testAlarm() {
  toast('Testing alarm sound...', 'info');
  startSiren();
  setTimeout(stopSiren, 3000);
}
async function uploadLogo() {
  const file = document.getElementById('logoFile').files[0];
  if (!file) return;
  const fd = new FormData(); fd.append('logo', file);
  const res = await fetch('/api/settings/logo', { method: 'POST', body: fd }).then(r => r.json());
  if (res.success) { await loadSettings(); document.getElementById('logoPreview').innerHTML = `<img src="${res.logo_path}">`; toast('Logo uploaded!', 'success'); }
}

// ============ UTILITIES ============
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function formatDate(s) { if (!s) return '—'; return new Date(s).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' }); }
function timeAgo(s) {
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return Math.floor(diff) + 's ago';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return Math.floor(diff/86400) + 'd ago';
}
