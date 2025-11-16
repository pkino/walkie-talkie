const statusEl = document.getElementById('status');
const roomInput = document.getElementById('room');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const peerList = document.getElementById('peerList');
const audioGrid = document.getElementById('audioGrid');

let ws;
let clientId = null;
let currentRoom = null;
let localStream = null;
const peerConnections = new Map();
const remoteAudios = new Map();

const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const signalingUrl = `${protocol}://${window.location.host}/ws`;

joinBtn.addEventListener('click', () => joinRoom());
leaveBtn.addEventListener('click', leaveRoom);

function setStatus(message) {
  statusEl.textContent = message;
}

async function ensureWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  if (ws && ws.readyState === WebSocket.CONNECTING) {
    await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
    return;
  }

  ws = new WebSocket(signalingUrl);
  ws.addEventListener('open', () => setStatus('シグナリングサーバーに接続しました'));
  ws.addEventListener('close', () => setStatus('シグナリングサーバーとの接続が切れました'));
  ws.addEventListener('message', handleSignalMessage);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
}

async function joinRoom() {
  const room = roomInput.value.trim();
  if (!room) {
    setStatus('ルーム名を入力してください');
    return;
  }

  if (currentRoom === room) {
    setStatus('すでに同じルームに参加しています');
    return;
  }

  try {
    await startLocalAudio();
    await ensureWebSocket();
    currentRoom = room;
    ws.send(JSON.stringify({ type: 'join', room }));
    joinBtn.disabled = true;
    leaveBtn.disabled = false;
    setStatus(`ルーム「${room}」に参加しました`);
  } catch (error) {
    console.error(error);
    setStatus('参加に失敗しました。ブラウザのマイク権限を確認してください。');
  }
}

async function startLocalAudio() {
  if (localStream) return;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

function handleSignalMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch (error) {
    console.error('Invalid message from server', error);
    return;
  }

  switch (message.type) {
    case 'welcome':
      clientId = message.id;
      break;
    case 'peers':
      updatePeers(message.peers);
      message.peers.forEach((peerId) => createOfferForPeer(peerId));
      break;
    case 'peer-joined':
      addPeer(message.from);
      createOfferForPeer(message.from);
      break;
    case 'offer':
      handleOffer(message.from, message.sdp);
      break;
    case 'answer':
      handleAnswer(message.from, message.sdp);
      break;
    case 'ice-candidate':
      handleCandidate(message.from, message.candidate);
      break;
    case 'peer-left':
      removePeer(message.from);
      break;
    default:
      break;
  }
}

function updatePeers(peerIds) {
  peerList.innerHTML = '';
  peerIds.forEach((id) => addPeer(id));
}

function addPeer(peerId) {
  if (peerList.querySelector(`[data-peer="${peerId}"]`)) return;
  const li = document.createElement('li');
  li.dataset.peer = peerId;
  li.textContent = `ピア: ${peerId}`;
  peerList.appendChild(li);
}

function removePeer(peerId) {
  const li = peerList.querySelector(`[data-peer="${peerId}"]`);
  if (li) li.remove();
  closePeerConnection(peerId);
}

function getPeerConnection(peerId) {
  if (peerConnections.has(peerId)) return peerConnections.get(peerId);

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws?.send(
        JSON.stringify({
          type: 'ice-candidate',
          target: peerId,
          candidate: event.candidate,
        }),
      );
    }
  };

  pc.ontrack = (event) => {
    const [stream] = event.streams;
    attachRemoteAudio(peerId, stream);
  };

  pc.onconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
      removePeer(peerId);
    }
  };

  localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream));

  peerConnections.set(peerId, pc);
  return pc;
}

async function createOfferForPeer(peerId) {
  const pc = getPeerConnection(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws?.send(
    JSON.stringify({
      type: 'offer',
      target: peerId,
      sdp: offer,
    }),
  );
}

async function handleOffer(from, sdp) {
  const pc = getPeerConnection(from);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws?.send(
    JSON.stringify({
      type: 'answer',
      target: from,
      sdp: answer,
    }),
  );
  addPeer(from);
}

async function handleAnswer(from, sdp) {
  const pc = getPeerConnection(from);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  addPeer(from);
}

async function handleCandidate(from, candidate) {
  const pc = getPeerConnection(from);
  if (candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Failed to add ICE candidate', error);
    }
  }
}

function attachRemoteAudio(peerId, stream) {
  if (remoteAudios.has(peerId)) return;
  const container = document.createElement('div');
  container.className = 'audio-card';
  container.id = `audio-${peerId}`;

  const label = document.createElement('div');
  label.textContent = `受信中: ${peerId}`;
  label.style.marginBottom = '8px';

  const audio = document.createElement('audio');
  audio.controls = true;
  audio.autoplay = true;
  audio.playsInline = true;
  audio.srcObject = stream;

  container.appendChild(label);
  container.appendChild(audio);
  audioGrid.appendChild(container);
  remoteAudios.set(peerId, container);
}

function closePeerConnection(peerId) {
  const pc = peerConnections.get(peerId);
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.close();
  }
  peerConnections.delete(peerId);

  const audioEl = remoteAudios.get(peerId);
  if (audioEl) {
    audioEl.remove();
    remoteAudios.delete(peerId);
  }
}

function stopLocalStream() {
  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
}

function leaveRoom() {
  ws?.send(JSON.stringify({ type: 'leave' }));
  peerConnections.forEach((_, peerId) => closePeerConnection(peerId));
  peerList.innerHTML = '';
  audioGrid.innerHTML = '';
  stopLocalStream();
  currentRoom = null;
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  setStatus('切断しました');
}
