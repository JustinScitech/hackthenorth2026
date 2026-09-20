/**
 * Public datasets that say something about a commercial property once it has coordinates.
 * Every source is a free HTTPS endpoint (only the Census data API wants a key), answers independently, and fails on its own:
 * one slow or missing dataset never blocks the others. Each returns a small, typed summary plus
 * the URL it read, so the finding that cites it can be checked by a person.
 */

export type Point = { latitude: number; longitude: number };

export type Geocoded = Point & {
  matchedAddress: string;
  stateFips: string;
  countyFips: string;
  countyName: string;
  tract: string | null;
  tractLandAreaSqMi: number | null;
};

export type SourceId = "flood" | "river" | "elevation" | "weather" | "seismic" | "wildfire" | "surroundings" | "epa" | "census" | "drought" | "disasters";

export type SourceResult<T = Record<string, unknown>> = {
  id: SourceId;
  label: string;
  status: "ok" | "unavailable";
  url: string;
  summary: string;
  data: T;
  ms: number;
};

const UA = { "User-Agent": "AstraRisk/1.0 (underwriting demo; public data lookup)" };

async function getJson<T>(url: string, timeoutMs = 10_000, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} from ${new URL(url).host}`), { status: response.status });
  return response.json() as Promise<T>;
}

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;
const miles = (km: number) => round(km * 0.621371, 1);

/** Great-circle distance in kilometres. */
export function distanceKm(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude), dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------------------------
// Geocoding: US Census Bureau. Also returns the tract and county, which the Census and drought
// lookups need.
// ---------------------------------------------------------------------------------------------

type CensusGeocode = { result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number }; geographies?: Record<string, { STATE?: string; COUNTY?: string; TRACT?: string; NAME?: string; AREALAND?: number | string }[]> }[] } };

export async function geocode(address: string): Promise<{ geocoded: Geocoded | null; url: string }> {
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const body = await getJson<CensusGeocode>(url, 12_000);
  const match = body.result?.addressMatches?.[0];
  if (!match) return { geocoded: null, url };
  const tract = match.geographies?.["Census Tracts"]?.[0];
  const county = match.geographies?.["Counties"]?.[0];
  const stateFips = tract?.STATE ?? county?.STATE ?? "";
  const countyFips = tract?.COUNTY ?? county?.COUNTY ?? "";
  return {
    url,
    geocoded: {
      latitude: match.coordinates.y, longitude: match.coordinates.x, matchedAddress: match.matchedAddress,
      stateFips, countyFips, countyName: county?.NAME ?? "",
      tract: tract?.TRACT ?? null,
      tractLandAreaSqMi: Number.isFinite(Number(tract?.AREALAND)) && Number(tract?.AREALAND) > 0 ? round(Number(tract?.AREALAND) / 2_589_988, 2) : null,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Each source below takes the geocoded point and returns a SourceResult. They are registered in
// SOURCES so the orchestrator can run them all at once.
// ---------------------------------------------------------------------------------------------

export type FloodData = { zone: string | null; subtype: string | null; specialFloodHazardArea: boolean | null };

/** FEMA National Flood Hazard Layer, flood hazard zones layer, queried at the point. */
export async function floodZone(point: Point): Promise<SourceResult<FloodData>> {
  const started = performance.now();
  const geometry = encodeURIComponent(JSON.stringify({ x: point.longitude, y: point.latitude, spatialReference: { wkid: 4326 } }));
  const url = `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?f=json&geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=false`;
  const body = await getJson<{ features?: { attributes: { FLD_ZONE?: string; ZONE_SUBTY?: string | null; SFHA_TF?: string } }[]; error?: { message?: string } }>(url, 12_000);
  if (body.error) throw new Error(body.error.message ?? "NFHL error");
  const attributes = body.features?.[0]?.attributes;
  const zone = attributes?.FLD_ZONE ?? null;
  const subtype = attributes?.ZONE_SUBTY || null;
  const sfha = attributes ? attributes.SFHA_TF === "T" : null;
  const summary = zone ? `FEMA flood zone ${zone}${subtype ? ` (${subtype.toLowerCase()})` : ""}${sfha ? ", a Special Flood Hazard Area" : sfha === false ? ", outside the Special Flood Hazard Area" : ""}.` : "The point falls outside FEMA's mapped flood layer.";
  return { id: "flood", label: "Flood zone (FEMA NFHL)", status: "ok", url, summary, data: { zone, subtype, specialFloodHazardArea: sfha }, ms: Math.round(performance.now() - started) };
}

export type RiverData = { years: number; medianDischarge: number; typicalHighDischarge: number; maxDischarge: number; daysOver3xTypicalHigh: number };

/** Open-Meteo flood API (GloFAS): ten years of modelled daily discharge for the nearest river cell, a riverine flood signal that answers even where the FEMA layer is out of reach. */
export async function riverFlood(point: Point, asOf = new Date()): Promise<SourceResult<RiverData>> {
  const started = performance.now();
  const end = new Date(asOf.getTime() - 7 * 86_400_000);
  const start = new Date(end); start.setFullYear(end.getFullYear() - 10);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${point.latitude}&longitude=${point.longitude}&daily=river_discharge&start_date=${iso(start)}&end_date=${iso(end)}`;
  const body = await getJson<{ daily?: { river_discharge?: (number | null)[] } }>(url, 15_000);
  const flows = (body.daily?.river_discharge ?? []).filter((v): v is number => typeof v === "number");
  if (!flows.length) throw new Error("No river discharge returned");
  const sorted = [...flows].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // The 90th percentile is a "normal high" for that river; days far above it are the floods, whatever the river's size.
  const typicalHigh = sorted[Math.floor(sorted.length * 0.9)];
  const data: RiverData = { years: 10, medianDischarge: round(median, 1), typicalHighDischarge: round(typicalHigh, 1), maxDischarge: round(sorted[sorted.length - 1], 1), daysOver3xTypicalHigh: typicalHigh > 0 ? flows.filter((v) => v >= typicalHigh * 3).length : 0 };
  const summary = `Nearest modelled river: median flow ${data.medianDischarge} m³/s, normal high ${data.typicalHighDischarge} m³/s, ten-year peak ${data.maxDischarge} m³/s, ${data.daysOver3xTypicalHigh} day${data.daysOver3xTypicalHigh === 1 ? "" : "s"} at three times the normal high or more.`;
  return { id: "river", label: "River flood signal (GloFAS via Open-Meteo)", status: "ok", url, summary, data, ms: Math.round(performance.now() - started) };
}

export type ElevationData = { elevationFt: number };

/** Open-Meteo elevation model, for context beside the flood zone. */
export async function elevation(point: Point): Promise<SourceResult<ElevationData>> {
  const started = performance.now();
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${point.latitude}&longitude=${point.longitude}`;
  const body = await getJson<{ elevation?: number[] }>(url, 8_000);
  const metres = body.elevation?.[0];
  if (typeof metres !== "number") throw new Error("No elevation returned");
  const elevationFt = Math.round(metres * 3.28084);
  return { id: "elevation", label: "Elevation (Open-Meteo)", status: "ok", url, summary: `Ground elevation about ${elevationFt.toLocaleString("en-US")} ft above sea level.`, data: { elevationFt }, ms: Math.round(performance.now() - started) };
}

export type WeatherData = { years: number; maxGustMph: number; gustDaysOver60: number; gustDaysOver75: number; heavyRainDays: number; maxDailyRainIn: number; hardFreezeDays: number; maxDailySnowIn: number };

/** Open-Meteo historical archive: ten years of daily extremes at the point. */
export async function weatherHistory(point: Point, asOf = new Date()): Promise<SourceResult<WeatherData>> {
  const started = performance.now();
  const end = new Date(asOf.getTime() - 7 * 86_400_000);
  const start = new Date(end); start.setFullYear(end.getFullYear() - 10);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${point.latitude}&longitude=${point.longitude}&start_date=${iso(start)}&end_date=${iso(end)}&daily=wind_gusts_10m_max,precipitation_sum,temperature_2m_min,snowfall_sum&wind_speed_unit=mph&precipitation_unit=inch&temperature_unit=fahrenheit&timezone=auto`;
  const body = await getJson<{ daily?: { wind_gusts_10m_max?: (number | null)[]; precipitation_sum?: (number | null)[]; temperature_2m_min?: (number | null)[]; snowfall_sum?: (number | null)[] } }>(url, 15_000);
  const gusts = (body.daily?.wind_gusts_10m_max ?? []).filter((v): v is number => typeof v === "number");
  const rain = (body.daily?.precipitation_sum ?? []).filter((v): v is number => typeof v === "number");
  const mins = (body.daily?.temperature_2m_min ?? []).filter((v): v is number => typeof v === "number");
  const snow = (body.daily?.snowfall_sum ?? []).filter((v): v is number => typeof v === "number");
  if (!gusts.length) throw new Error("No daily weather returned");
  const data: WeatherData = {
    years: 10,
    maxGustMph: Math.round(Math.max(...gusts)),
    gustDaysOver60: gusts.filter((v) => v >= 60).length,
    gustDaysOver75: gusts.filter((v) => v >= 75).length,
    heavyRainDays: rain.filter((v) => v >= 2).length,
    maxDailyRainIn: round(Math.max(0, ...rain), 2),
    hardFreezeDays: mins.filter((v) => v <= 15).length,
    maxDailySnowIn: round(Math.max(0, ...snow), 1),
  };
  const summary = `Over ten years: peak wind gust ${data.maxGustMph} mph with ${data.gustDaysOver60} days at 60 mph or more; ${data.heavyRainDays} days with 2 in or more of rain (max ${data.maxDailyRainIn} in); ${data.hardFreezeDays} hard-freeze days at 15°F or below.`;
  return { id: "weather", label: "Weather history (Open-Meteo, 10 years)", status: "ok", url, summary, data, ms: Math.round(performance.now() - started) };
}

export type SeismicData = { quakesM45Within100km: number; since: string; largestMagnitude: number | null; largestPlace: string | null };

/** USGS earthquake catalogue: how often the ground has moved within 100 km since 1975. */
export async function seismicity(point: Point): Promise<SourceResult<SeismicData>> {
  const started = performance.now();
  const common = `format=geojson&latitude=${point.latitude}&longitude=${point.longitude}&maxradiuskm=100&minmagnitude=4.5&starttime=1975-01-01`;
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?${common}&orderby=magnitude&limit=1`;
  const [count, largest] = await Promise.all([
    getJson<{ count?: number }>(`https://earthquake.usgs.gov/fdsnws/event/1/count?${common}`, 10_000),
    getJson<{ features?: { properties: { mag: number; place: string } }[] }>(url, 10_000),
  ]);
  const top = largest.features?.[0]?.properties;
  const data: SeismicData = { quakesM45Within100km: count.count ?? 0, since: "1975", largestMagnitude: top ? round(top.mag, 1) : null, largestPlace: top?.place ?? null };
  const summary = data.quakesM45Within100km ? `${data.quakesM45Within100km} earthquakes of M4.5 or more within 100 km since 1975; the largest was M${data.largestMagnitude} (${data.largestPlace}).` : "No earthquakes of M4.5 or more within 100 km since 1975.";
  return { id: "seismic", label: "Seismicity (USGS)", status: "ok", url, summary, data, ms: Math.round(performance.now() - started) };
}

export type WildfireData = { firesWithin10km: number; firesWithin2km: number; acresWithin10km: number; latestYear: number | null; latestName: string | null };

const NIFC = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/InterAgencyFirePerimeterHistory_All_Years_View/FeatureServer/0/query";

/** NIFC interagency fire-perimeter history: wildfires that have burned near the point since 2000, and how close they came. */
export async function wildfireHistory(point: Point): Promise<SourceResult<WildfireData>> {
  const started = performance.now();
  const geometry = encodeURIComponent(JSON.stringify({ x: point.longitude, y: point.latitude, spatialReference: { wkid: 4326 } }));
  const base = `${NIFC}?f=json&geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&units=esriSRUnit_Meter&where=${encodeURIComponent("FIRE_YEAR_INT>=2000")}`;
  const listing = `${base}&distance=10000&outFields=INCIDENT,GIS_ACRES,FIRE_YEAR_INT&returnGeometry=false&orderByFields=FIRE_YEAR_INT%20DESC&resultRecordCount=25`;
  const [near, close, recent] = await Promise.all([
    getJson<{ count?: number; error?: { message?: string } }>(`${base}&distance=10000&returnCountOnly=true`, 12_000),
    getJson<{ count?: number }>(`${base}&distance=2000&returnCountOnly=true`, 12_000),
    getJson<{ features?: { attributes: { INCIDENT?: string; GIS_ACRES?: number; FIRE_YEAR_INT?: number } }[] }>(listing, 12_000),
  ]);
  if (near.error) throw new Error(near.error.message ?? "NIFC error");
  const rows = recent.features?.map((feature) => feature.attributes) ?? [];
  const data: WildfireData = {
    firesWithin10km: near.count ?? 0, firesWithin2km: close.count ?? 0,
    acresWithin10km: Math.round(rows.reduce((sum, row) => sum + (row.GIS_ACRES ?? 0), 0)),
    latestYear: rows[0]?.FIRE_YEAR_INT ?? null, latestName: rows[0]?.INCIDENT ?? null,
  };
  const summary = data.firesWithin10km
    ? `${data.firesWithin10km} wildfire perimeter${data.firesWithin10km === 1 ? "" : "s"} within 10 km since 2000, ${data.firesWithin2km} within 2 km, about ${data.acresWithin10km.toLocaleString("en-US")} acres across the most recent; latest was ${data.latestName ?? "unnamed"} in ${data.latestYear}.`
    : "No recorded wildfire perimeters within 10 km since 2000.";
  return { id: "wildfire", label: "Wildfire history (NIFC)", status: "ok", url: listing, summary, data, ms: Math.round(performance.now() - started) };
}

export type SurroundingsData = {
  nearestFireStationMi: number | null; fireStationsWithin5Mi: number; hydrantsWithin300m: number;
  fuelStationsWithin150m: number; industrialWithin300m: number; railWithin100m: number; coastlineWithin5km: boolean;
  building: { type: string | null; levels: number | null; heightFt: number | null; name: string | null } | null;
};

type OverpassElement = { type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

/** OpenStreetMap through Overpass, one query: fire protection, hydrants, neighbouring hazards, coastline, and the building itself. */
export async function surroundings(point: Point): Promise<SourceResult<SurroundingsData>> {
  const started = performance.now();
  const { latitude: lat, longitude: lon } = point;
  const query = `[out:json][timeout:20];(
    nwr(around:8000,${lat},${lon})[amenity=fire_station];
    node(around:300,${lat},${lon})[emergency=fire_hydrant];
    nwr(around:150,${lat},${lon})[amenity=fuel];
    way(around:300,${lat},${lon})[landuse=industrial];
    way(around:100,${lat},${lon})[railway=rail];
    way(around:5000,${lat},${lon})[natural=coastline];
    way(around:20,${lat},${lon})[building];
  );out tags center;`;
  const request = { method: "POST", body: `data=${encodeURIComponent(query)}`, headers: { "Content-Type": "application/x-www-form-urlencoded" } };
  // The main instance sheds load with 504s at busy times; the mirror usually answers.
  const body = await getJson<{ elements?: OverpassElement[] }>("https://overpass-api.de/api/interpreter", 25_000, request)
    .catch(() => getJson<{ elements?: OverpassElement[] }>("https://overpass.kumi.systems/api/interpreter", 25_000, request));
  const elements = body.elements ?? [];
  const at = (element: OverpassElement): Point | null => element.center ? { latitude: element.center.lat, longitude: element.center.lon } : typeof element.lat === "number" && typeof element.lon === "number" ? { latitude: element.lat, longitude: element.lon } : null;
  const has = (element: OverpassElement, key: string, value?: string) => element.tags?.[key] !== undefined && (value === undefined || element.tags[key] === value);
  const stations = elements.filter((e) => has(e, "amenity", "fire_station")).map(at).filter((p): p is Point => p !== null).map((p) => distanceKm(point, p));
  const buildings = elements.filter((e) => has(e, "building")).map((e) => ({ element: e, distance: at(e) ? distanceKm(point, at(e)!) : Infinity })).sort((a, b) => a.distance - b.distance);
  const nearest = buildings[0]?.element.tags;
  const levels = nearest?.["building:levels"] ? Number(nearest["building:levels"]) : null;
  const height = nearest?.height ? Number(String(nearest.height).replace(/[^\d.]/g, "")) : null;
  const data: SurroundingsData = {
    nearestFireStationMi: stations.length ? miles(Math.min(...stations)) : null,
    fireStationsWithin5Mi: stations.filter((km) => km <= 8.05).length,
    hydrantsWithin300m: elements.filter((e) => has(e, "emergency", "fire_hydrant")).length,
    fuelStationsWithin150m: elements.filter((e) => has(e, "amenity", "fuel")).length,
    industrialWithin300m: elements.filter((e) => has(e, "landuse", "industrial")).length,
    railWithin100m: elements.filter((e) => has(e, "railway", "rail")).length,
    coastlineWithin5km: elements.some((e) => has(e, "natural", "coastline")),
    building: nearest ? { type: nearest.building && nearest.building !== "yes" ? nearest.building : null, levels: Number.isFinite(levels) ? levels : null, heightFt: height && Number.isFinite(height) ? Math.round(height * 3.28084) : null, name: nearest.name ?? null } : null,
  };
  const parts = [
    data.nearestFireStationMi === null ? "No fire station mapped within 5 miles" : `Nearest fire station ${data.nearestFireStationMi} mi away (${data.fireStationsWithin5Mi} within 5 mi)`,
    `${data.hydrantsWithin300m} hydrant${data.hydrantsWithin300m === 1 ? "" : "s"} mapped within 300 m`,
    ...(data.fuelStationsWithin150m ? [`${data.fuelStationsWithin150m} fuel station${data.fuelStationsWithin150m === 1 ? "" : "s"} within 150 m`] : []),
    ...(data.industrialWithin300m ? ["industrial land within 300 m"] : []),
    ...(data.railWithin100m ? ["a rail line within 100 m"] : []),
    ...(data.coastlineWithin5km ? ["coastline within 5 km"] : []),
    ...(data.building ? [`building mapped as ${data.building.type ?? "unspecified"}${data.building.levels ? `, ${data.building.levels} levels` : ""}${data.building.name ? ` (${data.building.name})` : ""}`] : []),
  ];
  return { id: "surroundings", label: "Surroundings (OpenStreetMap)", status: "ok", url: `https://www.openstreetmap.org/#map=17/${lat}/${lon}`, summary: `${parts.join("; ")}.`, data, ms: Math.round(performance.now() - started) };
}

export type EpaData = { facilitiesWithinHalfMile: number; withViolations: number; names: string[] };

/** EPA ECHO: regulated facilities (air, water, hazardous waste) within half a mile, and how many carry current violations. */
export async function epaFacilities(point: Point): Promise<SourceResult<EpaData>> {
  const started = performance.now();
  const url = `https://echodata.epa.gov/echo/echo_rest_services.get_facilities?output=JSON&p_lat=${point.latitude}&p_long=${point.longitude}&p_radius=0.5&responseset=20`;
  const first = await getJson<{ Results?: { QueryRows?: string; QueryID?: string; Message?: string; Error?: { ErrorMessage?: string } } }>(url, 12_000);
  if (first.Results?.Error) throw new Error(first.Results.Error.ErrorMessage ?? "ECHO error");
  const count = Number(first.Results?.QueryRows ?? 0);
  let names: string[] = [], withViolations = 0;
  if (count > 0 && first.Results?.QueryID) {
    const page = await getJson<{ Results?: { Facilities?: { FacName?: string; CurrVioFlag?: string }[] } }>(`https://echodata.epa.gov/echo/echo_rest_services.get_qid?output=JSON&qid=${first.Results.QueryID}&pageno=1`, 12_000);
    const facilities = page.Results?.Facilities ?? [];
    names = facilities.map((f) => f.FacName ?? "").filter(Boolean).slice(0, 5);
    withViolations = facilities.filter((f) => f.CurrVioFlag === "Y").length;
  }
  const summary = count ? `${count} EPA-regulated facilit${count === 1 ? "y" : "ies"} within half a mile${withViolations ? `, ${withViolations} with current violations` : ""}${names.length ? ` (${names.join("; ")})` : ""}.` : "No EPA-regulated facilities within half a mile.";
  return { id: "epa", label: "Regulated facilities nearby (EPA ECHO)", status: "ok", url, summary, data: { facilitiesWithinHalfMile: count, withViolations, names }, ms: Math.round(performance.now() - started) };
}

export type CensusData = { tractName: string; population: number | null; peoplePerSqMi: number | null; medianHouseholdIncome: number | null; vacancyRatePct: number | null };

/** Census ACS five-year estimates for the tract: population, density, income, housing vacancy. The data API wants a free key (CENSUS_API_KEY); the geocoder above works without one. */
export async function censusTract(geocoded: Geocoded): Promise<SourceResult<CensusData>> {
  const started = performance.now();
  if (!geocoded.tract) throw new Error("No census tract for this address");
  const key = process.env.CENSUS_API_KEY;
  if (!key) throw new Error("needs CENSUS_API_KEY (free at api.census.gov/data/key_signup.html)");
  const url = `https://api.census.gov/data/2023/acs/acs5?get=NAME,B01003_001E,B19013_001E,B25002_001E,B25002_003E&for=tract:${geocoded.tract}&in=state:${geocoded.stateFips}%20county:${geocoded.countyFips}&key=${encodeURIComponent(key)}`;
  const rows = await getJson<string[][]>(url, 12_000);
  const row = rows[1];
  if (!row) throw new Error("No ACS row for this tract");
  const num = (value: string | undefined) => { const n = Number(value); return value !== undefined && Number.isFinite(n) && n >= 0 ? n : null; };
  const population = num(row[1]), income = num(row[2]), units = num(row[3]), vacant = num(row[4]);
  const data: CensusData = {
    tractName: row[0], population,
    peoplePerSqMi: population !== null && geocoded.tractLandAreaSqMi ? Math.round(population / geocoded.tractLandAreaSqMi) : null,
    medianHouseholdIncome: income, vacancyRatePct: units && vacant !== null ? round((vacant / units) * 100, 1) : null,
  };
  const summary = `${data.tractName}: ${population?.toLocaleString("en-US") ?? "unknown"} residents${data.peoplePerSqMi ? ` (${data.peoplePerSqMi.toLocaleString("en-US")} per sq mi)` : ""}, median household income ${income ? `$${income.toLocaleString("en-US")}` : "unknown"}, housing vacancy ${data.vacancyRatePct ?? "unknown"}%.`;
  return { id: "census", label: "Neighbourhood (Census ACS 2023)", status: "ok", url, summary, data, ms: Math.round(performance.now() - started) };
}

export type DroughtData = { weeksInSevereDroughtPct: number; latestSevereAreaPct: number };

/** US Drought Monitor county statistics for the last year: share of weeks with severe drought (D2+) over half the county. */
export async function droughtHistory(geocoded: Geocoded, asOf = new Date()): Promise<SourceResult<DroughtData>> {
  const started = performance.now();
  const fips = `${geocoded.stateFips}${geocoded.countyFips}`;
  if (fips.length !== 5) throw new Error("No county FIPS for this address");
  const start = new Date(asOf); start.setFullYear(asOf.getFullYear() - 1);
  const us = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const url = `https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent?aoi=${fips}&startdate=${us(start)}&enddate=${us(asOf)}&statisticsType=1`;
  const weeks = await getJson<{ D2?: number | string; D3?: number | string; D4?: number | string }[]>(url, 12_000, { headers: { Accept: "application/json" } });
  if (!Array.isArray(weeks) || !weeks.length) throw new Error("No drought weeks returned");
  const severe = weeks.map((w) => Number(w.D2 ?? 0));
  const data: DroughtData = { weeksInSevereDroughtPct: Math.round((severe.filter((pct) => pct >= 50).length / weeks.length) * 100), latestSevereAreaPct: round(severe[0] ?? 0, 0) };
  const summary = data.weeksInSevereDroughtPct ? `Severe drought (D2 or worse) covered most of the county in ${data.weeksInSevereDroughtPct}% of the past year's weeks; latest reading ${data.latestSevereAreaPct}% of the county.` : "No week in the past year had severe drought over most of the county.";
  return { id: "drought", label: "Drought (US Drought Monitor, past year)", status: "ok", url, summary, data, ms: Math.round(performance.now() - started) };
}

export type DisastersData = { declarationsSince: string; total: number; byType: Record<string, number>; latest: { type: string; date: string; title: string } | null };

/** OpenFEMA: federally declared disasters for the county over the last twenty years. */
export async function disasterDeclarations(geocoded: Geocoded, asOf = new Date()): Promise<SourceResult<DisastersData>> {
  const started = performance.now();
  if (!geocoded.stateFips || !geocoded.countyFips) throw new Error("No county for this address");
  const since = new Date(asOf); since.setFullYear(asOf.getFullYear() - 20);
  const filter = encodeURIComponent(`fipsStateCode eq '${geocoded.stateFips}' and fipsCountyCode eq '${geocoded.countyFips}' and declarationDate ge '${since.toISOString()}'`);
  const url = `https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=${filter}&$select=incidentType,declarationDate,declarationTitle&$orderby=declarationDate%20desc&$top=1000`;
  const body = await getJson<{ DisasterDeclarationsSummaries?: { incidentType: string; declarationDate: string; declarationTitle: string }[] }>(url, 12_000);
  const rows = body.DisasterDeclarationsSummaries ?? [];
  const byType: Record<string, number> = {};
  for (const row of rows) byType[row.incidentType] = (byType[row.incidentType] ?? 0) + 1;
  const latest = rows[0] ? { type: rows[0].incidentType, date: rows[0].declarationDate.slice(0, 10), title: rows[0].declarationTitle } : null;
  const data: DisastersData = { declarationsSince: since.toISOString().slice(0, 4), total: rows.length, byType, latest };
  const listed = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([type, n]) => `${type.toLowerCase()} ×${n}`).join(", ");
  const summary = rows.length ? `${rows.length} federal disaster declarations for ${geocoded.countyName || "the county"} since ${data.declarationsSince}: ${listed}. Latest: ${latest?.title} (${latest?.date}).` : `No federal disaster declarations for ${geocoded.countyName || "the county"} since ${data.declarationsSince}.`;
  return { id: "disasters", label: "Disaster declarations (OpenFEMA, 20 years)", status: "ok", url, summary, data, ms: Math.round(performance.now() - started) };
}

/** Every source, keyed by id, so the orchestrator and tests can run them uniformly. */
export const SOURCES: Record<SourceId, { label: string; run: (geocoded: Geocoded, asOf: Date) => Promise<SourceResult> }> = {
  flood: { label: "Flood zone (FEMA NFHL)", run: (g) => floodZone(g) },
  river: { label: "River flood signal (GloFAS via Open-Meteo)", run: (g, asOf) => riverFlood(g, asOf) },
  elevation: { label: "Elevation (Open-Meteo)", run: (g) => elevation(g) },
  weather: { label: "Weather history (Open-Meteo, 10 years)", run: (g, asOf) => weatherHistory(g, asOf) },
  seismic: { label: "Seismicity (USGS)", run: (g) => seismicity(g) },
  wildfire: { label: "Wildfire history (NIFC)", run: (g) => wildfireHistory(g) },
  surroundings: { label: "Surroundings (OpenStreetMap)", run: (g) => surroundings(g) },
  epa: { label: "Regulated facilities nearby (EPA ECHO)", run: (g) => epaFacilities(g) },
  census: { label: "Neighbourhood (Census ACS 2023)", run: (g) => censusTract(g) },
  drought: { label: "Drought (US Drought Monitor, past year)", run: (g, asOf) => droughtHistory(g, asOf) },
  disasters: { label: "Disaster declarations (OpenFEMA, 20 years)", run: (g, asOf) => disasterDeclarations(g, asOf) },
};
