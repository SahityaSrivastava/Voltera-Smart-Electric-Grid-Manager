import unittest
from app import create_app
from app.models import db, User, Transformer, Incident, Crew, CriticalFacility

class PowerGridLucknowTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    def test_01_unauthenticated_state(self):
        res = self.client.get('/api/auth/me')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertFalse(data['authenticated'])

    def test_02_guest_login(self):
        res = self.client.post('/api/auth/guest')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['user']['role'], 'CONSUMER')

    def test_03_admin_login(self):
        res = self.client.post('/api/auth/login', json={
            'email': 'admin@lesa.up.gov.in',
            'password': 'Admin@Lucknow2026'
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['user']['role'], 'ADMIN')

    def test_03b_login_aliases_and_error_handling(self):
        # 1. Test alias 'operator'
        res_op = self.client.post('/api/auth/login', json={
            'email': 'operator',
            'password': 'LucknowGrid@2026'
        })
        self.assertEqual(res_op.status_code, 200)
        self.assertEqual(res_op.get_json()['user']['role'], 'OPERATOR')

        # 2. Test alias 'citizen'
        res_cit = self.client.post('/api/auth/login', json={
            'email': 'citizen',
            'password': 'LucknowGrid@2026'
        })
        self.assertEqual(res_cit.status_code, 200)
        self.assertEqual(res_cit.get_json()['user']['role'], 'CONSUMER')

        # 3. Test invalid credentials returns 401 and descriptive error
        res_err = self.client.post('/api/auth/login', json={
            'email': 'wrong_operator',
            'password': 'BadPassword999'
        })
        self.assertEqual(res_err.status_code, 401)
        err_data = res_err.get_json()
        self.assertFalse(err_data['success'])
        self.assertIn('Invalid username or password', err_data['error'])

    def test_03_admin_user_management(self):
        # 1. Login as Admin
        self.client.post('/api/auth/login', json={
            'email': 'admin@lesa.up.gov.in',
            'password': 'Admin@Lucknow2026'
        })

        # 2. List users
        res = self.client.get('/api/auth/users')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertGreaterEqual(len(data['users']), 1)

        # 3. Create a new user
        new_email = 'testoperator_new@lesa.up.gov.in'
        res = self.client.post('/api/auth/users', json={
            'name': 'Test New Operator',
            'email': new_email,
            'password': 'OperatorPass2026!',
            'role': 'OPERATOR',
            'zone': 'Alambagh',
            'phone': '+91 99999 11111'
        })
        self.assertEqual(res.status_code, 200)
        create_data = res.get_json()
        self.assertTrue(create_data['success'])
        created_id = create_data['user']['id']

        # 4. Logout Admin
        self.client.post('/api/auth/logout')

        # 5. Sign in as the new user
        res = self.client.post('/api/auth/login', json={
            'email': new_email,
            'password': 'OperatorPass2026!'
        })
        self.assertEqual(res.status_code, 200)
        login_data = res.get_json()
        self.assertTrue(login_data['success'])
        self.assertEqual(login_data['user']['role'], 'OPERATOR')

        # 6. Verify non-admin CANNOT create/manage users (Forbidden)
        res = self.client.get('/api/auth/users')
        self.assertEqual(res.status_code, 403)

        # 7. Switch back to admin and delete test user
        self.client.post('/api/auth/login', json={
            'email': 'admin@lesa.up.gov.in',
            'password': 'Admin@Lucknow2026'
        })
        del_res = self.client.delete(f'/api/auth/users/{created_id}')
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.get_json()['success'])

    def test_04_grid_operations_data(self):
        # Substations / Area
        res = self.client.get('/api/transformers')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()['success'])

        # Incidents
        res = self.client.get('/api/incidents')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()['success'])

        # Crews
        res = self.client.get('/api/crews')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()['success'])

        # Facilities
        res = self.client.get('/api/critical-facilities')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()['success'])

    def test_05_citizen_outage_reporting_and_tracking(self):
        res = self.client.post('/api/outages/report', json={
            'locality': 'Hazratganj',
            'phone': '+91 98765 00000',
            'description': 'Feeder spark near Mayfair',
            'latitude': 26.8500,
            'longitude': 80.9499
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        token = data['tracking_token']

        # Track with token (exact casing)
        res_track = self.client.get(f'/api/outages/track/{token}')
        self.assertEqual(res_track.status_code, 200)
        track_data = res_track.get_json()
        self.assertTrue(track_data['success'])
        self.assertEqual(track_data['tracking_token'], token)

        # Track with lowercase token (case-insensitive resilience)
        res_lower = self.client.get(f'/api/outages/track/{token.lower()}')
        self.assertEqual(res_lower.status_code, 200)
        self.assertTrue(res_lower.get_json()['success'])

    def test_06_dispatch_crew_and_messages(self):
        # 1. Login as Admin
        self.client.post('/api/auth/login', json={
            'email': 'admin@lesa.up.gov.in',
            'password': 'Admin@Lucknow2026'
        })

        # 2. Dispatch Crew #1 to Incident #1
        res = self.client.post('/api/incidents/1/dispatch', json={'crew_id': 1})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])

        # 3. Verify messages feed contains the dispatch order
        res_msg = self.client.get('/api/messages')
        self.assertEqual(res_msg.status_code, 200)
        msg_data = res_msg.get_json()
        self.assertTrue(msg_data['success'])
        self.assertGreaterEqual(len(msg_data['messages']), 1)

        # 4. Progress incident status to ON_SITE and RESOLVED
        res_status = self.client.post('/api/incidents/1/status', json={'status': 'ON_SITE'})
        self.assertEqual(res_status.status_code, 200)

        res_resolve = self.client.post('/api/incidents/1/status', json={'status': 'RESOLVED'})
        self.assertEqual(res_resolve.status_code, 200)

    def test_07_regional_hierarchy_and_coordinators(self):
        # 1. Verify 6 Regional Power Grids exist
        res = self.client.get('/api/regions')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['count'], 6)

        region_names = [r['name'] for r in data['regions']]
        self.assertIn('Alambagh', region_names)
        self.assertIn('Hazratganj', region_names)
        self.assertIn('Gomti Nagar', region_names)
        self.assertIn('Aliganj', region_names)
        self.assertIn('Chowk', region_names)
        self.assertIn('Amausi & SGPGI', region_names)

        # 2. Check each region has a dedicated coordinator
        for reg in data['regions']:
            self.assertTrue(reg['coordinator_name'])
            self.assertTrue(reg['coordinator_phone'])
            self.assertTrue(reg['coordinator_email'])
            self.assertGreater(reg['power_houses_count'], 0)
            self.assertEqual(reg['crews_count'], 5)

        # 3. Verify single region deep detail endpoint
        first_region = data['regions'][0]
        res_detail = self.client.get(f"/api/regions/{first_region['id']}")
        self.assertEqual(res_detail.status_code, 200)
        detail_data = res_detail.get_json()
        self.assertTrue(detail_data['success'])
        self.assertEqual(len(detail_data['power_houses']), 3)
        self.assertEqual(len(detail_data['crews']), 5)

        # Verify Power House Managers are present
        for ph in detail_data['power_houses']:
            self.assertTrue(ph['manager_name'])
            self.assertTrue(ph['manager_phone'])
            self.assertTrue(ph['manager_email'])
            self.assertTrue(ph['sub_region'])

        # Verify Crew Leads are present
        for crew in detail_data['crews']:
            self.assertTrue(crew['leader_name'])
            self.assertTrue(crew['leader_phone'])
            self.assertTrue(crew['leader_title'])

        # 4. Total fleet across Lucknow should be 30 crews (5 per region)
        res_crews = self.client.get('/api/crews')
        self.assertEqual(res_crews.status_code, 200)
        crews_data = res_crews.get_json()
        self.assertEqual(crews_data['count'], 30)

        # 5. Total power houses should be 18
        res_tfs = self.client.get('/api/transformers')
        self.assertEqual(res_tfs.status_code, 200)
        tfs_data = res_tfs.get_json()
        self.assertEqual(tfs_data['count'], 18)

    def test_09_security_and_privacy_controls(self):
        # 1. CSRF Origin defense
        csrf_res = self.client.post('/api/auth/login', json={'email': 'admin@lesa.up.gov.in', 'password': 'Admin@Lucknow2026'}, headers={'Origin': 'https://evil-attacker.example.com'})
        self.assertEqual(csrf_res.status_code, 403)

        # 2. Path traversal attack rejected
        pt_res = self.client.get('/uploads/../../etc/passwd')
        self.assertIn(pt_res.status_code, [400, 403, 404])

        pt_res2 = self.client.get('/uploads/malicious_script.sh')
        self.assertIn(pt_res2.status_code, [400, 403, 404])

        # 3. Invalid tracking token injection
        token_res = self.client.get('/api/outages/track/<script>alert(1)</script>')
        self.assertEqual(token_res.status_code, 400)

        # 4. Telemetry bounds validation (requires operator login)
        self.client.post('/api/auth/login', json={'email': 'admin@lesa.up.gov.in', 'password': 'Admin@Lucknow2026'})
        tel_res = self.client.post('/api/transformers/1/telemetry', json={'temperature_c': 99999.0})
        self.assertEqual(tel_res.status_code, 400)

        # 5. Weak password rejection
        pw_res = self.client.post('/api/auth/users', json={
            'name': 'Weak User',
            'email': 'weakuser@lesa.up.gov.in',
            'password': '123',
            'role': 'OPERATOR'
        })
        self.assertEqual(pw_res.status_code, 400)

    def test_10_static_asset_caching_and_performance(self):
        # 1. Verify static assets receive caching header
        res = self.client.get('/static/css/style.css')
        self.assertEqual(res.status_code, 200)
        self.assertIn('max-age=86400', res.headers.get('Cache-Control', ''))
        res.close()

        # 2. Verify dynamic API routes enforce no-cache
        api_res = self.client.get('/api/regions')
        self.assertEqual(api_res.status_code, 200)
        self.assertIn('no-store', api_res.headers.get('Cache-Control', ''))

    def test_11_crew_dispatch_route_and_closest_recommendations(self):
        # 1. Proximity-based recommendation strictly recommends closest crew
        res_recs = self.client.get('/api/incidents/1/dispatch-recommendations')
        self.assertEqual(res_recs.status_code, 200)
        recs_data = res_recs.get_json()
        self.assertTrue(recs_data['success'])
        self.assertIn('closest_crew', recs_data)
        closest = recs_data['closest_crew']
        self.assertTrue(closest['is_closest'])
        self.assertTrue(closest['is_recommended'])
        # Verify it has minimum distance among available units
        avail_units = [r for r in recs_data['recommendations'] if r['current_status'] == 'AVAILABLE']
        if avail_units:
            min_dist = min(r['distance_km'] for r in avail_units)
            self.assertEqual(closest['distance_km'], min_dist)

        # 2. Field crew accounts list
        res_acc = self.client.get('/api/crews/accounts')
        self.assertEqual(res_acc.status_code, 200)
        acc_data = res_acc.get_json()
        self.assertTrue(acc_data['success'])
        self.assertEqual(acc_data['count'], 30)

        # 3. Dispatched crew active dispatch & route navigation
        self.client.post('/api/auth/login', json={'email': 'admin@lesa.up.gov.in', 'password': 'Admin@Lucknow2026'})
        self.client.post('/api/incidents/3/dispatch', json={'crew_id': 26})
        res_disp = self.client.get('/api/crews/26/active-dispatch')
        self.assertEqual(res_disp.status_code, 200)
        disp_data = res_disp.get_json()
        self.assertTrue(disp_data['success'])
        self.assertTrue(disp_data['has_active_dispatch'])
        self.assertTrue(disp_data['primary_dispatch_message'])
        self.assertIn('route', disp_data)
        self.assertGreater(len(disp_data['route']['waypoints']), 2)
        self.assertGreater(len(disp_data['route']['turn_by_turn']), 2)

        # 4. Crew login alias and quick switch
        res_crew_login = self.client.post('/api/auth/login', json={
            'email': 'crew',
            'password': 'LucknowGrid@2026'
        })
        self.assertEqual(res_crew_login.status_code, 200)
        crew_user = res_crew_login.get_json()['user']
        self.assertEqual(crew_user['role'], 'CREW')

        # 5. Quick switch to any crew account
        switch_res = self.client.post('/api/auth/quick-switch', json={'crew_id': 1})
        self.assertEqual(switch_res.status_code, 200)
        switched_user = switch_res.get_json()['user']
        self.assertEqual(switched_user['role'], 'CREW')

    def test_12_role_based_access_and_footer_structure(self):
        # Verify rendered index.html meets all UI constraints
        res = self.client.get('/')
        self.assertEqual(res.status_code, 200)
        html = res.get_data(as_text=True)

        # 1. Login screen has only Admin, Operator, Crew, and Guest
        self.assertIn('title="Admin Demo', html)
        self.assertIn('title="Operator Demo', html)
        self.assertIn('title="Field Crew Demo', html)
        self.assertIn('id="btn-guest-explore"', html)
        # Extra dropdowns removed
        self.assertNotIn('login-crew-select', html)
        self.assertNotIn('Quick Switch Account', html)

        # 2. Bottom copyright line with integrated Version in main website and login screen
        self.assertIn('app-global-footer', html)
        self.assertIn('login-copyright-line', html)
        self.assertIn('Version 1.0.2', html)
        self.assertIn('footer-version-tag', html)
        self.assertIn('Madhyanchal Vidyut Vitaran Nigam Ltd. (MVVNL) / UPPCL', html)
        self.assertIn('All Rights Reserved.', html)

        # 3. Navigation modules with IDs for RBAC
        self.assertIn('id="nav-overview"', html)
        self.assertIn('id="nav-incidents"', html)
        self.assertIn('id="nav-substations"', html)
        self.assertIn('id="nav-fleet"', html)
        self.assertIn('id="nav-facilities"', html)
        self.assertIn('id="nav-citizen"', html)
        self.assertIn('id="nav-crew-terminal"', html)
        self.assertIn('id="nav-users"', html)

        # 4. Professional fonts and manual nav sliders
        self.assertIn('IBM+Plex+Sans', html)
        self.assertIn('IBM+Plex+Mono', html)
        self.assertIn('id="btn-nav-slide-left"', html)
        self.assertIn('id="btn-nav-slide-right"', html)
        self.assertIn('toggleNotificationCenter(event)', html)

    def test_13_advanced_resilience_and_lifecycle(self):
        # 1. Login as Admin
        self.client.post('/api/auth/login', json={
            'email': 'admin@lesa.up.gov.in',
            'password': 'Admin@Lucknow2026'
        })

        # 2. Test crew dispatch lifecycle and post-resolve state
        # Dispatch Crew #2 to Incident #2
        disp_res = self.client.post('/api/incidents/2/dispatch', json={'crew_id': 2})
        self.assertEqual(disp_res.status_code, 200)

        # Verify Crew 2 now has active dispatch
        crew2_disp = self.client.get('/api/crews/2/active-dispatch')
        self.assertEqual(crew2_disp.status_code, 200)
        self.assertTrue(crew2_disp.get_json()['has_active_dispatch'])

        # Advance through EN_ROUTE and ON_SITE
        st_res1 = self.client.post('/api/incidents/2/status', json={'status': 'EN_ROUTE'})
        self.assertEqual(st_res1.status_code, 200)

        st_res2 = self.client.post('/api/incidents/2/status', json={'status': 'ON_SITE'})
        self.assertEqual(st_res2.status_code, 200)

        # Resolve incident
        st_res3 = self.client.post('/api/incidents/2/status', json={'status': 'RESOLVED'})
        self.assertEqual(st_res3.status_code, 200)

        # Crucial check: After resolution, Crew 2 should have has_active_dispatch == False
        crew2_after = self.client.get('/api/crews/2/active-dispatch')
        self.assertEqual(crew2_after.status_code, 200)
        self.assertFalse(crew2_after.get_json()['has_active_dispatch'])

        # 3. Test crew reassignment release:
        # Create an active incident state by changing Incident 1 status to DETECTED
        self.client.post('/api/incidents/1/status', json={'status': 'DETECTED'})
        # Dispatch Crew 3 to Incident 1
        self.client.post('/api/incidents/1/dispatch', json={'crew_id': 3})
        c3_active = self.client.get('/api/crews/3/active-dispatch')
        self.assertTrue(c3_active.get_json()['has_active_dispatch'])

        # Reassign Incident 1 to Crew 4
        self.client.post('/api/incidents/1/dispatch', json={'crew_id': 4})
        c4_active = self.client.get('/api/crews/4/active-dispatch')
        self.assertTrue(c4_active.get_json()['has_active_dispatch'])

        # Crew 3 must now be released (has_active_dispatch == False)
        c3_released = self.client.get('/api/crews/3/active-dispatch')
        self.assertFalse(c3_released.get_json()['has_active_dispatch'])

        # Resolve Incident 1 to restore state
        self.client.post('/api/incidents/1/status', json={'status': 'RESOLVED'})

        # 4. Outage report unique token generation
        rep_tokens = set()
        for _ in range(5):
            rep_res = self.client.post('/api/outages/report', json={
                'locality': 'Gomti Nagar',
                'phone': '+91 91234 56789',
                'description': 'Brief power fluctuation'
            })
            self.assertEqual(rep_res.status_code, 200)
            tok = rep_res.get_json()['tracking_token']
            self.assertNotIn(tok, rep_tokens)
            rep_tokens.add(tok)

if __name__ == '__main__':
    unittest.main()

