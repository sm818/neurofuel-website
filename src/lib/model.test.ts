import {describe,it,expect} from 'vitest';
import {defaults,naid,reference,run,solveFlux,reversibleTransport,loads} from './model';
describe('NeuroFuel flux validation',()=>{
 it('32 ATP per fully oxidized glucose',()=>{const p={...reference,gn:1,ga:0,acoN:2,acoA:0,ciiN:2,ciiA:0,civN:12,civA:0,lmax:0};const f=solveFlux(p,1,0);expect(f.tn).toBeCloseTo(2,8);expect(f.neuronATP).toBeCloseTo(32,8);expect(f.neuronOxATP+f.neuronGTP+f.neuronGlyATP).toBeCloseTo(32,8)});
 it('reference capacities reproduce 11.86',()=>expect(run({...defaults,iron:'Reference'},false).flux.totalATP).toBeCloseTo(11.86,6));
 it('NAID capacities reproduce 6.86',()=>expect(run(defaults,false).flux.totalATP).toBeCloseTo(6.86,6));
 it('enzyme reductions are capacities not ATP multipliers',()=>{expect(naid.acoN/reference.acoN).toBe(.5);expect(naid.ciiN/reference.ciiN).toBeCloseTo(.7);expect(naid.civN/reference.civN).toBeCloseTo(.7);expect(naid.th/reference.th).toBe(.7)});
 it('respects compartment enzyme bounds and carbon conservation',()=>{for(const iron of ['NAID','Reference'] as const){const r=run({...defaults,iron},false),p=iron==='NAID'?naid:reference,f=r.flux;expect(f.tn).toBeLessThanOrEqual(p.acoN+1e-9);expect(f.ta).toBeLessThanOrEqual(p.acoA+1e-9);expect(f.tn).toBeLessThanOrEqual(p.ciiN+1e-9);expect(f.ta).toBeLessThanOrEqual(p.ciiA+1e-9);expect(6*f.tn).toBeLessThanOrEqual(p.civN+1e-9);expect(6*f.ta).toBeLessThanOrEqual(p.civA+1e-9);expect(f.tn).toBeLessThanOrEqual(2*f.gn+f.l+f.externalLactate+1e-9);expect(f.ta+f.l).toBeLessThanOrEqual(2*f.ga+1e-9)}});
 it('separate compartment ATP budgets',()=>{const r=run({...defaults,load:'High'},false);expect(r.neuronShortfall).toBeCloseTo(loads.High.neuron-r.flux.neuronATP);expect(r.astroShortfall).toBeCloseTo(loads.High.astro-r.flux.astroATP)});
 it('glutamate recycling cost is two ATP per cycling equivalent',()=>{const r=run(defaults,false);expect(r.recyclingCost).toBeCloseTo(2*r.glutamate)});
 it('baseline 1:1 neuronal glucose-equivalent oxidation and cycling',()=>{const r=run(defaults,false);expect(r.glutamate/(r.flux.tn/2)).toBeCloseTo(1,7)});
 it('fasting duration does not imply hypoglycaemia',()=>{expect(run({...defaults,fastingHours:15},false).flux.totalATP).toBeCloseTo(run(defaults,false).flux.totalATP)});
 it('GLUT1 bound and glucose supply bound can each limit flux',()=>{const a=run({...defaults,glucoseFactor:.3},false);const b=run({...defaults,bbbFactor:.3},false);expect(a.flux.gn+a.flux.ga).toBeLessThanOrEqual(.43*.3+1e-9);expect(b.flux.gn+b.flux.ga).toBeLessThanOrEqual(.43*.3+1e-9)});
 it('saturable transport increases and saturates',()=>{expect(reversibleTransport(2,0,3,1)).toBeLessThan(reversibleTransport(20,0,3,1));expect(reversibleTransport(10000,0,3,1)).toBeLessThanOrEqual(1)});
 it('a single relaxation can improve ATP objective',()=>{const r=run(defaults);expect(r.bottlenecks.some(b=>b.name==='ACO2_N'||b.name==='ACO2_A')).toBe(true)});
 it('joint constraints are tested',()=>{const r=run({...defaults,paramsOverride:{acoN:.25,civN:1.5}});expect(Array.isArray(r.jointBottlenecks)).toBe(true)});
 it('microdomain is a partition not extra demand',()=>{const r=run({...defaults,microdomainFraction:.3},false);expect(r.microdomain.demand).toBeCloseTo(.3*r.astroDemand);expect(r.demand).toBeCloseTo(r.neuronDemand+r.astroDemand)});
 it('ketones do not fabricate extra ATP',()=>{const a=run(defaults,false),b=run({...defaults,ketones:true},false);expect(a.flux.totalATP).toBe(b.flux.totalATP);expect(b.warnings.join(' ')).toContain('not validated')});
});
