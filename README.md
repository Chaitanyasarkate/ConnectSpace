# ConnectSpace - Flask + Twilio Programmable Video Chat Application

A production-ready, real-time multi-participant Video Chat Application built with **Python 3.12**, **Flask**, **Twilio Programmable Video SDK**, and a modern **Vanilla JavaScript** responsive UI with glassmorphism design.

![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)
![Flask](https://img.shields.io/badge/Flask-3.0+-green.svg)
![Twilio Video](https://img.shields.io/badge/Twilio-Programmable%20Video-red.svg)
![License](https://img.shields.io/badge/License-MIT-purple.svg)

---

## 🌟 Key Features

- ✔ **User Identity**: Enter display name & customizable room code.
- ✔ **Camera & Microphone Pre-Check**: Test local devices & permissions before entering rooms.
- ✔ **Twilio WebRTC Video Rooms**: Real-time peer-to-peer and group video streaming powered by Twilio's global infrastructure.
- ✔ **Dynamic Video Grid**: Automatically resizes layout grid for 1, 2, 3-4, 5-6, or 7+ participants.
- ✔ **Live Media Controls**: Mute/Unmute audio mic, Toggle video camera on/off with visual avatar fallbacks.
- ✔ **Participant Counter & Timer**: Live room participant badge count and real-time call duration timer.
- ✔ **Shareable Room Invites**: Copy room link button to easily invite peers to your video session.
- ✔ **Glassmorphism Dark Theme**: Modern UI with CSS custom properties, blur filters, and fluid animations.
- ✔ **Responsive Design**: Built for Mobile, Tablet, and Desktop browsers.
- ✔ **Production Ready**: Full error handling, toast notifications, loading states, and clean project architecture.

---

## 📁 Project Structure

```
flask-twilio-video/
├── .env.example            # Environment variables configuration template
├── .gitignore              # Git ignore file for secrets and Python caches
├── README.md               # Complete project documentation
├── requirements.txt        # Python package dependencies
├── config.py               # Application configuration loader
├── app.py                  # Main Flask application & REST API routes
├── static/
│   ├── css/
│   │   └── style.css       # Responsive dark-mode glassmorphic styling
│   └── js/
│       ├── twilio-room.js  # Twilio Video SDK room manager & track handler
│       └── app.js          # Main UI controller & event binding
└── templates/
    └── index.html          # Single Page Application HTML5 structure
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites

- **Python 3.12** or higher installed.
- A **Twilio Account** ([Sign up free at twilio.com](https://www.twilio.com/)).

### 2. Install Dependencies

Clone or navigate to the project directory and install required Python packages:

```bash
pip install -r requirements.txt
```

### 3. Environment Variables Configuration

Copy `.env.example` to create your local `.env` file:

```bash
cp .env.example .env
```

Open `.env` and fill in your Twilio credentials obtained from the [Twilio Console](https://console.twilio.com):

```env
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_API_KEY_SID=SKXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_API_KEY_SECRET=your_twilio_api_key_secret_here

FLASK_ENV=development
SECRET_KEY=your-custom-production-secret-key
PORT=5000
```

> 💡 **Where to find Twilio Credentials:**
> - **Account SID**: Found on your main Twilio Console dashboard.
> - **API Key SID & Secret**: Navigate to **Account** -> **API Keys & Tokens** -> **Create API Key**.

### 4. Run the Application

Start the Flask server:

```bash
python app.py
```

Open your browser and navigate to:

```
http://localhost:5000
```

---

## 🔌 API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Serves the main HTML5 Video Chat SPA application. |
| `GET` | `/api/health` | Health check endpoint returning backend and Twilio configuration status. |
| `POST` | `/api/token` | Generates a JWT Video Access Token for an identity and room name. |

### Sample Token Request Payload (`POST /api/token`):

```json
{
  "identity": "Alex Johnson",
  "room": "Design-Sync"
}
```

### Sample Response (`200 OK`):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "identity": "Alex Johnson",
  "room": "Design-Sync"
}
```

---

## 🔒 Security & Best Practices

- **Never Commit Secrets**: Secrets like `TWILIO_API_KEY_SECRET` are managed via `.env` files and excluded from git history using `.gitignore`.
- **Short-Lived Access Tokens**: Tokens expire after 1 hour (3600s) to prevent authorization hijacking.
- **HTTPS in Production**: For WebRTC media device access (`getUserMedia`), always serve over HTTPS when deploying to production environments.

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
