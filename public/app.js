const REFRESH_MS = 3000; //how often to poll /aggregate

let historicMin = Infinity;
let historicMax = -Infinity;

const COLOR_STOPS = [
  [30, 120, 30],    // green  — low latency
  [160, 140, 30],   // yellow — mid latency
  [160, 40, 40],    // red    — high latency
];

function interpolateColor(t) {
  const scaled = t * (COLOR_STOPS.length - 1);
  const i = Math.min(Math.floor(scaled), COLOR_STOPS.length - 2);
  const f = scaled - i;
  const c = COLOR_STOPS[i].map((start, idx) =>
    Math.round(start + f * (COLOR_STOPS[i + 1][idx] - start))
  );
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function latencyColor(ms) {
  if (historicMin === Infinity || historicMax === -Infinity) return '#1e2130';
  if (historicMin === historicMax) return interpolateColor(0.5);
  const t = (ms - historicMin) / (historicMax - historicMin);
  return interpolateColor(Math.max(0, Math.min(1, t)));
}

function initLegendBar() {
  const stops = COLOR_STOPS.map(c => `rgb(${c.join(',')})`);
  document.querySelector('.legend-bar').style.background =
    `linear-gradient(to right, ${stops.join(', ')})`;
}

//only include pods that have reported their own metrics
// this excludes terminating pods and pods not yet ready
function buildPodIndex(metrics) {
  const podMap = {};
  for (const m of metrics) {
    if (m.source?.ip && m.source?.node) {
      podMap[m.source.ip] = m.source;
    }
  }
  return Object.values(podMap).sort((a, b) =>
    (a.node || '').localeCompare(b.node || '')
  );
}

function render(metrics) {
  const pods = buildPodIndex(metrics);

  // build lookup: sourceIp -> targetIp -> latest measurement
  const lookup = {};
  for (const m of metrics) {
    if (!m.source?.ip) continue;
    lookup[m.source.ip] = {};
    for (const meas of m.measurements) {
      lookup[m.source.ip][meas.targetIp] = meas.latest;
      //update historic min/max including loopback
      if (meas.latest?.rtt != null) {
        historicMin = Math.min(historicMin, meas.latest.rtt);
        historicMax = Math.max(historicMax, meas.latest.rtt);
      }
    }
  }

  // update legend
  if (historicMin !== Infinity) {
    document.getElementById('legendMin').textContent = historicMin + 'ms';
    document.getElementById('legendMax').textContent = historicMax + 'ms';
  }

  const head = document.getElementById('matrixHead');
  const body = document.getElementById('matrixBody');

  // header row
  head.innerHTML = '';
  const headerRow = document.createElement('tr');
  headerRow.appendChild(th(''));
  for (const pod of pods) {
    const cell = th(pod.node || pod.name || '?');
    cell.classList.add('node-header');
    headerRow.appendChild(cell);
  }
  head.appendChild(headerRow);

  // data rows
  body.innerHTML = '';
  for (const sourcePod of pods) {
    const row = document.createElement('tr');

    const label = document.createElement('td');
    label.className = 'row-label';
    label.textContent = sourcePod.node || sourcePod.name || '?';
    row.appendChild(label);

    for (const targetPod of pods) {
      const cell = document.createElement('td');
      const result = lookup[sourcePod.ip]?.[targetPod.ip];

      if (sourcePod.ip === targetPod.ip) {
        // Diagonal — loopback measurement
        cell.className = 'latency self';
        if (!result) {
          cell.textContent = '...';
          cell.style.color = '#444';
        } else if (result.rtt === null) {
          cell.textContent = 'err';
          cell.style.color = '#e05c5c';
        } else {
          cell.textContent = result.rtt + 'ms';
          cell.style.background = latencyColor(result.rtt);
        }
      } else {
        cell.className = 'latency';
        if (!result) {
          cell.textContent = '...';
          cell.style.color = '#444';
        } else if (result.rtt === null) {
          cell.className = 'unreachable';
          cell.textContent = 'unreachable';
        } else {
          cell.textContent = result.rtt + 'ms';
          cell.style.background = latencyColor(result.rtt);
        }
      }
      row.appendChild(cell);
    }

    body.appendChild(row);
  }
}

function th(text) {
  const el = document.createElement('th');
  el.textContent = text;
  return el;
}

async function refresh() {
  try {
    const res = await fetch('/aggregate');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    render(data);
    document.getElementById('status').textContent = 'updated ' + new Date().toLocaleTimeString();
    document.getElementById('status').className = 'status ok';
  } catch (err) {
    document.getElementById('status').textContent = 'error: ' + err.message;
    document.getElementById('status').className = 'status error';
  }
}

//probe interval control
const slider = document.getElementById('intervalSlider');
const label = document.getElementById('intervalLabel');
let sliderTimer = null;

slider.addEventListener('input', () => {
  const seconds = parseInt(slider.value);
  label.textContent = seconds + 's';
  clearTimeout(sliderTimer);
  sliderTimer = setTimeout(async () => {
    await fetch('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interval: seconds * 1000 })
    });
  }, 500);
});

// start
initLegendBar();
refresh();
setInterval(refresh, REFRESH_MS);