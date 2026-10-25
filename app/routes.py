import os
import re
import time
import math
import html
import random
import threading
from collections import defaultdict
from functools import wraps
from pathlib import Path
from datetime import datetime, timezone
from flask import (
    Blueprint, jsonify, request, session, render_template,
    send_from_directory, current_app, Response, stream_with_context, abort
)
from sqlalchemy.orm import joinedload
from app.models import (
    db, User, PowerGridRegion, Transformer, CriticalFacility,
    OutageReport, Incident, Crew, DispatchRecord, CrossDeviceMessage,
    PrivacyAuditLog, ROLE_PERMISSIONS
)
from app.services import (
    cloak_coordinates, hash_identifier, mask_phone_number, mask_email,
    log_privacy_event, upload_fault_photo, get_lucknow_weather,
    set_weather_scenario, reverse_geocode_lucknow, WEATHER_SCENARIOS,
    predict_transformer_failure, correlate_and_detect_outages,
    get_recommended_crews_for_incident, execute_crew_dispatch,
    register_subscriber, unregister_subscriber, broadcast_event,
    create_cross_device_message, generate_crew_dispatch_route
)

def _utc_now():
    return datetime.now(timezone.utc)

def _get_user(uid):
    if not uid:
        return None
    return db.session.get(User, uid) if hasattr(db.session, "get") else User.query.get(uid)

def _sanitize_text(val: str, max_len: int = 500) -> str:
    """Escapes HTML and strips control characters for defense-in-depth against XSS."""
    if not val:
        return ""
    cleaned = str(val).strip()[:max_len]
    return html.escape(cleaned, quote=True)

view_bp = Blueprint("view", __name__)
auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
api_bp = Blueprint("api", __name__, url_prefix="/api")

# In-memory thread-safe rate limiter for authentication & abuse protection
_rate_lock = threading.Lock()
_action_timestamps = defaultdict(list)

def _is_rate_limited(bucket: str, max_attempts: int = 10, window_secs: int = 60) -> bool:
    now = time.time()
    with _rate_lock:
        if len(_action_timestamps) > 100:
            stale_keys = [k for k, ts in _action_timestamps.items() if not ts or (now - ts[-1] > window_secs)]
            for k in stale_keys:
                _action_timestamps.pop(k, None)

        timestamps = [t for t in _action_timestamps[bucket] if now - t < window_secs]
        if timestamps:
            _action_timestamps[bucket] = timestamps
        else:
            _action_timestamps.pop(bucket, None)
        return len(timestamps) >= max_attempts

def _record_action(bucket: str):
    now = time.time()
    with _rate_lock:
        _action_timestamps[bucket].append(now)

def _clear_actions(bucket: str):
    with _rate_lock:
        _action_timestamps.pop(bucket, None)

# ==============================================================================
# AUTH HELPERS & DECORATORS
# ==============================================================================
def get_current_user():
    return _get_user(session.get("user_id"))

def role_required(*allowed_roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            uid = session.get("user_id")
            if not uid:
                return jsonify({"success": False, "error": "Authentication required. Please sign in.", "code": "AUTH_REQUIRED"}), 401
            user = _get_user(uid)
            if not user:
                session.clear()
                return jsonify({"success": False, "error": "User account not found"}), 401
            if user.role == "ADMIN" or (allowed_roles and user.role in allowed_roles):
                return fn(*args, **kwargs)
            return jsonify({"success": False, "error": f"Access denied. Required role: {', '.join(allowed_roles)}. Your role: {user.role}", "code": "FORBIDDEN"}), 403
        return wrapper
    return decorator

# ==============================================================================
# 1. VIEW ROUTES
# ==============================================================================
@view_bp.route("/")
def index():
    return render_template("index.html", cache_buster=int(time.time()))

@view_bp.route("/uploads/<path:filename>")
def uploaded_file(filename):
    clean_name = os.path.basename(filename)
    if not clean_name or ".." in clean_name or clean_name.startswith("."):
        abort(400)
    allowed_exts = {".jpg", ".jpeg", ".png", ".webp", ".svg"}
    if os.path.splitext(clean_name)[1].lower() not in allowed_exts:
        abort(403)
    folder = Path(current_app.config.get("UPLOAD_FOLDER", Path(current_app.root_path).parent / "uploads")).resolve()
    target_file = (folder / clean_name).resolve()
    if not target_file.is_relative_to(folder) or not target_file.is_file():
        abort(404)
    return send_from_directory(folder, clean_name)

# ==============================================================================
# 2. AUTH & USER MANAGEMENT ROUTES
# ==============================================================================
@auth_bp.route("/me", methods=["GET"])
def get_me():
    user = get_current_user()
    if not user:
        return jsonify({"authenticated": False, "user": None})
    return jsonify({"authenticated": True, "user": user.to_dict(), "permissions": user.get_permissions()})

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    pwd = data.get("password", "").strip()
    if not email or not pwd:
        return jsonify({"success": False, "error": "Email and password are required"}), 400
    if email == "admin":
        email = "admin@lesa.up.gov.in"
    elif email == "operator":
        email = "operator@lesa.up.gov.in"
    elif email in ("citizen", "resident", "consumer"):
        email = "resident@lucknow.in"
    elif email in ("crew", "crew1", "field_crew", "amausi_crew"):
        # Default crew alias maps to LESA-Amausi-1 or first active crew
        disp_crew = Crew.query.filter_by(status="BUSY").first() or Crew.query.filter_by(status="AVAILABLE").first()
        if disp_crew and disp_crew.leader:
            email = disp_crew.leader.email
        else:
            c_user = User.query.filter_by(role="CREW").first()
            if c_user:
                email = c_user.email
    elif email.startswith("crew_") or email.startswith("crew-"):
        # Match crew usernames like crew_lesa_alambagh_1
        c_user = User.query.filter(User.email.ilike(f"%{email}%")).first()
        if c_user:
            email = c_user.email

    rate_key = f"login_acc_{hash_identifier(email)}"
    if _is_rate_limited(rate_key, max_attempts=12, window_secs=60) or _is_rate_limited("login_burst_global", max_attempts=50, window_secs=60):
        return jsonify({"success": False, "error": "Too many failed attempts. Please wait 60 seconds.", "code": "RATE_LIMITED"}), 429

    user = User.query.filter((User.email == email) | (User.email.ilike(email))).first()
    if not user and "@" not in email:
        user = User.query.filter(User.email.ilike(f"{email}@%")).first()

    if not user or not user.check_password(pwd):
        _record_action(rate_key)
        _record_action("login_burst_global")
        return jsonify({"success": False, "error": "Invalid username or password"}), 401

    _clear_actions(rate_key)
    session.clear()
    session["user_id"] = user.id
    session["active_role"] = user.role
    log_privacy_event(user.role, "USER_LOGIN", user.email, "LESA / UPPCL Authentication Service")
    return jsonify({"success": True, "message": f"Welcome back, {user.name}", "user": user.to_dict(), "permissions": user.get_permissions()})

@auth_bp.route("/quick-switch", methods=["POST"])
def quick_switch():
    data = request.get_json() or {}
    role = data.get("role")
    crew_id = data.get("crew_id")
    email = data.get("email")

    # Privilege escalation defense: Administrative roles require proper credentialed authentication
    if role in ("ADMIN", "OPERATOR"):
        curr = get_current_user()
        if not curr or curr.role != "ADMIN":
            return jsonify({
                "success": False,
                "error": "Privilege escalation blocked. Administrative accounts require credentialed authentication.",
                "code": "FORBIDDEN"
            }), 403

    user = None
    if crew_id:
        crew = db.session.get(Crew, crew_id) if hasattr(db.session, "get") else Crew.query.get(crew_id)
        if crew and crew.leader:
            user = crew.leader
    elif email:
        target_candidate = User.query.filter((User.email == email) | (User.email.ilike(email))).first()
        if target_candidate and target_candidate.role in ("ADMIN", "OPERATOR"):
            curr = get_current_user()
            if not curr or curr.role != "ADMIN":
                return jsonify({
                    "success": False,
                    "error": "Privilege escalation blocked. Administrative accounts require credentialed authentication.",
                    "code": "FORBIDDEN"
                }), 403
        user = target_candidate
    elif role == "ADMIN":
        user = User.query.filter_by(role="ADMIN").first()
    elif role == "OPERATOR":
        user = User.query.filter_by(role="OPERATOR").first()
    elif role == "CREW":
        disp_crew = Crew.query.filter_by(status="BUSY").first() or Crew.query.filter_by(status="AVAILABLE").first()
        user = disp_crew.leader if (disp_crew and disp_crew.leader) else User.query.filter_by(role="CREW").first()
    elif role in ("CONSUMER", "CITIZEN"):
        user = User.query.filter_by(role="CONSUMER").first()

    if not user:
        return jsonify({"success": False, "error": "Target user profile not found"}), 404

    session.clear()
    session["user_id"] = user.id
    session["active_role"] = user.role
    log_privacy_event(user.role, "USER_LOGIN_SWITCH", user.email, "Session quick-switch")
    return jsonify({
        "success": True,
        "message": f"Active account switched to {user.name} ({user.role})",
        "user": user.to_dict(),
        "permissions": user.get_permissions()
    })

@auth_bp.route("/guest", methods=["POST"])
def guest_login():
    user = User.query.filter_by(role="CONSUMER").first() or User.query.first()
    if user:
        session.clear()
        session["user_id"] = user.id
        session["active_role"] = user.role
        return jsonify({"success": True, "message": "Connected as Citizen Guest", "user": user.to_dict(), "permissions": user.get_permissions()})
    return jsonify({"success": False, "error": "No default profile available"}), 404

@auth_bp.route("/logout", methods=["POST"])
def logout():
    user = get_current_user()
    role = user.role if user else "ANONYMOUS"
    session.clear()
    log_privacy_event(role, "USER_LOGOUT", "SYSTEM", "Session invalidated")
    return jsonify({"success": True, "message": "Logged out successfully"})

@auth_bp.route("/users", methods=["GET"])
@role_required("ADMIN")
def list_users():
    users = User.query.order_by(User.id.asc()).all()
    return jsonify({"success": True, "count": len(users), "users": [u.to_dict() for u in users]})

@auth_bp.route("/users", methods=["POST"])
@role_required("ADMIN")
def create_user():
    data = request.get_json() or {}
    name = _sanitize_text(data.get("name", ""), max_len=100)
    email = data.get("email", "").strip().lower()
    pwd = data.get("password", "").strip()
    role = data.get("role", "OPERATOR").strip().upper()
    phone = re.sub(r"[^\d+\-\s()]", "", str(data.get("phone", "")))[:25]
    zone = _sanitize_text(data.get("zone", "Lucknow"), max_len=80)

    if not name or not email or not pwd:
        return jsonify({"success": False, "error": "Name, email, and password are required"}), 400
    if len(pwd) < 8:
        return jsonify({"success": False, "error": "Password must be at least 8 characters long"}), 400
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return jsonify({"success": False, "error": "Invalid email address format"}), 400
    if role not in ROLE_PERMISSIONS:
        return jsonify({"success": False, "error": f"Invalid role. Must be one of: {list(ROLE_PERMISSIONS.keys())}"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"success": False, "error": f"An account with email {email} already exists"}), 400

    u = User(name=name, email=email, email_masked=mask_email(email), role=role, phone_masked=mask_phone_number(phone), zone=zone)
    u.set_password(pwd)
    db.session.add(u)
    db.session.commit()
    log_privacy_event("ADMIN", "CREATE_USER_ACCOUNT", f"{email} ({role})", "Admin RBAC User Provisioning")
    return jsonify({"success": True, "message": f"Account for {name} ({role}) created successfully", "user": u.to_dict()})

@auth_bp.route("/users/<int:user_id>", methods=["DELETE"])
@role_required("ADMIN")
def delete_user(user_id):
    curr = get_current_user()
    if curr and curr.id == user_id:
        return jsonify({"success": False, "error": "Cannot delete your own admin account"}), 400
    user = db.session.get(User, user_id)
    if not user:
        abort(404)
    email = user.email

    # Safely detach foreign key references before deleting user
    for c in user.crews_led:
        c.leader_id = None
    for d in user.dispatches_authorized:
        d.operator_id = None
    from app.models import PowerGridRegion
    PowerGridRegion.query.filter_by(coordinator_id=user.id).update({"coordinator_id": None})

    db.session.delete(user)
    db.session.commit()
    log_privacy_event("ADMIN", "DELETE_USER_ACCOUNT", email, "Admin RBAC User Deprovisioning")
    return jsonify({"success": True, "message": f"Account {email} deleted successfully"})

# ==============================================================================
# 3. SPATIAL GRID, TELEMETRY & OPERATIONS API
# ==============================================================================
@api_bp.route("/stream/events", methods=["GET"])
def stream_events():
    def event_generator():
        q = register_subscriber()
        try:
            yield f"event: connected\ndata: {{\"connected\": true, \"timestamp\": \"{_utc_now().isoformat()}\"}}\n\n"
            while True:
                try:
                    yield q.get(timeout=15.0)
                except Exception:
                    yield f": keep-alive {time.time()}\n\n"
        finally:
            unregister_subscriber(q)

    return Response(
        stream_with_context(event_generator()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"}
    )

@api_bp.route("/regions", methods=["GET"])
def get_regions():
    regions = PowerGridRegion.query.options(
        joinedload(PowerGridRegion.power_houses),
        joinedload(PowerGridRegion.crews)
    ).order_by(PowerGridRegion.name.asc()).all()
    return jsonify({"success": True, "count": len(regions), "regions": [r.to_dict() for r in regions]})

@api_bp.route("/regions/<int:region_id>", methods=["GET"])
def get_region_detail(region_id):
    region = db.session.get(PowerGridRegion, region_id)
    if not region:
        abort(404)
    power_houses = [t.to_dict() for t in region.power_houses]
    crews = [c.to_dict() for c in region.crews]
    incidents = [inc.to_dict() for ph in region.power_houses for inc in ph.incidents if inc.status != "RESOLVED"]
    return jsonify({"success": True, "region": region.to_dict(), "power_houses": power_houses, "crews": crews, "active_incidents": incidents})

@api_bp.route("/transformers", methods=["GET"])
def get_transformers():
    zone, region_id = request.args.get("zone"), request.args.get("region_id", type=int)
    query = Transformer.query.options(
        joinedload(Transformer.grid_region),
        joinedload(Transformer.critical_facilities)
    )
    if region_id: query = query.filter_by(grid_region_id=region_id)
    if zone: query = query.filter((Transformer.zone == zone) | (Transformer.sub_region.ilike(f"%{zone}%")))
    tfs = query.all()
    return jsonify({"success": True, "count": len(tfs), "transformers": [t.to_dict() for t in tfs]})

@api_bp.route("/transformers/<int:tf_id>", methods=["GET"])
def get_transformer_detail(tf_id):
    tf = db.session.get(Transformer, tf_id)
    if not tf:
        abort(404)
    weather = get_lucknow_weather()
    ml_res = predict_transformer_failure(tf.temperature_c, tf.voltage_v, tf.current_a, tf.load_pct, tf.oil_level_pct, weather.get("temp_c", 32.0))
    facilities = [f.to_dict() for f in tf.critical_facilities]
    active_inc = Incident.query.filter(Incident.transformer_id == tf.id, Incident.status != "RESOLVED").first()
    return jsonify({"success": True, "transformer": tf.to_dict(), "ml_inference": ml_res, "critical_facilities": facilities, "active_incident": active_inc.to_dict() if active_inc else None})

@api_bp.route("/transformers/<int:tf_id>/telemetry", methods=["POST"])
@role_required("OPERATOR")
def update_telemetry(tf_id):
    tf = db.session.get(Transformer, tf_id)
    if not tf:
        abort(404)
    data = request.get_json() or {}
    val_ranges = {
        "temperature_c": (-40.0, 200.0),
        "voltage_v": (50.0, 500.0),
        "current_a": (0.0, 500.0),
        "load_pct": (0.0, 250.0),
        "oil_level_pct": (0.0, 100.0),
    }
    for k, (min_v, max_v) in val_ranges.items():
        if k in data:
            try:
                v = float(data[k])
                if math.isnan(v) or math.isinf(v) or not (min_v <= v <= max_v):
                    return jsonify({"success": False, "error": f"Value out of permissible range for {k}"}), 400
                setattr(tf, k, v)
            except (TypeError, ValueError):
                return jsonify({"success": False, "error": f"Numeric value required for {k}"}), 400

    weather = get_lucknow_weather()
    ml_res = predict_transformer_failure(tf.temperature_c, tf.voltage_v, tf.current_a, tf.load_pct, tf.oil_level_pct, weather.get("temp_c", 32.0))
    tf.failure_probability, tf.status, tf.last_updated = ml_res["failure_probability"], ml_res["status"], _utc_now()
    db.session.commit()
    correlate_and_detect_outages(tf.id)
    broadcast_event("telemetry_updated", {"transformer": tf.to_dict(), "ml_inference": ml_res})
    return jsonify({"success": True, "transformer": tf.to_dict(), "ml_inference": ml_res})

@api_bp.route("/transformers/<int:tf_id>/simulate-fault", methods=["POST"])
@role_required("OPERATOR")
def simulate_fault(tf_id):
    tf = db.session.get(Transformer, tf_id)
    if not tf:
        abort(404)
    tf.temperature_c = round(random.uniform(96.0, 108.0), 1)
    tf.voltage_v = round(random.uniform(170.0, 185.0), 1)
    tf.load_pct = round(random.uniform(98.0, 118.0), 1)
    tf.oil_level_pct = round(random.uniform(32.0, 48.0), 1)
    tf.last_updated = _utc_now()

    weather = get_lucknow_weather()
    ml_res = predict_transformer_failure(tf.temperature_c, tf.voltage_v, tf.current_a, tf.load_pct, tf.oil_level_pct, weather.get("temp_c", 32.0))
    tf.failure_probability, tf.status = ml_res["failure_probability"], ml_res["status"]
    db.session.commit()
    incidents = correlate_and_detect_outages(tf.id)
    broadcast_event("fault_simulated", {"transformer": tf.to_dict(), "incidents": [i.to_dict() for i in incidents]})
    return jsonify({"success": True, "transformer": tf.to_dict(), "incidents": [i.to_dict() for i in incidents]})

@api_bp.route("/emergency/simulate", methods=["POST"])
@role_required("OPERATOR")
def simulate_random_emergency():
    all_tfs = Transformer.query.all()
    if not all_tfs:
        return jsonify({"success": False, "error": "No substations found"}), 404

    # Select random transformer, preferably one not currently CRITICAL
    available_tfs = [t for t in all_tfs if t.status != "CRITICAL"]
    tf = random.choice(available_tfs) if available_tfs else random.choice(all_tfs)

    emergency_scenarios = [
        ("33kV Busbar Arc Flash & Multi-Feeder Trip", 95.0, "Catastrophic busbar flashover detected across distribution panels. High fault current triggered protection relays."),
        ("132/33kV Primary Transformer Core Thermal Overload", 92.5, "Severe core overheating reaching 106°C under peak distribution stress. Buchholz gas relay warning activated."),
        ("Underground 33kV Feeder Cable Severance", 97.0, "Civil works excavator severed primary underground distribution line. Immediate gang clearance required."),
        ("Severe Thunderstorm Lightning Strike on Feeder Circuit", 88.5, "Atmospheric surge strike caused insulator shatter and transient phase-to-ground flashover."),
        ("Phase Imbalance & Frequency Surge Outage", 86.0, "Heavy asymmetric load caused severe voltage sag to 172V and phase distortion across busbars."),
        ("Substation Oil Pressure Loss & Breaker Lockout", 94.0, "Rapid cooling oil leak triggered automatic circuit breaker lockout to prevent tank rupture.")
    ]
    cause, sev, desc = random.choice(emergency_scenarios)

    tf.temperature_c = round(random.uniform(98.0, 114.0), 1)
    tf.voltage_v = round(random.uniform(165.0, 180.0), 1)
    tf.load_pct = round(random.uniform(108.0, 125.0), 1)
    tf.oil_level_pct = round(random.uniform(25.0, 38.0), 1)
    tf.failure_probability = round(random.uniform(0.91, 0.99), 2)
    tf.status = "CRITICAL"
    tf.last_updated = _utc_now()
    db.session.commit()

    incidents = correlate_and_detect_outages(tf.id)
    new_inc = incidents[0] if incidents else None

    # Broadcast real-time SSE emergency event
    broadcast_event("emergency_simulated", {
        "transformer": tf.to_dict(),
        "emergency_title": cause,
        "severity": sev,
        "description": desc,
        "incident": new_inc.to_dict() if new_inc else None
    })

    # Log cross device notification
    try:
        create_cross_device_message(
            incident_id=new_inc.id if new_inc else None,
            sender_role="SYSTEM",
            sender_name="SCADA Automated Grid Telemetry",
            target_role="OPERATOR",
            channel="SCADA",
            message_body=f"[SCADA EMERGENCY] {cause} at {tf.substation_name}. Severity {sev}/100. Automated dispatch order initiated."
        )
    except Exception as e:
        current_app.logger.warning(f"Failed to log emergency cross device message: {e}")

    return jsonify({
        "success": True,
        "transformer": tf.to_dict(),
        "emergency_title": cause,
        "severity": sev,
        "description": desc,
        "incident": new_inc.to_dict() if new_inc else None
    })

@api_bp.route("/emergency/clear", methods=["POST"])
@role_required("ADMIN")
def clear_simulated_emergencies():
    now = _utc_now()
    active_incidents = Incident.query.filter(Incident.status != "RESOLVED").all()
    resolved_count = 0
    for inc in active_incidents:
        inc.status = "RESOLVED"
        inc.resolved_at = now
        resolved_count += 1
        for d in inc.dispatches:
            if not d.resolved_at:
                d.resolved_at = now
                if d.crew:
                    d.crew.status = "AVAILABLE"
                    d.crew.active_workload = 0

    critical_tfs = Transformer.query.filter_by(status="CRITICAL").all()
    for tf in critical_tfs:
        tf.status = "NORMAL"
        tf.temperature_c = 65.0
        tf.voltage_v = 230.0
        tf.load_pct = 58.0
        tf.failure_probability = 0.04
        tf.oil_level_pct = 85.0
        tf.last_updated = now

    for tf in Transformer.query.filter(Transformer.status == "WARNING").all():
        tf.status = "NORMAL"
        tf.temperature_c = 65.0
        tf.voltage_v = 230.0
        tf.load_pct = 55.0
        tf.failure_probability = 0.04
        tf.last_updated = now

    db.session.commit()

    try:
        create_cross_device_message(
            incident_id=None,
            sender_role="ADMIN",
            sender_name="LESA Grid Administrator",
            target_role="ALL",
            channel="SYSTEM",
            message_body="[GRID NORMALIZED] Emergency state cleared by Administrator. All 33/11kV substations normalized."
        )
    except Exception as e:
        current_app.logger.warning(f"Failed to create clear message: {e}")

    broadcast_event("emergency_cleared", {
        "success": True,
        "resolved_incidents_count": resolved_count,
        "normalized_substations_count": len(critical_tfs)
    })

    return jsonify({
        "success": True,
        "message": "All emergency outages resolved and grid telemetry normalized.",
        "resolved_incidents": resolved_count,
        "normalized_substations": len(critical_tfs)
    })

@api_bp.route("/incidents", methods=["GET"])
def get_incidents():
    status_filter, region_id = request.args.get("status"), request.args.get("region_id", type=int)
    query = Incident.query.options(
        joinedload(Incident.transformer),
        joinedload(Incident.dispatches).joinedload(DispatchRecord.crew).joinedload(Crew.leader)
    )
    if status_filter and status_filter != "ALL": query = query.filter_by(status=status_filter)
    if region_id: query = query.join(Transformer).filter(Transformer.grid_region_id == region_id)
    incidents = query.order_by(Incident.severity_score.desc(), Incident.created_at.desc()).all()
    return jsonify({"success": True, "count": len(incidents), "incidents": [i.to_dict() for i in incidents]})

@api_bp.route("/incidents/<int:inc_id>/dispatch-recommendations", methods=["GET"])
def get_dispatch_recommendations(inc_id):
    recs = get_recommended_crews_for_incident(inc_id)
    closest = recs[0] if recs else None
    return jsonify({
        "success": True,
        "incident_id": inc_id,
        "recommendations": recs,
        "closest_crew": closest
    })

@api_bp.route("/incidents/<int:inc_id>/dispatch", methods=["POST"])
@role_required("OPERATOR")
def dispatch_crew(inc_id):
    data = request.get_json() or {}
    raw_crew_id = data.get("crew_id")
    if not raw_crew_id:
        return jsonify({"success": False, "error": "crew_id is required"}), 400
    try:
        crew_id = int(raw_crew_id)
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invalid crew_id format"}), 400

    user = get_current_user()
    operator_id = user.id if user else data.get("operator_id", 1)
    res = execute_crew_dispatch(incident_id=inc_id, crew_id=crew_id, operator_id=operator_id)
    if not res.get("success"): return jsonify(res), 400
    log_privacy_event("OPERATOR", "CREW_DISPATCH_AUTHORIZED", f"Incident #{inc_id} -> Crew #{crew_id}", "LESA Standard SOP 2026")
    return jsonify(res)

@api_bp.route("/incidents/<int:inc_id>/status", methods=["POST"])
@role_required("OPERATOR", "CREW")
def update_incident_status(inc_id):
    incident = db.session.get(Incident, inc_id)
    if not incident:
        abort(404)
    data = request.get_json() or {}
    new_status = data.get("status")
    if new_status not in ["DETECTED", "VERIFIED", "DISPATCHED", "EN_ROUTE", "ON_SITE", "RESOLVED"]:
        return jsonify({"success": False, "error": "Invalid status"}), 400

    incident.status = new_status
    active_disp = incident.dispatches[-1] if incident.dispatches else None

    sub_name = incident.transformer.substation_name if incident.transformer else "Grid Substation"

    if new_status == "RESOLVED":
        incident.resolved_at = _utc_now()
        for d in incident.dispatches:
            if not d.resolved_at:
                d.resolved_at = _utc_now()
                if d.crew:
                    d.crew.status = "AVAILABLE"
                    d.crew.active_workload = max(0, d.crew.active_workload - 1)
        if incident.transformer:
            tf = incident.transformer
            tf.status, tf.temperature_c, tf.voltage_v, tf.load_pct, tf.failure_probability = "NORMAL", 65.0, 230.0, 58.0, 0.04
        create_cross_device_message(incident.id, "CREW", "Field Crew", "ALL", "IN_APP", f"Fault resolved at {sub_name}. Power restored.")
    elif new_status == "ON_SITE":
        create_cross_device_message(incident.id, "CREW", "Field Crew", "OPERATOR", "IN_APP", f"Crew arrived on site at {sub_name}. Diagnostics in progress.")
    elif new_status == "EN_ROUTE":
        create_cross_device_message(incident.id, "CREW", "Field Crew", "OPERATOR", "IN_APP", f"Crew is en route to {sub_name}.")

    db.session.commit()
    broadcast_event("incident_status_changed", {"incident_id": incident.id, "status": new_status, "incident": incident.to_dict()})
    return jsonify({"success": True, "incident": incident.to_dict()})

@api_bp.route("/outages/report", methods=["POST"])
def submit_outage_report():
    if _is_rate_limited("outage_report_burst", max_attempts=25, window_secs=60):
        return jsonify({"success": False, "error": "Too many reports submitted. Please wait a moment.", "code": "RATE_LIMITED"}), 429
    _record_action("outage_report_burst")

    if request.content_type and "multipart/form-data" in request.content_type:
        raw_lat = request.form.get("latitude", type=float) or 26.8467
        raw_lng = request.form.get("longitude", type=float) or 80.9462
        phone = request.form.get("phone", "")
        desc = request.form.get("description", "Power Outage Reported")
        photo_file = request.files.get("photo")
    else:
        data = request.get_json() or {}
        try:
            raw_lat = float(data.get("latitude", 26.8467))
            raw_lng = float(data.get("longitude", 80.9462))
        except (TypeError, ValueError):
            raw_lat, raw_lng = 26.8467, 80.9462
        phone = data.get("phone", "")
        desc = data.get("description", "Power Outage Reported")
        photo_file = None

    # Sanitize inputs & prevent injection
    phone = re.sub(r"[^\d+\-\s()]", "", str(phone or ""))[:25]
    desc = _sanitize_text(desc or "Power Outage Reported", max_len=500)
    if not (24.0 <= raw_lat <= 29.0 and 78.0 <= raw_lng <= 84.0):
        raw_lat, raw_lng = 26.8467, 80.9462

    cloaked_lat, cloaked_lng = cloak_coordinates(raw_lat, raw_lng, 300.0)
    consumer_hash = hash_identifier(phone if phone else f"anon-{time.time()}")
    locality_name = reverse_geocode_lucknow(cloaked_lat, cloaked_lng)
    photo_url = upload_fault_photo(photo_file, original_filename=photo_file.filename, actor_role="CONSUMER") if photo_file else None

    # Nearest transformer
    tfs = Transformer.query.all()
    nearest_tf = min(tfs, key=lambda t: (t.latitude - cloaked_lat)**2 + (t.longitude - cloaked_lng)**2) if tfs else None

    # Guaranteed unique tracking token
    while True:
        token = f"LKO-OUT-{random.randint(10000, 99999)}"
        if not OutageReport.query.filter_by(tracking_token=token).first():
            break

    rep = OutageReport(tracking_token=token, consumer_hash=consumer_hash, transformer_id=nearest_tf.id if nearest_tf else None,
                       cloaked_lat=cloaked_lat, cloaked_lng=cloaked_lng, locality_name=locality_name, description=desc,
                       image_blob_url=photo_url, exif_stripped=True, verified=False)
    db.session.add(rep)
    db.session.commit()

    if nearest_tf: correlate_and_detect_outages(nearest_tf.id)
    log_privacy_event("CONSUMER", "OUTAGE_REPORT_CLOAKED", token, "DPDP Section 4 & 8: Spatial 300m fuzzing, salted SHA-256")
    broadcast_event("new_outage_report", {"report": rep.to_dict(), "cloaked_lat": cloaked_lat, "cloaked_lng": cloaked_lng})
    return jsonify({"success": True, "tracking_token": token, "cloaked_lat": cloaked_lat, "cloaked_lng": cloaked_lng, "locality_name": locality_name, "message": "Outage report submitted. Exact location cloaked to 300m cell for your privacy."})

@api_bp.route("/outages/track/<path:token>", methods=["GET"])
def track_outage(token):
    token = (token or "").strip()
    if not token or not re.match(r"^[A-Za-z0-9\-_]{4,40}$", token):
        return jsonify({"success": False, "error": "Invalid tracking token format"}), 400
    report = OutageReport.query.filter(db.func.upper(OutageReport.tracking_token) == token.upper()).first()
    if not report: return jsonify({"success": False, "error": "Tracking token not found"}), 404
    incident = Incident.query.filter(Incident.transformer_id == report.transformer_id, Incident.status != "RESOLVED").first() if report.transformer_id else None
    status_label, eta_min = "Under Investigation", 25
    if incident:
        if incident.status == "DISPATCHED": status_label, eta_min = "Crew Dispatched", (incident.dispatches[-1].eta_minutes if incident.dispatches else 20)
        elif incident.status == "EN_ROUTE": status_label, eta_min = "Crew En Route", 12
        elif incident.status == "ON_SITE": status_label, eta_min = "Repair Crew On Site", 10
        elif incident.status == "RESOLVED": status_label, eta_min = "Power Restored", 0

    return jsonify({"success": True, "tracking_token": report.tracking_token, "locality": report.locality_name, "status_label": status_label, "eta_minutes": eta_min, "verified": report.verified or (incident is not None), "cloaked_lat": report.cloaked_lat, "cloaked_lng": report.cloaked_lng, "created_at": report.created_at.isoformat() if report.created_at else None})

@api_bp.route("/crews", methods=["GET"])
def get_crews():
    region_id = request.args.get("region_id", type=int)
    q = Crew.query.options(
        joinedload(Crew.leader),
        joinedload(Crew.power_house),
        joinedload(Crew.grid_region)
    )
    if region_id:
        q = q.filter_by(grid_region_id=region_id)
    crews = q.all()
    return jsonify({"success": True, "count": len(crews), "crews": [c.to_dict() for c in crews]})

@api_bp.route("/crews/<int:crew_id>/location", methods=["POST"])
@role_required("CREW", "OPERATOR")
def update_crew_location(crew_id):
    crew = db.session.get(Crew, crew_id)
    if not crew:
        abort(404)
    data = request.get_json() or {}
    try:
        lat = float(data.get("lat", crew.current_lat))
        lng = float(data.get("lng", crew.current_lng))
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
            return jsonify({"success": False, "error": "Coordinates out of bounds"}), 400
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invalid coordinates"}), 400

    crew.current_lat = lat
    crew.current_lng = lng
    crew.last_ping = _utc_now()
    db.session.commit()
    broadcast_event("crew_moved", {"crew_id": crew.id, "lat": crew.current_lat, "lng": crew.current_lng})
    return jsonify({"success": True, "crew": crew.to_dict()})

@api_bp.route("/crews/accounts", methods=["GET"])
def get_crew_accounts():
    crews = Crew.query.options(
        joinedload(Crew.leader), joinedload(Crew.power_house), joinedload(Crew.grid_region)
    ).all()
    accounts = []
    for c in crews:
        active_disp = next((d for d in reversed(c.dispatches) if not d.resolved_at and d.incident and d.incident.status != "RESOLVED"), None)
        accounts.append({
            "crew_id": c.id,
            "team_name": c.team_name,
            "leader_id": c.leader_id,
            "leader_name": c.leader.name if c.leader else "Crew Supervisor",
            "leader_email": c.leader.email if c.leader else "",
            "leader_phone": c.leader_phone,
            "status": c.status,
            "region": c.grid_region.name if c.grid_region else "Lucknow Metro",
            "base_substation": c.power_house.substation_name if c.power_house else "Base Substation",
            "has_active_dispatch": bool(active_disp),
            "active_incident_code": active_disp.incident.incident_code if (active_disp and active_disp.incident) else None,
            "active_substation_name": active_disp.incident.transformer.substation_name if (active_disp and active_disp.incident and active_disp.incident.transformer) else None
        })
    return jsonify({"success": True, "count": len(accounts), "accounts": accounts})

@api_bp.route("/crews/<int:crew_id>/active-dispatch", methods=["GET"])
def get_crew_active_dispatch(crew_id):
    crew = db.session.get(Crew, crew_id) if hasattr(db.session, "get") else Crew.query.get(crew_id)
    if not crew:
        return jsonify({"success": False, "error": "Crew unit not found"}), 404

    active_disp = next((d for d in reversed(crew.dispatches) if not d.resolved_at and d.incident and d.incident.status != "RESOLVED"), None)

    if active_disp and active_disp.incident:
        inc = active_disp.incident
        tf = inc.transformer
        route_info = generate_crew_dispatch_route(
            crew.current_lat, crew.current_lng,
            tf.latitude, tf.longitude,
            crew.team_name, tf.substation_name
        ) if tf else None

        messages = CrossDeviceMessage.query.filter_by(incident_id=inc.id).order_by(CrossDeviceMessage.created_at.asc()).all()
        msg_dicts = [m.to_dict() for m in messages]

        # Find primary dispatch message for this crew
        disp_body = None
        for m in msg_dicts:
            if m.get("target_role") == "CREW" or "DISPATCH" in m.get("message_body", "").upper():
                disp_body = m.get("message_body")
                break
        if not disp_body and msg_dicts:
            disp_body = msg_dicts[0].get("message_body")
        if not disp_body:
            disp_body = (
                f"[DISPATCH DIRECTIVE AUTHORIZED]\n"
                f"Assigned Unit: {crew.team_name}\n"
                f"Incident Ref: {inc.incident_code} (Severity: {inc.severity_score}/100)\n"
                f"Target Substation: {tf.substation_name if tf else 'Regional Substation'}\n"
                f"Root Cause: {inc.root_cause_prediction}\n"
                f"Directive: Immediate deployment for priority power restoration."
            )

        return jsonify({
            "success": True,
            "has_active_dispatch": True,
            "crew": crew.to_dict(),
            "dispatch": active_disp.to_dict(),
            "incident": inc.to_dict(),
            "transformer": tf.to_dict() if tf else None,
            "route": route_info,
            "messages": msg_dicts,
            "primary_dispatch_message": disp_body
        })

    # If no active dispatch, find nearest active incident for standby sector route awareness
    nearest_inc = Incident.query.filter(Incident.status.in_(["DETECTED", "VERIFIED", "DISPATCHED"])).first()
    standby_route = None
    nearest_dict = None
    if nearest_inc and nearest_inc.transformer:
        tf = nearest_inc.transformer
        standby_route = generate_crew_dispatch_route(
            crew.current_lat, crew.current_lng,
            tf.latitude, tf.longitude,
            crew.team_name, tf.substation_name
        )
        nearest_dict = nearest_inc.to_dict()

    base_sub = crew.power_house.substation_name if crew.power_house else "Base Grid Substation"
    return jsonify({
        "success": True,
        "has_active_dispatch": False,
        "crew": crew.to_dict(),
        "dispatch": None,
        "incident": nearest_dict,
        "route": standby_route,
        "messages": [],
        "primary_dispatch_message": f"Unit {crew.team_name} currently on STANDBY at {base_sub}. Monitoring 33/11kV network."
    })

@api_bp.route("/crews/my-dispatch", methods=["GET"])
def get_my_crew_dispatch():
    user = get_current_user()
    if not user:
        return jsonify({"success": False, "error": "Authentication required"}), 401

    crew = None
    if user.crews_led:
        crew = user.crews_led[0]
    elif user.role == "CREW":
        crew = Crew.query.filter_by(leader_id=user.id).first()

    if not crew:
        crew = Crew.query.filter_by(status="BUSY").first() or Crew.query.first()

    if not crew:
        return jsonify({"success": False, "error": "No crew associated with this account"}), 404

    return get_crew_active_dispatch(crew.id)

@api_bp.route("/critical-facilities", methods=["GET"])
def get_critical_facilities():
    facs = CriticalFacility.query.options(
        joinedload(CriticalFacility.transformer)
    ).order_by(CriticalFacility.priority_weight.desc()).all()
    return jsonify({"success": True, "count": len(facs), "facilities": [f.to_dict() for f in facs]})

@api_bp.route("/lucknow/weather", methods=["GET"])
def get_weather():
    return jsonify({"success": True, "weather": get_lucknow_weather(), "available_scenarios": list(WEATHER_SCENARIOS.keys())})

@api_bp.route("/lucknow/weather/set-scenario", methods=["POST"])
@role_required("OPERATOR", "COORDINATOR")
def update_weather_scenario():
    data = request.get_json() or {}
    weather = set_weather_scenario(data.get("scenario", "LIVE"))
    active_incidents = Incident.query.filter(Incident.status != "RESOLVED").all()
    for inc in active_incidents:
        inc.weather_condition, inc.ambient_temp_c, inc.weather_multiplier = weather["condition"], weather["temp_c"], weather["multiplier"]
        inc.severity_score = min(100.0, inc.severity_score * weather["multiplier"])
    db.session.commit()
    broadcast_event("weather_changed", {"weather": weather})
    return jsonify({"success": True, "weather": weather, "updated_incidents": len(active_incidents)})

@api_bp.route("/lucknow/grid-summary", methods=["GET"])
def get_grid_summary():
    tfs = Transformer.query.all()
    incidents = Incident.query.filter(Incident.status != "RESOLVED").all()
    crews = Crew.query.all()
    facs = CriticalFacility.query.all()

    cap_mva = sum([t.capacity_kva for t in tfs]) / 1000.0
    avg_load = sum([t.load_pct for t in tfs]) / max(1, len(tfs))
    weather = get_lucknow_weather()

    zones = {}
    for t in tfs:
        zones.setdefault(t.zone, {"transformers": 0, "incidents": 0, "loads": []})
        zones[t.zone]["transformers"] += 1
        zones[t.zone]["loads"].append(t.load_pct)
    for inc in incidents:
        if inc.transformer and inc.transformer.zone in zones:
            zones[inc.transformer.zone]["incidents"] += 1

    zone_summary = [{"zone": k, "transformers": v["transformers"], "incidents": v["incidents"], "avg_load_pct": round(sum(v["loads"])/max(1, len(v["loads"])), 1)} for k, v in zones.items()]
    regions = [r.to_dict() for r in PowerGridRegion.query.order_by(PowerGridRegion.name.asc()).all()]

    return jsonify({
        "success": True,
        "metrics": {
            "total_load_mw": round(cap_mva * (avg_load / 100.0) * 0.9, 2),
            "total_capacity_mva": round(cap_mva, 1),
            "avg_load_pct": round(avg_load, 1),
            "active_incidents": len(incidents),
            "critical_transformers": sum(1 for t in tfs if t.status == "CRITICAL"),
            "warning_transformers": sum(1 for t in tfs if t.status == "WARNING"),
            "normal_transformers": sum(1 for t in tfs if t.status == "NORMAL"),
            "available_crews": sum(1 for c in crews if c.status == "AVAILABLE"),
            "critical_facilities_online": len(facs),
            "weather_condition": weather["condition"],
            "ambient_temp_c": weather["temp_c"],
        },
        "zones": zone_summary,
        "regions": regions,
    })

@api_bp.route("/messages", methods=["GET"])
def get_messages():
    limit = request.args.get("limit", 40, type=int)
    msgs = CrossDeviceMessage.query.order_by(CrossDeviceMessage.created_at.desc()).limit(limit).all()
    return jsonify({"success": True, "messages": [m.to_dict() for m in reversed(msgs)]})

@api_bp.route("/messages", methods=["POST"])
@role_required("OPERATOR", "COORDINATOR", "CREW")
def post_message():
    user = get_current_user()
    user_key = f"msg_user_{user.id}" if user else "msg_anon"
    if _is_rate_limited(user_key, max_attempts=30, window_secs=60):
        return jsonify({"success": False, "error": "Message rate limit exceeded. Please wait a moment.", "code": "RATE_LIMITED"}), 429
    _record_action(user_key)

    data = request.get_json() or {}
    raw_body = str(data.get("message_body", "")).strip()
    if not raw_body:
        return jsonify({"success": False, "error": "Message body is required"}), 400
    if len(raw_body) > 1000:
        return jsonify({"success": False, "error": "Message length exceeds 1000 characters limit"}), 400

    clean_body = _sanitize_text(raw_body, max_len=1000)
    sender_name = user.name if user else "Control Room"
    sender_role = user.role if user else "OPERATOR"
    msg = create_cross_device_message(
        incident_id=data.get("incident_id"), sender_role=sender_role,
        sender_name=sender_name, target_role=data.get("target_role", "ALL"),
        channel=data.get("channel", "IN_APP"), message_body=clean_body
    )
    return jsonify({"success": True, "message": msg})

@api_bp.route("/privacy/audit-logs", methods=["GET"])
@role_required("OPERATOR", "INSPECTOR")
def get_privacy_audit_logs():
    logs = PrivacyAuditLog.query.order_by(PrivacyAuditLog.timestamp.desc()).limit(60).all()
    return jsonify({"success": True, "count": len(logs), "logs": [l.to_dict() for l in logs]})
