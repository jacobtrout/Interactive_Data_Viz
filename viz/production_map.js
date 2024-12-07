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
            }, 500); // Update every second (1000 ms)
            this.textContent = "Pause";  // Change button text to Pause
        }
    });
    
    // Add this with your other button handlers
    d3.select("#resetZoom").on("click", function() {
        svg.transition()
            .duration(750)
            .call(zoom.transform, d3.zoomIdentity);
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
function updateInfoBox(countyName, stateName, year, production, yield) {
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

    countyInfoText.append("tspan")
        .attr("x", width - 210)
        .attr("dy", "1.4em")  // Line spacing
        .text(`5-Year Avg Yield: ${yield}`);

}

let lastClickedCounty = null;  // Store the last clicked county

function updateMap(selectedYear) {
    const fileName = `output_data/output_${selectedYear}.geojson`;
    
    d3.json(fileName).then(data => {
        // Add detailed data inspection
        console.log(`Year ${selectedYear} - Sample Feature Properties:`, 
            data.features.slice(0, 3).map(f => ({
                id: f.properties.id,
                county: f.properties.county_name,
                state: f.properties.state_name,
                production: f.properties.rolling_avg_production,
                yield: f.properties.rolling_yield,
                rawProperties: f.properties
            }))
        );

        // Rest of your existing validation
        const nonNullValues = data.features.filter(f => 
            f.properties.rolling_avg_production !== null && 
            f.properties.rolling_avg_production !== undefined &&
            !isNaN(f.properties.rolling_avg_production)
        );
        
        console.log(`Year ${selectedYear}:`, {
            totalFeatures: data.features.length,
            featuresWithData: nonNullValues.length,
            sampleValues: nonNullValues.slice(0, 3).map(f => f.properties.rolling_avg_production)
        });

        // Update existing paths with better error handling
        const paths = choroplethGroup.selectAll("path")
            .data(data.features, d => d.properties.id);

        // Update existing paths
        paths
            .transition()
            .duration(750)
            .attr("fill", d => {
                const avg = d.properties.rolling_avg_production;
                if (avg === null || avg === undefined || isNaN(avg) || avg === 0) {
                    return "white";
                }
                return colorScale(avg);
            });

        // Add new paths
        paths.enter()
            .append("path")
            .attr("fill", "white")
            .attr("d", path)
            .style("opacity", 0)
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
                const year = d.properties.year || 'No year available';
                const production = d.properties.rolling_avg_production || 'No data available';
                const yield = d.properties.rolling_yield || 'No data available';

                // Update the information box (text inside the SVG or div)
                updateInfoBox(countyName, stateName, year, production, yield)
                
                // Optionally, you could zoom to the clicked county (if desired)
                zoomToCounty(event, d);
            })
            .transition()
            .duration(750)
            .style("opacity", 1)
            .attr("fill", d => {
                const avg = d.properties.rolling_avg_production;
                if (avg === null || avg === undefined || isNaN(avg) || avg === 0) {
                    return "white";
                }
                return colorScale(avg);
            });

        // Remove old paths
        paths.exit()
            .transition()
            .duration(750)
            .style("opacity", 0)
            .remove();

    }).catch(error => {
        console.error(`Error loading data for year ${selectedYear}:`, error);
    });
}

// Set up Zoom Behavior
const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height]])
    .extent([[0, 0], [width, height]])
    .on("zoom", event => {
        // Get the current transform
        const transform = event.transform;
        
        // Clamp the x and y translations to keep the map in view
        transform.x = Math.min(0, Math.max(width * (1 - transform.k), transform.x));
        transform.y = Math.min(0, Math.max(height * (1 - transform.k), transform.y));
        
        // Apply the clamped transform to map layers only (exclude info box)
        const layers = [baseCountiesGroup, choroplethGroup, countiesGroup, statesGroup];
        layers.forEach(layer => layer.attr("transform", transform));
        
        // Remove this line to keep info box stationary
        // infoBox.attr("transform", `translate(${transform.x}, ${transform.y})`);
    });

// Function to reset zoom
function resetZoom() {
    svg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity);
}

// Modify zoomToCounty function to respect bounds
function zoomToCounty(event, d) {
    const bounds = path.bounds(d);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    
    // Calculate the scale and translate
    const scale = Math.min(4, 0.9 / Math.max(dx / width, dy / height));
    
    // Calculate the translation while respecting bounds
    let translate = [width / 2 - scale * x, height / 2 - scale * y];
    translate[0] = Math.min(0, Math.max(width * (1 - scale), translate[0]));
    translate[1] = Math.min(0, Math.max(height * (1 - scale), translate[1]));
    
    svg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity
            .translate(translate[0], translate[1])
            .scale(scale));
}

// Make sure to attach the zoom behavior to the SVG
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




