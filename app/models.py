import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()
_utcnow = lambda: datetime.datetime.now(datetime.timezone.utc)

ROLE_PERMISSIONS = {
    "ADMIN": ["admin:all", "user:manage", "scada:read", "scada:write", "incident:read", "incident:dispatch", "incident:simulate", "crew:read", "crew:manage", "facilities:read", "facilities:inspect", "audit:read", "weather:simulate", "messages:read", "messages:write"],
    "OPERATOR": ["scada:read", "scada:write", "incident:read", "incident:dispatch", "incident:simulate", "crew:read", "messages:read", "messages:write"],
    "CREW": ["incident:assigned", "incident:update_status", "crew:update_location", "crew:upload_photo", "messages:read", "messages:write"],
    "COORDINATOR": ["grid:overview", "incident:read", "crew:workload_balance", "weather:simulate", "messages:read"],
    "INSPECTOR": ["facilities:read", "facilities:inspect", "audit:read"],
    "CONSUMER": ["outage:report", "outage:track"],
}


class BaseModel(db.Model):
    __abstract__ = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class User(BaseModel):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    email_masked = db.Column(db.String(120), nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(30), nullable=False, default="CONSUMER")
    phone_masked = db.Column(db.String(30), nullable=False)
    zone = db.Column(db.String(80), nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow)

    crews_led = db.relationship("Crew", backref="leader", foreign_keys="Crew.leader_id", lazy=True)
    dispatches_authorized = db.relationship("DispatchRecord", backref="operator", foreign_keys="DispatchRecord.operator_id", lazy=True)

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        if not password:
            return False
        return check_password_hash(self.password_hash, password.strip())

    def get_permissions(self) -> list[str]:
        return ROLE_PERMISSIONS.get(self.role, ROLE_PERMISSIONS["CONSUMER"])

    def has_permission(self, perm: str) -> bool:
        return True if self.role == "ADMIN" else perm in self.get_permissions()

    def to_dict(self):
        d = {
            "id": self.id, "name": self.name, "email": self.email, "email_masked": self.email_masked,
            "role": self.role, "permissions": self.get_permissions(), "phone_masked": self.phone_masked, "zone": self.zone
        }
        if self.role == "CREW" and self.crews_led:
            c = self.crews_led[0]
            d["crew_id"] = c.id
            d["crew_name"] = c.team_name
            d["crew_status"] = c.status
        return d


class PowerGridRegion(BaseModel):
    __tablename__ = "power_grid_regions"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False, index=True)
    code = db.Column(db.String(30), unique=True, nullable=False, index=True)
    grid_name = db.Column(db.String(150), nullable=False)
    circle_type = db.Column(db.String(80), nullable=False, default="132kV TRANSMISSION CIRCLE")

    coordinator_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    coordinator_name = db.Column(db.String(120), nullable=False, default="Regional Grid Coordinator")
    coordinator_phone = db.Column(db.String(30), nullable=False, default="+91 94150 11000")
    coordinator_email = db.Column(db.String(120), nullable=False, default="coordinator@lesa.up.gov.in")

    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    total_capacity_mva = db.Column(db.Float, nullable=False, default=120.0)
    status = db.Column(db.String(30), nullable=False, default="NORMAL")
    created_at = db.Column(db.DateTime, default=_utcnow)

    power_houses = db.relationship("Transformer", backref="grid_region", lazy=True)
    crews = db.relationship("Crew", backref="grid_region", lazy=True)
    coordinator = db.relationship("User", foreign_keys=[coordinator_id], backref="coordinated_region", lazy=True)

    def to_dict(self):
        active_load = sum([t.load_pct * (t.capacity_kva / 1000.0) * 0.9 / 100.0 for t in self.power_houses]) if self.power_houses else 0.0
        return {
            "id": self.id, "name": self.name, "code": self.code, "grid_name": self.grid_name, "circle_type": self.circle_type,
            "coordinator_id": self.coordinator_id, "coordinator_name": self.coordinator_name, "coordinator_phone": self.coordinator_phone,
            "coordinator_email": self.coordinator_email, "latitude": round(self.latitude, 5), "longitude": round(self.longitude, 5),
            "total_capacity_mva": round(self.total_capacity_mva, 1), "active_load_mw": round(active_load, 2), "status": self.status,
            "power_houses_count": len(self.power_houses), "crews_count": len(self.crews),
            "available_crews_count": sum(1 for c in self.crews if c.status == "AVAILABLE"),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Transformer(BaseModel):
    __tablename__ = "transformers"
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False, index=True)
    substation_name = db.Column(db.String(120), nullable=False)
    zone = db.Column(db.String(80), nullable=False, index=True)
    grid_region_id = db.Column(db.Integer, db.ForeignKey("power_grid_regions.id"), nullable=True, index=True)
    sub_region = db.Column(db.String(120), nullable=True)
    manager_name = db.Column(db.String(120), nullable=False, default="Er. Assistant Engineer")
    manager_phone = db.Column(db.String(30), nullable=False, default="+91 94150 20000")
    manager_email = db.Column(db.String(120), nullable=False, default="ph_manager@lesa.up.gov.in")

    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    capacity_kva = db.Column(db.Float, nullable=False, default=1000.0)

    temperature_c = db.Column(db.Float, nullable=False, default=65.0)
    oil_level_pct = db.Column(db.Float, nullable=False, default=90.0)
    voltage_v = db.Column(db.Float, nullable=False, default=230.0)
    current_a = db.Column(db.Float, nullable=False, default=45.0)
    load_pct = db.Column(db.Float, nullable=False, default=60.0)

    failure_probability = db.Column(db.Float, nullable=False, default=0.05)
    status = db.Column(db.String(30), nullable=False, default="NORMAL")
    last_updated = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow)

    critical_facilities = db.relationship("CriticalFacility", backref="transformer", lazy=True)
    outage_reports = db.relationship("OutageReport", backref="transformer", lazy=True)
    incidents = db.relationship("Incident", backref="transformer", lazy=True)

    def to_dict(self):
        return {
            "id": self.id, "code": self.code, "substation_name": self.substation_name, "zone": self.zone,
            "grid_region_id": self.grid_region_id, "region_name": self.grid_region.name if self.grid_region else self.zone,
            "region_code": self.grid_region.code if self.grid_region else None, "sub_region": self.sub_region or self.zone,
            "manager_name": self.manager_name, "manager_phone": self.manager_phone, "manager_email": self.manager_email,
            "latitude": self.latitude, "longitude": self.longitude, "capacity_kva": self.capacity_kva,
            "temperature_c": round(self.temperature_c, 1), "oil_level_pct": round(self.oil_level_pct, 1),
            "voltage_v": round(self.voltage_v, 1), "current_a": round(self.current_a, 1), "load_pct": round(self.load_pct, 1),
            "failure_probability": round(self.failure_probability, 3), "status": self.status,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
            "critical_facilities_count": len(self.critical_facilities),
        }


class CriticalFacility(BaseModel):
    __tablename__ = "critical_facilities"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    facility_type = db.Column(db.String(50), nullable=False)
    transformer_id = db.Column(db.Integer, db.ForeignKey("transformers.id"), nullable=True, index=True)
    priority_weight = db.Column(db.Integer, nullable=False, default=8)
    backup_generator_hours = db.Column(db.Float, nullable=False, default=12.0)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "facility_type": self.facility_type, "transformer_id": self.transformer_id,
            "transformer_code": self.transformer.code if self.transformer else None, "priority_weight": self.priority_weight,
            "backup_generator_hours": round(self.backup_generator_hours, 1), "latitude": self.latitude, "longitude": self.longitude
        }


class OutageReport(BaseModel):
    __tablename__ = "outage_reports"
    id = db.Column(db.Integer, primary_key=True)
    tracking_token = db.Column(db.String(50), unique=True, nullable=False, index=True)
    consumer_hash = db.Column(db.String(64), nullable=False, index=True)
    transformer_id = db.Column(db.Integer, db.ForeignKey("transformers.id"), nullable=True, index=True)
    cloaked_lat = db.Column(db.Float, nullable=False)
    cloaked_lng = db.Column(db.Float, nullable=False)
    locality_name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    image_blob_url = db.Column(db.String(350), nullable=True)
    exif_stripped = db.Column(db.Boolean, default=True)
    verified = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=_utcnow)

    def to_dict(self):
        return {
            "id": self.id, "tracking_token": self.tracking_token, "cloaked_lat": round(self.cloaked_lat, 4),
            "cloaked_lng": round(self.cloaked_lng, 4), "locality_name": self.locality_name, "description": self.description,
            "image_blob_url": self.image_blob_url, "exif_stripped": self.exif_stripped, "verified": self.verified,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "transformer_code": self.transformer.code if self.transformer else None,
            "zone": self.transformer.zone if self.transformer else self.locality_name,
        }


class Incident(BaseModel):
    __tablename__ = "incidents"
    id = db.Column(db.Integer, primary_key=True)
    incident_code = db.Column(db.String(50), unique=True, nullable=False, index=True)
    transformer_id = db.Column(db.Integer, db.ForeignKey("transformers.id"), nullable=False, index=True)
    weather_condition = db.Column(db.String(80), nullable=False, default="Clear")
    ambient_temp_c = db.Column(db.Float, nullable=False, default=32.0)
    weather_multiplier = db.Column(db.Float, nullable=False, default=1.0)
    consumer_report_count = db.Column(db.Integer, nullable=False, default=1)
    affected_critical_count = db.Column(db.Integer, nullable=False, default=0)
    severity_score = db.Column(db.Float, nullable=False, default=50.0)
    root_cause_prediction = db.Column(db.String(180), nullable=False, default="Thermal Overload")
    status = db.Column(db.String(30), nullable=False, default="DETECTED", index=True)
    created_at = db.Column(db.DateTime, default=_utcnow, index=True)
    resolved_at = db.Column(db.DateTime, nullable=True)

    dispatches = db.relationship("DispatchRecord", backref="incident", lazy=True)
    messages = db.relationship("CrossDeviceMessage", backref="incident", lazy=True)

    def to_dict(self):
        active_disp = self.dispatches[-1] if self.dispatches else None
        return {
            "id": self.id, "incident_code": self.incident_code, "transformer_id": self.transformer_id,
            "transformer_code": self.transformer.code if self.transformer else None,
            "substation_name": self.transformer.substation_name if self.transformer else None,
            "zone": self.transformer.zone if self.transformer else None,
            "latitude": self.transformer.latitude if self.transformer else None,
            "longitude": self.transformer.longitude if self.transformer else None,
            "weather_condition": self.weather_condition, "ambient_temp_c": round(self.ambient_temp_c, 1),
            "weather_multiplier": round(self.weather_multiplier, 2), "consumer_report_count": self.consumer_report_count,
            "affected_critical_count": self.affected_critical_count, "severity_score": round(self.severity_score, 1),
            "root_cause_prediction": self.root_cause_prediction, "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "active_crew": active_disp.crew.team_name if (active_disp and active_disp.crew) else None,
            "active_crew_leader": (active_disp.crew.leader.name if (active_disp and active_disp.crew and active_disp.crew.leader) else "Lead Supervisor") if (active_disp and active_disp.crew) else None,
            "assigned_crew_id": active_disp.crew_id if active_disp else None,
            "active_dispatch_id": active_disp.id if active_disp else None,
            "eta_minutes": active_disp.eta_minutes if active_disp else None,
            "assigned_crew": {
                "id": active_disp.crew.id,
                "team_name": active_disp.crew.team_name,
                "name": active_disp.crew.team_name,
                "leader_name": active_disp.crew.leader.name if active_disp.crew.leader else "Lead Supervisor",
                "phone": active_disp.crew.leader_phone,
            } if (active_disp and active_disp.crew) else None,
        }


class Crew(BaseModel):
    __tablename__ = "crews"
    id = db.Column(db.Integer, primary_key=True)
    team_name = db.Column(db.String(100), unique=True, nullable=False, index=True)
    grid_region_id = db.Column(db.Integer, db.ForeignKey("power_grid_regions.id"), nullable=True, index=True)
    power_house_id = db.Column(db.Integer, db.ForeignKey("transformers.id"), nullable=True, index=True)

    leader_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    leader_phone = db.Column(db.String(30), nullable=False, default="+91 94150 30000")
    leader_title = db.Column(db.String(100), nullable=False, default="Crew Lead Technician")

    current_lat = db.Column(db.Float, nullable=False)
    current_lng = db.Column(db.Float, nullable=False)
    skill_specialization = db.Column(db.String(50), nullable=False, default="TRANSFORMER_REPAIR")
    active_workload = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(30), nullable=False, default="AVAILABLE", index=True)
    last_ping = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow)

    dispatches = db.relationship("DispatchRecord", backref="crew", lazy=True)
    power_house = db.relationship("Transformer", foreign_keys=[power_house_id], backref="local_crews", lazy=True)

    def to_dict(self):
        return {
            "id": self.id, "team_name": self.team_name, "name": self.team_name, "grid_region_id": self.grid_region_id,
            "region_name": self.grid_region.name if self.grid_region else "Lucknow Metro",
            "region_code": self.grid_region.code if self.grid_region else None,
            "leader_id": self.leader_id, "leader_name": self.leader.name if self.leader else "Field Supervisor",
            "leader_phone": self.leader_phone, "leader_title": self.leader_title,
            "power_house_id": self.power_house_id, "power_house_name": self.power_house.substation_name if self.power_house else None,
            "current_lat": round(self.current_lat, 5), "current_lng": round(self.current_lng, 5),
            "skill_specialization": self.skill_specialization, "active_workload": self.active_workload,
            "status": self.status, "last_ping": self.last_ping.isoformat() if self.last_ping else None,
        }


class DispatchRecord(BaseModel):
    __tablename__ = "dispatch_records"
    id = db.Column(db.Integer, primary_key=True)
    incident_id = db.Column(db.Integer, db.ForeignKey("incidents.id"), nullable=False, index=True)
    crew_id = db.Column(db.Integer, db.ForeignKey("crews.id"), nullable=False, index=True)
    operator_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    match_score = db.Column(db.Float, nullable=False, default=85.0)
    distance_km = db.Column(db.Float, nullable=False, default=3.2)
    eta_minutes = db.Column(db.Integer, nullable=False, default=18)
    report_blob_url = db.Column(db.String(350), nullable=True)
    dispatched_at = db.Column(db.DateTime, default=_utcnow)
    resolved_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id, "incident_id": self.incident_id, "incident_code": self.incident.incident_code if self.incident else None,
            "crew_id": self.crew_id, "crew_name": self.crew.team_name if self.crew else None,
            "operator_id": self.operator_id, "operator_name": self.operator.name if self.operator else "Auto-Dispatcher",
            "match_score": round(self.match_score, 1), "distance_km": round(self.distance_km, 2), "eta_minutes": self.eta_minutes,
            "report_blob_url": self.report_blob_url, "dispatched_at": self.dispatched_at.isoformat() if self.dispatched_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }


class CrossDeviceMessage(BaseModel):
    __tablename__ = "cross_device_messages"
    id = db.Column(db.Integer, primary_key=True)
    incident_id = db.Column(db.Integer, db.ForeignKey("incidents.id"), nullable=True, index=True)
    sender_role = db.Column(db.String(30), nullable=False)
    sender_name = db.Column(db.String(100), nullable=False)
    target_role = db.Column(db.String(30), nullable=False, default="ALL")
    channel = db.Column(db.String(30), nullable=False, default="IN_APP")
    message_body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id, "incident_id": self.incident_id, "sender_role": self.sender_role,
            "sender_name": self.sender_name, "target_role": self.target_role, "channel": self.channel,
            "message_body": self.message_body,
            "created_at": self.created_at.strftime("%H:%M:%S") if self.created_at else "",
            "timestamp_iso": self.created_at.isoformat() if self.created_at else None,
        }


class PrivacyAuditLog(BaseModel):
    __tablename__ = "privacy_audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    actor_role = db.Column(db.String(30), nullable=False)
    action_type = db.Column(db.String(60), nullable=False)
    resource_target = db.Column(db.String(120), nullable=False)
    privacy_policy_applied = db.Column(db.String(180), nullable=False)
    timestamp = db.Column(db.DateTime, default=_utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id, "actor_role": self.actor_role, "action_type": self.action_type,
            "resource_target": self.resource_target, "privacy_policy_applied": self.privacy_policy_applied,
            "timestamp": self.timestamp.strftime("%Y-%m-%d %H:%M:%S") if self.timestamp else "",
        }
