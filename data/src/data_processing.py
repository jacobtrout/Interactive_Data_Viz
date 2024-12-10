import pandas as pd
import sqlite3
from vega_datasets import data
import geopandas as gpd
import os

# Configuration
DB_NAME = "field_crops.db"
CROP_TABLE = "midwest_key_field_crops_cleaned"
AREA_TABLE = "midwest_area_planted_cleaned"
OUTPUT_PATH = "../viz/"
MIDWESTERN_STATE_IDS = [17, 18, 19, 20, 26, 27, 29, 31, 38, 39, 46, 55]


def load_midwest_counties(conn, table, counties_gdf):
    """
    Load and filter counties GeoDataFrame for Midwestern states.
    """
    query = f"SELECT DISTINCT state_ansi FROM {table}"
    state_ansi_list = pd.read_sql(query, conn).iloc[:, 0].to_list()

    # Filter counties to only include Midwest states with valid county codes
    midwest_counties_gdf = counties_gdf[
        counties_gdf["id"].str[:2].isin(state_ansi_list)
        & (counties_gdf["id"].str.len() == 5)
    ]

    return midwest_counties_gdf


def get_production_data(conn, table, year_start, year_end):
    """
    Get average production data for a specific time period.
    """
    query = f"""
    SELECT 
        avg(value) AS avg_prod,
        commodity_desc,
        state_alpha, 
        state_ansi || county_ansi as id
    FROM {table} 
    WHERE short_desc != 'CORN, SILAGE - PRODUCTION, MEASURED IN TONS'
        AND asd_code != 99
        AND county_ansi != ""
        AND year BETWEEN {year_start} AND {year_end}
    GROUP BY state_ansi || county_ansi, commodity_desc
    """
    return pd.read_sql(query, conn)


def get_area_data(conn, table, year_start, year_end):
    """
    Get average area data for a specific time period.
    """
    query = f"""
    SELECT 
        avg(value) AS avg_area,
        commodity_desc,
        state_alpha,
        state_ansi || county_ansi as id
    FROM {table} 
    WHERE short_desc != 'CORN, SILAGE - PRODUCTION, MEASURED IN TONS'
        AND asd_code != 99
        AND county_ansi != ""
        AND year BETWEEN {year_start} AND {year_end}
    GROUP BY state_ansi || county_ansi, commodity_desc
    """
    return pd.read_sql(query, conn)


def calculate_yield_changes(prod_past, area_past, prod_present, area_present):
    """
    Calculate yield changes between two time periods.
    """
    # Calculate yields for each period
    yield_past = pd.merge(
        prod_past, area_past, on=["commodity_desc", "id", "state_alpha"]
    )
    yield_past["yield_past"] = yield_past["avg_prod"] / yield_past["avg_area"]

    yield_present = pd.merge(
        prod_present, area_present, on=["commodity_desc", "id", "state_alpha"]
    )
    yield_present["yield_present"] = (
        yield_present["avg_prod"] / yield_present["avg_area"]
    )

    # Calculate changes
    yield_change = pd.merge(
        yield_past, yield_present, on=["commodity_desc", "id", "state_alpha"]
    )
    yield_change["abs_change_yield"] = (
        yield_change["yield_present"] - yield_change["yield_past"]
    )
    yield_change["perc_change_yield"] = (
        (yield_change["yield_present"] - yield_change["yield_past"])
        / yield_change["yield_past"]
        * 100
    )

    return yield_change


def get_annual_data(conn, crop_table, area_table):
    """
    Get annual production and area data since 1975, and calculate yields.
    """
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

    # Get production and area data
    prod_df = pd.read_sql(production_query, conn)
    area_df = pd.read_sql(area_query, conn)

    # Merge production and area data
    annual_data = pd.merge(prod_df, area_df, on=["id", "year"], how="outer")

    # Calculate yield
    annual_data["annual_yield"] = (
        annual_data["annual_production"] / annual_data["annual_area"]
    )

    return annual_data


def main():
    # Load geographic data
    url = data.us_10m.url
    states_gdf = gpd.read_file(url, layer="states")
    counties_gdf = gpd.read_file(url, layer="counties")

    # Create output directories
    os.makedirs(f"{OUTPUT_PATH}output_data", exist_ok=True)
    os.makedirs(f"{OUTPUT_PATH}backgrounds", exist_ok=True)

    # Create single connection object
    conn = sqlite3.connect(DB_NAME)

    try:
        # Get production and area data
        prod_past = get_production_data(conn, CROP_TABLE, 1975, 1980)
        prod_present = get_production_data(conn, CROP_TABLE, 2018, 2023)
        area_past = get_area_data(conn, AREA_TABLE, 1975, 1980)
        area_present = get_area_data(conn, AREA_TABLE, 2018, 2023)

        # Calculate yield changes
        yield_change = calculate_yield_changes(
            prod_past, area_past, prod_present, area_present
        )

        # Process corn data
        midwest_counties_gdf = load_midwest_counties(conn, CROP_TABLE, counties_gdf)
        merged = gpd.GeoDataFrame(
            pd.merge(yield_change, midwest_counties_gdf, on="id", how="left")
        )
        merged.set_geometry("geometry", inplace=True)

        # Get and process annual data
        annual_data = get_annual_data(conn, CROP_TABLE, AREA_TABLE)

        # Create complete time series
        counties = annual_data["id"].unique()
        years = pd.Series(range(1976, pd.to_datetime("today").year + 1))
        all_combinations = pd.MultiIndex.from_product(
            [counties, years], names=["id", "Year"]
        )
        all_combinations = pd.DataFrame(
            all_combinations.to_flat_index().tolist(), columns=["id", "Year"]
        )

        # Merge and calculate rolling averages
        annual_data["Year"] = annual_data["year"]
        full_data = all_combinations.merge(annual_data, on=["id", "Year"], how="left")

        # Calculate 5-year rolling averages for both production and yield
        full_data[["fiveyr_rolling_prod", "fiveyr_rolling_yield"]] = (
            full_data.sort_values(by=["id", "Year"])
            .groupby("id")[["annual_production", "annual_yield"]]
            .rolling(window=5, min_periods=1)
            .mean()
            .reset_index(level=0, drop=True)
        )

        # Create final output
        output_df = merged[["id", "state_name", "county_name", "geometry"]].copy()
        output_df = output_df.merge(
            full_data[
                [
                    "id",
                    "Year",
                    "annual_production",
                    "annual_yield",
                    "fiveyr_rolling_prod",
                    "fiveyr_rolling_yield",
                ]
            ],
            on="id",
            how="left",
        )
        output_df = output_df[output_df["Year"] >= 1980]
        output_df.set_crs("EPSG:4326", inplace=True)

        # Save files
        for year in output_df["Year"].unique():
            year_df = output_df[output_df["Year"] == year]
            year_filename = os.path.join(
                f"{OUTPUT_PATH}output_data", f"output_{year}.geojson"
            )
            year_df.to_file(year_filename, driver="GeoJSON")

        # Save background files
        midwest_counties_gdf.set_crs("EPSG:4326", inplace=True)
        midwest_counties_gdf.to_file(
            f"{OUTPUT_PATH}backgrounds/counties.geojson", driver="GeoJSON"
        )

        midwest_states_gdf = states_gdf[
            states_gdf["id"].astype(int).isin(MIDWESTERN_STATE_IDS)
        ]
        midwest_states_gdf.set_crs("EPSG:4326", inplace=True)
        midwest_states_gdf.to_file(
            f"{OUTPUT_PATH}backgrounds/states.geojson", driver="GeoJSON"
        )

        states_gdf.set_crs("EPSG:4326", inplace=True)
        states_gdf.to_file(
            f"{OUTPUT_PATH}backgrounds/all_states.geojson", driver="GeoJSON"
        )

    finally:
        conn.close()


if __name__ == "__main__":
    main()
