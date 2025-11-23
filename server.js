        function updateUserAircraftDetails() {
            const detailsPanel = document.getElementById('aircraftDetails');
            if (!detailsPanel) return;
            
            // Use the same data fields as AI aircraft for consistency
            const callsign = currentFlightData.atcId || "Your Aircraft";
            const flightInfo = (currentFlightData.atcAirline && currentFlightData.atcFlightNumber) 
                ? currentFlightData.atcAirline + " " + currentFlightData.atcFlightNumber 
                : currentFlightData.atcAirline || "";
            const routeInfo = (currentFlightData.userDepartureAirport && currentFlightData.userDestinationAirport) 
                ? currentFlightData.userDepartureAirport + " → " + currentFlightData.userDestinationAirport 
                : (currentFlightData.userDestinationAirport ? "To " + currentFlightData.userDestinationAirport : "");
            
            detailsPanel.innerHTML = \`
                <h4 style="margin-top:0">\${callsign}</h4>
                \${flightInfo ? \`<p><strong>Flight:</strong> \${flightInfo}</p>\` : ""}
                <p><strong>Aircraft:</strong> \${currentFlightData.atcType || 'User Aircraft'}</p>
                \${routeInfo ? \`<p><strong>Route:</strong> \${routeInfo}</p>\` : ""}
                <div class="detail-row">
                    <span class="detail-label">Departure:</span>
                    <span class="detail-value">\${currentFlightData.userDepartureAirport || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Destination:</span>
                    <span class="detail-value">\${currentFlightData.userDestinationAirport || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Speed:</span>
                    <span class="detail-value">\${Math.round(currentFlightData.groundSpeed || 0)} kts</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Altitude:</span>
                    <span class="detail-value">\${Math.round(currentFlightData.altitude || 0)} ft</span>
                </div>
            \`;
        }

        function updateAircraftDetails(aircraft) {
            const detailsPanel = document.getElementById('aircraftDetails');
            if (!detailsPanel) return;
            
            let callsign = aircraft.atcId || "N/A";
            let flightInfo = "";
            if (aircraft.atcAirline && aircraft.atcFlightNumber) {
                flightInfo = aircraft.atcAirline + " " + aircraft.atcFlightNumber;
            } else if (aircraft.atcAirline) {
                flightInfo = aircraft.atcAirline;
            }
            
            let routeInfo = "";
            if (aircraft.departureAirport && aircraft.destinationAirport) {
                routeInfo = aircraft.departureAirport + " → " + aircraft.destinationAirport;
            } else if (aircraft.destinationAirport) {
                routeInfo = "To " + aircraft.destinationAirport;
            }
            
            detailsPanel.innerHTML = \`
                <h4 style="margin-top:0">\${callsign}</h4>
                \${flightInfo ? \`<p><strong>Flight:</strong> \${flightInfo}</p>\` : ""}
                <p><strong>Aircraft:</strong> \${aircraft.atcModel || aircraft.atcType || aircraft.title}</p>
                \${routeInfo ? \`<p><strong>Route:</strong> \${routeInfo}</p>\` : ""}
                <div class="detail-row">
                    <span class="detail-label">Departure:</span>
                    <span class="detail-value">\${aircraft.departureAirport || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Destination:</span>
                    <span class="detail-value">\${aircraft.destinationAirport || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Speed:</span>
                    <span class="detail-value">\${Math.round(aircraft.groundSpeed)} kts</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Altitude:</span>
                    <span class="detail-value">\${Math.round(aircraft.altitude)} ft</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Distance:</span>
                    <span class="detail-value">\${aircraft.distanceFromUser.toFixed(1)} nm</span>
                </div>
            \`;
        }
