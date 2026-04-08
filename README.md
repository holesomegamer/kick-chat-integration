# Kick.com Chat Integration Web App

A Node.js web application that integrates with Kick.com's chat API using webhooks through ngrok to display real-time chat messages on a local website.

## 🚀 Features

- **OAuth Authentication** with Kick.com
- **Real-time Chat Messages** display using WebSockets
- **Start/Stop Monitoring** controls for chat channels
- **Channel Management** with input field for channel names
- **Status Checking** functionality
- **Webhook Integration** via ngrok for receiving chat messages
- **Responsive Web Interface** with modern UI

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- ngrok account (for webhook tunneling)
- Kick.com Developer Account

## 🛠️ Installation

1. **Clone or download this project**
   ```bash
   cd chat2tts
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` file with your Kick.com OAuth credentials.

4. **Install ngrok globally (if not already installed)**
   ```bash
   npm install -g ngrok
   ```

## ⚙️ Configuration

### 1. Kick.com OAuth Setup

1. Go to [Kick.com Developer Console](https://kick.com/developer/applications)
2. Create a new application
3. Set the redirect URI to: `http://localhost:3000/auth/callback`
4. Copy the Client ID and Client Secret to your `.env` file

### 2. Environment Variables

Update your `.env` file with the following:

```env
KICK_CLIENT_ID=your_kick_client_id_here
KICK_CLIENT_SECRET=your_kick_client_secret_here
REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=your_random_session_secret_here
PORT=3000
```

## 🚀 Usage

### 1. Start the Application

```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### 2. Set up ngrok Tunnel

In a separate terminal, run:
```bash
ngrok http 3000
```

Copy the HTTPS URL provided by ngrok (e.g., `https://abc123.ngrok.io`)

### 3. Configure Webhooks

You'll need to configure your Kick.com application or use their API to send webhooks to:
```
https://your-ngrok-url.ngrok.io/webhook/chat
```

### 4. Using the Application

1. **Authenticate**: Click "OAuth Login with Kick.com" to authenticate
2. **Enter Channel**: Input the channel name you want to monitor
3. **Start Monitoring**: Click "Start Monitoring" to begin receiving messages
4. **View Messages**: Chat messages will appear in real-time in the chat section
5. **Check Status**: Use "Check Status" to see current monitoring state
6. **Stop Monitoring**: Click "Stop Monitoring" to stop receiving messages

## 📡 API Endpoints

### Authentication
- `GET /auth/kick` - Initiates OAuth flow with Kick.com
- `GET /auth/callback` - OAuth callback endpoint
- `POST /auth/logout` - Logs out the user

### Chat Control
- `POST /chat/start` - Starts monitoring a channel
- `POST /chat/stop` - Stops monitoring
- `GET /chat/status` - Gets current monitoring status

### Webhooks
- `POST /webhook/chat` - Receives chat messages from Kick.com

### API
- `GET /api/chat/history` - Gets chat message history

## 🔧 Development

### Project Structure

```
chat2tts/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env.example          # Environment variables template
├── views/
│   └── index.ejs         # Main HTML template
├── public/
│   ├── css/
│   │   └── style.css     # Styles
│   └── js/
│       └── main.js       # Frontend JavaScript
└── .github/
    └── copilot-instructions.md
```

### Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start development server with nodemon
- `npm run ngrok` - Quick ngrok tunnel command

## 🔌 WebSocket Events

### Client → Server
- Connection/disconnection handled automatically

### Server → Client
- `statusUpdate` - Current monitoring status
- `chatHistory` - Historical chat messages
- `newChatMessage` - New incoming chat message
- `chatStarted` - Monitoring started notification
- `chatStopped` - Monitoring stopped notification

## 🛡️ Security Considerations

- Session data is stored in memory (use Redis in production)
- HTTPS should be used in production
- Validate and sanitize all webhook input
- Implement rate limiting for API endpoints
- Set up proper CORS policies for production

## 🐛 Troubleshooting

### Common Issues

1. **OAuth Authentication Fails**
   - Check your Client ID and Client Secret
   - Verify the redirect URI matches your Kick.com app settings
   - Ensure ngrok tunnel is active if using custom domain

2. **Webhooks Not Received**
   - Verify ngrok tunnel is running and URL is correct
   - Check that webhook URL is properly configured in Kick.com
   - Monitor server logs for incoming requests

3. **Chat Messages Not Displaying**
   - Ensure WebSocket connection is established
   - Check browser console for JavaScript errors
   - Verify chat monitoring is started

### Debug Mode

Add this to your `.env` for verbose logging:
```env
NODE_ENV=development
```

## 📝 License

MIT License - feel free to use this project as a starting point for your own applications.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

If you encounter any issues or have questions, please check the troubleshooting section above or create an issue in the project repository.