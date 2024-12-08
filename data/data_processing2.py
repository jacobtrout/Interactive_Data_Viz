import pandas as pd
import sqlite3
from vega_datasets import data
import geopandas as gpd
import os

# Load data
url = data.us_10m.url
states_gdf = gpd.read_file(url, layer="states")
counties_gdf = gpd.read_file(url, layer="counties")

# Configuration
DB_NAME = "field_crops.db"
CROP_TABLE = "midwest_key_field_crops_cleaned"
AREA_TABLE = "midwest_area_planted_cleaned"
OUTPUT_PATH = "../viz/"
MIDWESTERN_STATE_IDS = [17, 18, 19, 20, 26, 27, 29, 31, 38, 39, 46, 55]


def load_midwest_counties(conn, table, counties_gdf):
    # Fetch distinct state_ansi values as a list
    query = f"SELECT DISTINCT state_ansi FROM {table}"
    state_ansi_list = pd.read_sql(query, conn).squeeze().tolist()

    # Filter counties based on state_ansi and id length
    midwest_counties_gdf = counties_gdf[
        counties_gdf["id"].str[:2].isin(state_ansi_list)
        & (counties_gdf["id"].str.len() == 5)
    ]

    # Remove duplicated 'id' values
    midwest_counties_gdf_no_duplicates = midwest_counties_gdf.drop_duplicates(
        subset="id", keep=False
    )

    # Group duplicated counties and merge geometries
    duplicated_counties_gdf = midwest_counties_gdf[
        midwest_counties_gdf.duplicated("id", keep=False)
    ]
    results = [
        {"id": county, "geometry": county_records.geometry.unary_union}
        for county, county_records in duplicated_counties_gdf.groupby("id")
    ]

    # Create GeoDataFrame for merged geometries
    duplicated_counties_multi_gdf = gpd.GeoDataFrame(results, crs=counties_gdf.crs)

    # Concatenate and return the final GeoDataFrame
    final_counties_gdf = pd.concat(
        [midwest_counties_gdf_no_duplicates, duplicated_counties_multi_gdf],
        ignore_index=True,
    )
    final_counties_gdf = gpd.GeoDataFrame(final_counties_gdf, crs=counties_gdf.crs)

    return final_counties_gdf


def get_annual_corn_production(conn, table):
    query = f"""
    SELECT 
        state_name,
        county_name,
        year,
        value AS annual_production,
        state_ansi || county_ansi as id
    FROM {table} 
    WHERE short_desc != 'CORN, SILAGE - PRODUCTION, MEASURED IN TONS'
        AND commodity_desc = 'CORN'
        AND asd_code != 99
        AND county_ansi != ""
        AND year > 1975
    """
    return pd.read_sql(query, conn)


def get_annual_data(conn, crop_table, area_table):
    production_query = f"""
    SELECT 
        state_name,
        county_name,
        year,
        value AS annual_production,
        state_ansi || county_ansi as id
    FROM {crop_table} 
    WHERE short_desc != 'CORN, SILAGE - PRODUCTION, MEASURED IN TONS'
        AND commodity_desc = 'CORN'
        AND asd_code != 99
        AND county_ansi != ""
        AND year > 1975
    """

    area_query = f"""
    SELECT 
        year,
        value AS annual_area,
        state_ansi || county_ansi as id
    FROM {area_table} 
    WHERE short_desc != 'CORN, SILAGE - ACRES HARVESTED'
        AND commodity_desc = 'CORN'
        AND asd_code != 99
        AND county_ansi != ""
        AND year > 1975
    """

    prod_df = pd.read_sql(production_query, conn)
    area_df = pd.read_sql(area_query, conn)

    annual_data = pd.merge(prod_df, area_df, on=["id", "year"], how="outer")
    annual_data["annual_yield"] = (
        annual_data["annual_production"] / annual_data["annual_area"]
    )

    return annual_data


# Create output directories
os.makedirs(f"{OUTPUT_PATH}output_data", exist_ok=True)
os.makedirs(f"{OUTPUT_PATH}backgrounds", exist_ok=True)

# Create single connection object
conn = sqlite3.connect(DB_NAME)

# Get the annual data and calculate rolling averages
annual_data = get_annual_data(conn, CROP_TABLE, AREA_TABLE)
counties = annual_data["id"].unique()
years = pd.Series(range(1976, pd.to_datetime("today").year + 1))
all_combinations = pd.MultiIndex.from_product([counties, years], names=["id", "year"])
all_combinations = pd.DataFrame(
    all_combinations.to_flat_index().tolist(), columns=["id", "year"]
)

annual_data = all_combinations.merge(annual_data, on=["id", "year"], how="left")

# Calculate 5-year rolling sums for both production and area
annual_data["rolling_production"] = annual_data.groupby("id")[
    "annual_production"
].transform(lambda x: x.rolling(window=5, min_periods=1).sum())
annual_data["rolling_area"] = annual_data.groupby("id")["annual_area"].transform(
    lambda x: x.rolling(window=5, min_periods=1).sum()
)

# Add rolling average production calculation
annual_data["rolling_avg_production"] = (
    annual_data.groupby("id")["annual_production"]
    .transform(lambda x: x.rolling(window=5, min_periods=1).mean())
    .round(2)
)

# Calculate yield based on rolling totals and round
annual_data["rolling_yield"] = (
    annual_data["rolling_production"] / annual_data["rolling_area"]
).round(2)

# Calculate percentile ranks within each year
annual_data["yield_percentile"] = (
    annual_data.groupby("year")["rolling_yield"]
    .transform(lambda x: x.rank(pct=True).round(2) * 100)
    .fillna(-1)
    .astype(int)
)

# Update to use rolling average production for percentile
annual_data["production_percentile"] = (
    annual_data.groupby("year")["rolling_avg_production"]
    .transform(lambda x: x.rank(pct=True).round(2) * 100)
    .fillna(-1)
    .astype(int)
)

# Clean up intermediate columns
annual_data = annual_data.drop(
    [
        "rolling_area",
        "annual_production",
        "rolling_production",
        "annual_area",
        "annual_yield",
    ],
    axis=1,
)

# Mapping and filtering codes
noaa_midwest_codes = [
    "11",
    "12",
    "13",
    "14",
    "20",
    "21",
    "23",
    "25",
    "32",
    "33",
    "39",
    "47",
]
fips_mapping = {
    "11": "17",
    "12": "18",
    "13": "19",
    "14": "20",
    "20": "26",
    "21": "27",
    "23": "29",
    "25": "31",
    "32": "38",
    "33": "39",
    "39": "46",
    "47": "55",
}
final_df_cols = ["Year", "County_Code", "state_fips"]


def parse_climdiv_data(
    file_path,
    yearly_avg_column_name,
    midwest_codes=noaa_midwest_codes,
    final_df_cols=final_df_cols,
):
    column_specs = [
        (0, 2),
        (2, 5),
        (5, 7),
        (7, 11),
        (11, 18),
        (18, 25),
        (25, 32),
        (32, 39),
        (39, 46),
        (46, 53),
        (53, 60),
        (60, 67),
        (67, 74),
        (74, 81),
        (81, 88),
        (88, 95),
    ]

    column_names = [
        "State_Code",
        "Division_Number",
        "Element_Code",
        "Year",
        "Jan_Value",
        "Feb_Value",
        "Mar_Value",
        "Apr_Value",
        "May_Value",
        "Jun_Value",
        "Jul_Value",
        "Aug_Value",
        "Sep_Value",
        "Oct_Value",
        "Nov_Value",
        "Dec_Value",
    ]

    df = pd.read_fwf(
        file_path,
        colspecs=column_specs,
        names=column_names,
        dtype={"State_Code": str, "Division_Number": str},
    )

    df["state_fips"] = df["State_Code"].map(fips_mapping)
    df["County_Code"] = df["state_fips"] + df["Division_Number"]
    numeric_columns = column_names[4:]
    df[numeric_columns] = df[numeric_columns].apply(pd.to_numeric, errors="coerce")

    df.replace(
        {
            "Jan_Value": {-99.99: None, -9.99: None},
            "Feb_Value": {-99.99: None, -9.99: None},
            "Mar_Value": {-99.99: None, -9.99: None},
            "Apr_Value": {-99.99: None, -9.99: None},
            "May_Value": {-99.99: None, -9.99: None},
            "Jun_Value": {-99.99: None, -9.99: None},
            "Jul_Value": {-99.99: None, -9.99: None},
            "Aug_Value": {-99.99: None, -9.99: None},
            "Sep_Value": {-99.99: None, -9.99: None},
            "Oct_Value": {-99.99: None, -9.99: None},
            "Nov_Value": {-99.99: None, -9.99: None},
            "Dec_Value": {-99.99: None, -9.99: None},
        },
        inplace=True,
    )

    df[yearly_avg_column_name] = df[numeric_columns].mean(axis=1)

    midwest_df = df[df["State_Code"].isin(midwest_codes)]
    midwest_df_post1950 = midwest_df[midwest_df["Year"] > 1950]

    output_columns = final_df_cols + [yearly_avg_column_name]

    return midwest_df_post1950[output_columns]


# File paths
precipitation_path = "../data/climate_data/climdiv-pcpncy-v1.0.0-20241021.txt"
avg_temp_path = "../data/climate_data/climdiv-tmpccy-v1.0.0-20241021.txt"
max_temp_path = "../data/climate_data/climdiv-tmaxcy-v1.0.0-20241021.txt"
min_temp_path = "../data/climate_data/climdiv-tmincy-v1.0.0-20241021.txt"

# Parse climate data
precip_df = parse_climdiv_data(precipitation_path, "ann_avg_precip")
avg_temp_df = parse_climdiv_data(avg_temp_path, "ann_avg_temp")
max_temp_df = parse_climdiv_data(max_temp_path, "ann_max_temp")
min_temp_df = parse_climdiv_data(min_temp_path, "ann_min_temp")

merge_cols = ["Year", "County_Code", "state_fips"]
annual_climate_data_df = (
    precip_df.merge(avg_temp_df, on=merge_cols)
    .merge(max_temp_df, on=merge_cols)
    .merge(min_temp_df, on=merge_cols)
)
annual_climate_data_df = annual_climate_data_df.sort_values(by=["County_Code", "Year"])

# Round climate columns to 2 decimal places
climate_columns = ["ann_avg_precip", "ann_avg_temp", "ann_max_temp", "ann_min_temp"]
annual_climate_data_df[climate_columns] = annual_climate_data_df[climate_columns].round(
    2
)

rolling_avg_30yr_climate_data_df = (
    annual_climate_data_df.groupby("County_Code")[
        ["Year", "ann_avg_precip", "ann_avg_temp", "ann_max_temp", "ann_min_temp"]
    ]
    .apply(lambda x: x.set_index("Year").rolling(window=30).mean())
    .reset_index()
)

# Round the rolling averages to 2 decimal places
rolling_avg_30yr_climate_data_df[climate_columns] = rolling_avg_30yr_climate_data_df[
    climate_columns
].round(2)

rolling_avg_30yr_climate_data_df.rename(
    columns={"County_Code": "id", "Year": "year"}, inplace=True
)

# Merge data
merged_df = pd.merge(
    annual_data, rolling_avg_30yr_climate_data_df, on=["id", "year"], how="left"
)

# Calculate percentile ranks within each year
merged_df["precip_percentile"] = (
    merged_df.groupby("year")["ann_avg_precip"]
    .transform(lambda x: x.rank(pct=True).round(2) * 100)
    .fillna(-1)
    .astype(int)
)

merged_df["temp_percentile"] = (
    merged_df.groupby("year")["ann_avg_temp"]
    .transform(lambda x: x.rank(pct=True).round(2) * 100)
    .fillna(-1)
    .astype(int)
)

# Process corn data
midwest_counties_gdf = load_midwest_counties(conn, CROP_TABLE, counties_gdf)
merged = gpd.GeoDataFrame(
    pd.merge(merged_df, midwest_counties_gdf, on="id", how="left")
)
merged.set_geometry("geometry", inplace=True)

# Filter data
output_df = merged[(merged["year"] >= 1980) & (merged["year"] <= 2023)]
output_df.set_crs("EPSG:4326", inplace=True)

df = output_df.sort_values(by=["id", "year"])

features = ["rolling_avg_production", "rolling_yield", "ann_avg_temp", "ann_avg_precip"]

for feature in features:
    first_year_values = df[df["year"] == 1980].set_index("id")[feature]
    df[f"{feature}_1980"] = df["id"].map(first_year_values)
    df[f"{feature}_abs_change_from_1980"] = (df[feature] - df[f"{feature}_1980"]).round(
        2
    )
    df[f"{feature}_percentage_change_from_1980"] = (
        df[f"{feature}_abs_change_from_1980"] / df[f"{feature}_1980"]
    ) * 100
    df[f"{feature}_percentage_change_from_1980"] = df[
        f"{feature}_percentage_change_from_1980"
    ].round(2)
    # Drop the temporary _1980 column after calculations
    df = df.drop(columns=[f"{feature}_1980"])

output_df = df
output_df.set_crs("EPSG:4326", inplace=True)

# Save to GeoJSON
for year in output_df["year"].unique():
    year_df = output_df[output_df["year"] == year]
    year_filename = os.path.join(f"{OUTPUT_PATH}output_data", f"output_{year}.geojson")
    year_df.to_file(year_filename, driver="GeoJSON")
