function getMobileAppHTML() {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'>
    <meta name="apple-mobile-web-app-capable" content="yes">
    <title>P3D Remote</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Arial, sans-serif;
            background: #003057;
            color: white;
        }
        .header {
            background: linear-gradient(135deg, #003057 0%, #005a9c 100%);
            padding: 15px 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }
        .header h1 { 
            font-size: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .logo { font-size: 24px; }
        .status {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: bold;
            margin-top: 5px;
            display: inline-block;
        }
        .status.connected { background: #00c853; }
        .status.offline { background: #f44336; }
        
        .login-screen {
            padding: 20px;
            max-width: 500px;
            margin: 40px auto;
        }
        .login-card {
            background: #004d7a;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .login-card h2 { margin-bottom: 20px; color: #fff; }
        
        input {
            width: 100%;
            padding: 14px;
            background: #003057;
            border: 2px solid #005a9c;
            border-radius: 8px;
            color: white;
            font-size: 15px;
            margin: 10px 0;
        }
        input::placeholder { color: #7ab8e8; }
        
        .btn {
            width: 100%;
            padding: 14px;
            border: none;
            border-radius: 10px;
            font-size: 15px;
            font-weight: bold;
            cursor: pointer;
            margin: 8px 0;
        }
        .btn-primary { background: #00c853; color: white; }
        .btn-secondary { background: #005a9c; color: white; }
        .btn-danger { background: #f44336; color: white; }
        .btn:disabled { background: #555; opacity: 0.5; }
        
        .tabs {
            display: flex;
            background: #003057;
            border-bottom: 2px solid #005a9c;
        }
        .tab {
            flex: 1;
            padding: 15px;
            text-align: center;
            cursor: pointer;
            border: none;
            background: transparent;
            color: #7ab8e8;
            font-size: 14px;
            font-weight: bold;
        }
        .tab.active {
            color: white;
            background: #004d7a;
            border-bottom: 3px solid #00c853;
        }
        
        .tab-content {
            display: none;
            padding: 15px;
        }
        .tab-content.active { display: block; }
        
        .card {
            background: #004d7a;
            border-radius: 12px;
            padding: 15px;
            margin-bottom: 15px;
        }
        
        .data-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .data-item {
            background: #003057;
            padding: 12px;
            border-radius: 8px;
            text-align: center;
        }
        .data-label {
            font-size: 11px;
            color: #7ab8e8;
            text-transform: uppercase;
            margin-bottom: 5px;
        }
        .data-value {
            font-size: 24px;
            font-weight: bold;
            color: #00c853;
        }
        
        #map {
            height: 400px;
            border-radius: 12px;
            overflow: hidden;
        }
        
        .control-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: #003057;
            border-radius: 8px;
            margin-bottom: 8px;
        }
        .control-label { font-size: 14px; }
        .toggle-btn {
            padding: 6px 16px;
            border-radius: 20px;
            border: none;
            font-weight: bold;
            cursor: pointer;
            font-size: 12px;
        }
        .toggle-btn.on { background: #00c853; color: white; }
        .toggle-btn.off { background: #555; color: #999; }
        
        .hidden { display: none !important; }
        
        .info-box {
            background: #005a9c;
            padding: 12px;
            border-radius: 8px;
            margin: 10px 0;
            font-size: 13px;
        }

        .slider-container {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .slider {
            -webkit-appearance: none;
            width: 100%;
            height: 8px;
            border-radius: 5px;
            background: #003057;
            outline: none;
        }
        .slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #00c853;
            cursor: pointer;
        }
        .slider::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #00c853;
            cursor: pointer;
        }
        .slider-value {
            min-width: 45px;
            text-align: right;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class='header'>
        <h1><span class='logo'>✈️</span> Prepar3D Remote</h1>
        <div id='statusBadge' class='status offline'>Offline</div>
    </div>

    <div id='loginScreen' class='login-screen'>
        <div class='login-card'>
            <h2>Connect to Simulator</h2>
            <div class='info-box'>
                Enter your Unique ID from the PC Server
            </div>
            <input type='text' id='uniqueId' placeholder='Unique ID' autocapitalize='off'>
            <button class='btn btn-primary' onclick='connectToSim()'>Connect</button>
        </div>
    </div>

    <div id='mainApp' class='hidden'>
        <div class='tabs'>
            <button class='tab active' onclick='switchTab(0)'>Flight</button>
            <button class='tab' onclick='switchTab(1)'>Map</button>
            <button class='tab' onclick='switchTab(2)'>Autopilot</button>
        </div>

        <div class='tab-content active'>
            <div class='card'>
                <div class='data-label'>Distance to Destination</div>
                <div class='data-value'><span id='distance'>--</span> nm</div>
                <div style='margin-top: 8px; color: #7ab8e8; font-size: 13px;' id='ete'>ETE: --</div>
            </div>

            <div class='card'>
                <div class='data-grid'>
                    <div class='data-item'>
                        <div class='data-label'>Speed</div>
                        <div class='data-value' id='speed'>--</div>
                        <div style='font-size: 11px; color: #7ab8e8;'>knots</div>
                    </div>
                    <div class='data-item'>
                        <div class='data-label'>Altitude</div>
                        <div class='data-value' id='altitude'>--</div>
                        <div style='font-size: 11px; color: #7ab8e8;'>feet</div>
                    </div>
                    <div class='data-item'>
                        <div class='data-label'>Heading</div>
                        <div class='data-value' id='heading'>--</div>
                        <div style='font-size: 11px; color: #7ab8e8;'>degrees</div>
                    </div>
                    <div class='data-item'>
                        <div class='data-label'>V/S</div>
                        <div class='data-value' id='vs'>--</div>
                        <div style='font-size: 11px; color: #7ab8e8;'>fpm</div>
                    </div>
                </div>
            </div>
        </div>

        <div class='tab-content'>
            <div class='card'>
                <button class='btn btn-secondary' onclick='toggleRoute()' id='btnRoute'>Show Route</button>
                <div id='map'></div>
            </div>
        </div>

        <div class='tab-content'>
            <div id='controlLock' class='card'>
                <div class='info-box'>🔒 Enter password to access controls</div>
                <input type='password' id='controlPassword' placeholder='Password'>
                <button class='btn btn-primary' onclick='unlockControls()'>Unlock Controls</button>
            </div>
            
            <div id='controlPanel' class='hidden'>
                <div class='card'>
                    <button class='btn' id='btnPause' onclick='togglePause()'>⏸️ Pause</button>
                    <button class='btn btn-primary' onclick='saveGame()'>💾 Save</button>
                </div>
                
                <div class='card'>
                    <h3 style='margin-bottom: 15px;'>Autopilot</h3>
                    
                    <div class='control-row'>
                        <span class='control-label'>Master</span>
                        <button class='toggle-btn off' id='apMaster' onclick='toggleAP("master")'>OFF</button>
                    </div>
                    
                    <div class='control-row'>
                        <span class='control-label'>NAV1 Lock</span>
                        <button class='toggle-btn off' id='apNav1Lock' onclick='toggleAP("nav1_lock")'>OFF</button>
                    </div>

                    <div class='control-row'>
                        <span class='control-label'>Altitude</span>
                        <button class='toggle-btn off' id='apAlt' onclick='toggleAP("altitude")'>OFF</button>
                    </div>
                    <input type='number' id='targetAlt' placeholder='Target Altitude'>
                    <button class='btn btn-primary' onclick='setAltitude()'>Set</button>
                    
                    <div class='control-row'>
                        <span class='control-label'>V/S</span>
                        <button class='toggle-btn off' id='apVS' onclick='toggleAP("vs")'>OFF</button>
                    </div>
                    <input type='number' id='targetVS' placeholder='Vertical Speed (fpm)'>
                    <button class='btn btn-primary' onclick='setVS()'>Set</button>
                    
                    <div class='control-row'>
                        <span class='control-label'>Speed</span>
                        <button class='toggle-btn off' id='apSpeed' onclick='toggleAP("speed")'>OFF</button>
                    </div>
                    <input type='number' id='targetSpeed' placeholder='Target Speed (kts)'>
                    <button class='btn btn-primary' onclick='setSpeed()'>Set</button>
                    
                    <div class='control-row'>
                        <span class='control-label'>Heading</span>
                        <button class='toggle-btn off' id='apHdg' onclick='toggleAP("heading")'>OFF</button>
                    </div>
                    <input type='number' id='targetHdg' placeholder='Heading'>
                    <button class='btn btn-primary' onclick='setHeading()'>Set</button>
                    
                    <div class='control-row'>
                        <span class='control-label'>NAV/GPS</span>
                        <button class='toggle-btn off' id='navMode' onclick='toggleNavMode()'>GPS</button>
                    </div>
                    
                    <div class='control-row'>
                        <span class='control-label'>Approach</span>
                        <button class='toggle-btn off' id='apApp' onclick='toggleAP("approach")'>OFF</button>
                    </div>
                    
                    <div class='control-row'>
                        <span class='control-label'>Auto Throttle</span>
                        <button class='toggle-btn off' id='autoThrottle' onclick='toggleAP("throttle")'>OFF</button>
                    </div>
                </div>
                
                <div class='card'>
                    <h3 style='margin-bottom: 15px;'>Aircraft</h3>
                    
                    <div class='control-row'>
                        <span class='control-label'>Parking Brake</span>
                        <button class='toggle-btn off' id='parkingBrake' onclick='toggleParkingBrake()'>OFF</button>
                    </div>

                    <div class='control-row'>
                        <span class='control-label'>Landing Gear</span>
                        <button class='toggle-btn off' id='gear' onclick='toggleGear()'>UP</button>
                    </div>
                    
                    <div class='control-row'>
                        <span class='control-label'>Flaps</span>
                        <div>
                            <button class='btn btn-secondary' style='width:auto; padding:8px 12px; margin:0 5px;' onclick='changeFlaps(-1)'>-</button>
                            <span id='flapsPos'>0%</span>
                            <button class='btn btn-secondary' style='width:auto; padding:8px 12px; margin:0 5px;' onclick='changeFlaps(1)'>+</button>
                        </div>
                    </div>

                    <div class='control-row'>
                        <span class='control-label'>Speedbrake</span>
                        <div>
                            <button class='btn btn-secondary' style='width:auto; padding:8px 12px; margin:0 5px;' onclick='changeSpeedbrake(-1)'>-</button>
                            <span id='speedbrakePos'>0%</span>
                            <button class='btn btn-secondary' style='width:auto; padding:8px 12px; margin:0 5px;' onclick='changeSpeedbrake(1)'>+</button>
                        </div>
                    </div>
                    <button class='btn btn-secondary' onclick='toggleSpeedbrake()'>Toggle Speedbrake</button>
                </div>

                <div class='card'>
                    <h3 style='margin-bottom: 15px;'>Engines</h3>
                    
                    <div class='control-row'>
                        <span class='control-label'>Throttle 1</span>
                        <div class="slider-container">
                            <input type="range" min="0" max="100" value="0" class="slider" id="throttle1Slider" oninput="setThrottle(1, this.value)">
                            <span class="slider-value" id="throttle1Value">0%</span>
                        </div>
                    </div>

                    <div class='control-row'>
                        <span class='control-label'>Throttle 2</span>
                        <div class="slider-container">
                            <input type="range" min="0" max="100" value="0" class="slider" id="throttle2Slider" oninput="setThrottle(2, this.value)">
                            <span class="slider-value" id="throttle2Value">0%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let ws = null;
        let map = null;
        let aircraftMarker = null;
        let aiMarkers = [];
        let routePolyline = null;
        let showingRoute = false;
        let uniqueId = null;
        let hasControl = false;

        function switchTab(index) {
            document.querySelectorAll('.tab').forEach((tab, i) => {
                tab.classList.toggle('active', i === index);
            });
            document.querySelectorAll('.tab-content').forEach((content, i) => {
                content.classList.toggle('active', i === index);
            });
            
            if (index === 1 && !map) {
                setTimeout(initMap, 100);
            }
        }

        function connectToSim() {
            uniqueId = document.getElementById('uniqueId').value.trim();
            if (!uniqueId) {
                alert('Please enter your Unique ID');
                return;
            }
            
            localStorage.setItem('p3d_unique_id', uniqueId);
            
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(protocol + '//' + window.location.host);
            
            ws.onopen = () => {
                ws.send(JSON.stringify({ 
                    type: 'connect_mobile',
                    uniqueId: uniqueId
                }));
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleMessage(data);
            };

            ws.onclose = () => {
                updateStatus('offline');
                setTimeout(connectToSim, 3000);
            };
        }

        function handleMessage(data) {
            switch(data.type) {
                case 'connected':
                    document.getElementById('loginScreen').classList.add('hidden');
                    document.getElementById('mainApp').classList.remove('hidden');
                    updateStatus(data.pcOnline ? 'connected' : 'offline');
                    break;
                    
                case 'error':
                    alert(data.message);
                    break;
                    
                case 'control_granted':
                    hasControl = true;
                    document.getElementById('controlLock').classList.add('hidden');
                    document.getElementById('controlPanel').classList.remove('hidden');
                    break;
                    
                case 'auth_failed':
                    alert('Wrong password!');
                    break;
                    
                case 'control_required':
                    if (document.getElementById('controlLock').classList.contains('hidden')) {
                        alert(data.message);
                    }
                    break;
                    
                case 'flight_data':
                    updateFlightData(data.data);
                    break;
                    
                case 'autopilot_state':
                    updateAutopilotUI(data.data);
                    break;
                    
                case 'ai_traffic':
                    updateAITraffic(data.aircraft);
                    break;
                    
                case 'pc_offline':
                    updateStatus('offline');
                    break;
            }
        }

        function updateStatus(status) {
            const badge = document.getElementById('statusBadge');
            badge.className = 'status ' + status;
            badge.textContent = status === 'connected' ? 'Connected' : 'Offline';
        }

        function updateFlightData(data) {
            document.getElementById('speed').textContent = Math.round(data.groundSpeed);
            document.getElementById('altitude').textContent = Math.round(data.altitude).toLocaleString();
            document.getElementById('heading').textContent = Math.round(data.heading) + '°';
            document.getElementById('vs').textContent = Math.round(data.verticalSpeed);
            document.getElementById('distance').textContent = data.totalDistance.toFixed(1);
            
            const hours = Math.floor(data.ete / 3600);
            const minutes = Math.floor((data.ete % 3600) / 60);
            document.getElementById('ete').textContent = 'ETE: ' + (hours > 0 ? hours + 'h ' + minutes + 'm' : minutes + 'm');

            const btnPause = document.getElementById('btnPause');
            if (data.isPaused) {
                btnPause.textContent = '▶️ Resume';
                btnPause.style.background = '#f44336'; // Red for Paused
            } else {
                btnPause.textContent = '⏸️ Pause';
                btnPause.style.background = '#005a9c'; // Normal color
            }

            if (map && data.latitude && data.longitude) {
                updateMap(data.latitude, data.longitude, data.heading);
            }
        }

        function updateAutopilotUI(data) {
            updateToggle('apMaster', data.master);
            updateToggle('apNav1Lock', data.nav1Lock);
            updateToggle('apAlt', data.altitude);
            updateToggle('apHdg', data.heading);
            updateToggle('apVS', data.vs);
            updateToggle('apSpeed', data.speed);
            updateToggle('apApp', data.approach);
            updateToggle('autoThrottle', data.throttle);
            updateToggle('gear', data.gear, data.gear ? 'DOWN' : 'UP');
            updateToggle('parkingBrake', data.parkingBrake);
            
            document.getElementById('flapsPos').textContent = Math.round(data.flaps) + '%';
            document.getElementById('speedbrakePos').textContent = Math.round(data.speedbrake) + '%';
            
            // Update throttle sliders
            document.getElementById('throttle1Slider').value = Math.round(data.throttle1 * 100);
            document.getElementById('throttle1Value').textContent = Math.round(data.throttle1 * 100) + '%';
            document.getElementById('throttle2Slider').value = Math.round(data.throttle2 * 100);
            document.getElementById('throttle2Value').textContent = Math.round(data.throttle2 * 100) + '%';
            
            // NAV/GPS toggle
            const navBtn = document.getElementById('navMode');
            navBtn.textContent = data.navMode ? 'NAV' : 'GPS';
            navBtn.className = 'toggle-btn ' + (data.navMode ? 'on' : 'off');
        }

        function updateToggle(id, state, text) {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.className = 'toggle-btn ' + (state ? 'on' : 'off');
            btn.textContent = text || (state ? 'ON' : 'OFF');
        }

        function initMap() {
            map = L.map('map').setView([0, 0], 8);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(map);
            
            aircraftMarker = L.marker([0, 0], {
                icon: createPlaneIcon('#FFD700', 32)
            }).addTo(map);
        }

        function createPlaneIcon(color, size) {
            return L.divIcon({
                html: '<div style="font-size:' + size + 'px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">✈️</div>',
                className: '',
                iconSize: [size, size],
                iconAnchor: [size/2, size/2]
            });
        }

        function updateMap(lat, lon, heading) {
            if (!map) return;
            
            const icon = L.divIcon({
                html: '<div style="font-size:32px;transform:rotate(' + heading + 'deg);filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">✈️</div>',
                className: '',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });
            
            aircraftMarker.setLatLng([lat, lon]);
            aircraftMarker.setIcon(icon);
            map.setView([lat, lon], map.getZoom());
        }

        function updateAITraffic(aircraft) {
            aiMarkers.forEach(m => map.removeLayer(m));
            aiMarkers = [];
            
            if (!map) return;
            
            aircraft.forEach(ac => {
                const marker = L.marker([ac.latitude, ac.longitude], {
                    icon: createPlaneIcon('#FFFFFF', 20)
                }).addTo(map);
                
                marker.bindPopup('<strong>' + ac.callsign + '</strong><br>' +
                    'Alt: ' + Math.round(ac.altitude) + ' ft<br>' +
                    'Speed: ' + Math.round(ac.speed) + ' kts');
                
                aiMarkers.push(marker);
            });
        }

        function toggleRoute() {
            // Implement route toggle
        }

        function unlockControls() {
            const password = document.getElementById('controlPassword').value;
            ws.send(JSON.stringify({ type: 'request_control', password }));
        }

        function togglePause() {
            ws.send(JSON.stringify({ type: 'pause_toggle' }));
        }

        function saveGame() {
            ws.send(JSON.stringify({ type: 'save_game' }));
            alert('Flight saved!');
        }

        function toggleAP(system) {
            ws.send(JSON.stringify({ type: 'autopilot_toggle', system }));
        }

        function setAltitude() {
            const alt = parseInt(document.getElementById('targetAlt').value);
            if (!isNaN(alt)) {
                ws.send(JSON.stringify({ type: 'autopilot_set', param: 'altitude', value: alt }));
            }
        }

        function setHeading() {
            const hdg = parseInt(document.getElementById('targetHdg').value);
            if (!isNaN(hdg)) {
                ws.send(JSON.stringify({ type: 'autopilot_set', param: 'heading', value: hdg }));
            }
        }

        function setVS() {
            const vs = parseInt(document.getElementById('targetVS').value);
            if (!isNaN(vs)) {
                ws.send(JSON.stringify({ type: 'autopilot_set', param: 'vs', value: vs }));
            }
        }

        function setSpeed() {
            const speed = parseInt(document.getElementById('targetSpeed').value);
            if (!isNaN(speed)) {
                ws.send(JSON.stringify({ type: 'autopilot_set', param: 'speed', value: speed }));
            }
        }

        function toggleNavMode() {
            ws.send(JSON.stringify({ type: 'toggle_nav_mode' }));
        }

        function toggleGear() {
            ws.send(JSON.stringify({ type: 'toggle_gear' }));
        }

        function changeFlaps(direction) {
            ws.send(JSON.stringify({ type: 'change_flaps', direction }));
        }

        // --- NEW CONTROL FUNCTIONS ---
        function toggleSpeedbrake() {
            ws.send(JSON.stringify({ type: 'toggle_speedbrake' }));
        }

        function changeSpeedbrake(direction) {
            ws.send(JSON.stringify({ type: 'change_speedbrake', direction }));
        }

        function toggleParkingBrake() {
            ws.send(JSON.stringify({ type: 'toggle_parking_brake' }));
        }

        function setThrottle(engine, value) {
            ws.send(JSON.stringify({ type: 'set_throttle', engine: engine, value: value / 100.0 }));
            document.getElementById('throttle' + engine + 'Value').textContent = value + '%';
        }


        // Load saved ID
        window.onload = () => {
            const savedId = localStorage.getItem('p3d_unique_id');
            if (savedId) {
                document.getElementById('uniqueId').value = savedId;
            }
        };
    </script>
</body>
</html>`;
}
