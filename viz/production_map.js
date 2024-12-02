const width = 1000;
const height = 600;

var svg = d3.select("#my_map")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("border", "1px solid black");

// Map and projection
var projection = d3.geoAlbersUsa()
    .scale(2500)
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
    d3.json("all_states.geojson"),
    d3.json("output_data/output_1980.geojson") // Load data for the first year
]).then(([statesData, countiesData, USAData, data]) => {
    geojsonData = data; // Store the full data for later use

    // Extract unique years from the data
    for (let year = 1980; year <= 2023; year++) {
        years.push(year);
    }

    // Draw the base layers (only once)
    drawBaseLayers(statesData, countiesData, USAData);

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
                    clearInterval(playInterval);  // Stop the interval when we reach the last year
                    currentYearIndex = 0;
                    playInterval = null;
                    this.textContent = "Play";  // Reset button text to Play
                }
            }, 1000); // Update every second (1000 ms)
            this.textContent = "Pause";  // Change button text to Pause
        }
    });
    
});

// Function to draw the base layers on the map
function drawBaseLayers(statesData, countiesData, USAData) {

    // 1. Add the USA-wide map as the base layer
    baseCountiesGroup.selectAll("path.usa")
        .data(USAData.features)
        .enter().append("path")
        .attr("class", "usa")  // Assign class for styling
        .attr("fill", "grey")  // Light grey or any color you want
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .attr("d", path);

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

let infoBox = svg.append("g")
    .attr("class", "info-box")
    .attr("transform", "translate(0, 0)");

infoBox.append("rect")
    .attr("x", width - 220)
    .attr("y", height - 120)
    .attr("width", 200)
    .attr("height", 100)
    .attr("fill", "rgba(255, 255, 255, 0.9)")
    .attr("stroke", "black")
    .attr("stroke-width", 1);

let countyInfoText = infoBox.append("text")
    .attr("x", width - 210)
    .attr("y", height - 100)
    .attr("font-size", "12px")
    .attr("fill", "black")
    .style("pointer-events", "none")
    .style("font-family", "Arial, sans-serif");

// Update the information box with proper line breaks
function updateInfoBox(countyName, year, production) {
    countyInfoText
        .selectAll("*").remove();  // Remove any existing text
    
        // Append the title
    countyInfoText.append("tspan")
        .attr("x", width - 210)
        .attr("dy", "0em")  // Line spacing
        .attr("font-size", "16px")
        .attr("font-weight", "bold")  // Make the title bold
        .text("County Info");

    countyInfoText.append("tspan")
        .attr("x", width - 210)
        .attr("dy", "1.2em")  // Line spacing
        .text(`County: ${countyName}`);

    countyInfoText.append("tspan")
        .attr("x", width - 210)
        .attr("dy", "1.2em")  // Line spacing
        .text(`Year: ${year}`);

    countyInfoText.append("tspan")
        .attr("x", width - 210)
        .attr("dy", "1.2em")  // Line spacing
        .text(`5-Year Avg: ${production}`);
}

let lastClickedCounty = null;  // Store the last clicked county

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
            .attr("fill", d => {
                // Check if fiveyr_rolling_avg exists and is a valid number
                const avg = d.properties.fiveyr_rolling_avg;
                return avg !== null && avg !== undefined ? colorScale(avg) : "grey"; // If no data, grey
            })
            .select("title")
            .text(d => 
                `County ID: ${d.properties.id}\nYear: ${d.properties.Year}\nProduction: ${d.properties.fiveyr_rolling_avg || 'No Data'}`
            );

        // Add new paths (if any)
        paths.enter()
            .append("path")
            .attr("fill", "grey") // Start with grey for counties with no data
            .attr("d", path)
            .style("opacity", 0) // Initially invisible
            .on("click", function(event, d) {
                // Reset the border of the previously clicked county
                if (lastClickedCounty) {
                    lastClickedCounty.style("stroke", null).style("stroke-width", null);
                    lastClickedCounty.style("fill", null);

                }

                // Set the border color to orange on the clicked county
                d3.select(this).style("stroke", "orange").style("stroke-width", 3);
                d3.select(this).style("fill", "orange");

                // Store the current clicked county
                lastClickedCounty = d3.select(this);

                // Update the information box (text inside the SVG)
                const countyName = d.properties.id || 'No name available';
                const year = d.properties.Year || 'No year available';
                const production = d.properties.fiveyr_rolling_avg || 'No data available';

                // Update the information box (text inside the SVG or div)
                updateInfoBox(countyName, year, production)


                // Optionally, you could zoom to the clicked county (if desired)
                zoomToCounty(event, d);
            })
            .transition()
            .duration(750)
            .style("opacity", 1) // Fade in
            .attr("fill", d => {
                // Check if fiveyr_rolling_avg exists and is a valid number
                const avg = d.properties.fiveyr_rolling_avg;
                return avg !== null && avg !== undefined ? colorScale(avg) : "grey"; // If no data, grey
            })
            .selection() // End the transition to allow appending
            .append("title") // Append title to the path elements
            .text(d => 
                `County ID: ${d.properties.id}\nYear: ${d.properties.Year}\nProduction: ${d.properties.fiveyr_rolling_avg || 'No Data'}`
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

// Zoom Function
function zoomToCounty(event, d) {
    const [[x0, y0], [x1, y1]] = path.bounds(d); // Get bounding box of the clicked county
    const width = svg.node().getBoundingClientRect().width; // Get SVG dimensions
    const height = svg.node().getBoundingClientRect().height;

    const scale = Math.min(2, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height)); // Scale factor
    const translate = [(width - scale * (x0 + x1)) / 2, (height - scale * (y0 + y1)) / 2]; // Center translation

    svg.transition()
        .duration(750) // Smooth transition
        .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)); // Apply transform
}

// Set up Zoom Behavior
const zoom = d3.zoom()
    .scaleExtent([1, 10]) // Allow zoom between 1x and 10x
    .on("zoom", event => {
        // Apply the zoom transform to all map layers
        baseCountiesGroup.attr("transform", event.transform);
        choroplethGroup.attr("transform", event.transform);
        countiesGroup.attr("transform", event.transform);
        statesGroup.attr("transform", event.transform);
    });

svg.call(zoom); // Apply zoom behavior to the entire SVG// Function to create the vertical discrete color scale legend with a title and background
function createVerticalLegend() {
    // Set up smaller legend dimensions
    const legendWidth = 150;  // Smaller width
    const legendHeight = 120; // Smaller height
    const legendItemHeight = 15; // Smaller height for each legend item
    const legendItemSpacing = 18; // Adjust spacing to fit items in the smaller legend

    // Define the ticks based on the color scale domain
    const ticks = colorScale.domain();

    // Calculate the top-right position
    const margin = 20; // Margin from the right and top
    const legendX = width - legendWidth - margin; // Position from the right
    const legendY = margin; // Position from the top

    // Append a group for the legend and position it in the top-right corner of the map
    const legendGroup = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${legendX}, ${legendY})`);

    // Add a background rectangle for the legend
    legendGroup.append("rect")
        .attr("class", "legend-background")
        .attr("x", -5)
        .attr("y", -5)
        .attr("width", legendWidth+5)  // Set width for the background
        .attr("height", legendHeight + 30)  // Set height for the background
        .attr("fill", "grey")  // Set background color (white in this case)
        .attr("stroke", "#000000")  // Add a border around the background (black)
        .attr("stroke-width", 1);  // Border width

    // Add title to the legend
    legendGroup.append("text")
        .attr("class", "legend-title")
        .attr("x", 0)
        .attr("y", 10)  // Position the title above the first legend item
        .attr("font-weight", "bold")
        .attr("font-size", "14px")
        .text("Corn Production");  // You can change this to any title you want

    // Add color rectangles for each category (vertical alignment)
    legendGroup.selectAll(".legend-item")
        .data(ticks)
        .enter().append("rect")
        .attr("class", "legend-item")
        .attr("x", 0) // All color boxes start at x=0
        .attr("y", (d, i) => i * legendItemSpacing + 20) // Space out the categories vertically and adjust for title
        .attr("width", legendItemHeight) // Fixed width for each legend item (the color box)
        .attr("height", legendItemHeight) // Fixed height for each color box
        .style("fill", d => colorScale(d)); // Set color according to the color scale

    // Add labels for the legend items (to the right of the color box)
    legendGroup.selectAll(".legend-label")
        .data(ticks)
        .enter().append("text")
        .attr("class", "legend-label")
        .attr("x", legendItemHeight + 5) // Place label 5px to the right of the color box
        .attr("y", (d, i) => i * legendItemSpacing + legendItemHeight / 2 + 20) // Align vertically with the color box and adjust for title
        .attr("dy", ".35em") // Vertically center the label
        .text(d => `Category: ${d}`) // Label to show the threshold value for each category
        .style("font-size", "12px");
}

// Call the createVerticalLegend function after the map is initialized
createVerticalLegend();




