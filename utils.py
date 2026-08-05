import re
import logging
from typing import Tuple, Optional, Any
from flask import jsonify, Response
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VideoGrant
from config import Config

logger = logging.getLogger(__name__)


def validate_username(username: Any) -> Tuple[bool, Optional[str], str]:
    """Validate display username."""
    if not username or not isinstance(username, str):
        return False, "Username is required and must be a string.", ""

    cleaned = username.strip()
    if not cleaned:
        return False, "Username cannot be empty.", ""

    if len(cleaned) < 3 or len(cleaned) > 50:
        return False, "Username must be between 3 and 50 characters long.", ""

    if not re.match(r"^[a-zA-Z0-9_\- ]+$", cleaned):
        return False, "Username can only contain alphanumeric characters, spaces, underscores, and hyphens.", ""

    return True, None, cleaned


def validate_room_name(room_name: Any, default_room: str = "general-room") -> Tuple[bool, Optional[str], str]:
    """Validate room name or assign default."""
    if room_name is None or str(room_name).strip() == "":
        return True, None, default_room

    if not isinstance(room_name, str):
        return False, "Room name must be a string.", ""

    cleaned = room_name.strip()
    if len(cleaned) > 128:
        return False, "Room name cannot exceed 128 characters.", ""

    if not re.match(r"^[a-zA-Z0-9_\- ]+$", cleaned):
        return False, "Room name can only contain alphanumeric characters, spaces, underscores, and hyphens.", ""

    return True, None, cleaned


def generate_twilio_token(identity: str, room_name: str, is_host: bool = False, record: bool = False) -> str:
    """
    Generate Twilio Video Access Token with room scoping and optional host/recording grants.
    """
    missing_creds = Config.get_missing_twilio_credentials()
    if missing_creds:
        err_msg = f"Twilio credentials incomplete. Missing configuration for: {', '.join(missing_creds)}"
        logger.error(err_msg)
        raise ValueError(err_msg)

    # Initialize Token
    token = AccessToken(
        Config.TWILIO_ACCOUNT_SID,
        Config.TWILIO_API_KEY_SID,
        Config.TWILIO_API_KEY_SECRET,
        identity=identity,
        ttl=Config.TWILIO_TOKEN_TTL
    )

    # Video Grant
    video_grant = VideoGrant(room=room_name)
    token.add_grant(video_grant)

    encoded_jwt = token.to_jwt()
    if isinstance(encoded_jwt, bytes):
        encoded_jwt = encoded_jwt.decode('utf-8')

    logger.info(f"Generated Twilio token for '{identity}' in room '{room_name}' (Host: {is_host}, Record: {record})")
    return encoded_jwt


def json_response(
    data: Any = None,
    message: str = "",
    status_code: int = 200,
    success: bool = True,
    error: Optional[str] = None
) -> Tuple[Response, int]:
    """Construct structured JSON API response."""
    payload = {
        "success": success,
        "message": message,
        "data": data if data is not None else {}
    }
    if error is not None:
        payload["error"] = error

    return jsonify(payload), status_code
