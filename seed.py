import datetime
from app import create_app
from app.models import (
    db, User, PowerGridRegion, Transformer, CriticalFacility,
    OutageReport, Incident, Crew, DispatchRecord, CrossDeviceMessage,
    PrivacyAuditLog
)
from app.services import train_model, hash_identifier, cloak_coordinates

def seed_database(force_reset=False):
    app = create_app()
    with app.app_context():
        print("[Voltera] Initializing database...")
        if not force_reset and PowerGridRegion.query.first() and User.query.filter_by(email="admin@lesa.up.gov.in").first():
            print(f"[Voltera ML] Database records verified intact. Model ready: {train_model()}")
            return

        if force_reset:
            print("[Voltera] Explicit force_reset requested: recreating schema...")
            db.drop_all()

        db.create_all()

        # 1. Base Users
        base_users = [
            ("LESA Grid Administrator", "admin@lesa.up.gov.in", "a***n@lesa.up.gov.in", "ADMIN", "+91-XXXXXX6655", "Central Control (Shakti Bhawan)", "Admin@Lucknow2026"),
            ("Arunabh Tripathi", "operator@lesa.up.gov.in", "a***h@uppcl.org", "OPERATOR", "+91-XXXXXX9821", "Central Control (Shakti Bhawan)", "LucknowGrid@2026"),
            ("Dr. Pradeep Mishra", "inspector@lucknow.nic.in", "p***p@lucknow.nic.in", "INSPECTOR", "+91-XXXXXX1190", "KGMU & Pumping Zone", "LucknowGrid@2026"),
            ("Lucknow Resident (Zero-PII)", "resident@lucknow.in", "c***r@citizen.in", "CONSUMER", "+91-XXXXXX3312", "Vibhuti Khand", "LucknowGrid@2026"),
        ]
        user_objs = []
        for name, email, em_mask, role, ph_mask, zone, pwd in base_users:
            u = User(name=name, email=email, email_masked=em_mask, role=role, phone_masked=ph_mask, zone=zone)
            u.set_password(pwd)
            user_objs.append(u)
        db.session.add_all(user_objs)
        db.session.flush()
        operator_user = user_objs[1]

        # 2. Regional Coordinators & Regions
        reg_specs = [
            ("Alambagh", "GRID-AB", "132kV Alambagh Power Grid", "132kV SOUTH LUCKNOW TRANSMISSION CIRCLE", "Er. Satish Chandra", "coord_alambagh@lesa.up.gov.in", "+91 94150 11001", 26.8150, 80.9050, 130.0),
            ("Hazratganj", "GRID-HZ", "132kV Hazratganj Central Power Grid", "132kV CENTRAL LUCKNOW TRANSMISSION CIRCLE", "Er. Sunita Verma", "coord_hazratganj@lesa.up.gov.in", "+91 94150 11002", 26.8500, 80.9499, 150.0),
            ("Gomti Nagar", "GRID-GN", "132kV Gomti Nagar Trans-Gomti Grid", "132kV TRANS-GOMTI EAST TRANSMISSION CIRCLE", "Er. Rajeshwar Pandey", "coord_gomtinagar@lesa.up.gov.in", "+91 94150 11003", 26.8623, 80.9992, 140.0),
            ("Aliganj", "GRID-AL", "220/132kV Aliganj Transmission Grid", "220kV TRANS-GOMTI WEST TRANSMISSION CIRCLE", "Er. Manisha Saxena", "coord_aliganj@lesa.up.gov.in", "+91 94150 11004", 26.8920, 80.9420, 160.0),
            ("Chowk", "GRID-CK", "132kV Chowk Heritage City Grid", "132kV OLD LUCKNOW WEST TRANSMISSION CIRCLE", "Er. Tariq Ahmad", "coord_chowk@lesa.up.gov.in", "+91 94150 11005", 26.8680, 80.9100, 110.0),
            ("Amausi & SGPGI", "GRID-AM", "132/220kV Amausi & SGPGI Power Grid", "220kV INDUSTRIAL & HEALTHCARE TRANSMISSION CIRCLE", "Dr. V. K. Bansal", "coord_amausi@lesa.up.gov.in", "+91 94150 11006", 26.7550, 80.9100, 180.0),
        ]

        region_map = {}
        for r_name, code, g_name, c_type, c_name, c_email, c_phone, lat, lng, cap in reg_specs:
            cu = User(name=c_name, email=c_email, email_masked=f"{c_email[:2]}***@{c_email.split('@')[1]}", role="COORDINATOR", phone_masked=f"+91-XXXXXX{c_phone[-4:]}", zone=f"{r_name} Grid")
            cu.set_password("LucknowGrid@2026")
            db.session.add(cu)
            db.session.flush()

            reg = PowerGridRegion(
                name=r_name, code=code, grid_name=g_name, circle_type=c_type, coordinator_id=cu.id,
                coordinator_name=f"{c_name} (EE / Regional Coordinator)", coordinator_phone=c_phone,
                coordinator_email=c_email, latitude=lat, longitude=lng, total_capacity_mva=cap, status="NORMAL"
            )
            db.session.add(reg)
            db.session.flush()
            region_map[r_name] = reg

        # 3. 18 Power Houses (Transformers)
        tf_data = [
            ("LKO-AB-TF01", "33/11kV Singar Nagar Power House", "Alambagh", "Singar Nagar Sub-Division", "Er. Alok Verma (AE In-Charge)", "+91 94150 21001", "ph_singarnagar@lesa.up.gov.in", 26.8165, 80.9020, 2500.0, 67.0, 88.0, 229.0, 49.0, 62.0, 0.06, "NORMAL"),
            ("LKO-AB-TF02", "33/11kV Charbagh Junction Power House", "Alambagh", "Charbagh Railway Hub Sub-Division", "Er. Neha Trivedi (AE In-Charge)", "+91 94150 21002", "ph_charbagh@lesa.up.gov.in", 26.8285, 80.9200, 3500.0, 74.0, 82.0, 225.0, 64.0, 72.0, 0.11, "NORMAL"),
            ("LKO-AB-TF03", "33/11kV Krishna Nagar Power House", "Alambagh", "Krishna Nagar Sub-Division", "Er. Deepak Mishra (AE In-Charge)", "+91 94150 21003", "ph_krishnanagar@lesa.up.gov.in", 26.8040, 80.8920, 2000.0, 69.0, 91.0, 231.0, 42.0, 58.0, 0.04, "NORMAL"),
            ("LKO-HZ-TF01", "132/33kV Martinpurwa Transmission Substation", "Hazratganj", "Martinpurwa / Raj Bhavan Sub-Division", "Er. Rajiv Mehrotra (AE In-Charge)", "+91 94150 22001", "ph_martinpurwa@lesa.up.gov.in", 26.8500, 80.9499, 5000.0, 64.0, 92.0, 231.0, 44.0, 55.0, 0.04, "NORMAL"),
            ("LKO-HZ-TF02", "33/11kV Hazratganj Central Power House", "Hazratganj", "Vidhan Sabha / Ganj Commercial", "Er. Anuradha Rastogi (AE In-Charge)", "+91 94150 22002", "ph_hazratganj@lesa.up.gov.in", 26.8480, 80.9440, 3000.0, 71.0, 87.0, 227.0, 52.0, 64.0, 0.07, "NORMAL"),
            ("LKO-HZ-TF03", "33/11kV Aishbagh Waterworks Power House", "Hazratganj", "Aishbagh Pumping Station Sub-Division", "Er. Pankaj Singh (AE In-Charge)", "+91 94150 22003", "ph_aishbagh@lesa.up.gov.in", 26.8370, 80.9150, 3000.0, 68.5, 89.0, 230.0, 46.0, 60.0, 0.05, "NORMAL"),
            ("LKO-GN-TF01", "33/11kV Vibhuti Khand Power House", "Gomti Nagar", "Vibhuti Khand IT Park Sub-Division", "Er. Vivek Saxena (AE In-Charge)", "+91 94150 23001", "ph_vibhutikhand@lesa.up.gov.in", 26.8623, 80.9992, 2500.0, 88.5, 68.0, 192.0, 82.0, 89.0, 0.58, "WARNING"),
            ("LKO-GN-TF02", "33/11kV Patrakarpuram Power House", "Gomti Nagar", "Patrakarpuram Market Sub-Division", "Er. Shweta Singh (AE In-Charge)", "+91 94150 23002", "ph_patrakarpuram@lesa.up.gov.in", 26.8520, 81.0060, 2000.0, 73.0, 85.0, 226.0, 55.0, 66.0, 0.08, "NORMAL"),
            ("LKO-GN-TF03", "33/11kV HAL Indira Nagar Power House", "Gomti Nagar", "Indira Nagar Sector-14 Sub-Division", "Er. Pramod Kumar (AE In-Charge)", "+91 94150 23003", "ph_indiranagar@lesa.up.gov.in", 26.8850, 80.9850, 2000.0, 72.0, 85.0, 226.0, 54.0, 68.0, 0.08, "NORMAL"),
            ("LKO-AL-TF01", "220kV Kursi Road Power House", "Aliganj", "Kursi Road Sub-Division", "Er. Sandeep Shukla (AE In-Charge)", "+91 94150 24001", "ph_kursiroad@lesa.up.gov.in", 26.8920, 80.9420, 8000.0, 68.0, 89.0, 228.0, 48.0, 62.0, 0.05, "NORMAL"),
            ("LKO-AL-TF02", "33/11kV Jankipuram Power House", "Aliganj", "Jankipuram Extension Sub-Division", "Er. Preeti Kashyap (AE In-Charge)", "+91 94150 24002", "ph_jankipuram@lesa.up.gov.in", 26.9180, 80.9380, 2500.0, 70.0, 87.0, 229.0, 46.0, 59.0, 0.05, "NORMAL"),
            ("LKO-AL-TF03", "33/11kV Mahanagar Power House", "Aliganj", "Mahanagar Sub-Division", "Er. Girish Chandra (AE In-Charge)", "+91 94150 24003", "ph_mahanagar@lesa.up.gov.in", 26.8780, 80.9540, 3000.0, 75.0, 83.0, 224.0, 58.0, 70.0, 0.09, "NORMAL"),
            ("LKO-CK-TF01", "33/11kV Chowk / Neebu Park Power House", "Chowk", "Gol Darwaza / Neebu Park Sub-Division", "Er. Zeeshan Haider (AE In-Charge)", "+91 94150 25001", "ph_chowk@lesa.up.gov.in", 26.8680, 80.9100, 2500.0, 91.2, 58.0, 194.0, 86.0, 91.0, 0.64, "WARNING"),
            ("LKO-CK-TF02", "33/11kV Thakurganj Waterworks Power House", "Chowk", "Thakurganj / Gaughat Sub-Division", "Er. Amit Bhatt (AE In-Charge)", "+91 94150 25002", "ph_thakurganj@lesa.up.gov.in", 26.8710, 80.8990, 2000.0, 68.0, 88.0, 230.0, 43.0, 57.0, 0.05, "NORMAL"),
            ("LKO-CK-TF03", "33/11kV Rajajipuram Power House", "Chowk", "Rajajipuram Sector-11 Sub-Division", "Er. Kavita Sharma (AE In-Charge)", "+91 94150 25003", "ph_rajajipuram@lesa.up.gov.in", 26.8410, 80.8850, 2500.0, 72.5, 86.0, 227.0, 51.0, 65.0, 0.07, "NORMAL"),
            ("LKO-AM-TF01", "220kV Amausi Airport Power House", "Amausi", "Airport & Sarojini Nagar Sub-Division", "Er. Harishanker Tiwari (AE In-Charge)", "+91 94150 26001", "ph_amausi@lesa.up.gov.in", 26.7606, 80.8893, 10000.0, 63.5, 94.0, 232.0, 42.0, 50.0, 0.03, "NORMAL"),
            ("LKO-AM-TF02", "132kV SGPGI Rae Bareli Road Power House", "Rae Bareli Road", "SGPGI Hospital Sub-Division", "Er. Sudhir Mohan (AE In-Charge)", "+91 94150 26002", "ph_sgpgi@lesa.up.gov.in", 26.7450, 80.9380, 5000.0, 98.6, 46.0, 184.0, 92.0, 96.0, 0.88, "CRITICAL"),
            ("LKO-AM-TF03", "132kV Chinhat Industrial Power House", "Chinhat", "Chinhat Industrial Sub-Division", "Er. Arvind Patel (AE In-Charge)", "+91 94150 26003", "ph_chinhat@lesa.up.gov.in", 26.8870, 81.0340, 4000.0, 76.0, 82.0, 222.0, 62.0, 74.0, 0.12, "NORMAL"),
        ]

        tf_map = {}
        for code, sname, zone, sub_r, mname, mphone, memail, lat, lng, cap, temp, oil, volt, curr, load, fprob, stat in tf_data:
            reg_key = "Amausi & SGPGI" if zone in ["Amausi", "Rae Bareli Road", "Chinhat"] else zone
            reg = region_map[reg_key]
            tf = Transformer(
                code=code, substation_name=sname, zone=zone, grid_region_id=reg.id, sub_region=sub_r,
                manager_name=mname, manager_phone=mphone, manager_email=memail, latitude=lat, longitude=lng,
                capacity_kva=cap, temperature_c=temp, oil_level_pct=oil, voltage_v=volt, current_a=curr,
                load_pct=load, failure_probability=fprob, status=stat
            )
            db.session.add(tf)
            tf_map[code] = tf
        db.session.flush()

        # 4. 30 Crews (5 per Region)
        crew_specs = [
            ("Alambagh", "LESA-Alambagh-1 (Rapid Response)", "Ram Gopal Yadav", "Lead Field Technician", "+91 94150 31001", "TRANSFORMER_REPAIR", 26.8160, 80.9030, "LKO-AB-TF01", "AVAILABLE", 0),
            ("Alambagh", "LESA-Alambagh-2 (High Tension)", "Sunil Kumar Rawat", "Senior Line Inspector", "+91 94150 31002", "HIGH_VOLTAGE", 26.8250, 80.9180, "LKO-AB-TF02", "AVAILABLE", 0),
            ("Alambagh", "LESA-Alambagh-3 (Substation Relay)", "Mohd. Irfan", "Relay Automation Specialist", "+91 94150 31003", "SUBSTATION_RELAY", 26.8100, 80.8950, "LKO-AB-TF03", "AVAILABLE", 0),
            ("Alambagh", "LESA-Alambagh-4 (Feeder Clearance)", "Devendra Pratap", "Overhead Line Foreman", "+91 94150 31004", "LINE_CLEARANCE", 26.8180, 80.9100, "LKO-AB-TF01", "AVAILABLE", 0),
            ("Alambagh", "LESA-Alambagh-5 (Underground Cable)", "Ashok Kumar Maurya", "HT Cable Splicer", "+91 94150 31005", "UNDERGROUND_CABLE", 26.8050, 80.9000, "LKO-AB-TF03", "AVAILABLE", 0),
            ("Hazratganj", "LESA-Hazratganj-1 (VIP Corridor)", "Mahesh Chandra", "Master Technician (VIP Grid)", "+91 94150 32001", "TRANSFORMER_REPAIR", 26.8485, 80.9470, "LKO-HZ-TF02", "AVAILABLE", 0),
            ("Hazratganj", "LESA-Hazratganj-2 (High Voltage Mesh)", "Vikas Sharma", "132kV Line Supervisor", "+91 94150 32002", "HIGH_VOLTAGE", 26.8510, 80.9520, "LKO-HZ-TF01", "AVAILABLE", 0),
            ("Hazratganj", "LESA-Hazratganj-3 (Cable Fault Locating)", "Rajendra Prasad", "Underground Fault Master", "+91 94150 32003", "UNDERGROUND_CABLE", 26.8450, 80.9410, "LKO-HZ-TF02", "AVAILABLE", 0),
            ("Hazratganj", "LESA-Hazratganj-4 (Line Clearance)", "Santosh Tiwari", "Emergency Tree Line Foreman", "+91 94150 32004", "LINE_CLEARANCE", 26.8390, 80.9200, "LKO-HZ-TF03", "AVAILABLE", 0),
            ("Hazratganj", "LESA-Hazratganj-5 (Mobile Substation)", "Rakesh Awasthi", "Protection & Relay Tech", "+91 94150 32005", "SUBSTATION_RELAY", 26.8520, 80.9480, "LKO-HZ-TF01", "AVAILABLE", 0),
            ("Gomti Nagar", "LESA-GomtiNagar-1 (Commercial Feeder)", "Manoj Verma", "Lead Field Technician", "+91 94150 33001", "TRANSFORMER_REPAIR", 26.8590, 80.9950, "LKO-GN-TF01", "AVAILABLE", 0),
            ("Gomti Nagar", "LESA-GomtiNagar-2 (High Tension Ring)", "Ajay Dixit", "HV Line Specialist", "+91 94150 33002", "HIGH_VOLTAGE", 26.8540, 81.0040, "LKO-GN-TF02", "AVAILABLE", 0),
            ("Gomti Nagar", "LESA-GomtiNagar-3 (Substation Automation)", "Dinesh Yadav", "SCADA Relay Technician", "+91 94150 33003", "SUBSTATION_RELAY", 26.8820, 80.9820, "LKO-GN-TF03", "AVAILABLE", 0),
            ("Gomti Nagar", "LESA-GomtiNagar-4 (Underground Network)", "Vinay Nigam", "Underground Network Specialist", "+91 94150 33004", "UNDERGROUND_CABLE", 26.8640, 81.0010, "LKO-GN-TF01", "AVAILABLE", 0),
            ("Gomti Nagar", "LESA-GomtiNagar-5 (Rapid Line Clear)", "Surendra Pal", "Distribution Line Foreman", "+91 94150 33005", "LINE_CLEARANCE", 26.8860, 80.9880, "LKO-GN-TF03", "AVAILABLE", 0),
            ("Aliganj", "LESA-Aliganj-1 (Substation Primary)", "Satish Dwivedi", "Lead Substation Tech", "+91 94150 34001", "TRANSFORMER_REPAIR", 26.8910, 80.9410, "LKO-AL-TF01", "AVAILABLE", 0),
            ("Aliganj", "LESA-Aliganj-2 (High Tension Ring)", "Harish Gautam", "220kV Line Inspector", "+91 94150 34002", "HIGH_VOLTAGE", 26.9150, 80.9350, "LKO-AL-TF02", "AVAILABLE", 0),
            ("Aliganj", "LESA-Aliganj-3 (Ring Main Relay)", "Jitendra Prasad", "Relay Protection Engineer", "+91 94150 34003", "SUBSTATION_RELAY", 26.8770, 80.9520, "LKO-AL-TF03", "AVAILABLE", 0),
            ("Aliganj", "LESA-Aliganj-4 (Overhead Corridor)", "Babloo Kushwaha", "Line Clearance Specialist", "+91 94150 34004", "LINE_CLEARANCE", 26.8950, 80.9460, "LKO-AL-TF01", "AVAILABLE", 0),
            ("Aliganj", "LESA-Aliganj-5 (Sector Distribution)", "Naveen Pandey", "Sector Cable Technician", "+91 94150 34005", "UNDERGROUND_CABLE", 26.9200, 80.9400, "LKO-AL-TF02", "AVAILABLE", 0),
            ("Chowk", "LESA-Chowk-1 (Heritage Narrow Feeder)", "Mohd. Qasim", "Lead Old City Technician", "+91 94150 35001", "TRANSFORMER_REPAIR", 26.8670, 80.9120, "LKO-CK-TF01", "AVAILABLE", 0),
            ("Chowk", "LESA-Chowk-2 (Aerial Bunched Cable)", "Shyam Sundar", "ABC Line Specialist", "+91 94150 35002", "HIGH_VOLTAGE", 26.8700, 80.9010, "LKO-CK-TF02", "AVAILABLE", 0),
            ("Chowk", "LESA-Chowk-3 (KGMU Hospital Feeder)", "Pappu Verma", "Critical Feeder Specialist", "+91 94150 35003", "SUBSTATION_RELAY", 26.8685, 80.9140, "LKO-CK-TF01", "AVAILABLE", 0),
            ("Chowk", "LESA-Chowk-4 (Dense Alley Lines)", "Riyaz Khan", "Dense Corridor Foreman", "+91 94150 35004", "LINE_CLEARANCE", 26.8430, 80.8870, "LKO-CK-TF03", "AVAILABLE", 0),
            ("Chowk", "LESA-Chowk-5 (Substation Protection)", "Brijesh Yadav", "Protection Relay Tech", "+91 94150 35005", "UNDERGROUND_CABLE", 26.8400, 80.8840, "LKO-CK-TF03", "AVAILABLE", 0),
            ("Amausi & SGPGI", "LESA-Amausi-1 (SGPGI Hospital Line)", "Om Prakash", "Tier-1 Medical Line Lead", "+91 94150 36001", "TRANSFORMER_REPAIR", 26.7480, 80.9350, "LKO-AM-TF02", "BUSY", 1),
            ("Amausi & SGPGI", "LESA-Amausi-2 (Airport Grid Aviation)", "Ranjit Singh", "Aviation Grid Specialist", "+91 94150 36002", "HIGH_VOLTAGE", 26.7620, 80.8910, "LKO-AM-TF01", "AVAILABLE", 0),
            ("Amausi & SGPGI", "LESA-Amausi-3 (Industrial Relay)", "Govind Swaroop", "Industrial Protection Tech", "+91 94150 36003", "SUBSTATION_RELAY", 26.8850, 81.0310, "LKO-AM-TF03", "AVAILABLE", 0),
            ("Amausi & SGPGI", "LESA-Amausi-4 (Shaheed Path Corridor)", "Dharmendra Kushwaha", "Highway Grid Foreman", "+91 94150 36004", "LINE_CLEARANCE", 26.7580, 80.9200, "LKO-AM-TF02", "AVAILABLE", 0),
            ("Amausi & SGPGI", "LESA-Amausi-5 (Underground Feeder)", "Sant Kumar", "HT Underground Tech", "+91 94150 36005", "UNDERGROUND_CABLE", 26.7650, 80.8850, "LKO-AM-TF01", "AVAILABLE", 0),
        ]

        created_crews = []
        for reg_name, team, lead, title, phone, spec, lat, lng, ph_code, stat, wload in crew_specs:
            c_email = f"crew_{team.split()[0].lower()}@lesa.up.gov.in".replace("-", "_")
            lu = User(name=lead, email=c_email, email_masked=f"{c_email[:2]}***@lesa.up.gov.in", role="CREW", phone_masked=f"+91-XXXXXX{phone[-4:]}", zone=reg_name)
            lu.set_password("LucknowGrid@2026")
            db.session.add(lu)
            db.session.flush()

            crew = Crew(team_name=team, grid_region_id=region_map[reg_name].id, power_house_id=tf_map[ph_code].id,
                        leader_id=lu.id, leader_phone=phone, leader_title=title, current_lat=lat, current_lng=lng,
                        skill_specialization=spec, active_workload=wload, status=stat)
            db.session.add(crew)
            created_crews.append(crew)
        db.session.flush()

        # 5. Critical Facilities
        fac_specs = [
            ("King George's Medical University (KGMU - Chowk)", "HOSPITAL", "LKO-CK-TF01", 10, 7.5, 26.8690, 80.9130),
            ("Sanjay Gandhi Post Graduate Institute (SGPGI - Rae Bareli Rd)", "HOSPITAL", "LKO-AM-TF02", 10, 5.2, 26.7460, 80.9395),
            ("Dr. Ram Manohar Lohia Institute (RMLIMS - Gomti Nagar)", "HOSPITAL", "LKO-GN-TF01", 9, 13.0, 26.8610, 81.0020),
            ("Gaughat Jal Kal Water Pumping Station", "WATER_SYSTEM", "LKO-CK-TF02", 8, 18.0, 26.8710, 80.9080),
            ("Aishbagh Jal Kal Water Pumping Station", "WATER_SYSTEM", "LKO-HZ-TF03", 8, 14.5, 26.8370, 80.9150),
            ("Chaudhary Charan Singh International Airport (Amausi)", "GOVT_TRANSIT", "LKO-AM-TF01", 9, 24.0, 26.7606, 80.8893),
            ("Lok Bhavan / UP Vidhan Sabha (Hazratganj)", "GOVT_TRANSIT", "LKO-HZ-TF02", 9, 20.0, 26.8480, 80.9470),
            ("UP Police 112 Emergency HQ (Gomti Nagar)", "EMERGENCY_SERVICE", "LKO-GN-TF01", 9, 16.0, 26.8580, 81.0110),
            ("Charbagh Northern & NE Railway Terminus", "GOVT_TRANSIT", "LKO-AB-TF02", 9, 15.0, 26.8290, 80.9210),
        ]
        for fname, ftype, tfcode, pweight, bgen, lat, lng in fac_specs:
            db.session.add(CriticalFacility(name=fname, facility_type=ftype, transformer_id=tf_map[tfcode].id, priority_weight=pweight, backup_generator_hours=bgen, latitude=lat, longitude=lng))

        # 6. Outage Reports & Incidents
        cl_lat1, cl_lng1 = cloak_coordinates(26.7455, 80.9385)
        cl_lat2, cl_lng2 = cloak_coordinates(26.8630, 80.9995)
        cl_lat3, cl_lng3 = cloak_coordinates(26.8675, 80.9110)

        db.session.add_all([
            OutageReport(tracking_token="LKO-OUT-9482", consumer_hash=hash_identifier("9876543210"), transformer_id=tf_map["LKO-AM-TF02"].id, cloaked_lat=cl_lat1, cloaked_lng=cl_lng1, locality_name="Rae Bareli Road (SGPGI Campus)", description="Power tripped 20 mins ago, hospital backup generators running.", exif_stripped=True, verified=True),
            OutageReport(tracking_token="LKO-OUT-5521", consumer_hash=hash_identifier("9123456780"), transformer_id=tf_map["LKO-GN-TF01"].id, cloaked_lat=cl_lat2, cloaked_lng=cl_lng2, locality_name="Vibhuti Khand, Gomti Nagar", description="Heavy voltage fluctuation followed by sudden blackout near Mini Stadium.", exif_stripped=True, verified=True),
            OutageReport(tracking_token="LKO-OUT-3312", consumer_hash=hash_identifier("9811223344"), transformer_id=tf_map["LKO-CK-TF01"].id, cloaked_lat=cl_lat3, cloaked_lng=cl_lng3, locality_name="Chowk / Neebu Park", description="Sparking observed at distribution pole near Gol Darwaza.", exif_stripped=True, verified=False),
        ])

        inc1 = Incident(incident_code="INC-LKO-SG01-0941", transformer_id=tf_map["LKO-AM-TF02"].id, weather_condition="Severe Heatwave (Loo)", ambient_temp_c=44.5, weather_multiplier=1.45, consumer_report_count=3, affected_critical_count=1, severity_score=94.2, root_cause_prediction="Severe Thermal Overload (Lucknow Loo Induced)", status="DISPATCHED")
        inc2 = Incident(incident_code="INC-LKO-GN01-1015", transformer_id=tf_map["LKO-GN-TF01"].id, weather_condition="Severe Heatwave (Loo)", ambient_temp_c=43.0, weather_multiplier=1.40, consumer_report_count=2, affected_critical_count=2, severity_score=78.5, root_cause_prediction="Peak Feeder Demand Exceedance", status="VERIFIED")
        inc3 = Incident(incident_code="INC-LKO-CK01-1120", transformer_id=tf_map["LKO-CK-TF01"].id, weather_condition="Severe Heatwave (Loo)", ambient_temp_c=43.2, weather_multiplier=1.40, consumer_report_count=1, affected_critical_count=2, severity_score=81.0, root_cause_prediction="Transformer Bushing Insulation Degradation", status="DETECTED")
        db.session.add_all([inc1, inc2, inc3])
        db.session.flush()

        # 7. Dispatch, Messages, Privacy Audits
        amausi_crew_1 = next(c for c in created_crews if c.team_name.startswith("LESA-Amausi-1"))
        db.session.add(DispatchRecord(incident_id=inc1.id, crew_id=amausi_crew_1.id, operator_id=operator_user.id, match_score=94.5, distance_km=1.4, eta_minutes=10, dispatched_at=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=8)))

        db.session.add_all([
            CrossDeviceMessage(incident_id=inc1.id, sender_role="SYSTEM_ALARM", sender_name="SCADA Correlator", target_role="OPERATOR", channel="PUSH", message_body="Critical Alert: 132kV SGPGI Transformer exceeded 98C. SGPGI Hospital on primary feeder."),
            CrossDeviceMessage(incident_id=inc1.id, sender_role="OPERATOR", sender_name="Arunabh Tripathi", target_role="CREW", channel="WHATSAPP_ALERT", message_body="Urgent Dispatch: LESA-Amausi-1 deployed to SGPGI Substation. Hospital backup generators engaged."),
            CrossDeviceMessage(incident_id=inc1.id, sender_role="CREW", sender_name="Om Prakash (Crew Lead)", target_role="OPERATOR", channel="IN_APP", message_body="LESA-Amausi-1 en route via Rae Bareli Road. ETA 8 mins. Heavy traffic near Telibagh bridge."),
            CrossDeviceMessage(incident_id=inc1.id, sender_role="SYSTEM_SMS", sender_name="LESA SMS Gateway", target_role="CONSUMER", channel="SMS_GATEWAY", message_body="[LESA-UPPCL Alert] Outage reported in Rae Bareli Rd zone. Repair crew LESA-Amausi-1 dispatched. Tracking ID: LKO-OUT-9482."),
            CrossDeviceMessage(incident_id=inc2.id, sender_role="COORDINATOR", sender_name="Er. Rajeshwar Pandey (Gomti Nagar Coordinator)", target_role="OPERATOR", channel="IN_APP", message_body="Feeder Alert: 33/11kV Vibhuti Khand load at 89%. UP Police 112 HQ & RML Hospital affected. Standby crew alerted."),
            PrivacyAuditLog(actor_role="CONSUMER", action_type="GEOHASH_300M_CLOAK", resource_target="LKO-OUT-9482", privacy_policy_applied="DPDP Act 2023 Sec 4: K-Anonymity spatial fuzzing"),
            PrivacyAuditLog(actor_role="CONSUMER", action_type="SHA256_PII_SALT_HASH", resource_target="Consumer Phone", privacy_policy_applied="DPDP Act 2023 Sec 8: Cryptographic identifier masking"),
            PrivacyAuditLog(actor_role="OPERATOR", action_type="CRITICAL_FACILITY_ACCESS", resource_target="SGPGI Hospital / KGMU", privacy_policy_applied="Authorized Emergency Response RBAC Protocol"),
        ])

        db.session.commit()
        print("[Voltera] Database successfully initialized.")
        print(f"[Voltera ML] Model ready: {train_model()}")

if __name__ == "__main__":
    seed_database(force_reset=True)
