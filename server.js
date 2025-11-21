using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using WebSocketSharp;
using WebSocketSharp.Server;

namespace P3DDistanceMonitor
{
    // Create a custom panel with public DoubleBuffered property
    public class DoubleBufferedPanel : Panel
    {
        public DoubleBufferedPanel()
        {
            this.DoubleBuffered = true;
        }
    }

    public partial class MainForm : Form
    {
        private SimConnect simconnect = null;
        private const int WM_USER_SIMCONNECT = 0x0402;
        private bool isConnected = false;
        private double alertDistance = 100.0;
        private bool alertTriggered = false;
        private System.Windows.Forms.Timer connectionTimer;
        private int connectionAttempts = 0;

        private string smtpEmail = "";
        private string smtpPassword = "";
        private bool emailEnabled = false;
        private const string SETTINGS_FILE = "email_settings.txt";

        // WebSocket Server
        private WebSocketServer wsServer;
        private Dictionary<string, WebSocketSession> mobileClients = new Dictionary<string, WebSocketSession>();
        private string uniqueId = "Adrian"; // Change this to your desired ID
        private string password = "1234"; // Change this to your desired password
        private string guestPassword = "guest"; // Change this to your desired guest password

        // Map variables
        private double userLat = 0;
        private double userLon = 0;
        private double userHeading = 0;
        private double userAltitude = 0;
        private double userSpeed = 0;
        private double mapCenterLat = 0;
        private double mapCenterLon = 0;
        private int mapZoom = 7;
        private bool followUser = true;
        private Point mapDragStart = Point.Empty;
        private bool isDragging = false;
        private List<AircraftInfo> aiAircraft = new List<AircraftInfo>();
        private Dictionary<string, Image> tileCache = new Dictionary<string, Image>();
        private const string OSM_TILE_URL = "https://tile.openstreetmap.org/{0}/{1}/{2}.png";
        private bool mapNeedsRedraw = true;
        private Dictionary<string, Bitmap> aircraftIcons = new Dictionary<string, Bitmap>();
        private bool showAircraftLabels = true;
        private DateTime lastMapUpdate = DateTime.MinValue;
        private const int MAP_UPDATE_INTERVAL_MS = 100;

        // Performance optimization variables
        private BufferedGraphics bufferedGraphics;
        private BufferedGraphicsContext bufferedContext;
        private bool mapVisible = false;
        private System.Threading.Timer tileDownloadTimer;
        private readonly object tileLock = new object();
        private Queue<string> tilesToDownload = new Queue<string>();
        private bool isDownloadingTiles = false;

        // Aircraft details panel
        private Panel aircraftDetailsPanel;
        private Label aircraftDetailsLabel;
        private AircraftInfo selectedAircraft = null;

        // Live map update timer
        private System.Windows.Forms.Timer liveMapUpdateTimer;

        // Autopilot state tracking
        private bool apMaster = false;
        private bool apAltitude = false;
        private bool apHeading = false;
        private bool apVS = false;
        private bool apSpeed = false;
        private bool apApproach = false;
        private bool apThrottle = false;
        private bool apLoc = false;
        private bool apIls = false;
        private bool gearDown = false;
        private double flapsPosition = 0;
        private bool speedbrakeDeployed = false;
        private bool parkingBrakeSet = false;
        private bool isSimPaused = false;

        enum DEFINITIONS
        {
            PlaneData,
            AIData,
            AutopilotData
        }

        enum DATA_REQUESTS
        {
            REQUEST_1,
            REQUEST_AI,
            REQUEST_AUTOPILOT
        }

        enum EVENTS
        {
            PAUSE,
            SPEEDBRAKE_TOGGLE,
            PARKING_BRAKE_TOGGLE,
            LOC_TOGGLE,
            ILS_TOGGLE,
            NAV_GPS_TOGGLE,
            AP_MASTER_TOGGLE,
            AP_ALTITUDE_TOGGLE,
            AP_HEADING_TOGGLE,
            AP_VS_TOGGLE,
            AP_SPEED_TOGGLE,
            AP_APPROACH_TOGGLE,
            AP_THROTTLE_TOGGLE,
            GEAR_TOGGLE,
            FLAPS_INCREASE,
            FLAPS_DECREASE
        }

        enum GROUPID
        {
            GROUP0
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
        struct PlaneData
        {
            public double gpsIsActiveWaypoint;
            public double gpsFlightPlanWpCount;
            public double gpsWpDistance;
            public double gpsEte;
            public double groundSpeed;
            public double altitude;
            public double heading;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string gpsWpNextId;
            public double gpsWpBearing;
            public double gpsWpEte;
            public double gpsIsArrived;
            public double simOnGround;
            public double estimatedCruiseSpeed;
            public double gpsIsActiveFlightPlan;
            public double gpsTotalDistance;
            public double latitude;
            public double longitude;
            public double verticalSpeed;
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
            public string title;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string atcType;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string atcModel;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string atcId;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string atcAirline;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string atcFlightNumber;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string departureAirport;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string destinationAirport;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
        struct AutopilotData
        {
            public double apMaster;
            public double apAltitudeLock;
            public double apHeadingLock;
            public double apVSLock;
            public double apSpeedLock;
            public double apApproachHold;
            public double apAutothrottle;
            public double apLocHold;
            public double apIlsHold;
            public double gearHandlePosition;
            public double flapsHandlePercent;
            public double spoilerHandlePosition;
            public double brakeParkingPosition;
            public double simPaused;
        }

        class AircraftInfo
        {
            public double Latitude { get; set; }
            public double Longitude { get; set; }
            public double Altitude { get; set; }
            public double Heading { get; set; }
            public double GroundSpeed { get; set; }
            public string Title { get; set; }
            public string AtcType { get; set; }
            public string AtcModel { get; set; }
            public string AtcId { get; set; }
            public string AtcAirline { get; set; }
            public string AtcFlightNumber { get; set; }
            public double DistanceFromUser { get; set; }
            public string DepartureAirport { get; set; }
            public string DestinationAirport { get; set; }
        }

        private double lastKnownDistance = 0;
        private double flightDistanceNM = 0;
        private double cumulativeDistance = 0;
        private DateTime lastUpdateTime = DateTime.Now;
        private double lastGroundSpeed = 0;
        private double lastGpsEte = 0;
        private string userAirline = "";
        private string userAircraftType = "";

        // Alert time option
        private bool useTimeBasedAlert = false;
        private DateTime alertTime = DateTime.Now;

        private ProgressBar progressBar;
        private Label lblConnectionStatus;
        private Panel connectionPanel;
        private Panel mainPanel;
        private TabControl tabControl;
        private DoubleBufferedPanel mapPanel;
        private ListBox lstNearbyAircraft;
        private System.Windows.Forms.Timer updateTimer;
        private CheckBox chkShowLabels;

        public MainForm()
        {
            LoadEmailSettings();
            SetupUI();
            LoadAircraftIcons();
            InitializeMapBuffering();
            InitializeWebSocketServer();
            this.FormClosing += MainForm_FormClosing;
        }

        private void InitializeWebSocketServer()
        {
            try
            {
                wsServer = new WebSocketServer("ws://0.0.0.0:3000");
                wsServer.AddWebSocketService<WebSocketSession>("/", () => new WebSocketSession(this));
                wsServer.Start();
                Console.WriteLine("WebSocket server started on ws://0.0.0.0:3000");
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to start WebSocket server: {ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        public void RegisterMobileClient(WebSocketSession session, string id)
        {
            if (id == uniqueId)
            {
                mobileClients[session.ID] = session;
                Console.WriteLine($"Mobile client connected: {session.ID}");
                
                // Send initial data
                SendFlightDataToMobile();
                SendAutopilotStateToMobile();
            }
        }

        public void UnregisterMobileClient(string sessionId)
        {
            if (mobileClients.ContainsKey(sessionId))
            {
                mobileClients.Remove(sessionId);
                Console.WriteLine($"Mobile client disconnected: {sessionId}");
            }
        }

        public void HandleMobileMessage(WebSocketSession session, string message)
        {
            try
            {
                var data = JsonDocument.Parse(message).RootElement;
                string type = data.GetProperty("type").GetString();

                switch (type)
                {
                    case "connect_mobile":
                        string id = data.GetProperty("uniqueId").GetString();
                        RegisterMobileClient(session, id);
                        break;

                    case "request_control":
                        string password = data.GetProperty("password").GetString();
                        bool authenticated = (password == this.password || password == this.guestPassword);
                        session.Send(JsonSerializer.Serialize(new { type = authenticated ? "control_granted" : "auth_failed" }));
                        break;

                    case "pause_toggle":
                        TogglePause();
                        break;

                    case "save_game":
                        SaveGame();
                        break;

                    case "autopilot_toggle":
                        string system = data.GetProperty("system").GetString();
                        ToggleAutopilotSystem(system);
                        break;

                    case "autopilot_set":
                        string param = data.GetProperty("param").GetString();
                        double value = data.GetProperty("value").GetDouble();
                        SetAutopilotValue(param, value);
                        break;

                    case "toggle_nav_mode":
                        ToggleNavGpsMode();
                        break;

                    case "toggle_loc":
                        ToggleLocMode();
                        break;

                    case "toggle_ils":
                        ToggleIlsMode();
                        break;

                    case "toggle_gear":
                        ToggleGear();
                        break;

                    case "toggle_speedbrake":
                        ToggleSpeedbrake();
                        break;

                    case "toggle_parking_brake":
                        ToggleParkingBrake();
                        break;

                    case "change_flaps":
                        int direction = data.GetProperty("direction").GetInt32();
                        ChangeFlaps(direction);
                        break;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error handling mobile message: {ex.Message}");
            }
        }

        private void SendToMobileClients(object message)
        {
            string json = JsonSerializer.Serialize(message);
            var deadClients = new List<string>();

            foreach (var client in mobileClients.Values)
            {
                try
                {
                    if (client.Context.WebSocket.State == WebSocketState.Open)
                    {
                        client.Send(json);
                    }
                    else
                    {
                        deadClients.Add(client.ID);
                    }
                }
                catch
                {
                    deadClients.Add(client.ID);
                }
            }

            // Remove dead clients
            foreach (var id in deadClients)
            {
                mobileClients.Remove(id);
            }
        }

        private void SendFlightDataToMobile()
        {
            double nextWpDistanceNM = userSpeed > 0 ? (lastGpsEte * userSpeed) : 0;
            
            var flightData = new {
                groundSpeed = userSpeed,
                altitude = userAltitude,
                heading = userHeading,
                verticalSpeed = 0, // You'll need to add this to your data structure
                nextWaypointId = "", // Get from GPS data
                waypointDistance = nextWpDistanceNM,
                totalDistance = lastKnownDistance,
                ete = lastGpsEte,
                latitude = userLat,
                longitude = userLon,
                isPaused = isSimPaused,
                gpsActive = true // Get from GPS data
            };

            SendToMobileClients(new { type = "flight_data", data = flightData });
        }

        private void SendAutopilotStateToMobile()
        {
            var apData = new {
                master = apMaster,
                altitude = apAltitude,
                heading = apHeading,
                vs = apVS,
                speed = apSpeed,
                approach = apApproach,
                throttle = apThrottle,
                loc = apLoc,
                ils = apIls,
                gear = gearDown,
                flaps = flapsPosition,
                speedbrake = speedbrakeDeployed,
                parkingBrake = parkingBrakeSet,
                gpsActive = true // Get from GPS data
            };

            SendToMobileClients(new { type = "autopilot_state", data = apData });
        }

        private void InitializeMapBuffering()
        {
            bufferedContext = BufferedGraphicsManager.Current;
            bufferedContext.MaximumBuffer = new Size(800, 800);
        }

        private void LoadAircraftIcons()
        {
            aircraftIcons["user"] = CreateAircraftIcon(Color.Yellow, true);
            aircraftIcons["ai"] = CreateAircraftIcon(Color.White, false);
            aircraftIcons["selected"] = CreateAircraftIcon(Color.Red, false);
        }

        private Bitmap CreateAircraftIcon(Color color, bool isUser)
        {
            int size = isUser ? 24 : 16;
            Bitmap icon = new Bitmap(size, size);
            using (Graphics g = Graphics.FromImage(icon))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;

                Point[] aircraftShape = new Point[]
                {
                    new Point(size/2, 0),
                    new Point(size/2-2, size/3),
                    new Point(0, size/2-1),
                    new Point(size/2-1, size/2),
                    new Point(size/2-1, size-2),
                    new Point(size/2+1, size-2),
                    new Point(size/2+1, size/2),
                    new Point(size, size/2-1),
                    new Point(size/2+2, size/3)
                };

                g.FillPolygon(new SolidBrush(color), aircraftShape);
                g.DrawPolygon(new Pen(Color.Black), aircraftShape);
            }
            return icon;
        }

        private void LoadEmailSettings()
        {
            try
            {
                if (File.Exists(SETTINGS_FILE))
                {
                    string[] lines = File.ReadAllLines(SETTINGS_FILE);
                    foreach (string line in lines)
                    {
                        if (line.StartsWith("Email="))
                        {
                            smtpEmail = line.Substring(6);
                        }
                        else if (line.StartsWith("Password="))
                        {
                            smtpPassword = line.Substring(9);
                        }
                    }
                    emailEnabled = !string.IsNullOrWhiteSpace(smtpEmail) && !string.IsNullOrWhiteSpace(smtpPassword);
                }
            }
            catch
            {
                smtpEmail = "";
                smtpPassword = "";
                emailEnabled = false;
            }
        }

        private void SaveEmailSettings()
        {
            try
            {
                using (StreamWriter writer = new StreamWriter(SETTINGS_FILE))
                {
                    writer.WriteLine($"Email={smtpEmail}");
                    writer.WriteLine($"Password={smtpPassword}");
                }
            }
            catch { }
        }

        private void SetupUI()
        {
            this.Text = "P3D Distance Monitor & Remote Server";
            this.Size = new System.Drawing.Size(800, 850);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;

            connectionPanel = new Panel
            {
                Name = "connectionPanel",
                Location = new System.Drawing.Point(0, 0),
                Size = new System.Drawing.Size(800, 850),
                BackColor = System.Drawing.Color.FromArgb(240, 240, 240)
            };
            this.Controls.Add(connectionPanel);

            Label lblTitle = new Label
            {
                Text = "P3D Distance Monitor & Remote Server",
                Location = new System.Drawing.Point(0, 80),
                Size = new System.Drawing.Size(800, 50),
                Font = new System.Drawing.Font("Arial", 20, System.Drawing.FontStyle.Bold),
                TextAlign = System.Drawing.ContentAlignment.MiddleCenter
            };
            connectionPanel.Controls.Add(lblTitle);

            // Add server info
            Label lblServerInfo = new Label
            {
                Text = $"Server ID: {uniqueId}\nPort: 3000\nPassword: {password}",
                Location = new System.Drawing.Point(0, 140),
                Size = new System.Drawing.Size(800, 60),
                Font = new System.Drawing.Font("Arial", 12),
                TextAlign = System.Drawing.ContentAlignment.MiddleCenter,
                ForeColor = System.Drawing.Color.Blue
            };
            connectionPanel.Controls.Add(lblServerInfo);

            Button btnConnect = new Button
            {
                Name = "btnConnect",
                Text = "Connect to Sim",
                Location = new System.Drawing.Point(300, 250),
                Size = new System.Drawing.Size(200, 60),
                Font = new System.Drawing.Font("Arial", 14, System.Drawing.FontStyle.Bold),
                BackColor = System.Drawing.Color.FromArgb(0, 120, 215),
                ForeColor = System.Drawing.Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnConnect.FlatAppearance.BorderSize = 0;
            btnConnect.Click += BtnConnect_Click;
            connectionPanel.Controls.Add(btnConnect);

            progressBar = new ProgressBar
            {
                Name = "progressBar",
                Location = new System.Drawing.Point(250, 340),
                Size = new System.Drawing.Size(300, 30),
                Style = ProgressBarStyle.Marquee,
                MarqueeAnimationSpeed = 30,
                Visible = false
            };
            connectionPanel.Controls.Add(progressBar);

            lblConnectionStatus = new Label
            {
                Name = "lblConnectionStatus",
                Text = "",
                Location = new System.Drawing.Point(0, 390),
                Size = new System.Drawing.Size(800, 30),
                TextAlign = System.Drawing.ContentAlignment.MiddleCenter,
                Font = new System.Drawing.Font("Arial", 11),
                ForeColor = System.Drawing.Color.Gray,
                Visible = false
            };
            connectionPanel.Controls.Add(lblConnectionStatus);

            mainPanel = new Panel
            {
                Name = "mainPanel",
                Location = new System.Drawing.Point(0, 0),
                Size = new System.Drawing.Size(800, 850),
                Visible = false
            };
            this.Controls.Add(mainPanel);

            Panel headerPanel = new Panel
            {
                Location = new System.Drawing.Point(0, 0),
                Size = new System.Drawing.Size(800, 70),
                BackColor = System.Drawing.Color.FromArgb(0, 120, 215)
            };
            mainPanel.Controls.Add(headerPanel);

            Label lblHeader = new Label
            {
                Text = "✈ Connected to Prepar3D",
                Location = new System.Drawing.Point(25, 20),
                Size = new System.Drawing.Size(300, 35),
                Font = new System.Drawing.Font("Arial", 16, System.Drawing.FontStyle.Bold),
                ForeColor = System.Drawing.Color.White
            };
            headerPanel.Controls.Add(lblHeader);

            Button btnDisconnect = new Button
            {
                Name = "btnDisconnect",
                Text = "Disconnect",
                Location = new System.Drawing.Point(540, 18),
                Size = new System.Drawing.Size(110, 35),
                BackColor = System.Drawing.Color.FromArgb(200, 50, 50),
                ForeColor = System.Drawing.Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand,
                Font = new System.Drawing.Font("Arial", 10, System.Drawing.FontStyle.Bold)
            };
            btnDisconnect.FlatAppearance.BorderSize = 0;
            btnDisconnect.Click += BtnDisconnect_Click;
            headerPanel.Controls.Add(btnDisconnect);

            Button btnEmailSettings = new Button
            {
                Name = "btnEmailSettings",
                Text = "Email Settings",
                Location = new System.Drawing.Point(660, 18),
                Size = new System.Drawing.Size(120, 35),
                BackColor = System.Drawing.Color.FromArgb(100, 100, 100),
                ForeColor = System.Drawing.Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand,
                Font = new System.Drawing.Font("Arial", 10, System.Drawing.FontStyle.Bold)
            };
            btnEmailSettings.FlatAppearance.BorderSize = 0;
            btnEmailSettings.Click += BtnEmailSettings_Click;
            headerPanel.Controls.Add(btnEmailSettings);

            // Tab Control
            tabControl = new TabControl
            {
                Location = new System.Drawing.Point(10, 80),
                Size = new System.Drawing.Size(770, 750),
                Font = new System.Drawing.Font("Arial", 10, System.Drawing.FontStyle.Bold)
            };
            mainPanel.Controls.Add(tabControl);

            tabControl.Selected += TabControl_Selected;

            // Flight Data Tab
            TabPage flightDataTab = new TabPage("Flight Data");
            tabControl.TabPages.Add(flightDataTab);
            SetupFlightDataTab(flightDataTab);

            // Map Tab
            TabPage mapTab = new TabPage("Live Map");
            tabControl.TabPages.Add(mapTab);
            SetupMapTab(mapTab);

            updateTimer = new System.Windows.Forms.Timer
            {
                Interval = 1000,
                Enabled = false
            };
            updateTimer.Tick += UpdateTimer_Tick;

            connectionTimer = new System.Windows.Forms.Timer
            {
                Interval = 10000,
                Enabled = false
            };
            connectionTimer.Tick += ConnectionTimer_Tick;
        }

        private void TabControl_Selected(object sender, TabControlEventArgs e)
        {
            mapVisible = (e.TabPageIndex == 1);
            if (mapVisible)
            {
                mapNeedsRedraw = true;
                mapPanel.Invalidate();

                if (liveMapUpdateTimer == null)
                {
                    liveMapUpdateTimer = new System.Windows.Forms.Timer
                    {
                        Interval = MAP_UPDATE_INTERVAL_MS,
                        Enabled = true
                    };
                    liveMapUpdateTimer.Tick += LiveMapUpdateTimer_Tick;
                }
            }
            else
            {
                if (liveMapUpdateTimer != null)
                {
                    liveMapUpdateTimer.Stop();
                    liveMapUpdateTimer.Dispose();
                    liveMapUpdateTimer = null;
                }
            }
        }

        private void LiveMapUpdateTimer_Tick(object sender, EventArgs e)
        {
            if (mapVisible && mapNeedsRedraw)
            {
                mapPanel.Invalidate();
                mapNeedsRedraw = false;
            }
        }

        private void SetupFlightDataTab(TabPage tab)
        {
            Label lblFlightPlanStatus = new Label
            {
                Name = "lblFlightPlanStatus",
                Text = "⚠ No Active Flight Plan",
                Location = new System.Drawing.Point(15, 15),
                Size = new System.Drawing.Size(730, 30),
                Font = new System.Drawing.Font("Arial", 12, System.Drawing.FontStyle.Bold),
                ForeColor = System.Drawing.Color.Orange
            };
            tab.Controls.Add(lblFlightPlanStatus);

            GroupBox grpNextWaypoint = new GroupBox
            {
                Text = "Next Waypoint",
                Location = new System.Drawing.Point(15, 55),
                Size = new System.Drawing.Size(730, 90),
                Font = new System.Drawing.Font("Arial", 11, System.Drawing.FontStyle.Bold)
            };
            tab.Controls.Add(grpNextWaypoint);

            Label lblNextWpName = new Label
            {
                Name = "lblNextWpName",
                Text = "ID: --",
                Location = new System.Drawing.Point(20, 30),
                Size = new System.Drawing.Size(320, 25),
                Font = new System.Drawing.Font("Arial", 10, System.Drawing.FontStyle.Bold)
            };
            grpNextWaypoint.Controls.Add(lblNextWpName);

            Label lblNextWpDistance = new Label
            {
                Name = "lblNextWpDistance",
                Text = "Distance: -- nm",
                Location = new System.Drawing.Point(20, 58),
                Size = new System.Drawing.Size(320, 25),
                Font = new System.Drawing.Font("Arial", 10)
            };
            grpNextWaypoint.Controls.Add(lblNextWpDistance);

            Label lblNextWpBearing = new Label
            {
                Name = "lblNextWpBearing",
                Text = "Bearing: --°",
                Location = new System.Drawing.Point(370, 30),
                Size = new System.Drawing.Size(320, 25),
                Font = new System.Drawing.Font("Arial", 10)
            };
            grpNextWaypoint.Controls.Add(lblNextWpBearing);

            Label lblNextWpEte = new Label
            {
                Name = "lblNextWpEte",
                Text = "ETE: --",
                Location = new System.Drawing.Point(370, 58),
                Size = new System.Drawing.Size(320, 25),
                Font = new System.Drawing.Font("Arial", 10)
            };
            grpNextWaypoint.Controls.Add(lblNextWpEte);

            Panel distancePanel = new Panel
            {
                Location = new System.Drawing.Point(15, 160),
                Size = new System.Drawing.Size(730, 150),
                BackColor = System.Drawing.Color.FromArgb(245, 245, 245),
                BorderStyle = BorderStyle.FixedSingle
            };
            tab.Controls.Add(distancePanel);

            Label lblDistanceLabel = new Label
            {
                Text = "TOTAL DISTANCE TO DESTINATION",
                Location = new System.Drawing.Point(10, 12),
                Size = new System.Drawing.Size(710, 25),
                Font = new System.Drawing.Font("Arial", 10, System.Drawing.FontStyle.Bold),
                ForeColor = System.Drawing.Color.Gray,
                TextAlign = System.Drawing.ContentAlignment.MiddleCenter
            };
            distancePanel.Controls.Add(lblDistanceLabel);

            Label lblDistance = new Label
            {
                Name = "lblDistance",
                Text = "-- nm",
                Location = new System.Drawing.Point(10, 42),
                Size = new System.Drawing.Size(710, 45),
                Font = new System.Drawing.Font("Arial", 32, System.Drawing.FontStyle.Bold),
                TextAlign = System.Drawing.ContentAlignment.MiddleCenter,
                ForeColor = System.Drawing.Color.FromArgb(0, 120, 215)
            };
            distancePanel.Controls.Add(lblDistance);

            Label lblTotalEte = new Label
            {
                Name = "lblTotalEte",
                Text = "ETE: --",
                Location = new System.Drawing.Point(10, 92),
                Size = new System.Drawing.Size(710, 25),
                Font = new System.Drawing.Font("Arial", 12),
                TextAlign = System.Drawing.ContentAlignment.MiddleCenter,
                ForeColor = System.Drawing.Color.FromArgb(0, 120, 215)
            };
            distancePanel.Controls.Add(lblTotalEte);

            Label lblTotalEta = new Label
            {
                Name = "lblTotalEta",
                Text = "ETA: --",
                Location = new System.Drawing.Point(10, 117),
                Size = new System.Drawing.Size(710, 25),
                Font = new System.Drawing.Font("Arial", 12),
                TextAlign = System.Drawing.ContentAlignment.MiddleCenter,
                ForeColor = System.Drawing.Color.FromArgb(0, 120, 215)
            };
            distancePanel.Controls.Add(lblTotalEta);

            GroupBox grpFlightInfo = new GroupBox
            {
                Text = "Flight Information",
                Location = new System.Drawing.Point(15, 325),
                Size = new System.Drawing.Size(730, 110),
                Font = new System.Drawing.Font("Arial", 11, System.Drawing.FontStyle.Bold)
            };
            tab.Controls.Add(grpFlightInfo);

            Label lblSpeed = new Label
            {
                Name = "lblSpeed",
                Text = "Ground Speed: -- kts",
                Location = new System.Drawing.Point(25, 30),
                Size = new System.Drawing.Size(320, 25),
                Font = new System.Drawing.Font("Arial", 10)
            };
            grpFlightInfo.Controls.Add(lblSpeed);

            Label lblAltitude = new Label
            {
                Name = "lblAltitude",
                Text = "Altitude: -- ft",
                Location = new System.Drawing.Point(25, 62),
                Size = new System.Drawing.Size(320, 25),
                Font = new System.Drawing.Font("Arial", 10)
            };
            grpFlightInfo.Controls.Add(lblAltitude);

            Label lblHeading = new Label
            {
                Name = "lblHeading",
                Text = "Heading: --°",
                Location = new System.Drawing.Point(370, 30),
                Size = new System.Drawing.Size(320, 25),
                Font = new System.Drawing.Font("Arial", 10)
            };
            grpFlightInfo.Controls.Add(lblHeading);

            Label lblWaypoints = new Label
            {
                Name = "lblWaypoints",
                Text = "Waypoints: --",
                Location = new System.Drawing.Point(370, 62),
                Size = new System.Drawing.Size(320, 25),
                Font = new System.Drawing.Font("Arial", 10)
            };
            grpFlightInfo.Controls.Add(lblWaypoints);

            GroupBox grpAlert = new GroupBox
            {
                Text = "Alert Settings",
                Location = new System.Drawing.Point(15, 450),
                Size = new System.Drawing.Size(730, 220),
                Font = new System.Drawing.Font("Arial", 11, System.Drawing.FontStyle.Bold)
            };
            tab.Controls.Add(grpAlert);

            RadioButton rbDistanceAlert = new RadioButton
            {
                Name = "rbDistanceAlert",
                Text = "Alert by Distance:",
                Location = new System.Drawing.Point(25, 30),
                Size = new System.Drawing.Size(200, 25),
                Font = new System.Drawing.Font("Arial", 10),
                Checked = true
            };
            rbDistanceAlert.CheckedChanged += (s, e) => { useTimeBasedAlert = !rbDistanceAlert.Checked; };
            grpAlert.Controls.Add(rbDistanceAlert);

            TextBox txtAlertDistance = new TextBox
            {
                Name = "txtAlertDistance",
                Text = "100",
                Location = new System.Drawing.Point(230, 28),
                Size = new System.Drawing.Size(90, 28),
                Font = new System.Drawing.Font("Arial", 11),
                TextAlign = HorizontalAlignment.Center
            };
            txtAlertDistance.TextChanged += TxtAlertDistance_TextChanged;
            grpAlert.Controls.Add(txtAlertDistance);

            Label lblNm = new Label
            {
                Text = "nm remaining",
                Location = new System.Drawing.Point(330, 30),
                Size = new System.Drawing.Size(100, 25),
                Font = new System.Drawing.Font("Arial", 10)
            };
            grpAlert.Controls.Add(lblNm);

            RadioButton rbTimeAlert = new RadioButton
            {
                Name = "rbTimeAlert",
                Text = "Alert by PC Time:",
                Location = new System.Drawing.Point(25, 65),
                Size = new System.Drawing.Size(200, 25),
                Font = new System.Drawing.Font("Arial", 10),
                Checked = false
            };
            rbTimeAlert.CheckedChanged += (s, e) => { useTimeBasedAlert = rbTimeAlert.Checked; };
            grpAlert.Controls.Add(rbTimeAlert);

            DateTimePicker dtpAlertTime = new DateTimePicker
            {
                Name = "dtpAlertTime",
                Format = DateTimePickerFormat.Time,
                ShowUpDown = true,
                Location = new System.Drawing.Point(230, 63),
                Size = new System.Drawing.Size(120, 28),
                Font = new System.Drawing.Font("Arial", 11)
            };
            dtpAlertTime.ValueChanged += (s, e) => { alertTime = dtpAlertTime.Value; };
            grpAlert.Controls.Add(dtpAlertTime);

            Label lblTimeNote = new Label
            {
                Text = "(24-hour format)",
                Location = new System.Drawing.Point(360, 65),
                Size = new System.Drawing.Size(120, 25),
                Font = new System.Drawing.Font("Arial", 9),
                ForeColor = System.Drawing.Color.Gray
            };
            grpAlert.Controls.Add(lblTimeNote);

            CheckBox chkAutoPause = new CheckBox
            {
                Name = "chkAutoPause",
                Text = "Automatically pause simulator when alert is triggered",
                Location = new System.Drawing.Point(25, 105),
                Size = new System.Drawing.Size(680, 28),
                Font = new System.Drawing.Font("Arial", 10),
                Checked = true
            };
            grpAlert.Controls.Add(chkAutoPause);

            CheckBox chkEmailAlert = new CheckBox
            {
                Name = "chkEmailAlert",
                Text = "Send email notification when alert is triggered",
                Location = new System.Drawing.Point(25, 135),
                Size = new System.Drawing.Size(680, 28),
                Font = new System.Drawing.Font("Arial", 10),
                Checked = false,
                Enabled = emailEnabled
            };
            grpAlert.Controls.Add(chkEmailAlert);
        }

        private void SetupMapTab(TabPage tab)
        {
            mapPanel = new DoubleBufferedPanel
            {
                Name = "mapPanel",
                Location = new System.Drawing.Point(10, 50),
                Size = new System.Drawing.Size(550, 610),
                BackColor = System.Drawing.Color.LightGray,
                BorderStyle = BorderStyle.FixedSingle,
            };

            mapPanel.Paint += MapPanel_Paint;
            mapPanel.MouseDown += MapPanel_MouseDown;
            mapPanel.MouseMove += MapPanel_MouseMove;
            mapPanel.MouseUp += MapPanel_MouseUp;
            mapPanel.MouseWheel += MapPanel_MouseWheel;
            mapPanel.MouseClick += MapPanel_MouseClick;
            tab.Controls.Add(mapPanel);

            GroupBox grpNearby = new GroupBox
            {
                Text = "Nearby Aircraft",
                Location = new System.Drawing.Point(570, 50),
                Size = new System.Drawing.Size(180, 610),
                Font = new System.Drawing.Font("Arial", 10, System.Drawing.FontStyle.Bold)
            };
            tab.Controls.Add(grpNearby);

            lstNearbyAircraft = new ListBox
            {
                Name = "lstNearbyAircraft",
                Location = new System.Drawing.Point(10, 25),
                Size = new System.Drawing.Size(160, 400),
                Font = new System.Drawing.Font("Arial", 9),
                ScrollAlwaysVisible = true
            };
            lstNearbyAircraft.DoubleClick += LstNearbyAircraft_DoubleClick;
            lstNearbyAircraft.Click += LstNearbyAircraft_Click;
            grpNearby.Controls.Add(lstNearbyAircraft);

            aircraftDetailsPanel = new Panel
            {
                Location = new System.Drawing.Point(10, 430),
                Size = new System.Drawing.Size(160, 170),
                BackColor = System.Drawing.Color.FromArgb(245, 245, 245),
                BorderStyle = BorderStyle.FixedSingle
            };
            grpNearby.Controls.Add(aircraftDetailsPanel);

            aircraftDetailsLabel = new Label
            {
                Name = "aircraftDetailsLabel",
                Text = "Click on an aircraft\nto view details",
                Location = new System.Drawing.Point(5, 5),
                Size = new System.Drawing.Size(150, 160),
                Font = new System.Drawing.Font("Arial", 9),
                TextAlign = System.Drawing.ContentAlignment.MiddleCenter,
                ForeColor = System.Drawing.Color.Gray
            };
            aircraftDetailsPanel.Controls.Add(aircraftDetailsLabel);

            Button btnCenterUser = new Button
            {
                Name = "btnCenterUser",
                Text = "Center on Aircraft",
                Location = new System.Drawing.Point(10, 10),
                Size = new System.Drawing.Size(140, 30),
                Font = new System.Drawing.Font("Arial", 9, System.Drawing.FontStyle.Bold),
                BackColor = System.Drawing.Color.FromArgb(0, 120, 215),
                ForeColor = System.Drawing.Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnCenterUser.FlatAppearance.BorderSize = 0;
            btnCenterUser.Click += (s, e) => {
                followUser = true;
                mapZoom = 7;
                mapNeedsRedraw = true;
                mapPanel.Invalidate();

                selectedAircraft = null;
                string airline = string.IsNullOrWhiteSpace(userAirline) ? "N/A" : userAirline;
                string aircraftType = string.IsNullOrWhiteSpace(userAircraftType) ? "User Aircraft" : userAircraftType;
                string route = "N/A";

                string info = $"Airline: {airline}\n" +
                             $"Aircraft: {aircraftType}\n" +
                             $"Route: {route}\n" +
                             $"Speed: {userSpeed:F0} kts\n" +
                             $"Altitude: {userAltitude:F0} ft";

                aircraftDetailsLabel.Text = info;
                aircraftDetailsLabel.TextAlign = System.Drawing.ContentAlignment.TopLeft;
                aircraftDetailsLabel.ForeColor = System.Drawing.Color.Black;
                aircraftDetailsLabel.Font = new System.Drawing.Font("Arial", 9);

                Control[] lbls = tabControl.TabPages[1].Controls.Find("lblZoom", false);
                if (lbls.Length > 0)
                {
                    ((Label)lbls[0]).Text = $"Zoom: {mapZoom}";
                }
            };
            tab.Controls.Add(btnCenterUser);

            Label lblZoom = new Label
            {
                Name = "lblZoom",
                Text = "Zoom: 7",
                Location = new System.Drawing.Point(170, 15),
                Size = new System.Drawing.Size(80, 20),
                Font = new System.Drawing.Font("Arial", 9)
            };
            tab.Controls.Add(lblZoom);

            Label lblMapInfo = new Label
            {
                Text = "Drag to pan | Scroll to zoom | Click aircraft for details",
                Location = new System.Drawing.Point(270, 15),
                Size = new System.Drawing.Size(280, 20),
                Font = new System.Drawing.Font("Arial", 8),
                ForeColor = System.Drawing.Color.Gray
            };
            tab.Controls.Add(lblMapInfo);

            chkShowLabels = new CheckBox
            {
                Name = "chkShowLabels",
                Text = "Show aircraft labels on map",
                Location = new System.Drawing.Point(570, 670),
                Size = new System.Drawing.Size(180, 25),
                Font = new System.Drawing.Font("Arial", 9),
                Checked = true
            };
            chkShowLabels.CheckedChanged += (s, e) => {
                showAircraftLabels = chkShowLabels.Checked;
                mapNeedsRedraw = true;
                mapPanel.Invalidate();
            };
            tab.Controls.Add(chkShowLabels);

            tileDownloadTimer = new System.Threading.Timer(DownloadTiles, null, Timeout.Infinite, Timeout.Infinite);
        }

        // Control functions
        private void TogglePause()
        {
            if (simconnect != null)
            {
                isSimPaused = !isSimPaused;
                simconnect.TransmitClientEvent(0, EVENTS.PAUSE, isSimPaused ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                SendFlightDataToMobile();
            }
        }

        private void SaveGame()
        {
            if (simconnect != null)
            {
                simconnect.TransmitClientEvent(0, (EVENTS)65536, 1, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
            }
        }

        private void ToggleAutopilotSystem(string system)
        {
            if (simconnect != null)
            {
                switch (system)
                {
                    case "master":
                        apMaster = !apMaster;
                        simconnect.TransmitClientEvent(0, EVENTS.AP_MASTER_TOGGLE, apMaster ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;
                    case "altitude":
                        apAltitude = !apAltitude;
                        simconnect.TransmitClientEvent(0, EVENTS.AP_ALTITUDE_TOGGLE, apAltitude ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;
                    case "heading":
                        apHeading = !apHeading;
                        simconnect.TransmitClientEvent(0, EVENTS.AP_HEADING_TOGGLE, apHeading ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;
                    case "vs":
                        apVS = !apVS;
                        simconnect.TransmitClientEvent(0, EVENTS.AP_VS_TOGGLE, apVS ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;
                    case "speed":
                        apSpeed = !apSpeed;
                        simconnect.TransmitClientEvent(0, EVENTS.AP_SPEED_TOGGLE, apSpeed ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;
                    case "approach":
                        apApproach = !apApproach;
                        simconnect.TransmitClientEvent(0, EVENTS.AP_APPROACH_TOGGLE, apApproach ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;
                    case "throttle":
                        apThrottle = !apThrottle;
                        simconnect.TransmitClientEvent(0, EVENTS.AP_THROTTLE_TOGGLE, apThrottle ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;
                }
                SendAutopilotStateToMobile();
            }
        }

        private void SetAutopilotValue(string param, double value)
        {
            if (simconnect != null)
            {
                switch (param)
                {
                    case "altitude":
                        simconnect.TransmitClientEvent(0, (EVENTS)65537, value, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;
                    case "heading":
                        simconnect.TransmitClientEvent(0, (EVENTS)65538, value, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;
                    case "vs":
                        simconnect.TransmitClientEvent(0, (EVENTS)65539, value, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;
                    case "speed":
                        simconnect.TransmitClientEvent(0, (EVENTS)65540, value, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                        break;
                }
            }
        }

        private void ToggleNavGpsMode()
        {
            if (simconnect != null)
            {
                simconnect.TransmitClientEvent(0, EVENTS.NAV_GPS_TOGGLE, 1, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
            }
        }

        private void ToggleLocMode()
        {
            if (simconnect != null)
            {
                apLoc = !apLoc;
                simconnect.TransmitClientEvent(0, EVENTS.LOC_TOGGLE, apLoc ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                SendAutopilotStateToMobile();
            }
        }

        private void ToggleIlsMode()
        {
            if (simconnect != null)
            {
                apIls = !apIls;
                simconnect.TransmitClientEvent(0, EVENTS.ILS_TOGGLE, apIls ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                SendAutopilotStateToMobile();
            }
        }

        private void ToggleGear()
        {
            if (simconnect != null)
            {
                gearDown = !gearDown;
                simconnect.TransmitClientEvent(0, EVENTS.GEAR_TOGGLE, gearDown ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                SendAutopilotStateToMobile();
            }
        }

        private void ToggleSpeedbrake()
        {
            if (simconnect != null)
            {
                speedbrakeDeployed = !speedbrakeDeployed;
                simconnect.TransmitClientEvent(0, EVENTS.SPEEDBRAKE_TOGGLE, speedbrakeDeployed ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                SendAutopilotStateToMobile();
            }
        }

        private void ToggleParkingBrake()
        {
            if (simconnect != null)
            {
                parkingBrakeSet = !parkingBrakeSet;
                simconnect.TransmitClientEvent(0, EVENTS.PARKING_BRAKE_TOGGLE, parkingBrakeSet ? 1 : 0, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                SendAutopilotStateToMobile();
            }
        }

        private void ChangeFlaps(int direction)
        {
            if (simconnect != null)
            {
                if (direction > 0)
                {
                    simconnect.TransmitClientEvent(0, EVENTS.FLAPS_INCREASE, 1, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                }
                else
                {
                    simconnect.TransmitClientEvent(0, EVENTS.FLAPS_DECREASE, 1, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                }
            }
        }

        // Rest of the methods remain the same (MapPanel_Paint, MapPanel_MouseDown, etc.)
        // ... (keeping them the same as in your original code)

        private void BtnConnect_Click(object sender, EventArgs e)
        {
            Button btn = (Button)sender;
            btn.Enabled = false;
            progressBar.Visible = true;
            lblConnectionStatus.Visible = true;
            lblConnectionStatus.Text = "Connecting to Prepar3D...";
            lblConnectionStatus.ForeColor = System.Drawing.Color.Gray;

            connectionAttempts = 0;
            connectionTimer.Enabled = true;

            System.Windows.Forms.Timer delayTimer = new System.Windows.Forms.Timer { Interval = 100 };
            delayTimer.Tick += (s, ev) =>
            {
                delayTimer.Stop();
                AttemptConnection();
            };
            delayTimer.Start();
        }

        private void AttemptConnection()
        {
            try
            {
                simconnect = new SimConnect("P3D Distance Monitor", this.Handle, WM_USER_SIMCONNECT, null, 0);

                // Add all your data definitions
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS IS ACTIVE WAY POINT", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS FLIGHT PLAN WP COUNT", "number", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS WP DISTANCE", "meters", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS ETE", "seconds", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GROUND VELOCITY", "knots", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "PLANE ALTITUDE", "feet", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "PLANE HEADING DEGREES TRUE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS WP NEXT ID", null, SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS WP BEARING", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS WP ETE", "hours", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS IS ARRIVED", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "SIM ON GROUND", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "ESTIMATED CRUISE SPEED", "feet per second", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS IS ACTIVE FLIGHT PLAN", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "GPS TOTAL DISTANCE", "nautical miles", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "PLANE LATITUDE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "PLANE LONGITUDE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.PlaneData, "VERTICAL SPEED", "feet per minute", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);

                // Autopilot data definitions
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "AUTOPILOT MASTER", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "AUTOPILOT ALTITUDE LOCK", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "AUTOPILOT HEADING LOCK", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "AUTOPILOT VERTICAL HOLD", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "AUTOPILOT AIRSPEED HOLD", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "AUTOPILOT APPROACH HOLD", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "AUTOPILOT AUTOTHROTTLE ACTIVE", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "AUTOPILOT NAV1 LOCK", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "AUTOPILOT GLIDESLOPE HOLD", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "GEAR HANDLE POSITION", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "FLAPS HANDLE PERCENT", "percent", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "SPOILERS HANDLE POSITION", "percent", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "BRAKE PARKING POSITION", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AutopilotData, "SIM PAUSED", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);

                simconnect.RegisterDataDefineStruct<PlaneData>(DEFINITIONS.PlaneData);
                simconnect.RegisterDataDefineStruct<AIData>(DEFINITIONS.AIData);
                simconnect.RegisterDataDefineStruct<AutopilotData>(DEFINITIONS.AutopilotData);

                // AI Aircraft definition
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "PLANE LATITUDE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "PLANE LONGITUDE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "PLANE ALTITUDE", "feet", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "PLANE HEADING DEGREES TRUE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "GROUND VELOCITY", "knots", SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "TITLE", null, SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "ATC TYPE", null, SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "ATC MODEL", null, SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "ATC ID", null, SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "ATC AIRLINE", null, SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "ATC FLIGHT NUMBER", null, SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "FROM AIRPORT ID", null, SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                simconnect.AddToDataDefinition(DEFINITIONS.AIData, "TO AIRPORT ID", null, SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);

                // Map events
                simconnect.MapClientEventToSimEvent(EVENTS.PAUSE, "PAUSE_SET");
                simconnect.MapClientEventToSimEvent(EVENTS.SPEEDBRAKE_TOGGLE, "SPOILERS_TOGGLE");
                simconnect.MapClientEventToSimEvent(EVENTS.PARKING_BRAKE_TOGGLE, "PARKING_BRAKES_TOGGLE");
                simconnect.MapClientEventToSimEvent(EVENTS.LOC_TOGGLE, "AP_LOC_HOLD_TOGGLE");
                simconnect.MapClientEventToSimEvent(EVENTS.ILS_TOGGLE, "AP_APR_HOLD_TOGGLE");
                simconnect.MapClientEventToSimEvent(EVENTS.NAV_GPS_TOGGLE, "VOR1_GPS_TOGGLE");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_MASTER_TOGGLE, "AP_MASTER_SET");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_ALTITUDE_TOGGLE, "AP_ALT_HOLD_ON");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_HEADING_TOGGLE, "AP_HDG_HOLD_ON");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_VS_TOGGLE, "AP_VS_ON");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_SPEED_TOGGLE, "AP_ASPD_HOLD_ON");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_APPROACH_TOGGLE, "AP_APR_HOLD_ON");
                simconnect.MapClientEventToSimEvent(EVENTS.AP_THROTTLE_TOGGLE, "AP_AUTOTHROTTLE_ON");
                simconnect.MapClientEventToSimEvent(EVENTS.GEAR_TOGGLE, "GEAR_TOGGLE");
                simconnect.MapClientEventToSimEvent(EVENTS.FLAPS_INCREASE, "FLAPS_INCR");
                simconnect.MapClientEventToSimEvent(EVENTS.FLAPS_DECREASE, "FLAPS_DECR");

                simconnect.OnRecvSimobjectDataBytype += Simconnect_OnRecvSimobjectDataBytype;
                simconnect.OnRecvOpen += Simconnect_OnRecvOpen;

                connectionAttempts++;
            }
            catch (COMException)
            {
                connectionAttempts++;
                lblConnectionStatus.Text = $"Connection attempt {connectionAttempts}...";
            }
        }

        private void Simconnect_OnRecvOpen(SimConnect sender, SIMCONNECT_RECV_OPEN data)
        {
            connectionTimer.Enabled = false;
            isConnected = true;

            this.Invoke(new Action(() =>
            {
                connectionPanel.Visible = false;
                mainPanel.Visible = true;
                updateTimer.Enabled = true;
            }));
        }

        private void ConnectionTimer_Tick(object sender, EventArgs e)
        {
            connectionTimer.Enabled = false;

            if (!isConnected)
            {
                progressBar.Visible = false;
                lblConnectionStatus.Text = "❌ Connection Failed";
                lblConnectionStatus.ForeColor = System.Drawing.Color.Red;

                Button btn = (Button)connectionPanel.Controls["btnConnect"];
                btn.Enabled = true;

                MessageBox.Show("Failed to connect to Prepar3D after 10 seconds.\n\nDebug Info:\n- Make sure Prepar3D is running\n- Check that SimConnect is properly installed\n- Verify no firewall is blocking the connection\n" + $"- Connection attempts made: {connectionAttempts}\n\nTry starting P3D first, then click Connect again.", "Connection Timeout", MessageBoxButtons.OK, MessageBoxIcon.Error);

                if (simconnect != null)
                {
                    simconnect.Dispose();
                    simconnect = null;
                }
            }
        }

        private void BtnDisconnect_Click(object sender, EventArgs e)
        {
            CloseConnection();
            mainPanel.Visible = false;
            connectionPanel.Visible = true;

            Button btn = (Button)connectionPanel.Controls["btnConnect"];
            btn.Enabled = true;
            progressBar.Visible = false;
            lblConnectionStatus.Visible = false;
        }

        private void UpdateTimer_Tick(object sender, EventArgs e)
        {
            if (isConnected && simconnect != null)
            {
                try
                {
                    simconnect.RequestDataOnSimObjectType(DATA_REQUESTS.REQUEST_1, DEFINITIONS.PlaneData, 0, SIMCONNECT_SIMOBJECT_TYPE.USER);
                    simconnect.RequestDataOnSimObjectType(DATA_REQUESTS.REQUEST_AUTOPILOT, DEFINITIONS.AutopilotData, 0, SIMCONNECT_SIMOBJECT_TYPE.USER);

                    if (DateTime.Now.Second % 3 == 0)
                    {
                        simconnect.RequestDataOnSimObjectType(DATA_REQUESTS.REQUEST_AI, DEFINITIONS.AIData, 0, SIMCONNECT_SIMOBJECT_TYPE.AIRCRAFT);
                    }
                }
                catch { }
            }

            if (useTimeBasedAlert && !alertTriggered)
            {
                DateTime now = DateTime.Now;
                TimeSpan alertTimeOfDay = alertTime.TimeOfDay;
                TimeSpan nowTimeOfDay = now.TimeOfDay;

                if (Math.Abs((alertTimeOfDay - nowTimeOfDay).TotalMinutes) < 1)
                {
                    alertTriggered = true;
                    TabPage flightTab = tabControl.TabPages[0];
                    CheckBox chkAutoPause = (CheckBox)flightTab.Controls.Find("chkAutoPause", true)[0];
                    CheckBox chkEmailAlert = (CheckBox)flightTab.Controls.Find("chkEmailAlert", true)[0];

                    if (chkAutoPause.Checked)
                    {
                        simconnect.TransmitClientEvent(0, EVENTS.PAUSE, 1, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                    }

                    if (chkEmailAlert.Checked && emailEnabled)
                    {
                        try
                        {
                            SendEmail(smtpEmail, smtpPassword, "🔔 P3D Time Alert!", $"Time Alert from P3D Distance Monitor\n\nIt is now {now:HH:mm} - your scheduled alert time!\n\nHappy flying!");
                        }
                        catch { }
                    }

                    MessageBox.Show($"🔔 Time Alert!\n\nIt is now {now:HH:mm} - your scheduled alert time!", "Time Alert", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
        }

        private void Simconnect_OnRecvSimobjectDataBytype(SimConnect sender, SIMCONNECT_RECV_SIMOBJECT_DATA_BYTYPE data)
        {
            if (data.dwRequestID == (uint)DATA_REQUESTS.REQUEST_1)
            {
                PlaneData planeData = (PlaneData)data.dwData[0];

                userLat = planeData.latitude;
                userLon = planeData.longitude;
                userHeading = planeData.heading;
                userAltitude = planeData.altitude;
                userSpeed = planeData.groundSpeed;

                bool gpsActive = planeData.gpsIsActiveFlightPlan > 0.5 || planeData.gpsIsActiveWaypoint > 0.5;
                int waypointCount = (int)planeData.gpsFlightPlanWpCount;
                bool hasArrived = planeData.gpsIsArrived > 0.5;

                double nextWpDistanceNM = planeData.gpsWpDistance / 1852.0;

                double totalDistanceNM = 0;

                if (planeData.gpsTotalDistance > 0)
                {
                    totalDistanceNM = planeData.gpsTotalDistance;
                    flightDistanceNM = totalDistanceNM;
                    lastKnownDistance = totalDistanceNM;
                }
                else if (planeData.gpsEte > 0 && planeData.groundSpeed > 0)
                {
                    double calculatedDistance = (planeData.gpsEte / 3600.0) * planeData.groundSpeed;

                    if (lastKnownDistance > 0)
                    {
                        totalDistanceNM = (lastKnownDistance * 0.7) + (calculatedDistance * 0.3);
                    }
                    else
                    {
                        totalDistanceNM = calculatedDistance;
                    }

                    flightDistanceNM = totalDistanceNM;
                    lastKnownDistance = totalDistanceNM;
                    lastGpsEte = planeData.gpsEte;
                }
                else if (lastKnownDistance > 0)
                {
                    TimeSpan timeSinceLastUpdate = DateTime.Now - lastUpdateTime;
                    double hoursSinceLastUpdate = timeSinceLastUpdate.TotalHours;
                    double distanceTraveled = lastGroundSpeed * hoursSinceLastUpdate;
                    totalDistanceNM = Math.Max(0, lastKnownDistance - distanceTraveled);
                }

                lastUpdateTime = DateTime.Now;
                lastGroundSpeed = planeData.groundSpeed;
                lastKnownDistance = totalDistanceNM;

                double totalEteHours = 0;
                if (planeData.groundSpeed > 0 && totalDistanceNM > 0)
                {
                    totalEteHours = totalDistanceNM / planeData.groundSpeed;
                }

                int flightHours = (int)Math.Floor(planeData.gpsEte / 3600.0);
                int flightMinutes = (int)Math.Round((planeData.gpsEte - (flightHours * 3600.0)) / 60.0);

                DateTime eta = DateTime.Now.AddHours(totalEteHours);

                // Send data to mobile clients
                var flightData = new {
                    groundSpeed = planeData.groundSpeed,
                    altitude = planeData.altitude,
                    heading = planeData.heading,
                    verticalSpeed = planeData.verticalSpeed,
                    nextWaypointId = planeData.gpsWpNextId,
                    waypointDistance = nextWpDistanceNM,
                    totalDistance = totalDistanceNM,
                    ete = planeData.gpsEte,
                    latitude = planeData.latitude,
                    longitude = planeData.longitude,
                    isPaused = isSimPaused,
                    gpsActive = gpsActive
                };
                SendToMobileClients(new { type = "flight_data", data = flightData });

                this.Invoke(new Action(() =>
                {
                    TabPage flightTab = tabControl.TabPages[0];

                    Label lblDistance = (Label)flightTab.Controls.Find("lblDistance", true)[0];
                    Label lblTotalEte = (Label)flightTab.Controls.Find("lblTotalEte", true)[0];
                    Label lblTotalEta = (Label)flightTab.Controls.Find("lblTotalEta", true)[0];
                    Label lblSpeed = (Label)flightTab.Controls.Find("lblSpeed", true)[0];
                    Label lblAltitude = (Label)flightTab.Controls.Find("lblAltitude", true)[0];
                    Label lblHeading = (Label)flightTab.Controls.Find("lblHeading", true)[0];
                    Label lblWaypoints = (Label)flightTab.Controls.Find("lblWaypoints", true)[0];
                    Label lblFlightPlanStatus = (Label)flightTab.Controls.Find("lblFlightPlanStatus", true)[0];
                    Label lblNextWpName = (Label)flightTab.Controls.Find("lblNextWpName", true)[0];
                    Label lblNextWpDistance = (Label)flightTab.Controls.Find("lblNextWpDistance", true)[0];
                    Label lblNextWpBearing = (Label)flightTab.Controls.Find("lblNextWpBearing", true)[0];
                    Label lblNextWpEte = (Label)flightTab.Controls.Find("lblNextWpEte", true)[0];

                    lblSpeed.Text = $"Ground Speed: {planeData.groundSpeed:F0} kts";
                    lblAltitude.Text = $"Altitude: {planeData.altitude:F0} ft";
                    lblHeading.Text = $"Heading: {planeData.heading:F0}°";
                    lblWaypoints.Text = $"Waypoints: {waypointCount}";

                    if (gpsActive && !string.IsNullOrWhiteSpace(planeData.gpsWpNextId))
                    {
                        lblNextWpName.Text = $"ID: {planeData.gpsWpNextId}";
                        lblNextWpDistance.Text = $"Distance: {nextWpDistanceNM:F1} nm";
                        lblNextWpBearing.Text = $"Bearing: {planeData.gpsWpBearing:F0}°";

                        int hours = (int)Math.Floor(planeData.gpsWpEte);
                        int minutes = (int)Math.Floor((planeData.gpsWpEte - hours) * 60);
                        if (hours > 0)
                            lblNextWpEte.Text = $"ETE: {hours}h {minutes}m";
                        else
                            lblNextWpEte.Text = $"ETE: {minutes}m";
                    }
                    else
                    {
                        lblNextWpName.Text = "ID: --";
                        lblNextWpDistance.Text = "Distance: -- nm";
                        lblNextWpBearing.Text = "Bearing: --°";
                        lblNextWpEte.Text = "ETE: --";
                    }

                    bool hasFlightPlan = (gpsActive && waypointCount > 0) || (!string.IsNullOrWhiteSpace(planeData.gpsWpNextId) && waypointCount > 0);

                    if (hasFlightPlan && !hasArrived)
                    {
                        lblFlightPlanStatus.Text = "✓ Flight Plan Active";
                        lblFlightPlanStatus.ForeColor = System.Drawing.Color.Green;

                        if (totalDistanceNM > 0)
                        {
                            lblDistance.Text = $"{totalDistanceNM:F1} nm";

                            if (totalEteHours > 0)
                            {
                                int eteHours = (int)Math.Floor(totalEteHours);
                                int eteMinutes = (int)Math.Floor((totalEteHours - eteHours) * 60);

                                if (eteHours > 0)
                                    lblTotalEte.Text = $"ETE: {eteHours}h {eteMinutes}m";
                                else
                                    lblTotalEte.Text = $"ETE: {eteMinutes}m";

                                lblTotalEta.Text = $"ETA: {eta:HH:mm}";
                            }
                            else
                            {
                                lblTotalEte.Text = "ETE: --";
                                lblTotalEta.Text = "ETA: --";
                            }
                        }
                        else
                        {
                            lblDistance.Text = $"{nextWpDistanceNM:F1} nm";
                            totalDistanceNM = nextWpDistanceNM;
                            lblTotalEte.Text = "ETE: --";
                            lblTotalEta.Text = "ETA: --";
                        }

                        if (!alertTriggered && totalDistanceNM > 0 && totalDistanceNM <= alertDistance)
                        {
                            alertTriggered = true;
                            CheckBox chkAutoPause = (CheckBox)flightTab.Controls.Find("chkAutoPause", true)[0];
                            CheckBox chkEmailAlert = (CheckBox)flightTab.Controls.Find("chkEmailAlert", true)[0];

                            if (chkAutoPause.Checked)
                            {
                                simconnect.TransmitClientEvent(0, EVENTS.PAUSE, 1, GROUPID.GROUP0, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
                            }

                            if (chkEmailAlert.Checked && emailEnabled)
                            {
                                try
                                {
                                    SendEmail(smtpEmail, smtpPassword, "🔔 P3D Distance Alert!", $"Distance Alert from P3D Distance Monitor\n\nYou are now {totalDistanceNM:F1} nautical miles from your destination!\n\nCurrent flight info:\n- Next Waypoint: {planeData.gpsWpNextId}\n- Distance to Next WP: {nextWpDistanceNM:F1} nm\n- Ground Speed: {planeData.groundSpeed:F0} kts\n- Altitude: {planeData.altitude:F0} ft\n- Heading: {planeData.heading:F0}°\n\nHappy flying!");
                                }
                                catch { }
                            }

                            MessageBox.Show($"🔔 Distance Alert!\n\nTotal Distance to Destination: {totalDistanceNM:F1} nm\nNext Waypoint: {planeData.gpsWpNextId} ({nextWpDistanceNM:F1} nm)", "Distance Alert", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        }
                    }
                    else if (hasArrived)
                    {
                        lblFlightPlanStatus.Text = "✓ Arrived at Destination";
                        lblFlightPlanStatus.ForeColor = System.Drawing.Color.Green;
                        lblDistance.Text = "0.0 nm";
                        lblTotalEte.Text = "ETE: 0m";
                        lblTotalEta.Text = "ETA: Now";
                        alertTriggered = false;
                    }
                    else
                    {
                        lblFlightPlanStatus.Text = "⚠ No Active Flight Plan - Load GPS Flight Plan";
                        lblFlightPlanStatus.ForeColor = System.Drawing.Color.Orange;
                        lblDistance.Text = "-- nm";
                        lblTotalEte.Text = "ETE: --";
                        lblTotalEta.Text = "ETA: --";
                        alertTriggered = false;
                    }
                }));
            }
            else if (data.dwRequestID == (uint)DATA_REQUESTS.REQUEST_AUTOPILOT)
            {
                AutopilotData apData = (AutopilotData)data.dwData[0];

                apMaster = apData.apMaster > 0.5;
                apAltitude = apData.apAltitudeLock > 0.5;
                apHeading = apData.apHeadingLock > 0.5;
                apVS = apData.apVSLock > 0.5;
                apSpeed = apData.apSpeedLock > 0.5;
                apApproach = apData.approachHold > 0.5;
                apThrottle = apData.apAutothrottle > 0.5;
                apLoc = apData.apLocHold > 0.5;
                apIls = apData.apIlsHold > 0.5;
                gearDown = apData.gearHandlePosition > 0.5;
                flapsPosition = apData.flapsHandlePercent;
                speedbrakeDeployed = apData.spoilerHandlePosition > 0.5;
                parkingBrakeSet = apData.brakeParkingPosition > 0.5;
                isSimPaused = apData.simPaused > 0.5;

                SendAutopilotStateToMobile();
            }
            else if (data.dwRequestID == (uint)DATA_REQUESTS.REQUEST_AI)
            {
                AIData aiData = (AIData)data.dwData[0];

                if (Math.Abs(aiData.latitude - userLat) < 0.0001 &&
                    Math.Abs(aiData.longitude - userLon) < 0.0001 &&
                    Math.Abs(aiData.altitude - userAltitude) < 100 &&
                    Math.Abs(aiData.groundSpeed - userSpeed) < 5)
                    return;

                double distance = CalculateDistance(userLat, userLon, aiData.latitude, aiData.longitude);

                lock (aiAircraft)
                {
                    if (data.dwentrynumber == 1)
                    {
                        aiAircraft.Clear();
                    }

                    var existingAircraft = aiAircraft.FirstOrDefault(a =>
                        (a.AtcId == aiData.atcId && !string.IsNullOrWhiteSpace(aiData.atcId)) ||
                        (a.Title == aiData.title && string.IsNullOrWhiteSpace(aiData.atcId)));

                    if (existingAircraft != null)
                    {
                        existingAircraft.Latitude = aiData.latitude;
                        existingAircraft.Longitude = aiData.longitude;
                        existingAircraft.Altitude = aiData.altitude;
                        existingAircraft.Heading = aiData.heading;
                        existingAircraft.GroundSpeed = aiData.groundSpeed;
                        existingAircraft.DistanceFromUser = distance;
                        existingAircraft.DepartureAirport = aiData.departureAirport;
                        existingAircraft.DestinationAirport = aiData.destinationAirport;
                    }
                    else
                    {
                        aiAircraft.Add(new AircraftInfo
                        {
                            Latitude = aiData.latitude,
                            Longitude = aiData.longitude,
                            Altitude = aiData.altitude,
                            Heading = aiData.heading,
                            GroundSpeed = aiData.groundSpeed,
                            Title = aiData.title,
                            AtcType = aiData.atcType,
                            AtcModel = aiData.atcModel,
                            AtcId = aiData.atcId,
                            AtcAirline = aiData.atcAirline,
                            AtcFlightNumber = aiData.atcFlightNumber,
                            DistanceFromUser = distance,
                            DepartureAirport = aiData.departureAirport,
                            DestinationAirport = aiData.destinationAirport
                        });
                    }
                }

                this.Invoke(new Action(() =>
                {
                    if (data.dwoutof == data.dwentrynumber)
                    {
                        lock (aiAircraft)
                        {
                            lstNearbyAircraft.Items.Clear();

                            var uniqueAircraft = aiAircraft
                                .GroupBy(a => a.AtcId ?? a.Title)
                                .Select(g => g.First())
                                .OrderBy(a => a.DistanceFromUser)
                                .Take(20);

                            foreach (var ac in uniqueAircraft)
                            {
                                string callsign = string.IsNullOrWhiteSpace(ac.AtcId) ? ac.Title : ac.AtcId;
                                lstNearbyAircraft.Items.Add($"{callsign} ({ac.DistanceFromUser:F1}nm)");
                            }

                            // Send AI traffic to mobile clients
                            var aiTraffic = aiAircraft.Select(ac => new {
                                callsign = ac.AtcId ?? ac.Title,
                                latitude = ac.Latitude,
                                longitude = ac.Longitude,
                                altitude = ac.Altitude,
                                speed = ac.GroundSpeed
                            }).ToList();
                            
                            SendToMobileClients(new { type = "ai_traffic", aircraft = aiTraffic });
                        }
                    }
                }));
            }
        }

        private double CalculateDistance(double lat1, double lon1, double lat2, double lon2)
        {
            double R = 3440.065;
            double dLat = (lat2 - lat1) * Math.PI / 180.0;
            double dLon = (lon2 - lon1) * Math.PI / 180.0;
            double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                      Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0) *
                      Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            double c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
            return R * c;
        }

        private void TxtAlertDistance_TextChanged(object sender, EventArgs e)
        {
            TextBox txt = (TextBox)sender;
            if (double.TryParse(txt.Text, out double value) && value > 0)
            {
                alertDistance = value;
                alertTriggered = false;
            }
        }

        private void BtnEmailSettings_Click(object sender, EventArgs e)
        {
            Form emailForm = new Form
            {
                Text = "Email Notification Settings",
                Size = new System.Drawing.Size(470, 280),
                StartPosition = FormStartPosition.CenterParent,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false,
                MinimizeBox = false
            };

            Label lblInfo = new Label
            {
                Text = "Configure email notifications for distance alerts.\nYou'll need a Gmail account with an App Password.",
                Location = new System.Drawing.Point(20, 20),
                Size = new System.Drawing.Size(420, 40),
                Font = new System.Drawing.Font("Arial", 9)
            };
            emailForm.Controls.Add(lblInfo);

            LinkLabel linkAppPassword = new LinkLabel
            {
                Text = "How to create Gmail App Password",
                Location = new System.Drawing.Point(20, 65),
                Size = new System.Drawing.Size(420, 20),
                Font = new System.Drawing.Font("Arial", 9)
            };
            linkAppPassword.LinkClicked += (s, ev) =>
            {
                System.Diagnostics.Process.Start("https://support.google.com/accounts/answer/185833");
            };
            emailForm.Controls.Add(linkAppPassword);

            Label lblEmail = new Label
            {
                Text = "Your Gmail Address:",
                Location = new System.Drawing.Point(20, 100),
                Size = new System.Drawing.Size(140, 20)
            };
            emailForm.Controls.Add(lblEmail);

            TextBox txtEmail = new TextBox
            {
                Location = new System.Drawing.Point(170, 98),
                Size = new System.Drawing.Size(270, 25),
                Text = smtpEmail
            };
            emailForm.Controls.Add(txtEmail);

            Label lblPassword = new Label
            {
                Text = "App Password:",
                Location = new System.Drawing.Point(20, 135),
                Size = new System.Drawing.Size(140, 20)
            };
            emailForm.Controls.Add(lblPassword);

            TextBox txtPassword = new TextBox
            {
                Location = new System.Drawing.Point(170, 133),
                Size = new System.Drawing.Size(270, 25),
                PasswordChar = '*',
                Text = smtpPassword
            };
            emailForm.Controls.Add(txtPassword);

            Label lblNote = new Label
            {
                Text = "Alerts will be sent to your Gmail address.",
                Location = new System.Drawing.Point(20, 170),
                Size = new System.Drawing.Size(420, 35),
                Font = new System.Drawing.Font("Arial", 8),
                ForeColor = System.Drawing.Color.Gray
            };
            emailForm.Controls.Add(lblNote);

            Button btnTest = new Button
            {
                Text = "Test Email",
                Location = new System.Drawing.Point(180, 210),
                Size = new System.Drawing.Size(100, 30)
            };
            btnTest.Click += (s, ev) =>
            {
                if (string.IsNullOrWhiteSpace(txtEmail.Text) || string.IsNullOrWhiteSpace(txtPassword.Text))
                {
                    MessageBox.Show("Please fill in all fields.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                try
                {
                    SendEmail(txtEmail.Text, txtPassword.Text, "P3D Distance Monitor - Test", "This is a test email from P3D Distance Monitor. Your email notifications are configured correctly!");
                    MessageBox.Show("Test email sent successfully! Check your inbox.", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Failed to send email:\n\n{ex.Message}\n\nMake sure you're using an App Password, not your regular Gmail password.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };
            emailForm.Controls.Add(btnTest);

            Button btnSave = new Button
            {
                Text = "Save",
                Location = new System.Drawing.Point(290, 210),
                Size = new System.Drawing.Size(80, 30)
            };
            btnSave.Click += (s, ev) =>
            {
                smtpEmail = txtEmail.Text;
                smtpPassword = txtPassword.Text;
                emailEnabled = !string.IsNullOrWhiteSpace(smtpEmail) && !string.IsNullOrWhiteSpace(smtpPassword);

                SaveEmailSettings();

                CheckBox chkEmailAlert = (CheckBox)tabControl.TabPages[0].Controls.Find("chkEmailAlert", true)[0];
                chkEmailAlert.Enabled = emailEnabled;
                if (emailEnabled)
                {
                    chkEmailAlert.Checked = true;
                }

                MessageBox.Show("Email settings saved!", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
                emailForm.Close();
            };
            emailForm.Controls.Add(btnSave);

            Button btnCancel = new Button
            {
                Text = "Cancel",
                Location = new System.Drawing.Point(380, 210),
                Size = new System.Drawing.Size(70, 30)
            };
            btnCancel.Click += (s, ev) => emailForm.Close();
            emailForm.Controls.Add(btnCancel);

            emailForm.ShowDialog(this);
        }

        private void SendEmail(string fromEmail, string appPassword, string subject, string body)
        {
            using (MailMessage mail = new MailMessage())
            {
                mail.From = new MailAddress(fromEmail);
                mail.To.Add(fromEmail);
                mail.Subject = subject;
                mail.Body = body;
                mail.IsBodyHtml = false;

                using (SmtpClient smtp = new SmtpClient("smtp.gmail.com", 587))
                {
                    smtp.Credentials = new NetworkCredential(fromEmail, appPassword);
                    smtp.EnableSsl = true;
                    smtp.Send(mail);
                }
            }
        }

        protected override void DefWndProc(ref Message m)
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
                base.DefWndProc(ref m);
            }
        }

        private void CloseConnection()
        {
            if (simconnect != null)
            {
                updateTimer.Enabled = false;
                try
                {
                    simconnect.Dispose();
                }
                catch { }
                simconnect = null;
                isConnected = false;
            }
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            connectionTimer.Enabled = false;
            CloseConnection();

            if (bufferedGraphics != null)
            {
                bufferedGraphics.Dispose();
            }

            lock (tileCache)
            {
                foreach (var tile in tileCache.Values)
                {
                    tile?.Dispose();
                }
                tileCache.Clear();
            }

            liveMapUpdateTimer?.Dispose();
            
            if (wsServer != null)
            {
                wsServer.Stop();
            }
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    public class WebSocketSession : WebSocketBehavior
    {
        private MainForm parentForm;

        public WebSocketSession(MainForm form)
        {
            parentForm = form;
        }

        protected override void OnOpen()
        {
            Console.WriteLine($"WebSocket connection opened: {ID}");
        }

        protected override void OnMessage(MessageEventArgs e)
        {
            parentForm.HandleMobileMessage(this, e.Data);
        }

        protected override void OnClose(CloseEventArgs e)
        {
            parentForm.UnregisterMobileClient(ID);
            Console.WriteLine($"WebSocket connection closed: {ID}");
        }

        protected override void OnError(ErrorEventArgs e)
        {
            Console.WriteLine($"WebSocket error: {e.Message}");
        }
    }
}
