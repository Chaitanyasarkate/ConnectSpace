import logging
from flask import Blueprint, request, render_template, Response
from utils import (
    validate_username,
    validate_room_name,
    generate_twilio_token,
    json_response
)

logger = logging.getLogger(__name__)

api_bp = Blueprint("api", __name__)

# In-memory registry for room passwords & waiting room policies
ROOM_SECRETS = {}


@api_bp.route("/", methods=["GET"])
def index():
    """Render main meeting interface."""
    return render_template("index.html")


@api_bp.route("/favicon.ico", methods=["GET"])
def favicon():
    """Suppress 404 for browser favicon request."""
    return Response(status=204)


@api_bp.route("/login", methods=["POST"])
def login():
    """
    POST /login
    Generate a Twilio Video Access Token with room password & host features.
    """
    data = request.get_json(silent=True)
    if data is None:
        data = request.form.to_dict() if request.form else {}

    raw_username = data.get("username") or data.get("identity")
    raw_room = data.get("room") or data.get("room_name")
    password = data.get("password", "").strip()
    is_host = bool(data.get("is_host", False))
    record = bool(data.get("record", False))

    logger.info(f"Login request: username='{raw_username}', room='{raw_room}', host={is_host}")

    # 1. Validate Username
    is_valid_user, user_err, username = validate_username(raw_username)
    if not is_valid_user:
        return json_response(success=False, message="Validation Error", error=user_err, status_code=400)

    # 2. Validate Room Name
    is_valid_room, room_err, room_name = validate_room_name(raw_room)
    if not is_valid_room:
        return json_response(success=False, message="Validation Error", error=room_err, status_code=400)

    # 3. Room Password Validation
    if room_name in ROOM_SECRETS:
        stored_pw = ROOM_SECRETS[room_name]
        if stored_pw and stored_pw != password:
            logger.warning(f"Invalid password attempt for room '{room_name}' by user '{username}'")
            return json_response(
                success=False,
                message="Authentication Failed",
                error="Incorrect room password.",
                status_code=401
            )
    elif is_host and password:
        ROOM_SECRETS[room_name] = password

    # 4. Generate Twilio Access Token
    try:
        token = generate_twilio_token(identity=username, room_name=room_name, is_host=is_host, record=record)
    except ValueError as val_err:
        return json_response(success=False, message="Configuration Error", error=str(val_err), status_code=500)
    except Exception as exc:
        logger.exception(f"Unexpected token error: {exc}")
        return json_response(success=False, message="Server Error", error="Failed to generate token.", status_code=500)

    return json_response(
        data={
            "identity": username,
            "room": room_name,
            "token": token,
            "is_host": is_host,
            "has_password": bool(ROOM_SECRETS.get(room_name))
        },
        message="Authenticated successfully",
        success=True,
        status_code=200
    )


@api_bp.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return json_response(
        data={"status": "healthy", "service": "visionmeet-video-backend"},
        message="Service operational",
        success=True,
        status_code=200
    )
