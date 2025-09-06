# WebRTC Signaling Server 

*Because even the most introverted developers need to help people connect*

## What is this magical piece of code?

This is a WebSocket signaling server for WebRTC connections. Think of it as a digital matchmaker - it helps two devices find each other in the vast wilderness of the internet and exchange the necessary "hey, want to video chat?" messages.

It's like Tinder, but for devices, and instead of swiping right, they exchange ICE candidates.

## Features

- **WebSocket Communication**: Real-time messaging that's faster than your ex replying to texts
- **Room-based Architecture**: Automatically creates rooms for user pairs (no awkward third wheels)
- **SSL/TLS Support**: Secure connections because privacy matters
- **Automatic Cleanup**: Removes empty rooms faster than you clear your browser history
- **User Management**: Handles disconnections gracefully (unlike some people we know)
- **Zero Authentication**: No API keys, no passwords, just pure anarchic freedom

## Installation

### Prerequisites

- Node.js (version 12 or higher - if you're still on Node 10, we need to talk)
- npm or yarn (your choice, we don't judge)
- SSL certificates (if you want WSS, which you should)

### Setup

1. **Clone or create the project**
```bash
mkdir webrtc-signaling-server
cd webrtc-signaling-server
```

2. **Initialize npm and install dependencies**
```bash
npm init -y
npm install express ws
```

3. **Copy the server code** (the one in this repo)

4. **Set up SSL certificates** (for production)
```bash
# If using Let's Encrypt
sudo certbot certonly --standalone -d yourdomain.com

# Make sure your certificates are in the right place
# Default path: /etc/letsencrypt/live/yourdomain.com/
```

## Configuration

### Environment Variables

```bash
export PORT=8443  # Default port, change if needed
```

### SSL Certificate Paths

Update these paths in the code if your certificates are elsewhere:

```javascript
const serverOptions = {
  cert: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/fullchain.pem'),
  key: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/privkey.pem'),
};
```

*Pro tip: Don't commit your private keys to Git. That's like posting your diary on social media.*

## Usage

### Starting the Server

```bash
# Development (without SSL)
node server.js

# Production (with SSL)
# Make sure you have the certificates first!
sudo node server.js  # sudo needed for certificate access
```

### Using PM2 (Recommended for Production)

```bash
npm install -g pm2
pm2 start server.js --name "signaling-server"
pm2 save
pm2 startup
```

## API Reference

### WebSocket Endpoints

Connect to: `wss://yourdomain.com:8443`

### Message Types

#### 1. Join a Room
```json
{
  "type": "join",
  "userId": "user123",
  "remoteId": "user456"
}
```

**Response:**
```json
// If you're the first user
{
  "type": "created",
  "room": "room_user123_user456"
}

// If you're the second user
{
  "type": "joined",
  "room": "room_user123_user456"
}
```

#### 2. Send WebRTC Messages
```json
{
  "type": "message",
  "data": {
    "type": "offer",  // or "answer"
    "sdp": "v=0\r\no=- 123456789 1 IN IP4 127.0.0.1\r\n..."
  }
}
```

#### 3. Send ICE Candidates
```json
{
  "type": "candidate",
  "candidate": {
    "candidate": "candidate:1 1 UDP 2013266431 192.168.1.1 54400 typ host",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

#### 4. Leave Room
```json
{
  "type": "bye"
}
```

### Server Responses

#### Room Information
```json
{
  "type": "roomInfo",
  "room": "room_user123_user456",
  "users": [
    {"id": "1634567890123", "userId": "user123"},
    {"id": "1634567890124", "userId": "user456"}
  ],
  "userCount": 2
}
```

#### Ready Signal
```json
{
  "type": "ready",
  "room": "room_user123_user456"
}
```

#### Error Messages
```json
{
  "type": "error",
  "message": "User cannot connect to themselves"
}
```

## How It Works

1. **User A** connects and joins a room to call **User B**
2. Server creates a room with ID `room_userA_userB` (sorted alphabetically)
3. **User A** gets `"created"` message (they're the initiator)
4. **User B** connects to the same room
5. **User B** gets `"joined"` message
6. **User A** gets `"ready"` message to start the WebRTC process
7. Users exchange offers, answers, and ICE candidates through the server
8. Server forwards all messages between users in the room
9. When someone leaves, others get a `"bye"` message

*It's like being a translator at the UN, but for computers.*

## Room Management

- **Room Creation**: Automatic when first user joins
- **Room Naming**: `room_{sorted_user_ids}` (e.g., `room_alice_bob`)
- **Duplicate Connections**: Old connections are kicked out (sorry, not sorry)
- **Cleanup**: Empty rooms are deleted automatically
- **User Limit**: Maximum 2 users per room (this isn't a conference call system)

## Logging

The server logs everything because debugging WebRTC issues without logs is like trying to find a black cat in a dark room while wearing sunglasses.

Sample logs:
```
[2024-01-01T12:00:00.000Z] Client connected
[2024-01-01T12:00:01.000Z] User alice is joining room room_alice_bob to connect with bob
[2024-01-01T12:00:02.000Z] Created new room: room_alice_bob
[2024-01-01T12:00:03.000Z] User alice is initiator for room room_alice_bob
```

## Error Handling

### Common Errors

- **Missing Parameters**: Forgot userId or remoteId
- **Self-Connection**: Trying to call yourself (we've all been there)
- **Invalid JSON**: Malformed messages
- **Connection Issues**: Network problems (blame the ISP)

### Server Responses

All errors return:
```json
{
  "type": "error",
  "message": "Helpful error description"
}
```

## Security Considerations

- **No Authentication**: This server trusts everyone (naive but simple)
- **Rate Limiting**: Not implemented (add if you become popular)
- **Input Validation**: Basic validation only
- **SSL Required**: Use HTTPS/WSS in production
- **Firewall**: Only open port 8443 (or your chosen port)

*Remember: This is a signaling server, not Fort Knox. The actual media goes peer-to-peer.*

## Deployment

### Development
```bash
node server.js
```

### Production with PM2
```bash
pm2 start server.js --name signaling-server
```

### Using Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8443
CMD ["node", "server.js"]
```

### Nginx Reverse Proxy (Optional)
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/private.key;
    
    location / {
        proxy_pass https://localhost:8443;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## Troubleshooting

### "Server won't start"
- Check if port 8443 is already in use: `lsof -i :8443`
- Verify SSL certificate paths
- Make sure you have read permissions for certificates

### "WebSocket connection failed"
- Check if you're using WSS (not WS) in production
- Verify firewall settings
- Test with `curl` or browser dev tools

### "Messages not forwarding"
- Check server logs for errors
- Verify JSON message format
- Make sure both users are in the same room

### "SSL certificate errors"
- Renew your Let's Encrypt certificates
- Check certificate file permissions
- Verify certificate paths in code

## Use Cases

### 1. **Video Calling Apps** 📹
*"The next Zoom killer"*
- One-on-one video conferences
- Customer support with face-to-face interaction
- Virtual doctor appointments (because physical appointments are so 2019)

### 2. **Live Streaming Platforms** 🎬
*"Everyone's a content creator these days"*
- Personal broadcasting to friends
- Live tutoring sessions
- Virtual book clubs (where you actually see if people are paying attention)

### 3. **Dating Applications** 💕
*"Love at first video call"*
- Video verification for profiles
- Virtual first dates (safer than meeting strangers in dark alleys)
- Long-distance relationship maintenance

### 4. **Gaming Communities** 🎮
*"Voice chat with visual confirmation that your teammate is actually 12"*
- Strategy planning sessions
- Tournament streaming
- Showing off your epic gaming setup

### 5. **Remote Work Solutions** 💼
*"Working from home, but make it personal"*
- One-on-one performance reviews
- Client presentations
- Virtual coffee breaks (because Slack isn't personal enough)

### 6. **Educational Platforms** 📚
*"School, but from your pajamas"*
- Personal tutoring sessions
- Language exchange programs
- Virtual science experiments (safely exploding things from home)

### 7. **Telemedicine** 🏥
*"Doctor visits without the waiting room magazines from 2003"*
- Remote consultations
- Mental health therapy sessions
- Follow-up appointments (perfect for when you're too sick to travel)

### 8. **Real Estate Virtual Tours** 🏠
*"House hunting from your current couch"*
- Live property walkthroughs
- Remote inspections
- Showing apartments to out-of-town buyers

### 9. **Fitness and Wellness** 💪
*"Personal training, but your trainer can see if you're actually doing the exercises"*
- One-on-one fitness coaching
- Yoga instruction
- Nutrition consultations

### 10. **Family Connections** 👨‍👩‍👧‍👦
*"Grandma finally gets to see your face"*
- Long-distance family calls
- Virtual holiday celebrations
- Showing off your new apartment/pet/haircut

---

## Contributing

Found a bug? Want to add features? Pull requests welcome!

Guidelines:
- Test your changes (we don't want to break the internet)
- Keep it simple (complexity is the enemy of reliability)
- Add comments (future developers will thank you)
- Don't break existing functionality (please)

## License

This code is provided "as is" without warranty. Use at your own risk. We're not responsible if your signaling server becomes so popular that it crashes from success.

---

*May your connections be stable, your latency low, and your ICE candidates always gathering successfully!*

**Happy Signaling!** 

*P.S. If this server helps you build the next unicorn startup, we accept thank-you notes in the form of GitHub stars and coffee donations. We run on caffeine and validation.* ⭐☕
