const express = require('express');
const path = require('path');
const { startDiscovery } = require('./src/discovery');
const { startProbeLoop } = require('./src/probes');
const routes = require('./src/routes');
 
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', routes);
 
const PORT = process.env.PORT || 3000;
 
async function start() {
  await startDiscovery();
  startProbeLoop();
  app.listen(PORT, () => {
    console.log(`kube-latency-map running on port ${PORT}`);
    console.log(`Pod: ${process.env.POD_NAME} | Node: ${process.env.NODE_NAME} | IP: ${process.env.POD_IP} | Location: ${process.env.NODE_LOCATION || 'not set'}`);
  });
}
 
start();