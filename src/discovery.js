const k8s = require('@kubernetes/client-node');

const NAMESPACE = process.env.NAMESPACE || 'default';
const POD_IP = process.env.POD_IP;

const kc = new k8s.KubeConfig();
kc.loadFromCluster();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

let peers = [];

async function discoverPeers() {
  try {
    const res = await k8sApi.listNamespacedPod(NAMESPACE);
    peers = res.body.items
      .filter(pod =>
        pod.metadata.labels?.['app'] === 'kube-latency-map' &&
        pod.status.phase === 'Running' &&
        pod.status.podIP &&
        pod.status.podIP !== POD_IP
      )
      .map(pod => ({
        name: pod.metadata.name,
        ip: pod.status.podIP,
        node: pod.spec.nodeName,
        location: pod.metadata.annotations?.['kube-latency-map/location'] || null
      }));
  } catch (err) {
    console.error('Peer discovery failed:', err.message);
  }
}

async function startDiscovery() {
  await discoverPeers();
  setInterval(discoverPeers, 30000);
}

function getPeers() {
  return peers;
}

module.exports = { startDiscovery, getPeers };