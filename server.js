const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const { createDiscordBot, destroyBot } = require('./src/bot');
const GameEngine = require('./src/gameEngine');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Active game sessions: { sessionId -> { ws, gameEngine, bot } }
const sessions = new Map();

function broadcastToSession(sessionId, data) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const msg = JSON.stringify(data);
  session.wsList.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  let sessionId = null;

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // --- START LOBBY ---
    if (msg.type === 'START_LOBBY') {
      const { token, guildId, channelId, heroName } = msg;
      if (!token || !guildId || !channelId) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Token, Guild ID ve Channel ID zorunludur.' }));
        return;
      }

      sessionId = `${guildId}_${channelId}_${Date.now()}`;
      ws.send(JSON.stringify({ type: 'SESSION_ID', sessionId }));

      try {
        ws.send(JSON.stringify({ type: 'LOG', message: '🤖 Discord botuna bağlanılıyor...' }));

        const { client, members } = await createDiscordBot(token, guildId, channelId, (command, username) => {
          const session = sessions.get(sessionId);
          if (!session) return;
          session.gameEngine.registerVote(command, username);
          broadcastToSession(sessionId, {
            type: 'VOTE',
            command,
            username,
            votes: session.gameEngine.getVotes()
          });
        });

        ws.send(JSON.stringify({ type: 'LOG', message: `✅ Bot bağlandı! ${members.length} üye bulundu.` }));

        const gameEngine = new GameEngine(members, heroName || 'Kahraman');

        const session = {
          wsList: [ws],
          gameEngine,
          client,
          token,
          guildId,
          channelId
        };
        sessions.set(sessionId, session);

        // Start game
        gameEngine.start((event) => {
          broadcastToSession(sessionId, event);
        });

        broadcastToSession(sessionId, {
          type: 'GAME_START',
          state: gameEngine.getState()
        });

      } catch (err) {
        console.error('Bot error:', err);
        ws.send(JSON.stringify({ type: 'ERROR', message: `Bot hatası: ${err.message}` }));
      }
    }

    // --- JOIN LOBBY ---
    if (msg.type === 'JOIN_LOBBY') {
      sessionId = msg.sessionId;
      const session = sessions.get(sessionId);
      if (!session) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Lobi bulunamadı.' }));
        return;
      }
      session.wsList.push(ws);
      ws.send(JSON.stringify({ type: 'GAME_STATE', state: session.gameEngine.getState() }));
    }

    // --- GET STATE ---
    if (msg.type === 'GET_STATE') {
      const session = sessions.get(sessionId);
      if (session) {
        ws.send(JSON.stringify({ type: 'GAME_STATE', state: session.gameEngine.getState() }));
      }
    }
  });

  ws.on('close', () => {
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        session.wsList = session.wsList.filter(w => w !== ws);
      }
    }
  });
});

// REST API
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', sessions: sessions.size });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`\n🎮 Discord Dungeon Server başlatıldı!`);
  console.log(`🌐 http://localhost:${PORT}\n`);
});
