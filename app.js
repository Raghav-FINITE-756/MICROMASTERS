/* ============================================================
   MicroMaster – app.js
   Simulated IoT Data Engine + Dashboard Logic
   ============================================================ */

'use strict';

// ─── Sensor Definitions ──────────────────────────────────────
const SENSORS = [
  { id: 'MM-001', name: 'Upstream Entry',    lat: 0.15, lng: 0.12, zone: 'Zone A', type: 'Surface' },
  { id: 'MM-002', name: 'River Bend N',      lat: 0.25, lng: 0.30, zone: 'Zone A', type: 'Mid-depth' },
  { id: 'MM-003', name: 'Industrial Outlet', lat: 0.55, lng: 0.22, zone: 'Zone B', type: 'Surface' },
  { id: 'MM-004', name: 'Bridge Station',    lat: 0.45, lng: 0.48, zone: 'Zone B', type: 'Benthic' },
  { id: 'MM-005', name: 'South Bank',        lat: 0.75, lng: 0.35, zone: 'Zone C', type: 'Surface' },
  { id: 'MM-006', name: 'Estuary Mouth',     lat: 0.62, lng: 0.60, zone: 'Zone C', type: 'Mid-depth' },
  { id: 'MM-007', name: 'Wetland Node',      lat: 0.30, lng: 0.72, zone: 'Zone D', type: 'Surface' },
  { id: 'MM-008', name: 'Deep Channel',      lat: 0.50, lng: 0.80, zone: 'Zone D', type: 'Benthic' },
  { id: 'MM-009', name: 'Tributary Inflow',  lat: 0.20, lng: 0.55, zone: 'Zone A', type: 'Surface' },
  { id: 'MM-010', name: 'Main Reservoir',    lat: 0.80, lng: 0.18, zone: 'Zone E', type: 'Surface' },
  { id: 'MM-011', name: 'Downstream Weir',   lat: 0.70, lng: 0.58, zone: 'Zone E', type: 'Mid-depth' },
  { id: 'MM-012', name: 'Urban Runoff',      lat: 0.40, lng: 0.15, zone: 'Zone B', type: 'Surface' },
];

// ─── Thresholds ───────────────────────────────────────────────
const THRESHOLDS = {
  concentration: { safe: 30, warn: 50, unit: 'PPB' },
  ph:            { min: 6.5, max: 8.5 },
  turbidity:     { safe: 10, warn: 25,  unit: 'NTU' },
  temperature:   { min: 5, max: 32 },
  particles:     { safe: 200, warn: 450 },
};

// ─── State ────────────────────────────────────────────────────
let sensorReadings = {};
let liveHistory   = [];   // last 30 avg concentration readings
let alertsArr     = [];
let readingCount  = 0;
let notifCount    = 3;
let liveChart     = null;
let barChart      = null;

// ─── Utility: rand between min and max ───────────────────────
function rand(min, max, decimals = 1) {
  const v = Math.random() * (max - min) + min;
  return parseFloat(v.toFixed(decimals));
}

// ─── Generate a reading for a sensor ─────────────────────────
function generateReading(sensor) {
  const prev = sensorReadings[sensor.id];
  // Walk previous value for smooth simulation
  const walk = (v, min, max, step) => {
    const delta = (Math.random() - 0.5) * 2 * step;
    return Math.min(max, Math.max(min, parseFloat((v + delta).toFixed(2))));
  };

  if (!prev) {
    // Seed: industrial zones get higher base
    const isIndustrial = ['MM-003', 'MM-012'].includes(sensor.id);
    return {
      concentration: rand(isIndustrial ? 35 : 10, isIndustrial ? 65 : 38),
      ph:            rand(6.5, 8.5, 2),
      turbidity:     rand(2, isIndustrial ? 30 : 14, 2),
      temperature:   rand(14, 28, 2),
      particles:     rand(80, isIndustrial ? 500 : 280),
      battery:       rand(55, 100),
      status:        Math.random() > 0.1 ? 'online' : (Math.random() > 0.5 ? 'warning' : 'offline'),
    };
  }

  const newStatus = Math.random() > 0.98
    ? (prev.status === 'online' ? 'warning' : 'online')
    : prev.status;

  return {
    concentration: walk(prev.concentration, 5, 90, 3),
    ph:            walk(prev.ph, 5.5, 9.5, 0.1),
    turbidity:     walk(prev.turbidity, 1, 45, 1.5),
    temperature:   walk(prev.temperature, 10, 35, 0.3),
    particles:     Math.max(10, Math.round(walk(prev.particles, 10, 600, 15))),
    battery:       Math.max(5, parseFloat((prev.battery - rand(0, 0.1, 2)).toFixed(1))),
    status:        newStatus,
  };
}

// ─── Update all sensor readings ────────────────────────────────
function updateReadings() {
  SENSORS.forEach(s => {
    sensorReadings[s.id] = generateReading(s);
  });
  checkAlerts();
}

// ─── Compute average concentration ────────────────────────────
function avgConcentration() {
  const vals = SENSORS.map(s => sensorReadings[s.id]?.concentration ?? 0);
  return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
}
function avgValue(key) {
  const vals = SENSORS.map(s => sensorReadings[s.id]?.[key] ?? 0);
  return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
}

// ─── Update KPI Cards ─────────────────────────────────────────
function updateKPIs() {
  const conc  = avgConcentration();
  const ph    = avgValue('ph');
  const turb  = avgValue('turbidity');
  const temp  = avgValue('temperature');
  const parts = Math.round(avgValue('particles'));

  const el = id => document.getElementById(id);

  // Concentration
  const prevConc = parseFloat(el('kpi-conc').textContent) || conc;
  el('kpi-conc').textContent = conc.toFixed(1);
  const concDelta = (conc - prevConc).toFixed(1);
  el('kpi-conc-chg').textContent = (concDelta >= 0 ? '⬆ +' : '⬇ ') + concDelta + ' from last reading';
  el('kpi-conc-chg').className = 'kpi-change ' + (conc > THRESHOLDS.concentration.warn ? 'up' : conc > THRESHOLDS.concentration.safe ? 'ok' : 'down');

  // pH
  el('kpi-ph').textContent = ph.toFixed(2);
  const phOk = ph >= THRESHOLDS.ph.min && ph <= THRESHOLDS.ph.max;
  el('kpi-ph-chg').textContent = phOk ? '✓ Within safe range (6.5–8.5)' : '⚠ Outside safe range!';
  el('kpi-ph-chg').className = 'kpi-change ' + (phOk ? 'down' : 'up');

  // Turbidity
  el('kpi-turb').textContent = turb.toFixed(1);
  el('kpi-turb-chg').textContent = (turb > THRESHOLDS.turbidity.warn ? '⬆ High turbidity' : turb > THRESHOLDS.turbidity.safe ? '~ Moderate' : '✓ Clear');
  el('kpi-turb-chg').className = 'kpi-change ' + (turb > THRESHOLDS.turbidity.warn ? 'up' : turb > THRESHOLDS.turbidity.safe ? 'ok' : 'down');

  // Temperature
  el('kpi-temp').textContent = temp.toFixed(1);
  const tempOk = temp >= THRESHOLDS.temperature.min && temp <= THRESHOLDS.temperature.max;
  el('kpi-temp-chg').textContent = tempOk ? '✓ Normal range' : '⚠ Temperature concern';
  el('kpi-temp-chg').className = 'kpi-change ' + (tempOk ? 'down' : 'up');

  // Particles
  el('kpi-particles').textContent = parts.toLocaleString();
  el('kpi-particles-chg').textContent = (parts > THRESHOLDS.particles.warn ? '⬆ High particle load' : parts > THRESHOLDS.particles.safe ? '~ Moderate' : '✓ Within limits');
  el('kpi-particles-chg').className = 'kpi-change ' + (parts > THRESHOLDS.particles.warn ? 'up' : parts > THRESHOLDS.particles.safe ? 'ok' : 'down');

  // Last updated
  const now = new Date();
  document.getElementById('last-updated').textContent = 'Updated ' + now.toLocaleTimeString();
}

// ─── Update Gauges ────────────────────────────────────────────
const GAUGES = [
  { key: 'concentration', label: 'Microplastics', max: 100, unit: 'PPB', color: 'var(--accent-cyan)' },
  { key: 'ph',            label: 'pH Level',      max: 14,  unit: '',    color: 'var(--accent-teal)', normalize: v => (v / 14) * 100 },
  { key: 'turbidity',     label: 'Turbidity',     max: 50,  unit: 'NTU', color: 'var(--accent-orange)' },
  { key: 'temperature',   label: 'Temperature',   max: 40,  unit: '°C',  color: 'var(--accent-purple)' },
  { key: 'particles',     label: 'Particles /L',  max: 600, unit: '/L',  color: 'var(--accent-red)' },
];

function renderGauges() {
  const grid = document.getElementById('gauge-grid');
  if (!grid) return;

  if (!grid.hasChildNodes()) {
    grid.innerHTML = GAUGES.map((g, i) =>
      `<div class="gauge-card" id="gauge-${i}">
        <div class="gauge-header">
          <span class="gauge-name">${g.label}</span>
          <span class="gauge-val" id="gauge-val-${i}">--</span>
        </div>
        <div class="gauge-bar">
          <div class="gauge-fill" id="gauge-fill-${i}" style="width:0%; background:${g.color}; transition:width 0.8s ease;"></div>
        </div>
      </div>`
    ).join('');
  }

  GAUGES.forEach((g, i) => {
    const val = avgValue(g.key);
    const pct = g.normalize ? g.normalize(val) : Math.min(100, (val / g.max) * 100);
    document.getElementById(`gauge-val-${i}`).textContent = (g.key === 'ph' ? val.toFixed(2) : val.toFixed(1)) + ' ' + g.unit;
    document.getElementById(`gauge-fill-${i}`).style.width = pct.toFixed(1) + '%';
  });
}

// ─── Live Chart ───────────────────────────────────────────────
function initLiveChart() {
  const ctx = document.getElementById('liveChart').getContext('2d');

  const labels = Array.from({length: 30}, (_, i) => i + 1);
  const data   = Array.from({length: 30}, () => rand(15, 45));
  liveHistory  = [...data];

  liveChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Avg Concentration (PPB)',
        data,
        borderColor: 'rgba(0,229,255,0.9)',
        backgroundColor: 'rgba(0,229,255,0.06)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHitRadius: 20,
      }, {
        label: 'Safe Threshold (30 PPB)',
        data: Array(30).fill(30),
        borderColor: 'rgba(0,230,118,0.5)',
        borderWidth: 1.5,
        borderDash: [6, 4],
        fill: false,
        pointRadius: 0,
      }, {
        label: 'WHO Threshold (50 PPB)',
        data: Array(30).fill(50),
        borderColor: 'rgba(255,145,0,0.5)',
        borderWidth: 1.5,
        borderDash: [6, 4],
        fill: false,
        pointRadius: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: {
            color: '#7fa8c9',
            font: { size: 11, family: 'Inter' },
            boxWidth: 16,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(4,13,26,0.95)',
          borderColor: 'rgba(0,229,255,0.2)',
          borderWidth: 1,
          titleColor: '#e8f4fd',
          bodyColor:  '#7fa8c9',
        }
      },
      scales: {
        x: {
          grid:  { color: 'rgba(0,229,255,0.04)' },
          ticks: { color: '#3d6080', font: { size: 10 } },
          border:{ color: 'transparent' },
        },
        y: {
          min: 0, max: 100,
          grid:  { color: 'rgba(0,229,255,0.06)' },
          ticks: { color: '#3d6080', font: { size: 10 } },
          border:{ color: 'transparent' },
        }
      }
    }
  });
}

// ─── Update Live Chart ────────────────────────────────────────
function updateLiveChart() {
  if (!liveChart) return;
  const latest = avgConcentration();
  liveHistory.push(latest);
  if (liveHistory.length > 30) liveHistory.shift();
  liveChart.data.datasets[0].data = [...liveHistory];
  liveChart.update('none');
}

// ─── Bar Chart ────────────────────────────────────────────────
function initBarChart() {
  const ctx = document.getElementById('barChart').getContext('2d');
  const labels = SENSORS.map(s => s.id);
  const data   = SENSORS.map(s => rand(12, 65));

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '7-day Avg Concentration (PPB)',
        data,
        backgroundColor: labels.map((_, i) => {
          const v = data[i];
          if (v > 50) return 'rgba(255,23,68,0.7)';
          if (v > 30) return 'rgba(255,145,0,0.7)';
          return 'rgba(0,229,255,0.7)';
        }),
        borderColor: labels.map((_, i) => {
          const v = data[i];
          if (v > 50) return 'rgba(255,23,68,1)';
          if (v > 30) return 'rgba(255,145,0,1)';
          return 'rgba(0,229,255,1)';
        }),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800 },
      plugins: {
        legend: {
          labels: { color: '#7fa8c9', font: { size: 11, family: 'Inter' }, boxWidth: 14 }
        },
        tooltip: {
          backgroundColor: 'rgba(4,13,26,0.95)',
          borderColor: 'rgba(0,229,255,0.2)',
          borderWidth: 1,
          titleColor: '#e8f4fd',
          bodyColor:  '#7fa8c9',
        }
      },
      scales: {
        x: {
          grid:  { color: 'rgba(0,229,255,0.04)' },
          ticks: { color: '#3d6080', font: { size: 9 } },
          border:{ color: 'transparent' },
        },
        y: {
          min: 0, max: 80,
          grid:  { color: 'rgba(0,229,255,0.06)' },
          ticks: { color: '#3d6080', font: { size: 10 } },
          border:{ color: 'transparent' },
        }
      }
    }
  });
}

function refreshBarChart() {
  if (!barChart) return;
  const newData = SENSORS.map(() => rand(12, 65));
  barChart.data.datasets[0].data = newData;
  barChart.data.datasets[0].backgroundColor = newData.map(v =>
    v > 50 ? 'rgba(255,23,68,0.7)' : v > 30 ? 'rgba(255,145,0,0.7)' : 'rgba(0,229,255,0.7)');
  barChart.data.datasets[0].borderColor = newData.map(v =>
    v > 50 ? 'rgba(255,23,68,1)' : v > 30 ? 'rgba(255,145,0,1)' : 'rgba(0,229,255,1)');
  barChart.update();
}

// ─── Safety Meter ─────────────────────────────────────────────
function updateSafetyMeter() {
  const avg = avgConcentration();
  // Safety index: inverse of normalized concentration vs WHO threshold
  const raw  = Math.max(0, Math.min(100, 100 - (avg / 80) * 100));
  const pct  = Math.round(raw);

  document.getElementById('safety-pct').textContent = pct + '%';

  const statusEl = document.getElementById('safety-status');
  if (pct >= 75) {
    statusEl.textContent = '✅ Water Quality: SAFE';
    statusEl.style.color = 'var(--accent-green)';
  } else if (pct >= 50) {
    statusEl.textContent = '⚠️ Water Quality: MODERATE';
    statusEl.style.color = 'var(--accent-orange)';
  } else {
    statusEl.textContent = '🚨 Water Quality: HAZARDOUS';
    statusEl.style.color = 'var(--accent-red)';
  }

  // SVG ring: circumference of circle r=70 is ~440
  const fill = document.getElementById('safety-fill');
  const dashOffset = 440 - (440 * pct / 100);
  fill.style.strokeDashoffset = dashOffset.toFixed(1);

  // WHO / EPA bars
  const whoPct = Math.min(100, (avg / 50) * 100);
  const epaPct = Math.min(100, (avg / 30) * 100);
  document.getElementById('who-fill').style.width = whoPct.toFixed(0) + '%';
  document.getElementById('epa-fill').style.width = epaPct.toFixed(0) + '%';
  document.getElementById('who-val').textContent = avg <= 50 ? 'OK' : 'EXCEED';
  document.getElementById('epa-val').textContent = avg <= 30 ? 'OK' : 'EXCEED';
  document.getElementById('who-val').style.color = avg <= 50 ? 'var(--accent-green)' : 'var(--accent-red)';
  document.getElementById('epa-val').style.color  = avg <= 30 ? 'var(--accent-teal)' : 'var(--accent-orange)';
}

// ─── Alerts ───────────────────────────────────────────────────
const ALERT_MESSAGES = {
  concHigh:  (id, v) => ({ title: `High Concentration at ${id}`, desc: `${v} PPB detected — exceeds WHO threshold (50 PPB). Immediate investigation required.`, severity: 'critical' }),
  concMod:   (id, v) => ({ title: `Elevated Reading at ${id}`,   desc: `${v} PPB detected — above safe threshold (30 PPB). Monitor closely.`, severity: 'warning' }),
  turbHigh:  (id, v) => ({ title: `High Turbidity at ${id}`,     desc: `${v} NTU detected — reduced visibility may indicate particle intrusion.`, severity: 'warning' }),
  phAlert:   (id, v) => ({ title: `pH Anomaly at ${id}`,         desc: `pH ${v} outside normal range (6.5–8.5). May indicate chemical contamination.`, severity: 'warning' }),
  offline:   (id)    => ({ title: `Sensor Offline: ${id}`,       desc: `Node went offline. Check power supply and connectivity.`, severity: 'critical' }),
  particHigh:(id, v) => ({ title: `Particle Surge at ${id}`,     desc: `${v.toLocaleString()} particles/L — well above safe limit. Possible upstream discharge.`, severity: 'critical' }),
};

function checkAlerts() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString();
  const newAlerts = [];

  SENSORS.forEach(s => {
    const r = sensorReadings[s.id];
    if (!r) return;

    if (r.status === 'offline') {
      newAlerts.push({ ...ALERT_MESSAGES.offline(s.id), time: timeStr, id: s.id + '-offline-' + Date.now() });
    }
    if (r.concentration > THRESHOLDS.concentration.warn) {
      newAlerts.push({ ...ALERT_MESSAGES.concHigh(s.id, r.concentration.toFixed(1)), time: timeStr, id: s.id + '-conc-' + Date.now() });
    } else if (r.concentration > THRESHOLDS.concentration.safe && Math.random() > 0.7) {
      newAlerts.push({ ...ALERT_MESSAGES.concMod(s.id, r.concentration.toFixed(1)), time: timeStr, id: s.id + '-concmod-' + Date.now() });
    }
    if (r.turbidity > THRESHOLDS.turbidity.warn && Math.random() > 0.75) {
      newAlerts.push({ ...ALERT_MESSAGES.turbHigh(s.id, r.turbidity.toFixed(1)), time: timeStr, id: s.id + '-turb-' + Date.now() });
    }
    if ((r.ph < THRESHOLDS.ph.min || r.ph > THRESHOLDS.ph.max) && Math.random() > 0.65) {
      newAlerts.push({ ...ALERT_MESSAGES.phAlert(s.id, r.ph.toFixed(2)), time: timeStr, id: s.id + '-ph-' + Date.now() });
    }
    if (r.particles > THRESHOLDS.particles.warn && Math.random() > 0.75) {
      newAlerts.push({ ...ALERT_MESSAGES.particHigh(s.id, r.particles), time: timeStr, id: s.id + '-partic-' + Date.now() });
    }
  });

  if (newAlerts.length > 0) {
    alertsArr = [...newAlerts, ...alertsArr].slice(0, 30);
    renderAlerts();
    notifCount = Math.min(99, notifCount + newAlerts.length);
    document.getElementById('notif-count').textContent = notifCount > 9 ? '9+' : notifCount;
    document.getElementById('stat-alerts').textContent = alertsArr.filter(a => a.severity === 'critical').length;
  }
}

function renderAlerts() {
  const list = document.getElementById('alerts-list');
  if (!list) return;

  list.innerHTML = alertsArr.slice(0, 12).map(a => {
    const icon = a.severity === 'critical' ? '🚨' : a.severity === 'warning' ? '⚠️' : 'ℹ️';
    return `<div class="alert-item ${a.severity}">
      <span class="alert-icon">${icon}</span>
      <div class="alert-content">
        <div class="alert-title">${a.title}</div>
        <div class="alert-desc">${a.desc}</div>
        <div class="alert-time">🕐 ${a.time}</div>
      </div>
      <span class="alert-badge badge-${a.severity}">${a.severity}</span>
    </div>`;
  }).join('');
}

window.clearAlerts = function() {
  alertsArr = [];
  notifCount = 0;
  document.getElementById('notif-count').textContent = '0';
  document.getElementById('alerts-list').innerHTML =
    `<div style="text-align:center;color:var(--text-muted);padding:32px 0;font-size:0.82rem;">
      ✅ No active alerts. All sensors nominal.
    </div>`;
};

// ─── Sensor Map ───────────────────────────────────────────────
function renderSensorMap() {
  const map = document.getElementById('sensor-map');
  // Remove old nodes
  map.querySelectorAll('.sensor-node').forEach(n => n.remove());

  SENSORS.forEach(s => {
    const r = sensorReadings[s.id];
    if (!r) return;
    const color = r.status === 'online' ? 'var(--accent-green)' : r.status === 'warning' ? 'var(--accent-orange)' : 'var(--accent-red)';

    const node = document.createElement('div');
    node.className = 'sensor-node';
    node.style.left = (s.lng * 100) + '%';
    node.style.top  = (s.lat * 100) + '%';
    node.style.color = color;
    node.setAttribute('data-tooltip', `${s.id} · ${r.concentration.toFixed(1)} PPB`);
    node.innerHTML = `
      <div class="sensor-node-label">${s.id}</div>
      <div class="sensor-node-inner">
        <div class="sensor-node-pulse"></div>
      </div>`;
    map.appendChild(node);
  });
}

// ─── Sensor Table ─────────────────────────────────────────────
window.renderSensorTable = function() {
  const tbody = document.getElementById('sensor-tbody');
  if (!tbody) return;

  tbody.innerHTML = SENSORS.map(s => {
    const r = sensorReadings[s.id];
    if (!r) return '';

    const statusClass = r.status === 'online' ? 'status-online' : r.status === 'warning' ? 'status-warning' : 'status-offline';
    const statusIcon  = r.status === 'online' ? '●' : r.status === 'warning' ? '◐' : '○';

    const battClass = r.battery < 20 ? 'low' : r.battery < 40 ? 'med' : '';
    const concCell  = r.concentration > THRESHOLDS.concentration.warn
      ? `<span style="color:var(--accent-red)">${r.concentration.toFixed(1)}</span>`
      : r.concentration > THRESHOLDS.concentration.safe
        ? `<span style="color:var(--accent-orange)">${r.concentration.toFixed(1)}</span>`
        : `<span style="color:var(--accent-green)">${r.concentration.toFixed(1)}</span>`;

    const now = new Date();
    const secAgo = Math.floor(Math.random() * 10 + 1);
    const timeStr = new Date(now - secAgo * 1000).toLocaleTimeString();

    return `<tr>
      <td class="td-sensor-id">${s.id}</td>
      <td>${s.name}<br><span style="font-size:0.7rem;color:var(--text-muted)">${s.type} · ${s.zone}</span></td>
      <td><span class="status-pill ${statusClass}">${statusIcon} ${r.status}</span></td>
      <td>${concCell}</td>
      <td style="color:${r.ph >= 6.5 && r.ph <= 8.5 ? 'var(--accent-teal)' : 'var(--accent-orange)'}">
        ${r.ph.toFixed(2)}
      </td>
      <td style="color:${r.turbidity > 25 ? 'var(--accent-orange)' : 'var(--accent-primary)'}">
        ${r.turbidity.toFixed(1)}
      </td>
      <td>
        <div class="battery-bar">
          <div class="battery-track">
            <div class="battery-fill ${battClass}" style="width:${r.battery.toFixed(0)}%"></div>
          </div>
          <span class="battery-pct">${r.battery.toFixed(0)}%</span>
        </div>
      </td>
      <td style="font-family:var(--font-mono);font-size:0.74rem;color:var(--text-muted)">${timeStr}</td>
    </tr>`;
  }).join('');
};

// ─── Hero Stats ───────────────────────────────────────────────
function updateHeroStats() {
  readingCount += SENSORS.length;
  document.getElementById('stat-readings').textContent = (4200 + readingCount).toLocaleString();
  const onlineCount = Object.values(sensorReadings).filter(r => r.status !== 'offline').length;
  document.getElementById('stat-sensors').textContent = onlineCount;
}

// ─── Particles Animation ──────────────────────────────────────
function createParticles() {
  const colors = ['#00e5ff', '#00bfa5', '#7c4dff', '#00e676'];
  Array.from({length: 16}).forEach((_, i) => {
    const p = document.createElement('div');
    p.className = 'particle';
    const sz = rand(2, 5, 0);
    Object.assign(p.style, {
      width:  sz + 'px',
      height: sz + 'px',
      left:   rand(0, 100, 1) + 'vw',
      background: colors[Math.floor(Math.random() * colors.length)],
      animationDuration: rand(12, 28, 0) + 's',
      animationDelay:    '-' + rand(0, 20, 0) + 's',
    });
    document.body.appendChild(p);
  });
}

// ─── Nav Active Tracking ─────────────────────────────────────
function setupNavTracking() {
  const sections = ['dashboard', 'analytics', 'alerts-section', 'sensors'];
  const navIds   = ['nav-dashboard', 'nav-analytics', 'nav-alerts', 'nav-sensors'];

  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= 120) current = id;
    });
    navIds.forEach((navId, i) => {
      const a = document.getElementById(navId);
      if (a) a.classList.toggle('active', sections[i] === current || (!current && i === 0));
    });
  }, { passive: true });
}

// ─── Notif Button ─────────────────────────────────────────────
document.getElementById('notif-btn').addEventListener('click', () => {
  notifCount = 0;
  document.getElementById('notif-count').textContent = '0';
  document.getElementById('alerts-section').scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('analytics-refresh').addEventListener('click', () => {
  refreshBarChart();
});

// ─── Scenario Simulator (Demo Features) ───────────────────────
window.triggerScenario = function(type) {
  let message = '';
  switch(type) {
    case 'spill':
      // Spike Industrial and Runoff nodes
      ['MM-003', 'MM-012'].forEach(id => {
        if(sensorReadings[id]) {
          sensorReadings[id].concentration = rand(70, 95);
          sensorReadings[id].particles = rand(500, 800);
          sensorReadings[id].turbidity = rand(35, 50);
        }
      });
      message = 'Industrial Spill simulated: High concentration spikes detected at Industrial Outlet and Urban Runoff nodes.';
      break;
    case 'monsoon':
      // Widespread moderate increase, high turbidity
      SENSORS.forEach(s => {
        if(sensorReadings[s.id]) {
          sensorReadings[s.id].concentration = Math.min(100, sensorReadings[s.id].concentration + rand(10, 20));
          sensorReadings[s.id].turbidity = rand(25, 45);
        }
      });
      message = 'Monsoon Runoff simulated: Widespread turbidity increase and moderate microplastic intrusion across all zones.';
      break;
    case 'offline':
      // Randomly drop 2-3 connections
      const dropCount = rand(2, 3, 0);
      for(let i=0; i<dropCount; i++) {
        const id = SENSORS[rand(0, SENSORS.length-1, 0)].id;
        if(sensorReadings[id]) sensorReadings[id].status = 'offline';
      }
      message = 'Connection Error simulated: Random sensor nodes lost connection to the gateway.';
      break;
    case 'normal':
      // Reset all to normal operational baseline
      SENSORS.forEach(s => {
        if(sensorReadings[s.id]) {
          sensorReadings[s.id].concentration = rand(10, 35);
          sensorReadings[s.id].particles = rand(80, 250);
          sensorReadings[s.id].turbidity = rand(2, 15);
          sensorReadings[s.id].status = 'online';
        }
      });
      message = 'System Restored: All sensor nodes returned to normal operational baseline.';
      break;
  }
  
  // Force immediate update of UI and push an alert
  tick();
  
  const alertTime = new Date().toLocaleTimeString();
  const scenarioAlert = {
    title: 'System Event Triggered',
    desc: message,
    severity: type === 'normal' ? 'info' : (type === 'spill' ? 'critical' : 'warning'),
    time: alertTime,
    id: 'scenario-' + Date.now()
  };
  
  alertsArr = [scenarioAlert, ...alertsArr].slice(0, 30);
  renderAlerts();
  notifCount++;
  document.getElementById('notif-count').textContent = notifCount > 9 ? '9+' : notifCount;
  
  // Show browser alert for immediate feedback
  alert(message);
};

// ─── Export Data (Demo Feature) ───────────────────────────────
window.exportData = function() {
  const headers = ['Sensor ID', 'Name', 'Zone', 'Status', 'Concentration (PPB)', 'pH', 'Turbidity (NTU)', 'Temperature (C)', 'Particles /L', 'Battery %', 'Timestamp'];
  let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

  const now = new Date().toISOString();
  SENSORS.forEach(s => {
    const r = sensorReadings[s.id];
    if(r) {
      const row = [
        s.id, `"${s.name}"`, s.zone, r.status,
        r.concentration.toFixed(2), r.ph.toFixed(2), r.turbidity.toFixed(2), 
        r.temperature.toFixed(2), r.particles, r.battery.toFixed(1), now
      ];
      csvContent += row.join(",") + "\n";
    }
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `MicroMaster_Report_${new Date().getTime()}.csv`);
  document.body.appendChild(link); // Required for FF
  link.click();
  document.body.removeChild(link);
};

// ─── Master Tick (every 2 seconds) ───────────────────────────
function tick() {
  updateReadings();
  updateKPIs();
  renderGauges();
  updateLiveChart();
  renderSensorMap();
  renderSensorTable();
  updateSafetyMeter();
  updateHeroStats();
}

// ─── Init ─────────────────────────────────────────────────────
(function init() {
  createParticles();
  setupNavTracking();

  // Seed initial readings
  updateReadings();
  renderAlerts();

  // Initial render
  initLiveChart();
  initBarChart();
  renderGauges();
  renderSensorMap();
  renderSensorTable();
  updateKPIs();
  updateSafetyMeter();
  updateHeroStats();

  // Start live streaming (2-second tick)
  setInterval(tick, 2000);

  // Seed some initial alerts for demo
  alertsArr = [
    {
      title: 'High Concentration at MM-003',
      desc: '58.2 PPB detected at Industrial Outlet — exceeds WHO threshold.',
      severity: 'critical',
      time: new Date().toLocaleTimeString()
    },
    {
      title: 'Elevated Turbidity at MM-012',
      desc: '28.4 NTU detected at Urban Runoff node — elevated sediment load.',
      severity: 'warning',
      time: new Date().toLocaleTimeString()
    },
    {
      title: 'Network sync completed',
      desc: 'All 12 IoT sensor nodes checked in. Network health: 99.4%',
      severity: 'info',
      time: new Date().toLocaleTimeString()
    }
  ];
  renderAlerts();
})();
