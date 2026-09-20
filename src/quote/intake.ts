import { provinces } from "./rating";
import type { AutoQuoteInput, QuoteRequest, TenantQuoteInput } from "./types";

/**
 * Pulls quoting facts out of a free-text request. Only facts the text states
 * are taken; anything ambiguous stays unset so the assistant asks instead of
 * guessing. A live model can sit in front of this later; the parser is the
 * floor the evals hold it to.
 */
const cities: Record<string, string> = {
  toronto: "ON", ottawa: "ON", mississauga: "ON", hamilton: "ON", london: "ON", kitchener: "ON", waterloo: "ON", brampton: "ON", markham: "ON",
  montreal: "QC", "montréal": "QC", quebec: "QC", "québec": "QC", laval: "QC", gatineau: "QC",
  vancouver: "BC", victoria: "BC", surrey: "BC", burnaby: "BC", kelowna: "BC",
  calgary: "AB", edmonton: "AB", "red deer": "AB",
  winnipeg: "MB", regina: "SK", saskatoon: "SK", halifax: "NS", moncton: "NB", fredericton: "NB", "st. john's": "NL", charlottetown: "PE", whitehorse: "YT", yellowknife: "NT", iqaluit: "NU",
};
const provinceNames = Object.fromEntries(Object.entries(provinces).map(([code, item]) => [item.name.toLowerCase(), code]));
const makes = ["honda", "toyota", "ford", "hyundai", "kia", "mazda", "nissan", "chevrolet", "chevy", "gmc", "ram", "dodge", "jeep", "subaru", "volkswagen", "vw", "bmw", "mercedes", "audi", "tesla", "lexus", "acura", "volvo", "mitsubishi"];
const words: Record<string, number> = { zero: 0, no: 0, none: 0, one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const count = (value: string) => /^\d+$/.test(value) ? Number(value) : words[value.toLowerCase()] ?? Number.NaN;
const money = (value: string) => { const amount = Number(value.replace(/[$,]/g, "").replace(/k$/i, "")); return /k$/i.test(value) ? amount * 1000 : amount; };
const MONEY = "\\$?\\d{1,3}(?:,\\d{3})+|\\$?\\d+(?:\\.\\d+)?k|\\$\\d+";

function province(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [city, code] of Object.entries(cities)) if (new RegExp(`\\b${city.replace(".", "\\.")}\\b`).test(lower)) return code;
  for (const [name, code] of Object.entries(provinceNames)) if (lower.includes(name)) return code;
  const code = text.match(/\b(?:in|from|for|to)\s+(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\b/);
  return code ? code[1] : null;
}

export function parseQuoteRequest(text: string): QuoteRequest {
  const tenant: TenantQuoteInput = {};
  const auto: AutoQuoteInput = {};
  const lower = text.toLowerCase();
  const tenantWords = /\b(?:renters?|renter's|tenants?|tenant's|apartment|condo|basement|belongings|contents)\b/i.test(text);
  const vehicle = text.match(new RegExp(`\\b((?:19|20)\\d{2})\\s+(${makes.join("|")})\\s+([A-Za-z0-9-]+)`, "i"));
  const autoWords = /\b(?:car|auto|vehicle|drive|driving|driver|truck|suv|km|kilomet|commute|winter tires|collision|at-fault)\b/i.test(text) || vehicle !== null;
  const product = tenantWords && !autoWords ? "tenant" : autoWords && !tenantWords ? "auto" : vehicle ? "auto" : tenantWords ? "tenant" : null;

  const where = province(text);
  if (where) { tenant.province = where; auto.province = where; }

  const contents = text.match(new RegExp(`(${MONEY})\\s+(?:worth\\s+)?(?:of\\s+)?(?:stuff|belongings|contents|furniture|things|possessions)|(?:stuff|belongings|contents|possessions)\\s+(?:(?:are|is)\\s+)?(?:worth|valued at|of about|of)\\s+(?:about\\s+)?(${MONEY})`, "i"));
  if (contents) tenant.contentsValue = money(contents[1] ?? contents[2]);
  const building = lower.match(/\b(apartment|condo|basement|house)\b/);
  if (building) tenant.buildingType = building[1] as TenantQuoteInput["buildingType"];
  const deductible = text.match(new RegExp(`(${MONEY})\\s+deductible|deductible\\s+(?:of\\s+)?(${MONEY})`, "i"));
  if (deductible) { const amount = money(deductible[1] ?? deductible[2]); if (amount === 500 || amount === 1000 || amount === 2500) tenant.deductible = amount; }
  const claims = text.match(/\b(no|zero|none|one|two|three|four|five|\d+)\s+(?:insurance\s+)?claims?\b/i) ?? (/\bno claims\b|\bclaims?[-\s]free\b/i.test(text) ? ["", "no"] : null);
  if (claims && product !== "auto") { const value = count(claims[1]); if (Number.isFinite(value)) tenant.priorClaims = value; }

  const age = text.match(/\b(?:i(?:'|’)?m|i am|age|aged)\s+(\d{2})\b/i) ?? text.match(/\b(\d{2})\s*(?:years?\s+old|yo|y\/o)\b/i);
  if (age) auto.driverAge = Number(age[1]);
  if (vehicle) { auto.vehicleYear = Number(vehicle[1]); auto.vehicleMake = vehicle[2][0].toUpperCase() + vehicle[2].slice(1); auto.vehicleModel = vehicle[3]; }
  const value = text.match(new RegExp(`(?:car|vehicle|truck|suv)\\s+(?:is\\s+)?(?:worth|valued at)\\s+(?:about\\s+)?(${MONEY})`, "i"));
  if (value) auto.vehicleValue = money(value[1]);
  const km = text.match(/\b(\d{1,3}(?:,\d{3})+|\d{3,6})\s*(?:km|kilomet(?:re|er)s?)\b/i);
  if (km) auto.annualKm = Number(km[1].replace(/,/g, ""));
  if (/\b(?:pleasure|personal use only)\b/i.test(text)) auto.usage = "pleasure";
  else if (/\b(?:business|deliver|rideshare|uber)\b/i.test(text)) auto.usage = "business";
  else if (/\b(?:commut|to work|to the office|to school)/i.test(text)) auto.usage = "commute";
  const licensed = text.match(/\b(?:licensed|driving|been driving|had my licen[cs]e)\s+(?:for\s+)?(\d{1,2})\s+years?\b/i) ?? text.match(/\b(\d{1,2})\s+years?\s+(?:of\s+)?(?:driving|licensed)\b/i);
  if (licensed) auto.yearsLicensed = Number(licensed[1]);
  const accidents = text.match(/\b(no|zero|one|two|three|\d+)\s+at[-\s]fault\s+(?:accidents?|collisions?|claims?)\b/i);
  if (accidents) { const value = count(accidents[1]); if (Number.isFinite(value)) auto.atFaultAccidents = value; }
  const convictions = text.match(/\b(no|zero|one|two|three|a|\d+)\s+(?:speeding\s+)?(?:tickets?|convictions?|violations?)\b/i);
  if (convictions) { const value = count(convictions[1]); if (Number.isFinite(value)) auto.convictions = value; }
  if (/\bfull coverage\b/i.test(text)) auto.coverage = "full";
  else if (/\bliability[-\s]only\b|\bjust liability\b/i.test(text)) auto.coverage = "liability_only";
  else if (/\bstandard coverage\b/i.test(text)) auto.coverage = "standard";
  if (/\bwinter tires\b/i.test(text)) auto.winterTires = !/\b(?:no|without)\s+winter tires\b/i.test(text);

  return { product, tenant, auto };
}
