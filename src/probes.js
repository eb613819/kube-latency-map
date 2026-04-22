const http = require('http');
const { getPeers } = require('./discovery');

const PORT = process.env.PORT || 3000;
const POD_IP = process.env.POD_IP;
const HISTORY_LENGTH = 10;

let probeInterval = parseInt(process.env.PROBE_INTERVAL) || 5000;
let probeTimer = null;

// Keyed by target IP, includes loopback (own IP)
const measurements = {};

async function probeTarget(ip) {
  const start = Date.now();
  try {
    await new Promise((resolve, reject) => {
      const req = http.get(`http://${ip}:${PORT}/health`, (res) => {
        res.resume();
        resolve();
      });
      req.setTimeout(3000, () => {
        req.destroy();
        reject(new Error('timeout'));
      });
      req.on('error', reject);
    });

    const rtt = Date.now() - start;
    record(ip, { rtt, timestamp: Date.now() });

  } catch (err) {
    record(ip, { rtt: null, timestamp: Date.now(), error: err.message });
  }
}

function record(ip, entry) {
  if (!measurements[ip]) measurements[ip] = [];
  measurements[ip].push(entry);
  if (measurements[ip].length > HISTORY_LENGTH) measurements[ip].shift();
}

function startProbeLoop() {
  if (probeTimer) clearInterval(probeTimer);
  probeTimer = setInterval(() => {
    for (const peer of getPeers()) {
      probeTarget(peer.ip);
    }
    // Probe self
    probeTarget(POD_IP);
  }, probeInterval);
}

function setProbeInterval(ms) {
  probeInterval = ms;
  startProbeLoop();
}

function getProbeInterval() {
  return probeInterval;
}

function getMeasurements() {
  return measurements;
}

module.exports = { startProbeLoop, setProbeInterval, getProbeInterval, getMeasurements };