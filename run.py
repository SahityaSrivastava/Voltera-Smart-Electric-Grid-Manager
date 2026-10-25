import os
import socket
from app import create_app
from app.models import db, Transformer
from seed import seed_database

app = create_app()


def find_available_port(preferred_port=5000):
    """Checks if preferred port is free; if occupied, finds next available port."""
    if "PORT" in os.environ:
        return int(os.environ["PORT"])

    candidate_ports = [preferred_port, 5001, 5050, 8080, 8000]
    host = os.environ.get("HOST", "0.0.0.0")
    for p in candidate_ports:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((host, p))
                return p
            except OSError:
                continue
    return preferred_port


if __name__ == "__main__":
    with app.app_context():
        try:
            db.create_all()
            if not Transformer.query.first():
                print("[AutoSeed] Initializing empty database...")
                seed_database(force_reset=False)
            else:
                from app.services import train_model
                train_model()
        except Exception as e:
            print(f"[Init] Database notice: {e}. Preserving existing database records.")

    preferred = int(os.environ.get("PORT", 5000))
    port = find_available_port(preferred)
    host = os.environ.get("HOST", "0.0.0.0")

    print("\n=========================================================================")
    print("Voltera • Power Grid Operations & Outage Management System")
    print("State Distribution & Transmission Network")
    print(f"Operational Control Server: http://localhost:{port} (Network: http://0.0.0.0:{port})")
    if port != preferred:
        print(f"Notice: Port {preferred} occupied; assigned to port {port}.")
    print("=========================================================================\n")
    app.run(host=host, port=port, debug=False, threaded=True)
