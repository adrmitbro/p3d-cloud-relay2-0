// P3D Remote Cloud Relay - Simple Edition
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Create app data directory for storing credentials
const appDataDir = path.join(os.homedir(), 'AppData', 'Roaming', 'P3DRemote');
if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
}

// Simple session storage: uniqueId -> { pcClient, mobileClients: Set(), password, guestPassword }
const sessions = new Map();

// Load saved sessions from file
const sessionsFile = path.join(appDataDir, 'sessions.json');
if (fs.existsSync(sessionsFile)) {
    try {
        const savedSessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
        savedSessions.forEach(session => {
            sessions.set(session.uniqueId, {
                pcClient: null,
                mobileClients: new Set(),
                password: session.password,
                guestPassword: session.guestPassword
            });
        });
        console.log(`Loaded ${savedSessions.length} saved sessions`);
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

app.use(express.static('public'));

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        activeSessions: sessions.size
    });
});

app.get('/', (req, res) => {
    res.send(getMobileAppHTML());
});

wss.on('connection', (ws, req) => {
    console.log('New connection');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'register_pc') {
                // PC registering with unique ID
                const uniqueId = data.uniqueId;
                const password = data.password;
                const guestPassword = data.guestPassword;
                
                ws.uniqueId = uniqueId;
                ws.clientType = 'pc';
                
                if (!sessions.has(uniqueId)) {
                    sessions.set(uniqueId, {
                        pcClient: ws,
                        mobileClients: new Set(),
                        password: password,
                        guestPassword: guestPassword
                    });
                } else {
                    const session = sessions.get(uniqueId);
                    session.pcClient = ws;
                    session.password = password;
                    session.guestPassword = guestPassword;
                }
                
                // Save sessions to file
                saveSessions();
                
                ws.send(JSON.stringify({ type: 'registered', uniqueId }));
                console.log(`PC registered: ${uniqueId}`);
            }
            
            else if (data.type === 'connect_mobile') {
                // Mobile connecting with unique ID
                const uniqueId = data.uniqueId;
                
                if (!sessions.has(uniqueId)) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid ID' }));
                    return;
                }
                
                const session = sessions.get(uniqueId);
                ws.uniqueId = uniqueId;
                ws.clientType = 'mobile';
                ws.hasControlAccess = false;
                
                session.mobileClients.add(ws);
                
                ws.send(JSON.stringify({ 
                    type: 'connected',
                    pcOnline: !!session.pcClient
                }));
                
                console.log(`Mobile connected to: ${uniqueId}`);
            }
            
            else if (data.type === 'request_control') {
                // Mobile requesting control access
                const password = data.password;
                const session = sessions.get(ws.uniqueId);
                
                if (!session) {
                    ws.send(JSON.stringify({ type: 'auth_failed' }));
                    return;
                }
                
                if (password === session.password || password === session.guestPassword) {
                    ws.hasControlAccess = true;
                    ws.send(JSON.stringify({ type: 'control_granted' }));
                } else {
                    ws.send(JSON.stringify({ type: 'auth_failed' }));
                }
            }
            
            else if (data.type === 'save_game_with_title') {
                // PC handling save with title
                const session = sessions.get(ws.uniqueId);
                if (session && session.pcClient && session.pcClient.readyState === WebSocket.OPEN) {
                    session.pcClient.send(JSON.stringify({
                        type: 'save_game_with_title',
                        title: data.title
                    }));
                }
            }
            
            else {
                // Route all other messages
                const session = sessions.get(ws.uniqueId);
                if (!session) return;
                
                if (ws.clientType === 'mobile' && session.pcClient) {
                    // Check if command requires control access
                    if (data.type.includes('autopilot') || 
                        data.type === 'pause_toggle' || 
                        data.type === 'save_game' ||
                        data.type.includes('engine') ||
                        data.type === 'toggle_speedbrake' ||
                        data.type === 'toggle_parking_brake') {
                        if (!ws.hasControlAccess) {
                            ws.send(JSON.stringify({ 
                                type: 'control_required',
                                message: 'Enter password to access controls'
                            }));
                            return;
                        }
                    }
                    
                    // Forward to PC
                    if (session.pcClient.readyState === WebSocket.OPEN) {
                        session.pcClient.send(JSON.stringify(data));
                    }
                }
                else if (ws.clientType === 'pc') {
                    // Broadcast to all mobile clients
                    session.mobileClients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(data));
                        }
                    });
                }
            }
            
        } catch (error) {
            console.error('Error:', error);
        }
    });

    ws.on('close', () => {
        if (ws.uniqueId && sessions.has(ws.uniqueId)) {
            const session = sessions.get(ws.uniqueId);
            
            if (ws.clientType === 'pc') {
                console.log(`PC disconnected: ${ws.uniqueId}`);
                session.pcClient = null;
                
                // Notify mobile clients
                session.mobileClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'pc_offline' }));
                    }
                });
            }
            else if (ws.clientType === 'mobile') {
                session.mobileClients.delete(ws);
                console.log(`Mobile disconnected from: ${ws.uniqueId}`);
            }
        }
    });
});

function saveSessions() {
    const sessionsArray = [];
    sessions.forEach((session, uniqueId) => {
        sessionsArray.push({
            uniqueId,
            password: session.password,
            guestPassword: session.guestPassword
        });
    });
    
    try {
        fs.writeFileSync(sessionsFile, JSON.stringify(sessionsArray, null, 2));
    } catch (error) {
        console.error('Error saving sessions:', error);
    }
}

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
            background: #000000;
            color: white;
        }
        .header {
            background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%);
            padding: 15px 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        }
        .header h1 { 
            font-size: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
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
            background: #1a1a1a;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        .login-card h2 { margin-bottom: 20px; color: #fff; }
        
        input {
            width: 100%;
            padding: 14px;
            background: #000000;
            border: 2px solid #333333;
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
        .btn-secondary { background: #333333; color: white; }
        .btn-danger { background: #f44336; color: white; }
        .btn:disabled { background: #555; opacity: 0.5; }
        
        .tabs {
            display: flex;
            background: #000000;
            border-bottom: 2px solid #333333;
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
            background: #1a1a1a;
            border-bottom: 3px solid #00c853;
        }
        
        .tab-content {
            display: none;
            padding: 15px;
        }
        .tab-content.active { display: block; }
        
        .card {
            background: #1a1a1a;
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
            background: #000000;
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
            background: #000000;
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
            background: #333333;
            padding: 12px;
            border-radius: 8px;
            margin: 10px 0;
            font-size: 13px;
        }
        
        .btn-paused {
            background: #ff9800 !important;
            color: white !important;
        }
        
        .waypoint-info {
            background: #000000;
            padding: 10px;
            border-radius: 8px;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
        }
    </style>
</head>
<body>
    <div class='header'>
        <h1>Prepar3D Remote</h1>
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
            <button class='tab' onclick='switchTab(3)'>Engines</button>
        </div>

        <div class='tab-content active'>
            <div class='card'>
                <div class='waypoint-info'>
                    <div>
                        <div class='data-label'>Next Waypoint</div>
                        <div class='data-value' id='nextWaypoint'>--</div>
                    </div>
                    <div>
                        <div class='data-label'>Distance to Waypoint</div>
                        <div class='data-value' id='waypointDistance'>--</div>
                    </div>
                </div>
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
                    <button class='btn btn-secondary' id='btnPause' onclick='togglePause()'>⏸️ Pause</button>
                    <button class='btn btn-primary' onclick='saveGame()'>💾 Save</button>
                </div>
                
                <div class='card'>
                    <h3 style='margin-bottom: 15px;'>Autopilot</h3>
                    
                    <div class='control-row'>
                        <span class='control-label'>Master</span>
                        <button class='toggle-btn off' id='apMaster' onclick='toggleAP("master")'>OFF</button>
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
                        <span class='control-label'>LOC</span>
                        <button class='toggle-btn off' id='locMode' onclick='toggleLocMode()'>OFF</button>
                    </div>
                    
                    <div class='control-row'>
                        <span class='control-label'>ILS</span>
                        <button class='toggle-btn off' id='ilsMode' onclick='toggleILSMode()'>OFF</button>
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
                        <button class='toggle-btn off' id='speedbrake' onclick='toggleSpeedbrake()'>OFF</button>
                    </div>
                    
                    <div class='control-row'>
                        <span class='control-label'>Parking Brake</span>
                        <button class='toggle-btn off' id='parkingBrake' onclick='toggleParkingBrake()'>OFF</button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class='tab-content'>
            <div id='engineControlLock' class='card'>
                <div class='info-box'>🔒 Enter password to access engine controls</div>
                <input type='password' id='engineControlPassword' placeholder='Password'>
                <button class='btn btn-primary' onclick='unlockEngineControls()'>Unlock Controls</button>
            </div>
            
            <div id='engineControlPanel' class='hidden'>
                <div class='card'>
                    <h3 style='margin-bottom: 15px;'>Engine Controls</h3>
                    
                    <div class='control-row'>
                        <span class='control-label'>Engine 1</span>
                        <button class='toggle-btn on' id='engine1' onclick='toggleEngine(1)'>ON</button>
                    </div>
                    
                    <div class='control-row'>
                        <span class='control-label'>Engine 2</span>
                        <button class='toggle-btn on' id='engine2' onclick='toggleEngine(2)'>ON</button>
                    </div>
                    
                    <div class='control-row'>
                        <span class='control-label'>Engine 3</span>
                        <button class='toggle-btn on' id='engine3' onclick='toggleEngine(3)'>ON</button>
                    </div>
                    
                    <div class='control-row'>
                        <span class='control-label'>Engine 4</span>
                        <button class='toggle-btn on' id='engine4' onclick='toggleEngine(4)'>ON</button>
                    </div>
                    
                    <div class='control-row'>
                        <span class='control-label'>Throttle</span>
                        <div style='width: 100%; padding: 0 10px;'>
                            <input type='range' id='throttleSlider' min='0' max='100' value='0' style='width: 100%;' oninput='updateThrottle(this.value)'>
                            <div style='display: flex; justify-content: space-between; margin-top: 5px;'>
                                <span>0%</span>
                                <span id='throttleValue'>0%</span>
                                <span>100%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id='saveModal' class='hidden' style='position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;'>
        <div class='card' style='width: 80%; max-width: 400px;'>
            <h2>Save Flight</h2>
            <input type='text' id='saveTitle' placeholder='Enter save title'>
            <button class='btn btn-primary' onclick='confirmSave()'>Save</button>
            <button class='btn btn-secondary' onclick='closeSaveModal()'>Cancel</button>
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
        let hasEngineControl = false;

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
            
            // Save to localStorage
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
                    
                case 'engine_control_granted':
                    hasEngineControl = true;
                    document.getElementById('engineControlLock').classList.add('hidden');
                    document.getElementById('engineControlPanel').classList.remove('hidden');
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
                    
                case 'engine_state':
                    updateEngineUI(data.data);
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
            document.getElementById('nextWaypoint').textContent = data.nextWaypoint || '--';
            document.getElementById('waypointDistance').textContent = data.waypointDistance ? data.waypointDistance.toFixed(1) + ' nm' : '--';
            
            const hours = Math.floor(data.ete / 3600);
            const minutes = Math.floor((data.ete % 3600) / 60);
            document.getElementById('ete').textContent = 'ETE: ' + (hours > 0 ? hours + 'h ' + minutes + 'm' : minutes + 'm');

            const btnPause = document.getElementById('btnPause');
            btnPause.textContent = data.isPaused ? '▶️ Resume' : '⏸️ Pause';
            
            // Change button color when paused
            if (data.isPaused) {
                btnPause.classList.add('btn-paused');
            } else {
                btnPause.classList.remove('btn-paused');
            }

            if (map && data.latitude && data.longitude) {
                updateMap(data.latitude, data.longitude, data.heading);
            }
        }

        function updateAutopilotUI(data) {
            updateToggle('apMaster', data.master);
            updateToggle('apAlt', data.altitude);
            updateToggle('apHdg', data.heading);
            updateToggle('apVS', data.vs);
            updateToggle('apSpeed', data.speed);
            updateToggle('apApp', data.approach);
            updateToggle('autoThrottle', data.throttle);
            updateToggle('gear', data.gear, data.gear ? 'DOWN' : 'UP');
            updateToggle('speedbrake', data.speedbrake);
            updateToggle('parkingBrake', data.parkingBrake);
            
            document.getElementById('flapsPos').textContent = Math.round(data.flaps) + '%';
            
            // NAV/GPS toggle (fixed)
            const navBtn = document.getElementById('navMode');
            navBtn.textContent = data.navMode ? 'NAV' : 'GPS';
            navBtn.className = 'toggle-btn ' + (data.navMode ? 'off' : 'on');
            
            // LOC toggle
            const locBtn = document.getElementById('locMode');
            locBtn.className = 'toggle-btn ' + (data.locMode ? 'on' : 'off');
            
            // ILS toggle
            const ilsBtn = document.getElementById('ilsMode');
            ilsBtn.className = 'toggle-btn ' + (data.ilsMode ? 'on' : 'off');
            
            // Update input fields with current values
            document.getElementById('targetAlt').value = data.targetAlt || '';
            document.getElementById('targetHdg').value = data.targetHdg || '';
            document.getElementById('targetVS').value = data.targetVS || '';
            document.getElementById('targetSpeed').value = data.targetSpeed || '';
        }

        function updateEngineUI(data) {
            for (let i = 1; i <= 4; i++) {
                const engineKey = 'engine' + i;
                const engineBtn = document.getElementById(engineKey);
                if (engineBtn) {
                    updateToggle(engineKey, data[engineKey]);
                }
            }
            
            // Update throttle slider
            document.getElementById('throttleSlider').value = data.throttle || 0;
            document.getElementById('throttleValue').textContent = (data.throttle || 0) + '%';
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
            // Clear old markers
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

        function unlockEngineControls() {
            const password = document.getElementById('engineControlPassword').value;
            ws.send(JSON.stringify({ type: 'request_engine_control', password }));
        }

        function togglePause() {
            ws.send(JSON.stringify({ type: 'pause_toggle' }));
        }

        function saveGame() {
            document.getElementById('saveModal').classList.remove('hidden');
        }

        function confirmSave() {
            const title = document.getElementById('saveTitle').value;
            if (!title) {
                alert('Please enter a save title');
                return;
            }
            
            ws.send(JSON.stringify({ type: 'save_game_with_title', title }));
            closeSaveModal();
            alert('Flight saved!');
        }

        function closeSaveModal() {
            document.getElementById('saveModal').classList.add('hidden');
            document.getElementById('saveTitle').value = '';
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

        function toggleLocMode() {
            ws.send(JSON.stringify({ type: 'toggle_loc_mode' }));
        }

        function toggleILSMode() {
            ws.send(JSON.stringify({ type: 'toggle_ils_mode' }));
        }

        function toggleGear() {
            ws.send(JSON.stringify({ type: 'toggle_gear' }));
        }

        function changeFlaps(direction) {
            ws.send(JSON.stringify({ type: 'change_flaps', direction }));
        }

        function toggleSpeedbrake() {
            ws.send(JSON.stringify({ type: 'toggle_speedbrake' }));
        }

        function toggleParkingBrake() {
            ws.send(JSON.stringify({ type: 'toggle_parking_brake' }));
        }

        function toggleEngine(engineNumber) {
            ws.send(JSON.stringify({ type: 'toggle_engine', engineNumber }));
        }

        function updateThrottle(value) {
            document.getElementById('throttleValue').textContent = value + '%';
            ws.send(JSON.stringify({ type: 'set_throttle', value: parseInt(value) }));
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

server.listen(PORT, () => {
  console.log(`P3D Remote Cloud Relay running on port ${PORT}`);
});
