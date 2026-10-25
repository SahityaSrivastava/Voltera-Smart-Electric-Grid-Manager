import os
import time
import logging
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, request, render_template

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def get_secret(key: str, default: str = "") -> str:
    """Fetch secret from Azure Key Vault if configured, else environment variables."""
    vault_url = os.getenv("AZURE_KEYVAULT_URL")
    if vault_url:
        try:
            import importlib
            azure_identity = importlib.import_module("azure.identity")
            azure_keyvault = importlib.import_module("azure.keyvault.secrets")
            DefaultAzureCredential = getattr(azure_identity, "DefaultAzureCredential")
            SecretClient = getattr(azure_keyvault, "SecretClient")
            client = SecretClient(vault_url=vault_url, credential=DefaultAzureCredential())
            sec = client.get_secret(key.replace("_", "-"))
            if sec and sec.value:
                return sec.value
        except Exception:
            pass
    return os.getenv(key, default)


class Config:
    """Production and Development Configuration with Azure & Local Fallbacks."""
    _configured_secret = get_secret("SECRET_KEY", "")
    SECRET_KEY = _configured_secret if _configured_secret else "lko-smart-grid-secret-key-prod-2026-uppcl-lesa"
    raw_db = get_secret("DATABASE_URL", "sqlite:///powergrid_lucknow.db")
    if raw_db.startswith("sqlite:///"):
        db_file = raw_db.replace("sqlite:///", "")
        SQLALCHEMY_DATABASE_URI = raw_db if os.path.isabs(db_file) else f"sqlite:///{BASE_DIR / db_file}"
    else:
        SQLALCHEMY_DATABASE_URI = raw_db

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "connect_args": {"timeout": 30}
    }
    AZURE_STORAGE_CONNECTION_STRING = get_secret("AZURE_STORAGE_CONNECTION_STRING", "")
    AZURE_STORAGE_CONTAINER_NAME = get_secret("AZURE_STORAGE_CONTAINER_NAME", "powergrid-fault-photos")
    UPLOAD_FOLDER = BASE_DIR / "uploads"
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
    LUCKNOW_LAT = float(os.getenv("LUCKNOW_LAT", "26.8467"))
    LUCKNOW_LNG = float(os.getenv("LUCKNOW_LNG", "80.9462"))
    GEOHASH_PRIVACY_METERS = int(os.getenv("GEOHASH_PRIVACY_METERS", "300"))
    OPEN_METEO_BASE_URL = os.getenv("OPEN_METEO_BASE_URL", "https://api.open-meteo.com/v1/forecast")
    PRIVACY_HASH_SALT = get_secret("PRIVACY_HASH_SALT", "LESA-UPPCL-LUCKNOW-PRIVACY-SALT-2026")


    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Strict"
    SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "false").lower() in ("true", "1")
    PERMANENT_SESSION_LIFETIME = 14400


from app.models import db
from app.routes import auth_bp, api_bp, view_bp

# Privacy-first logging: completely suppress client IP, device info, and HTTP spam
logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logging.getLogger("werkzeug").setLevel(logging.ERROR)
logging.getLogger("powergrid").setLevel(logging.WARNING)


def create_app(config_class=Config):
    """Application factory for Voltera Grid Operations."""
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    Path(app.config.get("UPLOAD_FOLDER", BASE_DIR / "uploads")).mkdir(parents=True, exist_ok=True)

    app.register_blueprint(view_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(api_bp)

    @app.route("/favicon.ico")
    def favicon():
        return app.send_static_file("img/logo.svg")

    @app.errorhandler(400)
    def bad_request(e):
        return {"success": False, "error": "Bad request", "code": "BAD_REQUEST"}, 400

    @app.errorhandler(401)
    def unauthorized(e):
        return {"success": False, "error": "Authentication required", "code": "UNAUTHORIZED"}, 401

    @app.errorhandler(403)
    def forbidden(e):
        return {"success": False, "error": "Access forbidden", "code": "FORBIDDEN"}, 403

    @app.errorhandler(404)
    def not_found(e):
        if request.path.startswith("/api/"):
            return {"success": False, "error": "Resource not found", "code": "NOT_FOUND"}, 404
        return render_template("index.html", cache_buster=int(time.time())), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return {"success": False, "error": "Method not allowed", "code": "METHOD_NOT_ALLOWED"}, 405

    @app.errorhandler(429)
    def rate_limited(e):
        return {"success": False, "error": "Too many requests. Please try again later.", "code": "RATE_LIMITED"}, 429

    @app.errorhandler(500)
    def internal_error(e):
        return {"success": False, "error": "Internal server error occurred", "code": "SERVER_ERROR"}, 500

    @app.before_request
    def validate_csrf_origin():
        if request.method in ("POST", "PUT", "DELETE", "PATCH"):
            origin = request.headers.get("Origin")
            referer = request.headers.get("Referer")
            current_host = request.host.lower()
            allowed_hosts = {
                current_host,
                current_host.split(":")[0],
                "localhost",
                "127.0.0.1",
                "0.0.0.0",
            }
            if origin:
                origin_host = origin.split("://")[-1].split("/")[0].lower()
                origin_hostname = origin_host.split(":")[0]
                if origin_host != current_host and origin_hostname not in ("localhost", "127.0.0.1", "0.0.0.0"):
                    return {"success": False, "error": "Cross-site request blocked", "code": "CSRF_DETECTED"}, 403
            elif referer:
                ref_host = referer.split("://")[-1].split("/")[0].lower()
                ref_hostname = ref_host.split(":")[0]
                if ref_host != current_host and ref_hostname not in ("localhost", "127.0.0.1", "0.0.0.0"):
                    return {"success": False, "error": "Cross-site request blocked", "code": "CSRF_DETECTED"}, 403

    @app.after_request
    def set_security_headers(response):
        # Strict security headers & absolute zero client identification exposure
        response.headers["Server"] = "Voltera"
        response.headers.update({
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "no-referrer",
            "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Content-Security-Policy": (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com; "
                "img-src 'self' data: https://*.blob.core.windows.net; "
                "connect-src 'self'; "
                "base-uri 'self'; "
                "form-action 'self'; "
                "frame-ancestors 'none';"
            ),
        })
        if request.path.startswith("/static/"):
            response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=3600"
        else:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response

    return app
