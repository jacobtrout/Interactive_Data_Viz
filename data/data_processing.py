import pandas as pd
import sqlite3
from vega_datasets import data
import geopandas as gpd
import os

url = data.us_10m.url
states_gdf = gpd.read_file(url, layer="states")
counties_gdf = gpd.read_file(url, layer="counties")

# set global vars
db_name = "field_crops.db"
crop_table = "midwest_key_field_crops_cleaned"
area_table = "midwest_area_planted_cleaned"
output_path = "../static_final/"

# db connection
conn = sqlite3.connect(db_name)


def load_midwest_counties(db_name, table, counties_gdf):

    query = f"""
    Select 
        distinct
        state_ansi
    from {table} 
    """
    conn = sqlite3.connect(db_name)
    check = pd.read_sql(query, conn)

    state_ansi_list = check.iloc[:, 0].to_list()
    midwest_counties_gdf = counties_gdf[
        counties_gdf["id"].str[:2].isin(state_ansi_list)
    ]
    midwest_counties_gdf = midwest_counties_gdf[
        counties_gdf["id"].str[:2].isin(state_ansi_list)
        & (counties_gdf["id"].str.len() == 5)
    ]

    return midwest_counties_gdf


midwestern_state_ids = [17, 18, 19, 20, 26, 27, 29, 31, 38, 39, 46, 55]


# pull in production and area data by county for begin and end of period
query = f"""
Select 
    avg(value) AS avg_prod_present,
    commodity_desc,
    state_alpha, 
    state_ansi|| county_ansi as id
from {crop_table} 
where short_desc != 'CORN, SILAGE - PRODUCTION, MEASURED IN TONS'
and asd_code != 99
and county_ansi != ""
and year between 2018 and 2023
group by state_ansi|| county_ansi, commodity_desc
"""

# pull in production and area data by county for begin and end of period
query = f"""
Select 
    avg(value) AS avg_prod_present,
    commodity_desc,
    state_alpha, 
    state_ansi|| county_ansi as id
from {crop_table} 
where short_desc != 'CORN, SILAGE - PRODUCTION, MEASURED IN TONS'
and asd_code != 99
and county_ansi != ""
and year between 2018 and 2023
group by state_ansi|| county_ansi, commodity_desc
"""
avg_prod_present = pd.read_sql(query, conn)

query = f"""
Select 
    avg(value) AS avg_prod_past,
    commodity_desc,
    state_alpha,
    state_ansi|| county_ansi as id
from {crop_table} 
where short_desc != 'CORN, SILAGE - PRODUCTION, MEASURED IN TONS'
and asd_code != 99
and county_ansi != ""
and year between 1975 and 1980
group by state_ansi|| county_ansi, commodity_desc
"""
avg_prod_past = pd.read_sql(query, conn)
query = f"""
Select 
    avg(value) AS avg_area_present,
    commodity_desc,
    state_alpha,
    state_ansi|| county_ansi as id
from {area_table} 
where short_desc != 'CORN, SILAGE - PRODUCTION, MEASURED IN TONS'
and asd_code != 99
and county_ansi != ""
and year between 2018 and 2023
group by state_ansi|| county_ansi , commodity_desc
"""
avg_area_present = pd.read_sql(query, conn)
query = f"""
Select 
    avg(value) AS avg_area_past,
    commodity_desc,
    state_alpha,
    state_ansi|| county_ansi as id
from {area_table} 
where short_desc != 'CORN, SILAGE - PRODUCTION, MEASURED IN TONS'
and asd_code != 99
and county_ansi != ""
and year between 1975 and 1980
group by state_ansi|| county_ansi , commodity_desc
"""
avg_area_past = pd.read_sql(query, conn)

# calc yield
avg_yield_past = pd.merge(
    avg_prod_past, avg_area_past, on=["commodity_desc", "id", "state_alpha"]
)
avg_yield_past["yield_past"] = (
    avg_yield_past["avg_prod_past"] / avg_yield_past["avg_area_past"]
)
avg_yield_present = pd.merge(
    avg_prod_present, avg_area_present, on=["commodity_desc", "id", "state_alpha"]
)
avg_yield_present["yield_present"] = (
    avg_yield_present["avg_prod_present"] / avg_yield_present["avg_area_present"]
)

# calc change in yield
yield_change = pd.merge(
    avg_yield_past, avg_yield_present, on=["commodity_desc", "id", "state_alpha"]
)
yield_change["abs_change_yield"] = (
    yield_change["yield_present"] - yield_change["yield_past"]
)
yield_change["perc_change_yield"] = (
    (yield_change["yield_present"] - yield_change["yield_past"])
    / yield_change["yield_past"]
) * 100

# make geopandas df with yield info
midwest_counties_gdf = load_midwest_counties(db_name, crop_table, counties_gdf)
merged = gpd.GeoDataFrame(
    pd.merge(yield_change, midwest_counties_gdf, on="id", how="left")
)
merged.set_geometry("geometry", inplace=True)

corn_df = merged[merged["commodity_desc"] == "CORN"]

output_df = corn_df[["geometry", "avg_prod_present"]]

corn_df.to_csv("test.csv", index=False)


# Annnual Corn Production since 1975
query = f"""
Select 
    state_name,
    county_name,
    year,
    value AS annual_production,
    state_ansi|| county_ansi as id
from {crop_table} 
where short_desc != 'CORN, SILAGE - PRODUCTION, MEASURED IN TONS'
and commodity_desc = 'CORN'
and asd_code != 99
and county_ansi != ""
and year > 1975
"""
ann_prod_corn = pd.read_sql(query, conn)

# Generate a DataFrame with every combination of id and year
counties = ann_prod_corn["id"].unique()
years = pd.Series(
    range(1976, pd.to_datetime("today").year + 1)
)  # Years from 1976 to current year

# Create MultiIndex and convert to DataFrame
all_combinations = pd.MultiIndex.from_product([counties, years], names=["id", "Year"])
all_combinations = pd.DataFrame(
    all_combinations.to_flat_index().tolist(), columns=["id", "Year"]
)

# Merge with the original DataFrame
ann_prod_corn["Year"] = ann_prod_corn["year"]
full_data = all_combinations.merge(ann_prod_corn, on=["id", "Year"], how="left")

# Calculate rolling averages (5-year window)
full_data["fiveyr_rolling_avg"] = (
    full_data.sort_values(by=["id", "Year"])
    .groupby("id")["annual_production"]
    .rolling(window=5, min_periods=1)
    .mean()
    .reset_index(level=0, drop=True)
)


midwest_counties_gdf = load_midwest_counties(db_name, crop_table, counties_gdf)

# merge with geo data
merged = gpd.GeoDataFrame(
    pd.merge(full_data, midwest_counties_gdf, on="id", how="left")
)

output_df = merged[
    [
        "id",
        "state_name",
        "county_name",
        "Year",
        "annual_production",
        "fiveyr_rolling_avg",
        "geometry",
    ]
]
output_df = output_df[output_df["Year"] >= 1980]
# output_df = output_df[~output_df["fiveyr_rolling_avg"].isna()]

output_df.set_crs("EPSG:4326", inplace=True)

# output_df.to_file("output_data.geojson", driver="GeoJSON")
output_dir = "output_data"
os.makedirs(output_dir, exist_ok=True)
for year in output_df["Year"].unique():
    year_df = output_df[output_df["Year"] == year]
    year_filename = os.path.join(output_dir, f"output_{year}.geojson")
    year_df.to_file(year_filename, driver="GeoJSON")

midwest_counties_gdf.set_crs("EPSG:4326", inplace=True)
midwest_counties_gdf.to_file("counties.geojson", driver="GeoJSON")
print(states_gdf.dtypes)
midwest_states_gdf = states_gdf[states_gdf["id"].astype(int).isin(midwestern_state_ids)]

print(midwest_states_gdf.head())
# midwest_states_gdf = load_midwest_counties(db_name, crop_table, counties_gdf)
midwest_states_gdf.set_crs("EPSG:4326", inplace=True)
midwest_states_gdf.to_file("states.geojson", driver="GeoJSON")

states_gdf.set_crs("EPSG:4326", inplace=True)
states_gdf.to_file("all_states.geojson", driver="GeoJSON")
