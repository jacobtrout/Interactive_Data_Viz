# CornandClimate

## Author  
Jacob Trout

## Description  
This project explores the relationship between agricultural productivity and climate change in the U.S. Midwest. The core deliverable is an interactive website that visualizes these trends at the county level.

The site allows users to explore how long-term changes in temperature and precipitation relate to crop yield trends using interactive maps and graphs.

The website is built with **D3.js** and hosted on **Netlify**.  
👉 **Live site:** [https://cornandclimate.netlify.app](https://cornandclimate.netlify.app)

## Screenshot  
See accompanying PDF. The file is too large for a static screenshot.

## Data Sources  
- **Agricultural data:** USDA National Agricultural Statistics Service (Quick Stats API)  
- **Climate data:** NOAA's National Centers for Environmental Information (Climate Data Online)

Both sources are open and publicly accessible.

## How to Reproduce the Data  
Run `data_processing.py` to generate the necessary GeoJSON files. These will be saved in the `viz` folder and are required for the map to render properly.

## License  
This project is open source under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributions  
Feel free to fork the repository, submit issues, or open pull requests. Suggestions for new features or data so
