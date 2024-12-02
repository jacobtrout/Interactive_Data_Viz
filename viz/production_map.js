const width = 1000;
const height = 600;

var svg = d3.select("#my_map")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("border", "1px solid black");

// Map and projection
var projection = d3.geoAlbersUsa()
    .scale(2250)
    .translate([400, 450]);

var path = d3.geoPath().projection(projection);

var colorScale = d3.scaleThreshold()
    .domain([0, 10000000, 20000000, 30000000, 40000000, 50000000, 60000000]) // Adjust for your data range
    .range(d3.schemeGreens[7]);  // Adjust number of colors


let geojsonData; // To store the full GeoJSON data

// Create groups for each layer (order matters)
const baseCountiesGroup = svg.append("g").attr("class", "base-counties");
const choroplethGroup = svg.append("g").attr("class", "choropleth");
const countiesGroup = svg.append("g").attr("class", "counties");
const statesGroup = svg.append("g").attr("class", "states");

let years = [];

// Load the state and county boundary data
Promise.all([
    d3.json("states.geojson"), // Load state boundaries GeoJSON
    d3.json("counties.geojson"), // Load county boundaries GeoJSON
    d3.json("output_data/output_1980.geojson") // Load data for the first year
]).then(([statesData, countiesData, data]) => {
    geojsonData = data; // Store the full data for later use

    // Extract unique years from the data
    for (let year = 1980; year <= 2023; year++) {
        years.push(year);
    }

    // Draw the base layers (only once)
    drawBaseLayers(statesData, countiesData);

    // Initialize the map with the first year
    updateMap(years[0]);

    // Set slider values for the years
    const slider = d3.select("#timeSlider")
        .attr("min", 0)
        .attr("max", years.length - 1)
        .property("value", 0);  // Use .property for dynamic value binding

    // Display the year
    const timeDisplay = d3.select("#timeDisplay");
    timeDisplay.text(`Year: ${years[0]}`);

    // Handle year selection via slider
    slider.on("input", function(e) {
        const selectedIndex = +e.target.value;
        const selectedYear = years[selectedIndex];
        updateMap(selectedYear);
        timeDisplay.text(`Year: ${selectedYear}`);
    });

    // Play button functionality
    let playInterval;
    let currentYearIndex = 0;

    d3.select("#playPause").on("click", function() {
        // Toggle play/pause
        if (playInterval) {
            clearInterval(playInterval);  // Stop animation
            playInterval = null;
            this.textContent = "Play";  // Change button text to Play
        } else {
            playInterval = setInterval(() => {
                // Update the slider and map
                const selectedYear = years[currentYearIndex];
                slider.property("value", currentYearIndex);  // Dynamically update slider value
                updateMap(selectedYear);
                timeDisplay.text(`Year: ${selectedYear}`);

                // Move to the next year
                currentYearIndex++;
                if (currentYearIndex >= years.length) {
                    clearInterval(playInterval);
                    playInterval = null;
                    d3.select("#playPause").text("Play");
                }
            }, 500); // Update every second (1000 ms)
            this.textContent = "Pause";  // Change button text to Pause
        }
    });
});

// Function to draw the base layers on the map
function drawBaseLayers(statesData, countiesData) {
    // Draw base light grey filled counties
    baseCountiesGroup.selectAll("path")
        .data(countiesData.features)
        .enter().append("path")
        .attr("fill", "grey")  // Light grey fill
        .attr("d", path);

    // Draw county boundaries
    countiesGroup.selectAll("path")
        .data(countiesData.features)
        .enter().append("path")
        .attr("fill", "none")
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .attr("d", path);

    // Draw state boundaries
    statesGroup.selectAll("path")
        .data(statesData.features)
        .enter().append("path")
        .attr("fill", "none")
        .attr("stroke", "black")
        .attr("stroke-width", 3)
        .attr("d", path);
}

function updateMap(selectedYear) {
    // Load the GeoJSON file for the selected year
    const fileName = `output_data/output_${selectedYear}.geojson`;

    d3.json(fileName).then(data => {
        // Bind new data to the choropleth paths
        const paths = choroplethGroup.selectAll("path")
            .data(data.features, d => d.properties.id); // Use unique property for data binding

        // Update existing paths
        paths.transition()
            .duration(750) // Smooth transition for fade-in effect
            .attr("fill", d => colorScale(d.properties.fiveyr_rolling_avg))
            .select("title")
            .text(d => 
                `County ID: ${d.properties.id}\nYear: ${d.properties.Year}\nProduction: ${d.properties.fiveyr_rolling_avg}`
            );

        // Add new paths (if any)
        paths.enter()
            .append("path")
            .attr("fill", "grey") // Start with a neutral color for fade-in effect
            .attr("d", path)
            .style("opacity", 0) // Initially invisible
            .transition()
            .duration(750)
            .style("opacity", 1) // Fade in
            .attr("fill", d => colorScale(d.properties.fiveyr_rolling_avg))
            .selection() // End the transition to allow appending
            .append("title") // Append title to the path elements
            .text(d => 
                `County ID: ${d.properties.id}\nYear: ${d.properties.Year}\nProduction: ${d.properties.fiveyr_rolling_avg}`
            );

        // Remove paths that are no longer needed
        paths.exit()
            .transition()
            .duration(750)
            .style("opacity", 0) // Fade out
            .remove();
    }).catch(error => {
        console.error("Error loading the GeoJSON file:", error);
    });
}

