import os
import sys
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VideoGrant
from config import Config

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config.from_object(Config)
CORS(app)


@app.after_request
def add_security_headers(response):
    """Add Content-Security-Policy header allowing unsafe-eval for Twilio WebRTC SDK."""
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://sdk.twilio.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; "
        "img-src 'self' data: blob: https:; "
        "media-src 'self' blob: mediastream:; "
        "connect-src 'self' wss: https: https://*.twilio.com wss://*.twilio.com; "
        "worker-src 'self' blob:;"
    )
    response.headers["Content-Security-Policy"] = csp
    return response


@app.route("/")
def index():
    """Render the single page video chat application."""
    return render_template("index.html")


@app.route("/favicon.ico")
def favicon():
    """Return 204 No Content for favicon requests."""
    return "", 204


@app.route("/health", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health_check():
    """API health status endpoint."""
    return jsonify({
        "status": "healthy",
        "twilio_configured": Config.is_twilio_configured()
    }), 200


@app.route("/api/token", methods=["POST"])
def get_token():
    """
    Generate a Twilio Video Access Token for a given user identity and room name.
    Expects JSON body: { "identity": "User Name", "room": "Room Name" }
    """
    data = request.get_json() or {}
    identity = data.get("identity", "").strip()
    room = data.get("room", "").strip()

    if not identity:
        return jsonify({
            "error": "User identity (name) is required.",
            "code": "MISSING_IDENTITY"
        }), 400

    if not room:
        return jsonify({
            "error": "Room name is required.",
            "code": "MISSING_ROOM"
        }), 400

    # Validate Twilio environment configuration
    if not Config.is_twilio_configured():
        return jsonify({
            "error": "Twilio credentials are not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, and TWILIO_API_KEY_SECRET in your .env file.",
            "code": "TWILIO_NOT_CONFIGURED"
        }), 500

    try:
        # Create Access Token
        token = AccessToken(
            Config.TWILIO_ACCOUNT_SID,
            Config.TWILIO_API_KEY_SID,
            Config.TWILIO_API_KEY_SECRET,
            identity=identity,
            ttl=3600
        )

        # Grant access to the specified video room
        grant = VideoGrant(room=room)
        token.add_grant(grant)

        # Generate JWT string
        jwt_token = token.to_jwt()

        return jsonify({
            "token": jwt_token,
            "identity": identity,
            "room": room
        }), 200

    except Exception as e:
        app.logger.error(f"Error generating Twilio token: {str(e)}")
        return jsonify({
            "error": f"Failed to generate access token: {str(e)}",
            "code": "TOKEN_GENERATION_FAILED"
        }), 500


@app.errorhandler(404)
def not_found_error(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Resource not found", "code": "NOT_FOUND"}), 404
    return render_template("index.html"), 404


@app.errorhandler(500)
def internal_error(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Internal server error", "code": "SERVER_ERROR"}), 500
    return render_template("index.html"), 500


if __name__ == "__main__":
    port = Config.PORT
    debug = Config.DEBUG
    print(f"🚀 Starting Video Chat Application on http://localhost:{port}")
    print(f"🔑 Twilio Status: {'Configured ✅' if Config.is_twilio_configured() else 'Not Configured ⚠️ (Update .env file)'}")
    app.run(host="0.0.0.0", port=port, debug=debug)
