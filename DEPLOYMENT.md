# 🚢 VisionMeet Production Deployment Guide

This guide provides step-by-step instructions for deploying VisionMeet to production across various cloud platforms, including **Docker**, **Render**, **Railway**, **PythonAnywhere**, and **Linux VPS (Nginx + Gunicorn)**.

---

## 🔐 1. Production Environment Variables Matrix

Set the following environment variables on your production hosting platform:

| Variable | Recommended Production Value | Description |
| :--- | :--- | :--- |
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | Your Twilio Account SID |
| `TWILIO_API_KEY_SID` | `SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | Your Twilio API Key SID |
| `TWILIO_API_KEY_SECRET` | `your_production_secret` | Your Twilio API Key Secret |
| `TWILIO_TOKEN_TTL` | `3600` | Token expiration in seconds |
| `SECRET_KEY` | *(Strong hex string, e.g. 64 chars)* | Flask session secret key |
| `FLASK_ENV` | `production` | Disables debug mode for security |
| `PORT` | Set automatically by platform (or `5000`) | Network port |

---

## ⚡ 2. Production Gunicorn Command

The recommended WSGI server command for production execution:

```bash
gunicorn --bind 0.0.0.0:$PORT \
  --workers 4 \
  --threads 2 \
  --worker-class sync \
  --timeout 120 \
  --access-logfile - \
  --error-logfile - \
  app:app
```

### Options Breakdown:
- `--bind 0.0.0.0:$PORT`: Binds to all network interfaces on the designated port.
- `--workers 4`: Allocates 4 worker processes (`(2 * CPU cores) + 1` rule).
- `--threads 2`: Allocates 2 threads per process for concurrent connections.
- `--timeout 120`: Sets request timeout limit to 120 seconds.
- `--access-logfile - / --error-logfile -`: Logs to stdout/stderr for container log aggregators.

---

## 🐳 3. Docker & Docker Compose Deployment

### Option A: Running with Docker CLI
```bash
# Build Docker image
docker build -t visionmeet:latest .

# Run container with environment file
docker run -d \
  --name visionmeet_app \
  -p 5000:5000 \
  --env-file .env \
  visionmeet:latest
```

### Option B: Running with Docker Compose
```bash
# Launch container in background
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop container
docker-compose down
```

---

## 🚀 4. Render Deployment

Render automatically detects the [`render.yaml`](file:///c:/Users/chaitanya%20sarkate/OneDrive/Desktop/flask-twilio-video/render.yaml) file in your repository.

1. Push your repository to **GitHub** or **GitLab**.
2. Log in to **[Render.com](https://render.com/)** and click **New -> Web Service**.
3. Connect your Git repository.
4. Render will auto-fill settings:
   - **Environment**: `Python`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn --bind 0.0.0.0:$PORT --workers 4 app:app`
5. Add your Environment Variables (`TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `SECRET_KEY`).
6. Click **Deploy Web Service**.

---

## 🚂 5. Railway Deployment

1. Install the Railway CLI or connect via the web dashboard at **[Railway.app](https://railway.app/)**.
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your `flask-twilio-video` repository.
4. In **Variables**, add:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_API_KEY_SID`
   - `TWILIO_API_KEY_SECRET`
   - `SECRET_KEY`
   - `FLASK_ENV=production`
5. Set **Start Command** (in Settings):
   ```bash
   gunicorn --bind 0.0.0.0:$PORT --workers 4 app:app
   ```
6. Click **Deploy**.

---

## 🐍 6. PythonAnywhere Deployment

1. Log in to **[PythonAnywhere](https://www.pythonanywhere.com/)**.
2. Open a **Bash Console** and clone your repo:
   ```bash
   git clone https://github.com/yourusername/flask-twilio-video.git
   cd flask-twilio-video
   ```
3. Create a virtual environment and install packages:
   ```bash
   mkvirtualenv --python=/usr/bin/python3.10 myenv
   pip install -r requirements.txt
   ```
4. Go to the **Web** tab -> **Add a new web app**:
   - Choose **Manual Configuration** -> **Python 3.10**.
5. Set Virtualenv path to `/home/yourusername/.virtualenvs/myenv`.
6. Edit the **WSGI configuration file** (`/var/www/yourusername_pythonanywhere_com_wsgi.py`):
   ```python
   import sys
   import os

   path = '/home/yourusername/flask-twilio-video'
   if path not in sys.path:
       sys.path.append(path)

   os.environ['TWILIO_ACCOUNT_SID'] = 'your_account_sid'
   os.environ['TWILIO_API_KEY_SID'] = 'your_api_key_sid'
   os.environ['TWILIO_API_KEY_SECRET'] = 'your_api_key_secret'
   os.environ['SECRET_KEY'] = 'your_secret_key'

   from app import app as application
   ```
7. Click **Reload yourusername.pythonanywhere.com**.

---

## 🖥️ 7. Ubuntu VPS Deployment (Nginx + Gunicorn + Systemd)

### Step 1: System Package & Virtualenv Setup
```bash
sudo apt update && sudo apt install -y python3-pip python3-venv nginx git
cd /var/www
sudo git clone https://github.com/yourusername/flask-twilio-video.git
cd flask-twilio-video
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Step 2: Systemd Service Setup
Create a service file at `/etc/systemd/system/visionmeet.service`:

```ini
[Unit]
Description=Gunicorn instance to serve VisionMeet
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/flask-twilio-video
Environment="PATH=/var/www/flask-twilio-video/venv/bin"
EnvironmentFile=/var/www/flask-twilio-video/.env
ExecStart=/var/www/flask-twilio-video/venv/bin/gunicorn --workers 4 --bind 127.0.0.1:5000 app:app

[Install]
WantedBy=multi-user.target
```

Enable and start service:
```bash
sudo systemctl daemon-reload
sudo systemctl start visionmeet
sudo systemctl enable visionmeet
```

### Step 3: Nginx Proxy & SSL
1. Copy [`nginx.conf`](file:///c:/Users/chaitanya%20sarkate/OneDrive/Desktop/flask-twilio-video/nginx.conf) to `/etc/nginx/sites-available/visionmeet`.
2. Enable site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/visionmeet /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```
3. Secure with Let's Encrypt SSL:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```
