using LockheedMartin.Prepar3D.SimConnect;
using Newtonsoft.Json;
using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using WebSocketSharp;

namespace P3DRemoteServer
{
    public class MainForm : Form
    {
        private SimConnect simconnect = null;
        private const int WM_USER_SIMCONNECT = 0x0402;
        private bool isConnected = false;
        private bool isPaused = false;

        private WebSocket ws;
        private string CLOUD_URL = "wss://p3d-cloud-relay2-0.onrender.com";
        private string SETTINGS_FILE = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "P3DRemoteServer",
            "settings.json"
        );

        private string uniqueId = "";
        private string myPassword = "admin123";
        private string guestPassword = "";

        private Label lblUniqueId;
        private Label lblMyPassword;
        private Label lblGuestPassword;
        private TextBox txtUniqueId;
        private TextBox txtMyPassword;
        private System.Windows.Forms.Timer updateTimer;
        private System.Threading.Timer reconnectTimer;

        private PlaneData currentPlaneData;

        enum DEFINITIONS { PlaneData, AIData }
        enum DATA_REQUESTS { REQUEST_1, REQUEST_AI }
        enum EVENTS
        {
            PAUSE, SAVE,
            AP_MASTER, AP_ALT_HOLD, AP_HDG_HOLD, AP_VS_HOLD, AP_AIRSPEED_HOLD, AP_APR_HOLD, AP_NAV1_HOLD, AP_BC_HOLD,
            AP_ALT_SET, AP_HDG_SET, AP_VS_SET, AP_AIRSPEED_SET,
            GEAR_TOGGLE, FLAPS_INCR, FLAPS_DECR, SPOILERS_TOGGLE,
            TOGGLE_GPS_DRIVES_NAV1, AUTO_THROTTLE_ARM,
            THROTTLE_FULL, THROTTLE_CUT, THROTTLE_INCR, THROTTLE_DECR,
            PARKING_BRAKES
        }
        enum GROUPID { GROUP0 }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
        struct PlaneData
        {
            public double groundSpeed;
            public double altitude;
            public double heading;
            public double latitude;
            public double longitude;
            public double verticalSpeed;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string gpsWpNextId;
            public double gpsWpDistance;
            public double gpsWpEte;
            public double gpsTotalDistance;
            public double gpsEte;
            public double gpsIsActiveFlightPlan;
            public double gpsIsActiveWaypoint;
            public double gpsFlightPlanWpCount;

            // Autopilot
            public double autopilotMaster;
            public double autopilotAltitude;
            public double autopilotHeading;
            public double autopilotVS;
            public double autopilotAirspeed;
            public double autopilotApproach;
            public double autopilotNav1Lock;
            public double autopilotBackcourse;
            public double autopilotAltitudeVar;
            public double autopilotHeadingVar;
            public double autopilotVSVar;
            public double autopilotAirspeedVar;
            public double autoThrottle;

            // Aircraft
            public double gearPosition;
            public double flapsPosition;
            public double gpsNavMode;
            public double spoilersPosition;
            public double throttlePercent;
            public double parkingBrake;
            public double onGround;

            // Pause
            public double pauseState;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
        struct AIData
        {
            public double latitude;
            public double longitude;
            public double altitude;
            public double heading;
            public double groundSpeed;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string atcId;
        }

        public MainForm()
        {
            InitializeUI();
            LoadSettings();
            InitializeSimConnect();
            ConnectToCloud();
        }

        private void InitializeUI()
        {
            this.Text = "Prepar3D Remote Server";
            this.Size = new Size(600, 550);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(0, 48, 87);

            // Header
            Panel headerPanel = new Panel
            {
                Location = new Point(0, 0),
                Size = new Size(600, 80),
                BackColor = Color.FromArgb(0, 90, 156)
            };
            this.Controls.Add(headerPanel);

            Label lblTitle = new Label
            {
                Text = "✈ Prepar3D Remote Server",
                Location = new Point(20, 25),
                Size = new Size(560, 35),
                Font = new Font("Segoe UI", 18, FontStyle.Bold),
                ForeColor = Color.White
            };
            headerPanel.Controls.Add(lblTitle);

            // Connection Info Panel
            GroupBox grpConnection = new GroupBox
            {
                Text = "Your Connection Info",
                Location = new Point(20, 100),
                Size = new Size(560, 180),
                Font = new Font("Segoe UI", 11, FontStyle.Bold),
                ForeColor = Color.White
            };
            this.Controls.Add(grpConnection);

            Label lblIdLabel = new Label
            {
                Text = "Unique ID:",
                Location = new Point(20, 35),
                Size = new Size(100, 25),
                Font = new Font("Segoe UI", 10),
                ForeColor = Color.White
            };
            grpConnection.Controls.Add(lblIdLabel);

            txtUniqueId = new TextBox
            {
                Text = uniqueId,
                Location = new Point(130, 33),
                Size = new Size(300, 25),
                Font = new Font("Segoe UI", 11, FontStyle.Bold),
                BackColor = Color.FromArgb(0, 90, 156),
                ForeColor = Color.Yellow,
                BorderStyle = BorderStyle.FixedSingle
            };
            txtUniqueId.TextChanged += (s, e) => { uniqueId = txtUniqueId.Text; SaveSettings(); };
            grpConnection.Controls.Add(txtUniqueId);

            Button btnCopyId = new Button
            {
                Text = "Copy",
                Location = new Point(440, 32),
                Size = new Size(80, 27),
                BackColor = Color.FromArgb(0, 200, 83),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9, FontStyle.Bold)
            };
            btnCopyId.Click += (s, e) => { Clipboard.SetText(uniqueId); MessageBox.Show($"Copied: {uniqueId}", "Copied!"); };
            grpConnection.Controls.Add(btnCopyId);

            Label lblPwLabel = new Label
            {
                Text = "My Password:",
                Location = new Point(20, 75),
                Size = new Size(100, 25),
                Font = new Font("Segoe UI", 10),
                ForeColor = Color.White
            };
            grpConnection.Controls.Add(lblPwLabel);

            txtMyPassword = new TextBox
            {
                Text = myPassword,
                Location = new Point(130, 73),
                Size = new Size(300, 25),
                Font = new Font("Segoe UI", 10),
                BackColor = Color.FromArgb(0, 90, 156),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };
            txtMyPassword.TextChanged += (s, e) => { myPassword = txtMyPassword.Text; SaveSettings(); RegenerateGuestPassword(); };
            grpConnection.Controls.Add(txtMyPassword);

            Button btnCopyPw = new Button
            {
                Text = "Copy",
                Location = new Point(440, 72),
                Size = new Size(80, 27),
                BackColor = Color.FromArgb(0, 200, 83),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9, FontStyle.Bold)
            };
            btnCopyPw.Click += (s, e) => { Clipboard.SetText(myPassword); MessageBox.Show($"Copied: {myPassword}", "Copied!"); };
            grpConnection.Controls.Add(btnCopyPw);

            lblGuestPassword = new Label
            {
                Text = $"Guest Password: {guestPassword}",
                Location = new Point(20, 115),
                Size = new Size(410, 25),
                Font = new Font("Segoe UI", 10),
                ForeColor = Color.FromArgb(255, 200, 100)
            };
            grpConnection.Controls.Add(lblGuestPassword);

            Button btnCopyGuest = new Button
            {
                Text = "Copy",
                Location = new Point(440, 113),
                Size = new Size(80, 27),
                BackColor = Color.FromArgb(0, 200, 83),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9, FontStyle.Bold)
            };
            btnCopyGuest.Click += (s, e) => { Clipboard.SetText(guestPassword); MessageBox.Show($"Copied: {guestPassword}", "Copied!"); };
            grpConnection.Controls.Add(btnCopyGuest);

            Button btnRegenGuest = new Button
            {
                Text = "🔄 New Guest Password",
                Location = new Point(20, 145),
                Size = new Size(180, 27),
                BackColor = Color.FromArgb(0, 90, 156),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9, FontStyle.Bold)
            };
            btnRegenGuest.Click += (s, e) => RegenerateGuestPassword();
            grpConnection.Controls.Add(btnRegenGuest);

            // Status Panel
            GroupBox grpStatus = new GroupBox
            {
                Text = "Status",
                Location = new Point(20, 300),
                Size = new Size(560, 120),
                Font = new Font("Segoe UI", 11, FontStyle.Bold),
                ForeColor = Color.White
            };
            this.Controls.Add(grpStatus);

            Label lblSimStatus = new Label
            {
                Name = "lblSimStatus",
                Text = "SimConnect: Connecting...",
                Location = new Point(20, 30),
                Size = new Size(520, 25),
                Font = new Font("Segoe UI", 10),
                ForeColor = Color.White
            };
            grpStatus.Controls.Add(lblSimStatus);

            Label lblCloudStatus = new Label
            {
                Name = "lblCloudStatus",
                Text = "Cloud: Connecting...",
                Location = new Point(20, 60),
                Size = new Size(520, 25),
                Font = new Font("Segoe UI", 10),
                ForeColor = Color.White
            };
            grpStatus.Controls.Add(lblCloudStatus);

            Label lblClients = new Label
            {
                Name = "lblClients",
                Text = "Mobile clients: 0",
                Location = new Point(20, 90),
                Size = new Size(520, 25),
                Font = new Font("Segoe UI", 10),
                ForeColor = Color.White
            };
            grpStatus.Controls.Add(lblClients);

            // Info
            Label lblInfo = new Label
            {
                Text = "📱 Users enter your Unique ID in the mobile app\n" +
                       "🔒 Share your password or guest password for autopilot access",
                Location = new Point(20, 440),
                Size = new Size(560, 50),
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(200, 200, 200)
            };
            this.Controls.Add(lblInfo);

            updateTimer = new System.Windows.Forms.Timer { Interval = 200 };
            updateTimer.Tick += UpdateTimer_Tick;
        }

        private void LoadSettings()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(SETTINGS_FILE));

                if (File.Exists(SETTINGS_FILE))
                {
                    string json = File.ReadAllText(SETTINGS_FILE);
                    dynamic settings = JsonConvert.DeserializeObject(json);
                    
                    uniqueId = settings.uniqueId ?? "";
                    myPassword = settings.password ?? "admin123";
                    guestPassword = settings.guestPassword ?? "";
                }

                if (string.IsNullOrEmpty(uniqueId))
                    uniqueId = Environment.UserName + "-" + new Random().Next(1000, 9999);

                if (string.IsNullOrEmpty(guestPassword))
                    RegenerateGuestPassword();
            }
            catch
            {
                uniqueId = Environment.UserName + "-" + new Random().Next(1000, 9999);
                RegenerateGuestPassword();
            }
        }

        private void SaveSettings()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(SETTINGS_FILE));
                
                var settings = new
                {
                    uniqueId = uniqueId,
                    password = myPassword,
                    guestPassword = guestPassword
                };
                
                File.WriteAllText(SETTINGS_FILE, JsonConvert.SerializeObject(settings, Formatting.Indented));
            }
            catch { }
        }

        private void RegenerateGuestPassword()
        {
            guestPassword = new Random().Next(100000, 999999).ToString();
            if (lblGuestPassword != null)
                lblGuestPassword.Text = $"Guest Password: {guestPassword}";
            SaveSettings();

            // Send updated passwords to cloud
            if (ws != null && ws.ReadyState == WebSocketState.Open)
            {
                ws.Send(JsonConvert.SerializeObject(new
                {
                    type = "register_pc",
                    uniqueId = uniqueId,
                    password = myPassword,
                    guestPassword = guestPassword
                }));
            }
        }

        private void ConnectToCloud()
        {
            reconnectTimer?.Dispose();

            try
            {
                if (ws != null)
                {
                    try { ws.Close(); } catch { }
                    ws = null;
                }

                UpdateLabel("lblCloudStatus", "Cloud: Connecting...", Color.Orange);

                ws = new WebSocket(CLOUD_URL);
                ws.SslConfiguration.EnabledSslProtocols = System.Security.Authentication.SslProtocols.Tls12;
                ws.SslConfiguration.ServerCertificateValidationCallback = (sender, certificate, chain, sslPolicyErrors) => true;

                ws.OnOpen += (sender, e) =>
                {
                    UpdateLabel("lblCloudStatus", "Cloud: Connected ✓", Color.Lime);

                    ws.Send(JsonConvert.SerializeObject(new
                    {
                        type = "register_pc",
                        uniqueId = uniqueId,
                        password = myPassword,
                        guestPassword = guestPassword
                    }));
                };

                ws.OnMessage += (sender, e) =>
                {
                    try
                    {
                        dynamic data = JsonConvert.DeserializeObject(e.Data);
                        HandleCloudMessage(data);
                    }
                    catch { }
                };

                ws.OnClose += (sender, e) =>
                {
                    UpdateLabel("lblCloudStatus", "Cloud: Disconnected", Color.Red);
                    reconnectTimer = new System.Threading.Timer((state) => ConnectToCloud(), null, 5000, System.Threading.Timeout.Infinite);
                };

                ws.OnError += (sender, e) =>
                {
                    Console.WriteLine($"WS Error: {e.Message}");
                };

                ws.ConnectAsync();
            }
            catch (Exception ex)
            {
                UpdateLabel("lblCloudStatus", $"Cloud: Error - {ex.Message}", Color.Red);
            }
        }

        private void HandleCloudMessage(dynamic data)
        {
            string type = data.type.ToString();

            if (simconnect == null || !isConnected) return;

            try
            {
                switch (type)
                {
                    case "pause_toggle":
                        simconnect.TransmitClientEvent(0, EVENTS.PAUSE, 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;

                    case "save_game":
                        string filename = $"P3D_Flight_{DateTime.Now:yyyyMMdd_HHmmss}";
                        try
                        {
                            simconnect.FlightSave(filename, "", "", 0);
                        }
                        catch
                        {
                            // Fallback to SITUATION_SAVE event
                            simconnect.TransmitClientEvent(0, EVENTS.SAVE, 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        }
                        break;

                    case "autopilot_toggle":
                        string system = data.system.ToString();
                        EVENTS evt = EVENTS.AP_MASTER;
                        switch (system)
                        {
                            case "master": evt = EVENTS.AP_MASTER; break;
                            case "altitude": evt = EVENTS.AP_ALT_HOLD; break;
                            case "heading": evt = EVENTS.AP_HDG_HOLD; break;
                            case "vs": evt = EVENTS.AP_VS_HOLD; break;
                            case "speed": evt = EVENTS.AP_AIRSPEED_HOLD; break;
                            case "approach": evt = EVENTS.AP_APR_HOLD; break;
                            case "nav": evt = EVENTS.AP_NAV1_HOLD; break;
                            case "backcourse": evt = EVENTS.AP_BC_HOLD; break;
                            case "throttle": evt = EVENTS.AUTO_THROTTLE_ARM; break;
                        }
                        simconnect.TransmitClientEvent(0, evt, 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;

                    case "autopilot_set":
                        string param = data.param.ToString();
                        int value = (int)data.value;
                        EVENTS setEvt = EVENTS.AP_ALT_SET;
                        switch (param)
                        {
                            case "altitude": setEvt = EVENTS.AP_ALT_SET; break;
                            case "heading": setEvt = EVENTS.AP_HDG_SET; break;
                            case "vs": setEvt = EVENTS.AP_VS_SET; break;
                            case "speed": setEvt = EVENTS.AP_AIRSPEED_SET; break;
                        }
                        simconnect.TransmitClientEvent(0, setEvt, (uint)value, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;

                    case "toggle_nav_mode":
                        simconnect.TransmitClientEvent(0, EVENTS.TOGGLE_GPS_DRIVES_NAV1, 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;

                    case "toggle_gear":
                        simconnect.TransmitClientEvent(0, EVENTS.GEAR_TOGGLE, 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;

                    case "toggle_spoilers":
                        simconnect.TransmitClientEvent(0, EVENTS.SPOILERS_TOGGLE, 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;

                    case "toggle_parking_brake":
                        simconnect.TransmitClientEvent(0, EVENTS.PARKING_BRAKES, 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;

                    case "change_flaps":
                        int direction = (int)data.direction;
                        simconnect.TransmitClientEvent(0, direction > 0 ? EVENTS.FLAPS_INCR : EVENTS.FLAPS_DECR, 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;

                    case "throttle_control":
                        string throttleCmd = data.command.ToString();
                        switch (throttleCmd)
                        {
                            case "full":
                                simconnect.TransmitClientEvent(0, EVENTS.THROTTLE_FULL, 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                                break;
                            case "cut":
                                simconnect.TransmitClientEvent(0, EVENTS.THROTTLE_CUT, 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                                break;
                            case "increase":
                                simconnect.TransmitClientEvent(0, EVENTS.THROTTLE_INCR, 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                                break;
                            case "decrease":
                                simconnect.TransmitClientEvent(0, EVENTS.THROTTLE_DECR, 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                                break;
                        }
                        break;
                }
            }
            catch { }
        }

        private void InitializeSimConnect()
        {
            try
            {
                simconnect = new SimConnect("P3D Remote", this.Handle, WM_USER_SIMCONNECT, null, 0);

                // Flight data
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GROUND VELOCITY", "knots", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "PLANE ALTITUDE", "feet", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "PLANE HEADING DEGREES TRUE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "PLANE LATITUDE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "PLANE LONGITUDE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "VERTICAL SPEED", "feet per minute", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS WP NEXT ID", null, SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS WP DISTANCE", "meters", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS WP ETE", "seconds", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS TOTAL DISTANCE", "nautical miles", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS ETE", "seconds", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS IS ACTIVE FLIGHT PLAN", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS IS ACTIVE WAY POINT", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS FLIGHT PLAN WP COUNT", "number", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);

                // Autopilot
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT MASTER", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT ALTITUDE LOCK", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT HEADING LOCK", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT VERTICAL HOLD", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT AIRSPEED HOLD", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT APPROACH HOLD", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT NAV1 LOCK", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT BACKCOURSE HOLD", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT ALTITUDE LOCK VAR", "feet", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT HEADING LOCK DIR", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT VERTICAL HOLD VAR", "feet per minute", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT AIRSPEED HOLD VAR", "knots", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "AUTOPILOT THROTTLE ARM", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);

                // Aircraft
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GEAR POSITION", "percent", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "FLAPS HANDLE PERCENT", "percent", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS DRIVES NAV1", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "SPOILERS HANDLE POSITION", "percent", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GENERAL ENG THROTTLE LEVER POSITION:1", "percent", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "BRAKE PARKING POSITION", "position", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "SIM ON GROUND", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);

                simconnect.RegisterDataDefineStruct<PlaneData>(DEFINITIONS.PlaneData);

                // AI Data
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "PLANE LATITUDE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "PLANE LONGITUDE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "PLANE ALTITUDE", "feet", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "PLANE HEADING DEGREES TRUE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "GROUND VELOCITY", "knots", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "ATC ID", null, SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);

                simconnect.RegisterDataDefineStruct<AIData>(DEFINITIONS.AIData);

                // Events
                simconnect.MapClientEventToSimEvent(EVENTS.PAUSE, "PAUSE_TOGGLE");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_MASTER, "AP_MASTER");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_ALT_HOLD, "AP_ALT_HOLD");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_HDG_HOLD, "AP_HDG_HOLD");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_VS_HOLD, "AP_VS_HOLD");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_AIRSPEED_HOLD, "AP_AIRSPEED_HOLD");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_APR_HOLD, "AP_APR_HOLD");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_NAV1_HOLD, "AP_NAV1_HOLD");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_BC_HOLD, "AP_BC_HOLD");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_ALT_SET, "AP_ALT_VAR_SET_ENGLISH");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_HDG_SET, "HEADING_BUG_SET");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_VS_SET, "AP_VS_VAR_SET_ENGLISH");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_AIRSPEED_SET, "AP_SPD_VAR_SET");
                simconnect.MapClientEventToSimEvent(EVENTS.GEAR_TOGGLE, "GEAR_TOGGLE");
                simconnect.MapClientEventToSimEvent(EVENTS.FLAPS_INCR, "FLAPS_INCR");
                simconnect.MapClientEventToSimEvent(EVENTS.FLAPS_DECR, "FLAPS_DECR");
                simconnect.MapClientEventToSimEvent(EVENTS.SPOILERS_TOGGLE, "SPOILERS_TOGGLE");
                simconnect.MapClientEventToSimEvent(EVENTS.TOGGLE_GPS_DRIVES_NAV1, "TOGGLE_GPS_DRIVES_NAV1");
                simconnect.MapClientEventToSimEvent(EVENTS.AUTO_THROTTLE_ARM, "AUTO_THROTTLE_ARM");
                simconnect.MapClientEventToSimEvent(EVENTS.THROTTLE_FULL, "THROTTLE_FULL");
                simconnect.MapClientEventToSimEvent(EVENTS.THROTTLE_CUT, "THROTTLE_CUT");
                simconnect.MapClientEventToSimEvent(EVENTS.THROTTLE_INCR, "THROTTLE_INCR");
                simconnect.MapClientEventToSimEvent(EVENTS.THROTTLE_DECR, "THROTTLE_DECR");
                simconnect.MapClientEventToSimEvent(EVENTS.PARKING_BRAKES, "PARKING_BRAKES");

                simconnect.OnRecvSimobjectDataBytype += Simconnect_OnRecvSimobjectDataBytype;
                simconnect.OnRecvOpen += (s, d) => Console.WriteLine("SimConnect opened");

                isConnected = true;
                UpdateLabel("lblSimStatus", "SimConnect: Connected ✓", Color.Lime);
                updateTimer.Enabled = true;
            }
            catch (Exception ex)
            {
                UpdateLabel("lblSimStatus", $"SimConnect: Failed - {ex.Message}", Color.Red);
            }
        }

        private void Simconnect_OnRecvSimobjectDataBytype(SimConnect sender, SIMCONNECT_RECV_SIMOBJECT_DATA_BYTYPE data)
        {
            if (data.dwRequestID == (uint)DATA_REQUESTS.REQUEST_1)
            {
                currentPlaneData = (PlaneData)data.dwData[0];
                BroadcastData();
            }
        }

        private void UpdateTimer_Tick(object sender, EventArgs e)
        {
            if (isConnected && simconnect != null)
            {
                try
                {
                    simconnect.RequestDataOnSimObjectType(DATA_REQUESTS.REQUEST_1, DEFINITIONS.PlaneData, 0, SIMCONNECT_SIMOBJECT_TYPE.USER);
                }
                catch { }
            }
        }

        private void BroadcastData()
        {
            if (ws == null || ws.ReadyState != WebSocketState.Open) return;

            var flightData = new
            {
                type = "flight_data",
                data = new
                {
                    groundSpeed = currentPlaneData.groundSpeed,
                    altitude = currentPlaneData.altitude,
                    heading = currentPlaneData.heading,
                    latitude = currentPlaneData.latitude,
                    longitude = currentPlaneData.longitude,
                    verticalSpeed = currentPlaneData.verticalSpeed,
                    nextWaypoint = currentPlaneData.gpsWpNextId,
                    distanceToWaypoint = currentPlaneData.gpsWpDistance / 1852.0,
                    totalDistance = currentPlaneData.gpsTotalDistance,
                    ete = currentPlaneData.gpsEte,
                    waypointEte = currentPlaneData.gpsWpEte,
                    isPaused = currentPlaneData.pauseState > 0.5,
                    flightPlanActive = currentPlaneData.gpsIsActiveFlightPlan > 0.5,
                    waypointCount = (int)currentPlaneData.gpsFlightPlanWpCount
                }
            };

            var autopilotData = new
            {
                type = "autopilot_state",
                data = new
                {
                    master = currentPlaneData.autopilotMaster > 0.5,
                    altitude = currentPlaneData.autopilotAltitude > 0.5,
                    heading = currentPlaneData.autopilotHeading > 0.5,
                    vs = currentPlaneData.autopilotVS > 0.5,
                    speed = currentPlaneData.autopilotAirspeed > 0.5,
                    approach = currentPlaneData.autopilotApproach > 0.5,
                    nav = currentPlaneData.autopilotNav1Lock > 0.5,
                    backcourse = currentPlaneData.autopilotBackcourse > 0.5,
                    throttle = currentPlaneData.autoThrottle > 0.5,
                    gear = currentPlaneData.gearPosition > 50,
                    flaps = currentPlaneData.flapsPosition,
                    navMode = currentPlaneData.gpsNavMode > 0.5,
                    spoilers = currentPlaneData.spoilersPosition,
                    throttlePercent = currentPlaneData.throttlePercent,
                    parkingBrake = currentPlaneData.parkingBrake > 0.5,
                    targetAltitude = (int)currentPlaneData.autopilotAltitudeVar,
                    targetHeading = (int)currentPlaneData.autopilotHeadingVar,
                    targetVS = (int)currentPlaneData.autopilotVSVar,
                    targetSpeed = (int)currentPlaneData.autopilotAirspeedVar
                }
            };

            try
            {
                ws.Send(JsonConvert.SerializeObject(flightData));
                ws.Send(JsonConvert.SerializeObject(autopilotData));
            }
            catch { }
        }

        private void UpdateLabel(string name, string text, Color color)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => UpdateLabel(name, text, color)));
                return;
            }

            Control[] controls = this.Controls.Find(name, true);
            if (controls.Length > 0 && controls[0] is Label)
            {
                Label lbl = (Label)controls[0];
                lbl.Text = text;
                lbl.ForeColor = color;
            }
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_USER_SIMCONNECT)
            {
                if (simconnect != null)
                {
                    try
                    {
                        simconnect.ReceiveMessage();
                    }
                    catch { }
                }
            }
            else
            {
                base.WndProc(ref m);
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (simconnect != null)
            {
                simconnect.Dispose();
            }
            if (ws != null)
            {
                ws.Close();
            }
            reconnectTimer?.Dispose();
            base.OnFormClosing(e);
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
