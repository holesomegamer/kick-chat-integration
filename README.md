# Kick2TTS Web App

A Node.js web application that integrates with Kick.com's chat API to display real-time chat messages on a local website, with optional local voice synthesis.

## 🚀 Features

- **OAuth Authentication** with Kick.com
- **Real-time Chat Messages** display using WebSockets
- **Start/Stop Monitoring** controls for chat channels
- **Channel Management** with input field for channel names
- **Status Checking** functionality
- **Voice Library UI** for adding, editing, deleting, and tracking voice entries
- **Custom Voice Commands** (for example `!me`) mapped from ready voices
- **Local TTS Provider Support** (CPU, no cloud calls required)
- **Responsive Web Interface** with modern UI

## 📋 Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- Kick.com Developer Account
- Python 3.11 (only if using local voice cloning mode)

## 🛠️ Installation

Use this section for manual setup. For the easiest handoff flow, use the scripts in **Simple Setup** below.

1. **Clone or download this project**
   ```bash
   cd kick-chat-integration
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

## ⚡ Simple Setup (Recommended For Sharing)

Use these scripts for the fastest onboarding:

1. **Core setup (installs Node dependencies + creates `.env` file from template)**
   ```bash
   npm run setup:core
   ```
   *This creates your `.env` file automatically, but you'll still need to add your Kick.com OAuth credentials*

2. **Optional: local CPU voice cloning setup (Python 3.11 + venv + deps)**
   ```bash
   npm run setup:local-tts
   ```

3. **Start both services (main app + local TTS)**
   ```bash
   npm run start:all
   ```

4. **Run diagnostics if anything fails**
   ```bash
   npm run diagnose
   ```

Typical first-time flow:

1. `npm run setup:core`
2. Optional: `npm run setup:local-tts`
3. `npm run start:all`

### Python Verification (Local TTS Only)

Before running `npm run setup:local-tts`, verify Python 3.11 is available:

```powershell
py --list
py -3.11 --version
```

Expected result:

- `py --list` includes a `3.11` entry
- `py -3.11 --version` prints `Python 3.11.x`

If either command fails, install Python 3.11 from python.org and rerun the check.

## ⚙️ Configuration

### 1. Create Environment File

**First, create your `.env` file** (required for the app to work):

1. Copy the example file: `cp .env.example .env` (or manually copy and rename)
2. The `.env` file will contain your private configuration

### 2. Kick.com OAuth Setup

1. Go to [Kick.com Developer Console](https://kick.com/developer/applications)
2. Create a new application
3. Set the redirect URI to: `http://localhost:3000/auth/callback`
4. **Enable the following scopes (checkboxes):**
   - ✅ Read user information (including email address) - *default*
   - ✅ Read Channel points rewards information on a channel
   - ✅ Read, add, edit and delete Channel points rewards on a channel
   - ✅ Write to Chat feed
   - ✅ Subscribe to events (read chat feed, follows, subscribes, gifts)
5. Save the application and copy the Client ID and Client Secret (you'll need these in the next step)

### 3. Environment Variables

**Edit your newly created `.env` file** with your OAuth credentials:

```env
KICK_CLIENT_ID=your_kick_client_id_here
KICK_CLIENT_SECRET=your_kick_client_secret_here
REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=your_random_session_secret_here
PORT=3000
```

**Required fields** (app won't work without these):
- `KICK_CLIENT_ID` - From your Kick.com developer console
- `KICK_CLIENT_SECRET` - From your Kick.com developer console  
- `REDIRECT_URI` - Must match your Kick.com app settings exactly
- `SESSION_SECRET` - Any random string for session security

**Optional fields:**
- `PORT` - Server port (defaults to 3000 if not set)

### 3. Local Voice Provider Mode (No Cloud Calls)

To keep voice cloning and synthesis fully local, enable local mode:

```env
LOCAL_TTS_ENABLED=true
LOCAL_TTS_BASE_URL=http://127.0.0.1:8000
```

For this repo, the main app runs on port 3000 by default:

```env
PORT=3000
REDIRECT_URI=http://localhost:3000/auth/callback
```

When local mode is enabled, the app calls your localhost voice service and does not use ElevenLabs for new clone/synthesis jobs.

Expected localhost endpoints:

- `POST /clone` (multipart form-data)
   - fields: `name`, `tag`, `sample_file`
   - response JSON: `{ "voice_id": "your-local-voice-id" }`

- `POST /synthesize` (application/json)
   - body: `{ "voice_id": "...", "voice_tag": "...", "text": "..." }`
   - response: audio bytes (`audio/mpeg` or `audio/wav`)

If local mode is disabled and `ELEVENLABS_API_KEY` is set, the app uses ElevenLabs. If neither is configured, it uses mock mode for workflow testing.

## 🚀 Usage

### 1. Start the Application

```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

If you use `npm run start:all`, open `http://localhost:3000`.

### 2. Using the Application

1. **Authenticate**: Click "OAuth Login with Kick.com" to authenticate
2. **Enter Channel**: Input the channel name you want to monitor
3. **Start Monitoring**: Click "Start Monitoring" to begin receiving messages
4. **View Messages**: Chat messages will appear in real-time in the chat section
5. **Check Status**: Use "Check Status" to see current monitoring state
6. **Stop Monitoring**: Click "Stop Monitoring" to stop receiving messages

## 📡 API Endpoints

### Authentication
- `GET /auth/kick` - Initiates OAuth flow with Kick.com
- `GET /auth/popup` - Popup OAuth helper endpoint
- `GET /auth/callback` - OAuth callback endpoint
- `POST /auth/logout` - Logs out the user

### Chat And Status
- `GET /messages/:channel` - Fetches channel chat history
- `GET /channel/:channel` - Validates channel access
- `GET /status` - Current monitoring and auth status
- `POST /api/get-live-chat-messages` - Polls latest live chat messages
- `GET /api/tts/settings` - Returns TTS settings
- `POST /api/tts/settings` - Updates TTS settings

### Voice Management
- `GET /voices` - Voice library page
- `GET /api/voices` - List voice metadata and provider mode
- `POST /api/voices` - Create voice from uploaded sample
- `PATCH /api/voices/:voiceId` - Update voice name or tag
- `DELETE /api/voices/:voiceId` - Remove voice and cleanup sample
- `POST /api/tts/custom` - Synthesize audio for a custom voice tag

### Home
- `GET /` - Main control dashboard

## 🔧 Development

### Project Structure

```
kick-chat-integration/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env.example           # Environment variables template
├── scripts/               # Setup/start/diagnostic scripts
├── services/              # Voice provider adapter logic
├── local-tts-service/     # Local Python TTS service
├── data/                  # Persisted voice metadata
├── uploads/               # Uploaded voice sample files
├── views/
│   ├── index.ejs          # Main dashboard
│   └── voices.ejs         # Voice library UI
├── public/
│   ├── css/
│   │   └── style.css      # Styles
│   └── js/
│       ├── main.js        # Main dashboard frontend logic
│       └── voices.js      # Voice library frontend logic
└── .github/
    └── copilot-instructions.md
```

### Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start development server with nodemon
- `npm run setup:core` - Install Node deps and bootstrap `.env`
- `npm run setup:local-tts` - Install Python 3.11 local TTS dependencies
- `npm run start:all` - Start main app and local TTS in separate terminals
- `npm run diagnose` - Environment and service health checks

## 🔌 WebSocket Events

### Client → Server
- Connection/disconnection handled automatically

### Server → Client
- `statusUpdate` - Current monitoring status
- `chatHistory` - Historical chat messages
- `newChatMessage` - New incoming chat message
- `chatStarted` - Monitoring started notification
- `chatStopped` - Monitoring stopped notification

## 🐛 Troubleshooting

### Common Issues

1. **App Won't Start / "Cannot find module" Errors**
   - Make sure you created the `.env` file (copy from `.env.example`)
   - Ensure all required environment variables are set in `.env`
   - Run `npm install` to install dependencies

2. **OAuth Authentication Fails**
   - Check your Client ID and Client Secret
   - Verify the redirect URI matches your Kick.com app settings
   - Verify your local app URL and `REDIRECT_URI` are aligned

3. **OAuth Callback Problems**
   - Confirm `REDIRECT_URI` exactly matches your Kick app redirect URI
   - Restart the app after updating `.env`

4. **Chat Messages Not Displaying**
   - Ensure WebSocket connection is established
   - Check browser console for JavaScript errors
   - Verify chat monitoring is started

5. **TTS Not Triggering**
   - Confirm TTS is enabled in the app settings
   - Confirm your voice tag exists and is marked ready in the Voice Library
   - Confirm your message format matches your configured trigger mode

6. **First Local Voice Generation Is Slow**
   - First local synthesis may download model files and warm up CPU inference
   - This can take significantly longer than later requests
   - Use `npm run diagnose` and check `http://127.0.0.1:8000/health`

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
