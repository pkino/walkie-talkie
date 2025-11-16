const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');

const HOST = (process.env.HOST || '0.0.0.0').trim();
const PORT = (() => {
  const fromEnv = process.env.PORT;
  if (!fromEnv) return 3000;
  const parsed = Number(fromEnv);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
})();
const CLIENT_ROOT = path.join(__dirname, '..', 'client');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(CLIENT_ROOT));
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const rooms = new Map(); // roomName -> Map<clientId, WebSocket>
const clientInfo = new WeakMap(); // WebSocket -> { id, room }

function broadcast(roomName, message, excludeId) {
  const room = rooms.get(roomName);
  if (!room) return;
  const payload = JSON.stringify(message);
  room.forEach((socket, id) => {
    if (id === excludeId || socket.readyState !== socket.OPEN) return;
    socket.send(payload);
  });
}

function leaveRoom(socket) {
  const info = clientInfo.get(socket);
  if (!info || !info.room) return;
  const { room, id } = info;
  const roomMembers = rooms.get(room);
  if (!roomMembers) return;
  roomMembers.delete(id);
  broadcast(room, { type: 'peer-left', from: id });
  if (roomMembers.size === 0) {
    rooms.delete(room);
  }
}

wss.on('connection', (socket) => {
  const clientId = randomUUID();
  clientInfo.set(socket, { id: clientId, room: null });
  socket.send(JSON.stringify({ type: 'welcome', id: clientId }));

  socket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.error('Invalid message', error);
      return;
    }

    const info = clientInfo.get(socket);
    if (!info) return;

    switch (message.type) {
      case 'join': {
        const { room } = message;
        if (typeof room !== 'string' || room.trim().length === 0) return;
        const roomName = room.trim();
        let roomMembers = rooms.get(roomName);
        if (!roomMembers) {
          roomMembers = new Map();
          rooms.set(roomName, roomMembers);
        }

        info.room = roomName;
        roomMembers.set(clientId, socket);

        const peers = Array.from(roomMembers.keys()).filter((id) => id !== clientId);
        socket.send(JSON.stringify({ type: 'peers', peers, room: roomName }));
        broadcast(roomName, { type: 'peer-joined', from: clientId }, clientId);
        break;
      }
      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        const { target, sdp, candidate } = message;
        const { room } = info;
        if (!room) return;
        const roomMembers = rooms.get(room);
        const targetSocket = roomMembers?.get(target);
        if (targetSocket && targetSocket.readyState === targetSocket.OPEN) {
          targetSocket.send(
            JSON.stringify({
              type: message.type,
              from: clientId,
              sdp,
              candidate,
            }),
          );
        }
        break;
      }
      case 'leave': {
        leaveRoom(socket);
        break;
      }
      default:
        break;
    }
  });

  socket.on('close', () => leaveRoom(socket));
});

server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Signaling server running on http://${HOST}:${PORT}`);
});
