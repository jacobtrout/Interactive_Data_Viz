const width = 1000;
const height = 600;

var svg1 = d3.select("#my_map")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("border", "1px solid black");

var svg2 = d3.select("#my_map2")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("border", "1px solid black");


var projection = d3.geoAlbersUsa()
    .scale(2500)
    .translate([315, 475]);

var path = d3.geoPath().projection(projection);

var productionColorScale = d3.scaleThreshold()
    .domain([10000000, 20000000, 30000000, 40000000, 50000000, 60000000])
    .range(d3.schemeGreens[7]);

var yieldColorScale = d3.scaleThreshold()
    .domain([35, 70, 105, 140, 175, 210]) 
    .range(d3.schemeGreens[7]); 

var productionChangeColorScale = d3.scaleThreshold()
    .domain([0, 5000000, 10000000, 15000000, 20000000, 30000000])
    .range(["#ffd700", ...d3.schemeGreens[6]]); 

var yieldChangeColorScale = d3.scaleThreshold()
    .domain([-25, 0, 25, 50, 75, 100, 125])
    .range(["#ffd700", "#fff7bc", ...d3.schemeGreens[5]]); 

var temperatureColorScale = d3.scaleThreshold()
    .domain([40, 45, 50, 55, 60, 65])
    .range(d3.schemeReds[7]);

var precipitationColorScale = d3.scaleThreshold()
    .domain([0, 1, 2, 3, 4, 5])
    .range(d3.schemeBlues[7]);

var temperatureChangeColorScale = d3.scaleThreshold()
    .domain([0, 0.5, 1.0, 1.5, 2.0])
    .range(["#fee5d9", "#fcbba1", "#fc9272", "#fb6a4a", "#de2d26", "#a50f15"]);

var precipitationChangeColorScale = d3.scaleThreshold()
    .domain([0, 0.15, 0.3, 0.45, 0.6])
    .range(["#deebf7", "#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c", "white"]);

let currentMetric = 'production';

let geojsonData;

const baseCountiesGroup1 = svg1.append("g").attr("class", "base-counties");
const choroplethGroup1 = svg1.append("g").attr("class", "choropleth");
const countiesGroup1 = svg1.append("g").attr("class", "counties");
const statesGroup1 = svg1.append("g").attr("class", "states");

const baseCountiesGroup2 = svg2.append("g").attr("class", "base-counties");
const choroplethGroup2 = svg2.append("g").attr("class", "choropleth");
const countiesGroup2 = svg2.append("g").attr("class", "counties");
const statesGroup2 = svg2.append("g").attr("class", "states");

let years = [];

Promise.all([
    d3.json("backgrounds/states.geojson"),
    d3.json("backgrounds/counties.geojson"),
    d3.json("backgrounds/all_states.geojson"),
    d3.json("output_data/output_1980.geojson")
]).then(([statesData, countiesData, USAData, data]) => {
    geojsonData = data;

    for (let year = 1980; year <= 2023; year++) {
        years.push(year);
    }

    drawBaseLayers(statesData, countiesData, USAData);

    updateMap(years[0]);

    const slider = d3.select("#timeSlider")
        .attr("min", 0)
        .attr("max", years.length - 1)
        .property("value", 0)
        .on("mouseover", function() { 
            d3.select(this).style("opacity", "1"); 
        })
        .on("mouseout", function() { 
            d3.select(this).style("opacity", "0.7"); 
        });

    const timeDisplay = d3.select("#timeDisplay")
        .attr("class", "time-display")

    timeDisplay.text(`${years[0]}`);

    slider.on("input", function(e) {
        const selectedIndex = +e.target.value;
        const selectedYear = years[selectedIndex];
        updateMap(selectedYear);
        timeDisplay.text(`${selectedYear}`);
    });

    let playInterval;
    let currentYearIndex = 0;
    
    d3.select("#playPause").on("click", function() {
  
        if (playInterval) {
            clearInterval(playInterval); 
            playInterval = null;
            this.textContent = "Play";  
        } else {
            playInterval = setInterval(() => {
                
                const selectedYear = years[currentYearIndex];
                slider.property("value", currentYearIndex); 
                updateMap(selectedYear);
                timeDisplay.text(`${selectedYear}`);
    
                
                currentYearIndex++;
                if (currentYearIndex >= years.length) {
                    clearInterval(playInterval);  
                    currentYearIndex = 0;
                    playInterval = null;
                    this.textContent = "Play";  
                }
            }, 500);
            this.textContent = "Pause";  
        }
    });
    

    d3.select("#resetZoom")
        .on("mouseover", function() {
            d3.select(this).style("background-color", "rgba(190, 160, 120, 0.95)")
        })
        .on("mouseout", function() {
            d3.select(this).style("background-color", "rgba(210, 180, 140, 0.95)")
        });

    d3.select("#resetZoom").on("click", function() {
        svg1.transition()
            .duration(750)
            .call(zoom1.transform, d3.zoomIdentity);
        
        svg2.transition()
            .duration(750)
            .call(zoom2.transform, d3.zoomIdentity);
    });

    const playButton = d3.select("#playPause")
        .attr("class", "play-button");

    // Update dropdown position to be next to year display
    const metricSelector = d3.select("#controls")
        .append("select")
        .attr("id", "metricSelector")
        .attr("class", "metric-selector");

    metricSelector
        .selectAll("option")
        .data([
            {value: "production", text: "Production"},
            {value: "yield", text: "Yield"},
            {value: "temperature", text: "Annual Temperature"},
            {value: "precipitation", text: "Annual Precipitation"}
        ])
        .enter()
        .append("option")
        .attr("value", d => d.value)
        .text(d => d.text);

    // Add event listener for dropdown
    metricSelector.on("change", function() {
        currentMetric = this.value;
        const selectedYear = years[d3.select("#timeSlider").property("value")];
        updateMap(selectedYear);
        updateLegend();
    });

    console.log("Sample data properties:", data.features[0].properties);
});
// Function to draw the base layers on the map
function drawBaseLayers(statesData, countiesData, USAData) {
    // Draw for first map
    drawBaseLayersForMap(baseCountiesGroup1, countiesGroup1, statesGroup1, statesData, countiesData, USAData);
    // Draw for second map
    drawBaseLayersForMap(baseCountiesGroup2, countiesGroup2, statesGroup2, statesData, countiesData, USAData);
}

// Helper function to draw layers for a specific map
function drawBaseLayersForMap(baseGroup, countiesGroup, statesGroup, statesData, countiesData, USAData) {
    baseGroup.selectAll("path.usa")
        .data(USAData.features)
        .enter().append("path")
        .attr("class", "usa")
        .attr("fill", "#483c32")
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

// Create info boxes for both maps
let infoBox1 = svg1.append("g")
    .attr("class", "info-box")
    .attr("transform", "translate(0, 0)");

let infoBox2 = svg2.append("g")
    .attr("class", "info-box")
    .attr("transform", "translate(0, 0)");

infoBox1.append("rect")
    .attr("x", width - 190)
    .attr("y", height - 170)
    .attr("width", 175)
    .attr("height", 150)
    .attr("fill", "rgba(210, 180, 140, 0.95)")
    .attr("stroke", "black")
    .attr("stroke-width", 1);

let countyInfoText1 = infoBox1.append("text")
    .attr("x", width - 180)
    .attr("y", height - 150)
    .attr("font-size", "14px")
    .attr("fill", "black")
    .style("pointer-events", "none")
    .style("font-family", "Arial, sans-serif");

infoBox2.append("rect")
    .attr("x", width - 190)
    .attr("y", height - 170)
    .attr("width", 175)
    .attr("height", 150)
    .attr("fill", "rgba(210, 180, 140, 0.95)")
    .attr("stroke", "black")
    .attr("stroke-width", 1);

let countyInfoText2 = infoBox2.append("text")
    .attr("x", width - 180)
    .attr("y", height - 150)
    .attr("font-size", "14px")
    .attr("fill", "black")
    .style("pointer-events", "none")
    .style("font-family", "Arial, sans-serif");

// Update the information box with proper line breaks
function updateInfoBox(countyName, stateAlpha, year, production, yield, productionChange, yieldChange, avgTemp, avgPrecip, tempChange, precipChange) {
    // Format production to millions with 1 decimal place
    const productionInMillions = production !== 'No data available' 
        ? `${(production / 1000000).toFixed(1)} M` 
        : 'No data available';
    
    const productionChangeInMillions = productionChange !== 'No data available'
        ? `${(productionChange / 1000000).toFixed(1)} M`
        : 'No data available';

    // Update first info box
    countyInfoText1
        .selectAll("*").remove();  // Remove any existing text
    
    // Append the title with county and state
    countyInfoText1.append("tspan")
        .attr("x", width - 160)
        .attr("dy", "0em")
        .attr("font-size", "16px")
        .attr("font-weight", "bold")
        .text(`${countyName}, ${stateAlpha}`);

    countyInfoText1.append("tspan")
        .attr("x", width - 160)
        .attr("dy", "1.4em")
        .text(`Year: ${year}`);

    countyInfoText1.append("tspan")
        .attr("x", width - 160)
        .attr("dy", "1.4em")
        .text(`Production: ${productionInMillions}`);

    countyInfoText1.append("tspan")
        .attr("x", width - 160)
        .attr("dy", "1.4em")
        .text(`Yield: ${yield}`);

    countyInfoText1.append("tspan")
        .attr("x", width - 160)
        .attr("dy", "1.4em")
        .text(`Temperature: ${avgTemp}`);

    countyInfoText1.append("tspan")
        .attr("x", width - 160)
        .attr("dy", "1.4em")
        .text(`Precipitation: ${avgPrecip}`);

    // Update second info box
    countyInfoText2
        .selectAll("*").remove();  // Remove any existing text
    
    // Append the title with county and state
    countyInfoText2.append("tspan")
        .attr("x", width - 160)
        .attr("dy", "0em")
        .attr("font-size", "16px")
        .attr("font-weight", "bold")
        .text(`${countyName}, ${stateAlpha}`);

    countyInfoText2.append("tspan")
        .attr("x", width - 160)
        .attr("dy", "1.4em")
        .text(`Year: ${year}`);

    countyInfoText2.append("tspan")
        .attr("x", width - 160)
        .attr("dy", "1.4em")
        .text(`Δ Production: ${productionChangeInMillions}`);

    countyInfoText2.append("tspan")
        .attr("x", width - 160)
        .attr("dy", "1.4em")
        .text(`Δ Yield: ${yieldChange}`);

    countyInfoText2.append("tspan")
        .attr("x", width - 160)
        .attr("dy", "1.4em")
        .text(`Δ Temperature: ${tempChange}`);

    countyInfoText2.append("tspan")
        .attr("x", width - 160)
        .attr("dy", "1.4em")
        .text(`Δ Precipitation: ${precipChange}`);
}

// Track last clicked counties for both maps
let lastClickedCounty1 = null;
let lastClickedCounty2 = null;

// Add these variables at the top level of your file, near other global variables
let selectedCountyId = null;

// Modify the updateMap function
function updateMap(selectedYear) {
    const fileName = `output_data/output_${selectedYear}.geojson`;
    
    d3.json(fileName).then(data => {
        // Update the maps as before
        if (currentMetric === 'production') {
            updateMapData(choroplethGroup1, data, 'production');
            updateMapData(choroplethGroup2, data, 'production_change');
        } else if (currentMetric === 'yield') {
            updateMapData(choroplethGroup1, data, 'yield');
            updateMapData(choroplethGroup2, data, 'yield_change');
        } else if (currentMetric === 'temperature') {
            updateMapData(choroplethGroup1, data, 'temperature');
            updateMapData(choroplethGroup2, data, 'temperature_change');
        } else if (currentMetric === 'precipitation') {
            updateMapData(choroplethGroup1, data, 'precipitation');
            updateMapData(choroplethGroup2, data, 'precipitation_change');
        } else {
            updateMapData(choroplethGroup1, data, currentMetric);
            updateMapData(choroplethGroup2, data, currentMetric);
        }

        // If there's a selected county, update its info
        if (selectedCountyId) {
            const selectedFeature = data.features.find(f => f.properties.id === selectedCountyId);
            if (selectedFeature) {
                // Update info boxes with new year's data
                const d = selectedFeature;
                const countyName = d.properties.county_name || 'No name available';
                const stateAlpha = d.properties.state_alpha || 'No state available';
                const year = d.properties.year ?? 'NA';
                const production = d.properties.rolling_avg_production ?? 'NA';
                const yield = d.properties.rolling_yield ?? 'NA';
                const productionChange = d.properties.rolling_avg_production_abs_change_from_1980 ?? 'NA';
                const yieldChange = d.properties.rolling_yield_abs_change_from_1980 ?? 'NA';
                const avgTemp = d.properties.ann_avg_temp ?? 'NA';
                const avgPrecip = d.properties.ann_avg_precip ?? 'NA';
                const tempChange = d.properties.ann_avg_temp_abs_change_from_1980 ?? 'NA';
                const precipChange = d.properties.ann_avg_precip_abs_change_from_1980 ?? 'NA';

                updateInfoBox(countyName, stateAlpha, year, production, yield, productionChange, yieldChange, avgTemp, avgPrecip, tempChange, precipChange);
            }
        }
    }).catch(error => {
        console.error(`Error loading data for year ${selectedYear}:`, error);
    });
}

// Modify the click handler in updateMapData function to set selectedCountyId
function updateMapData(choroplethGroup, data, metric) {
    const paths = choroplethGroup.selectAll("path")
        .data(data.features, d => d.properties.id);

    // Update existing paths
    paths
        .transition()
        .duration(750)
        .attr("fill", d => {
            let value;
            switch(metric) {
                case 'production':
                    value = d.properties.rolling_avg_production;
                    return value === null || value === undefined || isNaN(value) || value === 0 
                        ? "white" : productionColorScale(value);
                case 'yield':
                    value = d.properties.rolling_yield;
                    return value === null || value === undefined || isNaN(value) || value === 0 
                        ? "white" : yieldColorScale(value);
                case 'production_change':
                    value = d.properties.rolling_avg_production_abs_change_from_1980;
                    return value === null || value === undefined || isNaN(value) 
                        ? "white" : productionChangeColorScale(value);
                case 'yield_change':
                    value = d.properties.rolling_yield_abs_change_from_1980;
                    return value === null || value === undefined || isNaN(value) 
                        ? "white" : yieldChangeColorScale(value);
                case 'temperature':
                    value = d.properties.ann_avg_temp;
                    return value === null || value === undefined || isNaN(value) 
                        ? "white" : temperatureColorScale(value);
                case 'precipitation':
                    value = d.properties.ann_avg_precip;
                    return value === null || value === undefined || isNaN(value) 
                        ? "white" : precipitationColorScale(value);
                case 'temperature_change':
                    value = d.properties.ann_avg_temp_abs_change_from_1980;
                    return value === null || value === undefined || isNaN(value) 
                        ? "white" : temperatureChangeColorScale(value);
                case 'precipitation_change':
                    value = d.properties.ann_avg_precip_abs_change_from_1980;
                    return value === null || value === undefined || isNaN(value) 
                        ? "white" : precipitationChangeColorScale(value);
            }
        });

    // Add new paths with modified click handler
    paths.enter()
        .append("path")
        .attr("fill", "white")
        .attr("d", path)
        .style("opacity", 0)
        .on("click", function(event, d) {
            // Set the selected county ID when clicking
            selectedCountyId = d.properties.id;

            // Reset previous highlights on both maps
            if (lastClickedCounty1) {
                lastClickedCounty1.style("stroke", null).style("stroke-width", null);
                lastClickedCounty1.style("fill", null);
            }
            if (lastClickedCounty2) {
                lastClickedCounty2.style("stroke", null).style("stroke-width", null);
                lastClickedCounty2.style("fill", null);
            }

            // Find and highlight the same county in both maps
            const countyId = d.properties.id;
            const map1County = choroplethGroup1.selectAll("path")
                .filter(d => d.properties.id === countyId);
            const map2County = choroplethGroup2.selectAll("path")
                .filter(d => d.properties.id === countyId);

            // Highlight both counties
            map1County.style("stroke", "orange").style("stroke-width", 3);
            map1County.style("fill", "orange");
            map2County.style("stroke", "orange").style("stroke-width", 3);
            map2County.style("fill", "orange");

            // Store the clicked counties
            lastClickedCounty1 = map1County;
            lastClickedCounty2 = map2County;

            // Update the information box
            const countyName = d.properties.county_name || 'No name available';
            const stateAlpha = d.properties.state_alpha || 'No state available';
            const year = d.properties.year ?? 'NA';
            const production = d.properties.rolling_avg_production ?? 'NA';
            const yield = d.properties.rolling_yield ?? 'NA';
            const productionChange = d.properties.rolling_avg_production_abs_change_from_1980 ?? 'NA';
            const yieldChange = d.properties.rolling_yield_abs_change_from_1980 ?? 'NA';
            const avgTemp = d.properties.ann_avg_temp ?? 'NA';
            const avgPrecip = d.properties.ann_avg_precip ?? 'NA';
            const tempChange = d.properties.ann_avg_temp_abs_change_from_1980 ?? 'NA';
            const precipChange = d.properties.ann_avg_precip_abs_change_from_1980 ?? 'NA';

            // Update the information box with all metrics
            updateInfoBox(countyName, stateAlpha, year, production, yield, productionChange, yieldChange, avgTemp, avgPrecip, tempChange, precipChange);
            
            // Zoom both maps to the clicked county
            zoomToCounty(event, d);
        })
        .transition()
        .duration(750)
        .style("opacity", 1)
        .attr("fill", d => {
            let value;
            switch(metric) {
                case 'production':
                    value = d.properties.rolling_avg_production;
                    return value === null || value === undefined || isNaN(value) || value === 0 
                        ? "white" : productionColorScale(value);
                case 'yield':
                    value = d.properties.rolling_yield;
                    return value === null || value === undefined || isNaN(value) || value === 0 
                        ? "white" : yieldColorScale(value);
                case 'production_change':
                    value = d.properties.rolling_avg_production_abs_change_from_1980;
                    return value === null || value === undefined || isNaN(value) 
                        ? "white" : productionChangeColorScale(value);
                case 'yield_change':
                    value = d.properties.rolling_yield_abs_change_from_1980;
                    return value === null || value === undefined || isNaN(value) 
                        ? "white" : yieldChangeColorScale(value);
                case 'temperature':
                    value = d.properties.ann_avg_temp;
                    return value === null || value === undefined || isNaN(value) 
                        ? "white" : temperatureColorScale(value);
                case 'precipitation':
                    value = d.properties.ann_avg_precip;
                    return value === null || value === undefined || isNaN(value) 
                        ? "white" : precipitationColorScale(value);
                case 'temperature_change':
                    value = d.properties.ann_avg_temp_abs_change_from_1980;
                    return value === null || value === undefined || isNaN(value) 
                        ? "white" : temperatureChangeColorScale(value);
                case 'precipitation_change':
                    value = d.properties.ann_avg_precip_abs_change_from_1980;
                    return value === null || value === undefined || isNaN(value) 
                        ? "white" : precipitationChangeColorScale(value);
            }
        });

    // Remove old paths
    paths.exit()
        .transition()
        .duration(750)
        .style("opacity", 0)
        .remove();
}

// Set up zoom behavior for both maps
const zoom1 = setupZoom(svg1, [baseCountiesGroup1, choroplethGroup1, countiesGroup1, statesGroup1]);
const zoom2 = setupZoom(svg2, [baseCountiesGroup2, choroplethGroup2, countiesGroup2, statesGroup2]);

// Helper function to set up zoom
function setupZoom(svg, layers) {
    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .translateExtent([[0, 0], [width, height]])
        .extent([[0, 0], [width, height]])
        .on("zoom", event => {
            const transform = event.transform;
            transform.x = Math.min(0, Math.max(width * (1 - transform.k), transform.x));
            transform.y = Math.min(0, Math.max(height * (1 - transform.k), transform.y));
            layers.forEach(layer => layer.attr("transform", transform));
        });

    svg.call(zoom);
    return zoom;
}

// Function to reset zoom
function resetZoom() {
    svg1.transition()
        .duration(750)
        .call(zoom1.transform, d3.zoomIdentity);
}

// Update zoomToCounty to zoom both maps
function zoomToCounty(event, d) {
    const bounds = path.bounds(d);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    
    const scale = Math.min(2, 0.9 / Math.max(dx / width, dy / height));
    
    let translate = [width / 2 - scale * x, height / 2 - scale * y];
    translate[0] = Math.min(0, Math.max(width * (1 - scale), translate[0]));
    translate[1] = Math.min(0, Math.max(height * (1 - scale), translate[1]));
    
    // Zoom both maps
    svg1.transition()
        .duration(750)
        .call(zoom1.transform, d3.zoomIdentity
            .translate(translate[0], translate[1])
            .scale(scale));
            
    svg2.transition()
        .duration(750)
        .call(zoom2.transform, d3.zoomIdentity
            .translate(translate[0], translate[1])
            .scale(scale));
}

function createVerticalLegend() {
    // Set up smaller legend dimensions
    const legendWidth = 200;
    const legendHeight = 190;
    const legendItemHeight = 15;
    const legendSpacing = 5;
    const titleHeight = 20;

    // Create legend groups for both maps
    const legendGroup1 = svg1.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${width - legendWidth - 20}, 20)`);

    const legendGroup2 = svg2.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${width - legendWidth - 20}, 20)`);

    // Add backgrounds for both legends
    [legendGroup1, legendGroup2].forEach(group => {
        group.append("rect")
            .attr("width", legendWidth)
            .attr("height", legendHeight)
            .attr("fill", "rgba(210, 180, 140, 0.95)")
            .attr("stroke", "black")
            .attr("stroke-width", 1);

        group.append("text")
            .attr("class", "legend-title")
            .attr("x", legendWidth / 2)
            .attr("y", titleHeight / 2 + 5)
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-family", "Arial, sans-serif")
            .style("font-weight", "bold");
    });

    function updateLegend() {
        // Create legend data for all metrics
        const productionLabels = ["0 - 10M", "10M - 20M", "20M - 30M", "30M - 40M", "40M - 50M", "50M - 60M", "> 60M", "No Data"];
        const productionColors = [...d3.schemeGreens[7], "white"];
        
        const yieldLabels = ["0 - 35", "35 - 70", "70 - 105", "105 - 140", "140 - 175", "175 - 210", "> 210", "No Data"];
        const yieldColors = [...d3.schemeGreens[7], "white"];

        const productionChangeLabels = ["< 0", "0 - 5M", "5M - 10M", "10M - 15M", "15M - 20M", "20M - 30M", "> 30M", "No Data"];
        const productionChangeColors = ["#ffd700", ...d3.schemeGreens[6], "white"];

        const yieldChangeLabels = ["< -25", "-25 - 0", "0 - 25", "25 - 50", "50 - 75", "75 - 100", "> 100", "No Data"];
        const yieldChangeColors = ["#ffd700", "#fff7bc", ...d3.schemeGreens[5], "white"];

        const temperatureLabels = ["< 40°F", "40-45°F", "45-50°F", "50-55°F", "55-60°F", "60-65°F", "> 65°F", "No Data"];
        const temperatureColors = [...d3.schemeReds[7], "white"];

        const precipitationLabels = ["< 1\"", "1-2\"", "2-3\"", "3-4\"", "4-5\"", "> 5\"", "No Data"];
        const precipitationColors = [...d3.schemeBlues[6], "white"];

        const temperatureChangeLabels = ["< 0°F", "0 - 0.5°F", "0.5 - 1.0°F", "1.0 - 1.5°F", "1.5 - 2.0°F", "> 2.0°F", "No Data"];
        const temperatureChangeColors = ["#fee5d9", "#fcbba1", "#fc9272", "#fb6a4a", "#de2d26", "#a50f15", "white"];

        const precipitationChangeLabels = ["< 0\"", "0 - 0.15\"", "0.15 - 0.3\"", "0.3 - 0.45\"", "0.45 - 0.6\"", "> 0.6\"", "No Data"];
        const precipitationChangeColors = ["#deebf7", "#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c", "white"];

        // Get legend config for both maps
        let legend1Title, legend1Labels, legend1Colors;
        let legend2Title, legend2Labels, legend2Colors;

        // Special handling for production, yield, and temperature
        if (currentMetric === 'production') {
            // First legend - Production
            legend1Title = "Production (bushels)";
            legend1Labels = productionLabels;
            legend1Colors = productionColors;
            
            // Second legend - Production Change
            legend2Title = "Change in Production";
            legend2Labels = productionChangeLabels;
            legend2Colors = productionChangeColors;
        } else if (currentMetric === 'yield') {
            // First legend - Yield
            legend1Title = "Yield (bushels/acre)";
            legend1Labels = yieldLabels;
            legend1Colors = yieldColors;
            
            // Second legend - Yield Change
            legend2Title = "Change in Yield";
            legend2Labels = yieldChangeLabels;
            legend2Colors = yieldChangeColors;
        } else if (currentMetric === 'temperature') {
            // First legend - Temperature
            legend1Title = "Average Temperature (°F)";
            legend1Labels = temperatureLabels;
            legend1Colors = temperatureColors;
            
            // Second legend - Temperature Change
            legend2Title = "Change in Temperature";
            legend2Labels = temperatureChangeLabels;
            legend2Colors = temperatureChangeColors;
        } else if (currentMetric === 'precipitation') {
            // First legend - Precipitation
            legend1Title = "Average Precipitation (in)";
            legend1Labels = precipitationLabels;
            legend1Colors = precipitationColors;
            
            // Second legend - Precipitation Change
            legend2Title = "Change in Precipitation";
            legend2Labels = precipitationChangeLabels;
            legend2Colors = precipitationChangeColors;
        }

        // Update titles and legends
        legendGroup1.select(".legend-title")
            .text(legend1Title)
            .style("font-size", "16px");

        legendGroup2.select(".legend-title")
            .text(legend2Title)
            .style("font-size", "16px");

        updateSingleLegend(legendGroup1, legend1Labels, legend1Colors);
        updateSingleLegend(legendGroup2, legend2Labels, legend2Colors);
    }

    function updateSingleLegend(group, labels, colors) {
        // Remove existing legend items
        group.selectAll(".legend-item").remove();

        // Create new legend items
        const legendItems = group.selectAll(".legend-item")
            .data(labels)
            .enter()
            .append("g")
            .attr("class", "legend-item")
            .attr("transform", (d, i) => `translate(10, ${25 + i * (legendItemHeight + legendSpacing)})`);

        // Add colored rectangle for each legend item
        legendItems.append("rect")
            .attr("width", 15)
            .attr("height", legendItemHeight)
            .attr("fill", (d, i) => colors[i])
            .attr("stroke", "black")
            .attr("stroke-width", 0.5);

        // Add label for each legend item
        legendItems.append("text")
            .attr("x", 20)
            .attr("y", legendItemHeight / 2)
            .attr("dy", "0.35em")
            .style("font-size", "14px")
            .style("font-family", "Arial, sans-serif")
            .text(d => d);
    }

    // Initial legend creation
    updateLegend();

    return updateLegend;
}

// Store the updateLegend function when creating the legend
const updateLegend = createVerticalLegend();
