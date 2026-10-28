/** Strict, header-aware parser for the two reconciled NeuroFuel exports. */
export type DayRecord = {
  day: number; label: string; cognitiveLoad: string; sleepHours: number;
  ratio: number; neuronShortfall: number; astroShortfall: number;
  glutamate: number; fatigue: number | null; pvt: number | null;
  lapses: number | null; maxATP: number;
};
export type HourRecord = {
  start: string; end: string; label: string; activity: string; cognitiveLoad: string;
  ratio: number; neuronShortfall: number; astroShortfall: number;
  glutamate: number; maxATP: number;
};
function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field.trim()); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field');
  row.push(field.trim());
  if (row.some(x => x !== '')) rows.push(row);
  return rows;
}
function objects(text: string, required: string[]): Record<string,string>[] {
  const rows = csvRows(text);
  if (!rows.length) throw new Error('CSV is empty');
  const headers = rows[0];
  for (const name of required) if (!headers.includes(name)) {
    throw new Error(`Missing CSV column: ${name}. Check the deployed file path and CSV version.`);
  }
  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}`);
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}
function number(row: Record<string,string>, key: string, line: number, optional = false): number | null {
  const raw = row[key];
  if (raw === undefined || raw === '') {
    if (optional) return null;
    throw new Error(`Row ${line}: missing numeric field ${key}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Row ${line}: invalid number for ${key}: ${raw}`);
  return value;
}
function requiredNumber(row: Record<string,string>, key: string, line: number): number {
  return number(row,key,line) as number;
}
const dayHeaders = [
  'day','cognitive_load','sleep_hours','ATP_supply_demand_ratio',
  'neuron_unmet_ATP_umol_g_min','astro_unmet_ATP_umol_g_min',
  'glutamate_cycle_flux_umol_g_min','total_max_ATP_umol_g_min',
  'original_fatigue_exploratory_not_recalibrated',
  'original_PVT_mean_ms_exploratory_not_recalibrated',
  'original_PVT_lapses_exploratory_not_recalibrated'
];
export function parseDays(csv: string): DayRecord[] {
  const rows = objects(csv,dayHeaders);
  if (rows.length !== 21) throw new Error(`Expected exactly 21 daily records; received ${rows.length}`);
  const parsed = rows.map((r,i):DayRecord => {
    const line=i+2;
    const day=requiredNumber(r,'day',line);
    if (!Number.isInteger(day) || day < 1 || day > 21) throw new Error(`Row ${line}: invalid day ${day}`);
    const cognitiveLoad=r.cognitive_load;
    if (!['Low','Moderate','High'].includes(cognitiveLoad)) throw new Error(`Row ${line}: invalid cognitive load`);
    const sleepHours=requiredNumber(r,'sleep_hours',line);
    const ratio=requiredNumber(r,'ATP_supply_demand_ratio',line);
    const neuronShortfall=requiredNumber(r,'neuron_unmet_ATP_umol_g_min',line);
    const astroShortfall=requiredNumber(r,'astro_unmet_ATP_umol_g_min',line);
    const glutamate=requiredNumber(r,'glutamate_cycle_flux_umol_g_min',line);
    const maxATP=requiredNumber(r,'total_max_ATP_umol_g_min',line);
    if (sleepHours<0 || sleepHours>24 || ratio<0 || neuronShortfall<0 || astroShortfall<0 || glutamate<0 || maxATP<0) throw new Error(`Row ${line}: value outside valid range`);
    const fatigue=number(r,'original_fatigue_exploratory_not_recalibrated',line,true);
    const pvt=number(r,'original_PVT_mean_ms_exploratory_not_recalibrated',line,true);
    const lapses=number(r,'original_PVT_lapses_exploratory_not_recalibrated',line,true);
    if (fatigue!==null && (fatigue<0||fatigue>10)) throw new Error(`Row ${line}: invalid fatigue`);
    if (pvt!==null && pvt<=0) throw new Error(`Row ${line}: invalid PVT reaction time`);
    if (lapses!==null && (!Number.isInteger(lapses)||lapses<0)) throw new Error(`Row ${line}: invalid PVT lapses`);
    return {day,label:`D${day}`,cognitiveLoad,sleepHours,ratio,neuronShortfall,astroShortfall,glutamate,fatigue,pvt,lapses,maxATP};
  });
  const unique = new Set(parsed.map(x=>x.day));
  if (unique.size!==21) throw new Error('Duplicate or missing day numbers');
  return parsed.sort((a,b)=>a.day-b.day);
}
const hourHeaders=['start','end','activity','load','supply_demand_ratio',
  'neuron_unmet_ATP_umol_g_min','astro_unmet_ATP_umol_g_min',
  'glutamate_cycle_flux_umol_g_min','max_total_ATP_umol_g_min'];
export function parseHours(csv: string): HourRecord[] {
  const rows=objects(csv,hourHeaders);
  if (rows.length!==10) throw new Error(`Expected 10 waking-day activity periods; received ${rows.length}`);
  const result=rows.map((r,i):HourRecord=>{
    const line=i+2;
    if (!/^\d{2}:\d{2}$/.test(r.start)||!/^\d{2}:\d{2}$/.test(r.end)) throw new Error(`Row ${line}: invalid time`);
    if (!r.activity||!['Low','Moderate','High'].includes(r.load)) throw new Error(`Row ${line}: invalid activity or load`);
    const ratio=requiredNumber(r,'supply_demand_ratio',line);
    const neuronShortfall=requiredNumber(r,'neuron_unmet_ATP_umol_g_min',line);
    const astroShortfall=requiredNumber(r,'astro_unmet_ATP_umol_g_min',line);
    const glutamate=requiredNumber(r,'glutamate_cycle_flux_umol_g_min',line);
    const maxATP=requiredNumber(r,'max_total_ATP_umol_g_min',line);
    if ([ratio,neuronShortfall,astroShortfall,glutamate,maxATP].some(v=>v<0)) throw new Error(`Row ${line}: negative metabolic value`);
    return {start:r.start,end:r.end,label:r.start,activity:r.activity,cognitiveLoad:r.load,ratio,neuronShortfall,astroShortfall,glutamate,maxATP};
  });
  if (new Set(result.map(x=>x.start)).size!==10) throw new Error('Duplicate time periods');
  return result;
}
export function datasetUrl(file: string): string {
  // Vite substitutes BASE_URL at build time, including the GitHub Pages repository prefix.
return `/neurofuel-website/data/${file}`;
export async function loadCsv<T>(url: string, parser: (csv:string)=>T[], signal?:AbortSignal): Promise<T[]> {
  const response=await fetch(url,{signal});
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  const text=await response.text();
  if (/^\s*<!doctype html|^\s*<html/i.test(text)) throw new Error(`Received HTML instead of CSV at ${url}. Check GitHub Pages base path.`);
  return parser(text);
}
