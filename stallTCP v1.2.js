import { connect } from 'cloudflare:sockets';
const AUTH_UUID = "2523c510-9ff0-415b-9582-93949bfae7e3";
export default {
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Hello World!', { status: 200 });
    const u = new URL(req.url); let proxyIPConfig = null;
    if (u.pathname.includes('/proxyip=')) {
      const proxyParam = u.pathname.split('/proxyip=')[1].split('/')[0];
      const [address, port = 443] = parseAddressPort(proxyParam);
      proxyIPConfig = { address, port: +port }; }
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept(); server.send(new Uint8Array([0, 0]));
    handleConnection(server, proxyIPConfig);
    return new Response(null, { status: 101, webSocket: client }); }
};
function buildUUID(arr, start) { return Array.from(arr.slice(start, start + 16)).map(n => n.toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'); }
const extractAddress = b => {
  const o1 = 18 + b[17] + 1, p = (b[o1] << 8) | b[o1 + 1], t = b[o1 + 2]; let o2 = o1 + 3, h, l;
  switch (t) {
    case 1: l = 4; h = b.slice(o2, o2 + l).join('.'); break;
    case 2: l = b[o2++]; h = new TextDecoder().decode(b.slice(o2, o2 + l)); break;
    case 3: l = 16; h = `[${Array.from({ length: 8 }, (_, i) => ((b[o2 + i * 2] << 8) | b[o2 + i * 2 + 1]).toString(16)).join(':')}]`; break;
    default: throw new Error('Invalid address type.');
  } return { host: h, port: p, payload: b.slice(o2 + l) };
};
function parseAddressPort(addressSegment) {
  let address, port;
  if (addressSegment.startsWith('[')) {
    const [ipv6Address, portStr = 443] = addressSegment.slice(1, -1).split(']:');
    address = `[${ipv6Address}]`; port = portStr;
  } else { [address, port = 443] = addressSegment.split(':'); } return [address, port];
}
function getConnectionOrder(proxyIPConfig) {
  const order = ['direct'];
  if (proxyIPConfig) order.push('proxy'); return order;
}
function handleConnection(ws, proxyIPConfig) {
  let socket, writer, reader, info;
  let isFirstMsg = true, bytesReceived = 0, stallCount = 0, reconnectCount = 0;
  let lastData = Date.now(); const timers = {}; const dataBuffer = [];
  const KEEPALIVE = 15000, STALL_TIMEOUT = 8000, MAX_STALL = 12, MAX_RECONNECT = 24;
  async function processHandshake(data) {
    const bytes = new Uint8Array(data);
    if (buildUUID(bytes, 1) !== AUTH_UUID) throw new Error('Auth failed');
    const { host, port, payload } = extractAddress(bytes);
    const connectionOrder = getConnectionOrder(proxyIPConfig);
    let sock, connectionSuccessful = false;
    for (const method of connectionOrder) {
      try {
        sock = connect(method === 'direct' ? { hostname: host, port } : { hostname: proxyIPConfig.address, port: proxyIPConfig.port });
        await sock.opened; connectionSuccessful = true; break;
      } catch { continue; }}
    if (!connectionSuccessful) throw new Error('All connection methods failed'); const w = sock.writable.getWriter();
    if (payload.length) await w.write(payload); return { socket: sock, writer: w, reader: sock.readable.getReader(), info: { host, port } };
  }
  async function readLoop() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (value?.length) {
          bytesReceived += value.length; lastData = Date.now();
          stallCount = reconnectCount = 0;
          if (ws.readyState === 1) {
            await ws.send(value);
            while (dataBuffer.length && ws.readyState === 1) { await ws.send(dataBuffer.shift()); }
          } else { dataBuffer.push(value); }}
        if (done) { ws.send('Stream ended gracefully'); await reconnect(); break;}}
    } catch (err) {
      if (err.message.includes('reset') || err.message.includes('broken')) {
        ws.send('Server closed connection, attempting reconnect'); await reconnect();
      } else { cleanup(); ws.close(1006, 'Connection abnormal'); }}
  }
  async function reconnect() {
    if (!info || ws.readyState !== 1 || reconnectCount >= MAX_RECONNECT) {
      cleanup(); ws.close(1011, 'Reconnection failed'); return;}
    reconnectCount++; ws.send(`Reconnecting (attempt ${reconnectCount})...`);
    try { cleanupSocket();
      await new Promise(resolve => setTimeout(resolve, 30 * Math.pow(2, reconnectCount) + Math.random() * 5));
      const connectionOrder = getConnectionOrder(proxyIPConfig); let sock, connectionSuccessful = false;
      for (const method of connectionOrder) {
        try {
          sock = connect(method === 'direct' ? { hostname: info.host, port: info.port } : { hostname: proxyIPConfig.address, port: proxyIPConfig.port });
          await sock.opened; connectionSuccessful = true; break;
        } catch { continue; }}
      if (!connectionSuccessful) throw new Error('All reconnect methods failed');
      socket = sock; writer = sock.writable.getWriter(); reader = sock.readable.getReader(); lastData = Date.now(); stallCount = 0; ws.send('Reconnected successfully');
      while (dataBuffer.length && ws.readyState === 1) { await writer.write(dataBuffer.shift()); } readLoop();
    } catch { setTimeout(reconnect, 1000); }
  }
  function startTimers() {
    timers.keepalive = setInterval(async () => {
      if (Date.now() - lastData > KEEPALIVE) {
        try {
          await writer.write(new Uint8Array(0)); lastData = Date.now();
        } catch { reconnect();}}}, KEEPALIVE / 3);
    timers.health = setInterval(() => {
      if (bytesReceived && Date.now() - lastData > STALL_TIMEOUT) {
        stallCount++; ws.send(`Stall detected (${stallCount}/${MAX_STALL}), ${Date.now() - lastData}ms since last data`);
        if (stallCount >= MAX_STALL) reconnect();}}, STALL_TIMEOUT / 2);
  }
  function cleanupSocket() {
    try { writer?.releaseLock(); reader?.releaseLock(); socket?.close(); } catch {}
  }
  function cleanup() {
    Object.values(timers).forEach(clearInterval); cleanupSocket();
  }
  ws.addEventListener('message', async evt => {
    try {
      if (isFirstMsg) {
        isFirstMsg = false;
        ({ socket, writer, reader, info } = await processHandshake(evt.data));
        startTimers(); readLoop();
      } else {
        lastData = Date.now();
        if (socket && writer) { await writer.write(evt.data);
        } else { dataBuffer.push(evt.data);}}
    } catch { cleanup(); ws.close(1006, 'Connection abnormal'); }
  }); ws.addEventListener('close', cleanup); ws.addEventListener('error', cleanup);
}