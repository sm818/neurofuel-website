import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseDays,parseHours,datasetUrl} from './studentData';
const path=(name:string)=>fileURLToPath(new URL(`../../public/data/${name}`,import.meta.url));
const dayText=readFileSync(path('neurofuel_21day_reconciled.csv'),'utf8');
const hourText=readFileSync(path('neurofuel_16hour_reconciled.csv'),'utf8');
describe('reconciled student datasets',()=>{
  it('contains exactly 21 valid, uniquely numbered days',()=>{
    const days=parseDays(dayText);
    expect(days).toHaveLength(21);
    expect(days.map(d=>d.day)).toEqual(Array.from({length:21},(_,i)=>i+1));
    expect(days.map(d=>d.label)).toEqual(Array.from({length:21},(_,i)=>`D${i+1}`));
  });
  it('has finite numeric values for every required daily chart field',()=>{
    for(const d of parseDays(dayText)){
      for(const field of ['sleepHours','ratio','neuronShortfall','astroShortfall','glutamate','maxATP'] as const)
        expect(Number.isFinite(d[field]),`${d.label}: ${field}`).toBe(true);
      for(const field of ['fatigue','pvt','lapses'] as const)
        expect(d[field]===null || Number.isFinite(d[field]),`${d.label}: ${field}`).toBe(true);
      expect(d.label).toMatch(/^D\d+$/);
    }
  });
  it('preserves the corrected 6.86 ATP capacity',()=>{
    for(const d of parseDays(dayText)) expect(d.maxATP).toBeCloseTo(6.86,6);
  });
  it('parses all 10 waking-day periods with valid chart values',()=>{
    const periods=parseHours(hourText);
    expect(periods).toHaveLength(10);
    expect(periods[0].label).toBe('07:00');
    expect(periods.at(-1)?.end).toBe('23:00');
    for(const p of periods){
      expect(p.label).toBeTruthy();
      for(const key of ['ratio','neuronShortfall','astroShortfall','glutamate','maxATP'] as const)
        expect(Number.isFinite(p[key]),`${p.label}: ${key}`).toBe(true);
      expect(p.maxATP).toBeCloseTo(6.86,6);
    }
  });
  it('rejects HTML returned instead of a CSV',()=>{
    expect(()=>parseDays('<!doctype html>\n<html>\n<body>not csv</body></html>')).toThrow(/Missing CSV column/);
  });
  it('rejects duplicate, incomplete or invalid records rather than plotting NaN',()=>{
    const lines=dayText.trim().split(/\r?\n/);
    expect(()=>parseDays(lines.slice(0,-1).join('\n'))).toThrow(/21/);
    const invalid=lines.slice(); invalid[1]=invalid[1].replace(',7.8,',',not-a-number,');
    expect(()=>parseDays(invalid.join('\n'))).toThrow(/invalid number/);
    const duplicate=lines.slice();duplicate[2]=duplicate[2].replace(/^2,/, '1,');
    expect(()=>parseDays(duplicate.join('\n'))).toThrow(/Duplicate/);
  });
  it('ignores trailing blank lines and supports quoted CSV fields',()=>{
    expect(parseDays(dayText+'\n\n')).toHaveLength(21);
    const quoted=hourText.replace('Breakfast and morning routine','"Breakfast, and morning routine"');
    expect(parseHours(quoted)[0].activity).toBe('Breakfast, and morning routine');
  });
  it('generates base-relative URLs for GitHub Pages',()=>{
    expect(datasetUrl('neurofuel_21day_reconciled.csv')).toContain('data/neurofuel_21day_reconciled.csv');
    expect(datasetUrl('neurofuel_21day_reconciled.csv')).not.toBe('/data/neurofuel_21day_reconciled.csv');
  });
});
