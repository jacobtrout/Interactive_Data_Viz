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
    .domain([10000000, 20000000, 30000000, 40000000, 50000000])
    .range(d3.schemeBlues[6]);

let geojsonData; // To store the full GeoJSON data

// Load the GeoJSON data once and initialize the map
d3.json("data/output_1980.geojson").then(data => {
    geojsonData = data; // Store the full data for later use

    // Extract unique years from the data
    const years = [...new Set(geojsonData.features.map(d => 
        new Date(d.properties.Year).getFullYear()
    ))].sort();

        // Set up the slider
    d3.select("#timeSlider")
        .attr("min", years[0]) // Set the minimum to the first year
        .attr("max", years[years.length - 1]) // Set the max to the last year
        .attr("value", years[0]); // Start with the first year

    // Initialize the map with the first year
    updateMap(years[0]);

    d3.select("#timeSlider").on("change", function (e) {
        const selectedYear = e.target.value;
        updateMap(selectedYear);
    });
});

// Function to update the map based on the selected year
function updateMap(selectedYear) {
    // Filter features by the selected year
    const yearData = geojsonData.features.filter(d => {
        const featureYear = new Date(d.properties.Year).getFullYear();
        console.log("Feature Year:", featureYear); 
        return featureYear === selectedYear;
    });

    console.log("filtered data:", yearData)

    // Clear the existing map before updating
    svg.selectAll("*").remove();

    // Draw the map for the selected year
    svg.append("g")
        .selectAll("path")
        .data(yearData)
        .enter().append("path")
        .attr("fill", d => colorScale(d.properties.annual_production))
        .attr("d", path)
        .append("title") // Add tooltip information
        .text(d => 
            `County ID: ${d.properties.id}\nYear: ${d.properties.Year.split("T")[0]}\nProduction: ${d.properties.annual_production}`
        );

    console.log("Selected Year:", selectedYear);
    console.log("Filtered Data:", yearData);
}
