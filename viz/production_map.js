const width = 1200;
const height = 800;

var svg = d3.select("#my_map")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("border", "1px solid black");

// Map and projection
var projection = d3.geoAlbersUsa()
    .scale(2500)
    .translate([500, 500]);

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
    d3.json("backgrounds/states.geojson"), // Load state boundaries GeoJSON
    d3.json("backgrounds/counties.geojson"), // Load county boundaries GeoJSON
    d3.json("backgrounds/all_states.geojson"),
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

/*
    // Draw base light grey filled counties
    baseCountiesGroup.selectAll("path")
        .data(countiesData.features)
        .enter().append("path")
        .attr("fill", "white")  // Light grey fill
        .attr("d", path); 
*/
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
function updateInfoBox(countyName, stateName, year, production) {
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
        .attr("dy", "1.4em")  // Line spacing
        .text(`County: ${countyName}`);

    countyInfoText.append("tspan")
        .attr("x", width - 210)
        .attr("dy", "1.4em")  // Line spacing
        .text(`State: ${stateName}`);

    countyInfoText.append("tspan")
        .attr("x", width - 210)
        .attr("dy", "1.4em")  // Line spacing
        .text(`Year: ${year}`);

    countyInfoText.append("tspan")
        .attr("x", width - 210)
        .attr("dy", "1.4em")  // Line spacing
        .text(`5-Year Avg Prod: ${production}`);
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
                return avg !== null && avg !== undefined ? colorScale(avg) : "white"; // If no data, grey
            })


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
                const countyName = d.properties.county_name || 'No name available';
                const stateName = d.properties.state_name || 'No state available';
                const year = d.properties.Year || 'No year available';
                const production = d.properties.fiveyr_rolling_avg || 'No data available';

                // Update the information box (text inside the SVG or div)
                updateInfoBox(countyName, stateName, year, production)


                // Optionally, you could zoom to the clicked county (if desired)
                zoomToCounty(event, d);
            })
            .transition()
            .duration(750)
            .style("opacity", 1) // Fade in
            .attr("fill", d => {
                // Check if fiveyr_rolling_avg exists and is a valid number
                const avg = d.properties.fiveyr_rolling_avg;
                return avg !== null && avg !== undefined ? colorScale(avg) : "white"; // If no data, grey
            });

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
        // Calculate new transform
        const transform = event.transform;

        // Restrict panning to map bounds
        const scale = transform.k; // Current zoom level
        const [width, height] = [svg.attr("width"), svg.attr("height")];
        const mapWidth = 1000;  // Replace with your map's width
        const mapHeight = 600;  // Replace with your map's height

        const tx = Math.min(0, Math.max(transform.x, width - mapWidth * scale));
        const ty = Math.min(0, Math.max(transform.y, height - mapHeight * scale));

        // Apply the constrained transform
        const constrainedTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);

        // Apply transform to all map layers
        baseCountiesGroup.attr("transform", constrainedTransform);
        choroplethGroup.attr("transform", constrainedTransform);
        countiesGroup.attr("transform", constrainedTransform);
        statesGroup.attr("transform", constrainedTransform);
    });

// Attach the zoom behavior to the SVG
svg.call(zoom);

function createVerticalLegend() {
    // Set up smaller legend dimensions
    const legendWidth = 150;  // Smaller width
    const legendHeight = 190; // Increased height to accommodate extra category
    const legendItemHeight = 15; // Height for each legend item
    const legendSpacing = 5; // Spacing between items
    const titleHeight = 20; // Space for the title

    // Create a group element for the legend
    const legendGroup = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${width - legendWidth - 20}, 20)`); // Position legend in the top-right corner

    // Add a background for the legend
    legendGroup.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .attr("fill", "rgba(255, 255, 255, 0.9)")
        .attr("stroke", "black")
        .attr("stroke-width", 1);

    // Add title for the legend
    legendGroup.append("text")
        .attr("x", legendWidth / 2)
        .attr("y", titleHeight / 2 + 5)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-family", "Arial, sans-serif")
        .style("font-weight", "bold")
        .text("Legend Title"); // Replace with your legend title

    // Define legend labels (including the new "No Data" label)
    const legendLabels = [
        "0 - 10M",
        "10M - 20M",
        "20M - 30M",
        "30M - 40M",
        "40M - 50M",
        "50M - 60M",
        "> 60M",
        "No Data"
    ];

    // Define colors for the legend (add white for "No Data")
    const legendColors = [...d3.schemeGreens[7], "white"];

    // Add legend items
    legendLabels.forEach((label, index) => {
        const legendItem = legendGroup.append("g")
            .attr("transform", `translate(10, ${25 + index * (legendItemHeight + legendSpacing)})`);

        // Add colored rectangle for each legend item
        legendItem.append("rect")
            .attr("width", 15)
            .attr("height", legendItemHeight)
            .attr("fill", legendColors[index])
            .attr("stroke", "black")
            .attr("stroke-width", 0.5);

        // Add label for each legend item
        legendItem.append("text")
            .attr("x", 20)
            .attr("y", legendItemHeight / 2)
            .attr("dy", "0.35em") // Center the text vertically
            .style("font-size", "12px")
            .style("font-family", "Arial, sans-serif")
            .text(label);
    });
}


// Call the createVerticalLegend function after the map is initialized
createVerticalLegend();




