const clients = new Map();

function addClient(userId, res) {
  const key = String(userId);
  const current = clients.get(key) || new Set();
  current.add(res);
  clients.set(key, current);

  res.on('close', () => {
    current.delete(res);
    if (current.size === 0) clients.delete(key);
  });
}

function sendToUser(userId, eventName, payload) {
  const current = clients.get(String(userId));
  if (!current) return;

  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of current) {
    res.write(message);
  }
}

function heartbeat() {
  for (const current of clients.values()) {
    for (const res of current) {
      res.write('event: ping\ndata: {}\n\n');
    }
  }
}

setInterval(heartbeat, 30000).unref();

module.exports = {
  addClient,
  sendToUser,
};
