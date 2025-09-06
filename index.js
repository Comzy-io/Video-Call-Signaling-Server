// server.js
const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 8443;

// Create WebSocket server
// Create HTTPS server with SSL certificates
const serverOptions = {
  cert: fs.readFileSync('/etc/letsencrypt/live/comzy.io/fullchain.pem'),
  key: fs.readFileSync('/etc/letsencrypt/live/comzy.io/privkey.pem'),
};

const httpsServer = https.createServer(serverOptions, app);

// Create WebSocket server using the HTTPS server
const wss = new WebSocket.Server({ server: httpsServer });
// Store active rooms and their participants
const rooms = {};

// Debugging helper function
function logMessage(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Helper function to generate a room ID from userId and remoteId
function generateRoomId(userId, remoteId) {
  // Sort IDs to ensure same room regardless of who connects first
  const sortedIds = [userId, remoteId].sort();
  return `room_${sortedIds[0]}_${sortedIds[1]}`;
}

// Serve a simple homepage to confirm server is running
app.get('/', (req, res) => {
  res.send('WebRTC Signaling Server Running');
});

// Helper to broadcast to all users in a room except the sender
function broadcastToRoom(room, sender, message) {
  if (!rooms[room]) {
    logMessage(`Room ${room} not found for broadcasting`);
    return;
  }

  logMessage(`Broadcasting to room ${room}: ${JSON.stringify(message)}`);

  rooms[room].users.forEach(user => {
    if (user.ws !== sender && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(JSON.stringify(message));
    }
  });
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  logMessage('Client connected');

  ws.on('message', async (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
      logMessage(`Received message: ${JSON.stringify(data)}`);
    } catch (e) {
      logMessage(`Invalid JSON: ${msg}`);
      return;
    }

    const { type } = data;

    switch (type) {
      case 'join': {
        const { userId, remoteId } = data;

        // Validate required parameters
        if (!userId || !remoteId) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Missing required parameters: userId and remoteId are required'
          }));
          logMessage(`Join attempt with missing parameters: userId=${userId}, remoteId=${remoteId}`);
          return;
        }

        // Reject if userId === remoteId
        if (userId === remoteId) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'User cannot connect to themselves'
          }));
          ws.close();
          return;
        }

        // Generate room ID from userId and remoteId
        const room = generateRoomId(userId, remoteId);

        ws.room = room;
        ws.userId = userId;
        ws.remoteId = remoteId;
        ws.id = Date.now().toString(); // Simple unique ID

        logMessage(`User ${userId} is joining room ${room} to connect with ${remoteId}`);

        if (!rooms[room]) {
          rooms[room] = { users: [] };
          logMessage(`Created new room: ${room}`);
        }

        // Check if userId is already connected; remove old one
        const existing = rooms[room].users.find(u => u.userId === userId);
        if (existing) {
          logMessage(`Replacing old connection for user ${userId} in room ${room}`);
          existing.ws.send(JSON.stringify({
            type: 'error',
            message: 'You have been disconnected due to a new connection from your account'
          }));
          existing.ws.close();
          rooms[room].users = rooms[room].users.filter(u => u.userId !== userId);
        }

        rooms[room].users.push({ id: ws.id, userId: ws.userId, ws });

        // First user is the initiator
        if (rooms[room].users.length === 1) {
          logMessage(`User ${userId} is initiator for room ${room}`);
          ws.send(JSON.stringify({ type: 'created', room }));
        } else {
          logMessage(`User ${userId} joined existing room ${room}`);
          ws.send(JSON.stringify({ type: 'joined', room }));

          // Tell the initiator that another user has joined and they can start the process
          broadcastToRoom(room, ws, { type: 'ready', room });
        }

        // Notify everyone of the current room info
        const userList = rooms[room].users.map(u => ({ id: u.id, userId: u.userId }));
        rooms[room].users.forEach(u => {
          if (u.ws.readyState === WebSocket.OPEN) {
            u.ws.send(JSON.stringify({
              type: 'roomInfo',
              room,
              users: userList,
              userCount: userList.length
            }));
          }
        });

        break;
      }

      case 'message': {
        if (!ws.room) {
          logMessage('Message received but no room assigned');
          return;
        }

        logMessage(`Message from ${ws.userId} in room ${ws.room}: ${JSON.stringify(data.data)}`);

        // Forward the message to all other peers in the room
        broadcastToRoom(ws.room, ws, {
          type: 'message',
          data: data.data,
          from: ws.userId
        });
        break;
      }

      case 'candidate': {
        if (!ws.room) {
          logMessage('ICE candidate received but no room assigned');
          return;
        }

        logMessage(`ICE candidate from ${ws.userId}`);

        // Forward the candidate to all other peers in the room
        broadcastToRoom(ws.room, ws, {
          type: 'message',
          data: {
            type: 'candidate',
            candidate: data.candidate
          },
          from: ws.userId
        });
        break;
      }

      case 'bye': {
        if (!ws.room) {
          logMessage('Bye message received but no room assigned');
          return;
        }

        logMessage(`User ${ws.userId} is leaving room ${ws.room}`);

        // Notify others that this peer is leaving
        broadcastToRoom(ws.room, ws, {
          type: 'bye',
          id: ws.id,
          userId: ws.userId
        });

        // Clean up the room
        handleDisconnect(ws);
        break;
      }

      default:
        logMessage(`Unknown message type: ${type}`);
    }
  });

  ws.on('close', () => {
    logMessage(`Client disconnected: ${ws.userId || 'Unknown'}`);
    handleDisconnect(ws);
  });

  ws.on('error', (error) => {
    logMessage(`WebSocket error: ${error.message}`);
  });
});

// Handle disconnection
function handleDisconnect(ws) {
  const room = ws.room;

  if (room && rooms[room]) {
    // Remove the user from the room
    rooms[room].users = rooms[room].users.filter(u => u.ws !== ws);

    // Notify others about the disconnection
    broadcastToRoom(room, ws, {
      type: 'bye',
      id: ws.id,
      userId: ws.userId
    });

    // Update room info for remaining users
    const userList = rooms[room].users.map(u => ({ id: u.id, userId: u.userId }));
    rooms[room].users.forEach(u => {
      if (u.ws.readyState === WebSocket.OPEN) {
        u.ws.send(JSON.stringify({
          type: 'roomInfo',
          room,
          users: userList,
          userCount: userList.length
        }));
      }
    });

    // Clean up empty rooms
    if (rooms[room].users.length === 0) {
      logMessage(`Deleting empty room: ${room}`);
      delete rooms[room];
    }
  }
}

// Handle server shutdown gracefully
process.on('SIGINT', () => {
  logMessage('Server shutting down');

  // Close all WebSocket connections
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1000, 'Server shutting down');
    }
  });

 httpsServer.close(() => {
  logMessage('Server shutdown complete');
  process.exit(0);
});
});

// Start the server
httpsServer.listen(PORT, () => {
  logMessage(`WebSocket signaling server running on WSS port ${PORT}`);
});
