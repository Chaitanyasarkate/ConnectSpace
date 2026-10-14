import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    """Application configuration class."""
    SECRET_KEY = os.getenv("SECRET_KEY", "default-dev-secret-key-change-me").strip()
    TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    TWILIO_API_KEY_SID = os.getenv("TWILIO_API_KEY_SID", "").strip()
    TWILIO_API_KEY_SECRET = os.getenv("TWILIO_API_KEY_SECRET", "").strip()
    PORT = int(os.getenv("PORT", 5000))
    DEBUG = os.getenv("FLASK_ENV", "development").lower() == "development"

    @classmethod
    def is_twilio_configured(cls) -> bool:
        """Check if Twilio credentials are standard non-placeholder values."""
        has_account_sid = bool(cls.TWILIO_ACCOUNT_SID) and not cls.TWILIO_ACCOUNT_SID.startswith("ACXXXXXXXX")
        has_api_key = bool(cls.TWILIO_API_KEY_SID) and not cls.TWILIO_API_KEY_SID.startswith("SKXXXXXXXX")
        has_secret = bool(cls.TWILIO_API_KEY_SECRET) and cls.TWILIO_API_KEY_SECRET != "your_twilio_api_key_secret_here"
        return has_account_sid and has_api_key and has_secret
