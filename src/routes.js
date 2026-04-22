const express = require('express');
const http = require('http');
const { getPeers } = require('./discovery');
const { getMeasurements, setProbeInterval, getProbeInterval } = require('./probes');

const router = express.Router();

const PORT = process.env.PORT || 3000;
const POD_NAME = process.env.POD_NAME;
const POD_IP = process.env.POD_IP;
const NODE_NAME = process.env.NODE_NAME;
const NODE_LOCATION = process.env.NODE_LOCATION || null;

function formatMeasurements() {
  const peers = getPeers();
  const measurements = getMeasurements();

  return Object.entries(measurements).map(([ip, samples]) => ({
    targetIp: ip,
    target: ip === POD_IP
      ? { name: POD_NAME, ip: POD_IP, node: NODE_NAME, location: NODE_LOCATION }
      : peers.find(p => p.ip === ip) || { ip },
    isSelf: ip === POD_IP,
    latest: samples[samples.length - 1] || null,
    avg: samples.filter(s => s.rtt !== null).reduce((a, b) => a + b.rtt, 0) /
         (samples.filter(s => s.rtt !== null).length || 1)
  }));
}

// /metrics from a single peer
function fetchPeerMetrics(peer) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${peer.ip}:${PORT}/metrics`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

// what peers probe
router.get('/health', (req, res) => {
  res.json({ status: 'ok', pod: POD_NAME });
});

// this pod's measurements
router.get('/metrics', (req, res) => {
  res.json({
    source: { name: POD_NAME, ip: POD_IP, node: NODE_NAME, location: NODE_LOCATION },
    peers: getPeers(),
    measurements: formatMeasurements()
  });
});

// fetches /metrics from all peers and combines with own
router.get('/aggregate', async (req, res) => {
  const peers = getPeers();

  const results = await Promise.allSettled(peers.map(fetchPeerMetrics));

  const ownMetrics = {
    source: { name: POD_NAME, ip: POD_IP, node: NODE_NAME, location: NODE_LOCATION },
    peers,
    measurements: formatMeasurements()
  };

  const allMetrics = [
    ownMetrics,
    ...results.filter(r => r.status === 'fulfilled').map(r => r.value)
  ];

  res.json(allMetrics);
});

// update probe interval
router.post('/config', (req, res) => {
  const { interval } = req.body;
  if (typeof interval === 'number' && interval >= 1000 && interval <= 60000) {
    setProbeInterval(interval);
    res.json({ ok: true, interval: getProbeInterval() });
  } else {
    res.status(400).json({ error: 'interval must be between 1000 and 60000 ms' });
  }
});

module.exports = router;