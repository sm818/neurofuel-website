/** NeuroFuel reduced, steady-state educational flux model.
 * Fluxes: µmol substrate or ATP / g combined modelled tissue / min.
 * This is NOT an atom-resolved kinetic reconstruction or a clinical model.
 */
export type Load='Low'|'Moderate'|'High';
export type Iron='NAID'|'Reference';
export type Constraint='glucose_supply'|'BBB_GLUT1'|'neuron_GLUT3'|'astro_GLUT1'|'astro_MCT4'|'neuron_MCT2'|'ACO2_N'|'ACO2_A'|'CII_N'|'CII_A'|'CIV_N'|'CIV_A';
export interface Params {gn:number;ga:number;acoN:number;acoA:number;ciiN:number;ciiA:number;civN:number;civA:number;lmax:number;th:number}
export const reference:Params={gn:.25,ga:.18,acoN:.62,acoA:.18,ciiN:.4/.7,ciiA:.146/.7,civN:2.4/.7,civA:.68/.7,lmax:.15,th:1};
export const naid:Params={...reference,acoN:.31,acoA:.09,ciiN:.4,ciiA:.146,civN:2.4,civA:.68,th:.7};
export const loads:Record<Load,{neuron:number;astro:number;glutamate:number}>={Low:{neuron:4.9,astro:1.65,glutamate:.155},Moderate:{neuron:5.4,astro:1.83,glutamate:.175},High:{neuron:6.2,astro:2.06,glutamate:.235}};
export interface Inputs {iron:Iron;load:Load;glucoseFactor:number;bbbFactor:number;lactateFactor:number;fastingHours:number;ketones:boolean;microdomainFraction:number;paramsOverride?:Partial<Params>}
export const defaults:Inputs={iron:'NAID',load:'Low',glucoseFactor:1,bbbFactor:1,lactateFactor:1,fastingHours:0,ketones:false,microdomainFraction:.25};
export const unit='µmol ATP / g / min';
/** Reversible facilitated transport approximation. C and Km in mM, Vmax in flux units. */
export function reversibleTransport(outside:number,inside:number,km:number,vmax:number):number{
 if([outside,inside,km,vmax].some(x=>!Number.isFinite(x)||x<0)||km<=0)throw Error('Invalid transport parameters');
 return vmax*(outside/(km+outside)-inside/(km+inside));
}
/** A one-way saturable cap used only for a scenario where direction is fixed. */
export function saturableTransport(c:number,km:number,vmax:number):number{return reversibleTransport(c,0,km,vmax)}
export interface Flux {gn:number;ga:number;tn:number;ta:number;l:number;externalLactate:number;neuronATP:number;astroATP:number;totalATP:number;neuronGlyATP:number;astroGlyATP:number;neuronOxATP:number;astroOxATP:number;neuronGTP:number;astroGTP:number;astroLactateExport:number;neuronLactateExport:number}
export interface Result {inputs:Inputs;flux:Flux;neuronDemand:number;astroDemand:number;demand:number;glutamate:number;recyclingCost:number;ratio:number;neuronShortfall:number;astroShortfall:number;totalShortfall:number;constraints:Constraint[];bottlenecks:{name:Constraint;gain:number}[];jointBottlenecks:{names:[Constraint,Constraint];gain:number}[];glucoseBBBcap:number;glucoseCap:number;microdomain:{demand:number;allocatedSupply:number;shortfall:number};warnings:string[]}
const EPS=1e-8;
function clamp(x:number,lo:number,hi:number){return Math.min(hi,Math.max(lo,x))}
/** Solve reduced linear program analytically: with positive ATP yield, glucose uptake reaches its bound;
 * optimize TCA allocation by evaluating the piecewise-linear feasible region's breakpoints.
 * Astrocyte lactate export l <= min(lmax,2ga-ta), neuronal oxidation tn<=2gn+l+externalLactate.
 */
export function solveFlux(p:Params,gnCap:number,gaCap:number,externalLactate=0):Flux{
 const gn=Math.max(0,gnCap),ga=Math.max(0,gaCap);
 const nCap=Math.max(0,Math.min(p.acoN,p.ciiN,p.civN/6));
 const aCap=Math.max(0,Math.min(p.acoA,p.ciiA,p.civA/6,2*ga));
 const lmax=Math.max(0,p.lmax);
 const points=[0,aCap,2*ga-lmax,2*ga+2*gn+externalLactate-nCap,2*ga+2*gn+externalLactate-nCap-lmax];
 let best={tn:0,ta:0,l:0,score:-Infinity};
 for(const raw of points){const ta=clamp(raw,0,aCap);const l=Math.min(lmax,Math.max(0,2*ga-ta));const tn=Math.max(0,Math.min(nCap,2*gn+l+externalLactate));const score=tn+ta;
  if(score>best.score+EPS||Math.abs(score-best.score)<EPS&&ta>best.ta){best={tn,ta,l,score}}
 }
 const {tn,ta,l}=best;
 const neuronATP=2*gn+15*tn,astroATP=2*ga+15*ta;
 return {gn,ga,tn,ta,l,externalLactate,neuronATP,astroATP,totalATP:neuronATP+astroATP,neuronGlyATP:2*gn,astroGlyATP:2*ga,neuronOxATP:14*tn,astroOxATP:14*ta,neuronGTP:tn,astroGTP:ta,astroLactateExport:Math.max(0,2*ga-ta),neuronLactateExport:Math.max(0,2*gn+l+externalLactate-tn)};
}
/** Nominal glucose delivery cap is 0.43, split according to GLUT3/astro GLUT1 capacities.
 * The baseline GLUT1 cap is calibrated to the Phase-4 flux reference, not measured BBB kinetics.
 */
function bounds(inputs:Inputs,p:Params){
 const glucoseCap=.43*clamp(inputs.glucoseFactor,0,2);
 const glucoseBBBcap=.43*clamp(inputs.bbbFactor,0,2);
 const effective=Math.min(glucoseCap,glucoseBBBcap);
 const n=Math.min(p.gn,effective);
 const a=Math.min(p.ga,Math.max(0,effective-n));
 // Fixed neuronal-priority allocation is a disclosed simplification. Redistribution is a future improvement.
 return {gn:n,ga:a,glucoseCap,glucoseBBBcap,externalLactate:Math.max(0,.12*(inputs.lactateFactor-1))};
}
export function run(inputs:Inputs,withSensitivity=true):Result{
 const p={...(inputs.iron==='NAID'?naid:reference),...inputs.paramsOverride};
 const b=bounds(inputs,p);
 const flux=solveFlux(p,b.gn,b.ga,Math.min(b.externalLactate,.12));
 const load=loads[inputs.load];const demand=load.neuron+load.astro;
 const neuronShortfall=Math.max(0,load.neuron-flux.neuronATP),astroShortfall=Math.max(0,load.astro-flux.astroATP);
 const constraints:Constraint[]=[];
 const add=(name:Constraint,used:number,cap:number)=>{if(cap>0&&Math.abs(used-cap)<1e-7)constraints.push(name)};
 add('glucose_supply',b.gn+b.ga,b.glucoseCap);add('BBB_GLUT1',b.gn+b.ga,b.glucoseBBBcap);
 add('neuron_GLUT3',b.gn,p.gn);add('astro_GLUT1',b.ga,p.ga);
 add('ACO2_N',flux.tn,p.acoN);add('ACO2_A',flux.ta,p.acoA);
 add('CII_N',flux.tn,p.ciiN);add('CII_A',flux.ta,p.ciiA);
 add('CIV_N',6*flux.tn,p.civN);add('CIV_A',6*flux.ta,p.civA);
 add('astro_MCT4',flux.l,p.lmax);
 const constraintsToTest:Constraint[]=['glucose_supply','BBB_GLUT1','neuron_GLUT3','astro_GLUT1','astro_MCT4','ACO2_N','ACO2_A','CII_N','CII_A','CIV_N','CIV_A'];
 const relax=(names:Constraint[])=>{
  const next:Inputs={...inputs,paramsOverride:{...inputs.paramsOverride}};
  const changes=next.paramsOverride!;
  for(const name of names){switch(name){case'glucose_supply':next.glucoseFactor*=1.2;break;case'BBB_GLUT1':next.bbbFactor*=1.2;break;case'neuron_GLUT3':changes.gn=p.gn*1.2;break;case'astro_GLUT1':changes.ga=p.ga*1.2;break;case'astro_MCT4':changes.lmax=p.lmax*1.2;break;case'ACO2_N':changes.acoN=p.acoN*1.2;break;case'ACO2_A':changes.acoA=p.acoA*1.2;break;case'CII_N':changes.ciiN=p.ciiN*1.2;break;case'CII_A':changes.ciiA=p.ciiA*1.2;break;case'CIV_N':changes.civN=p.civN*1.2;break;case'CIV_A':changes.civA=p.civA*1.2;break;default:break}}
  return run(next,false).flux.totalATP-flux.totalATP;
 };
 const bottlenecks=withSensitivity?constraintsToTest.map(name=>({name,gain:relax([name])})).filter(x=>x.gain>1e-6).sort((a,b)=>b.gain-a.gain):[];
 const jointBottlenecks:{names:[Constraint,Constraint];gain:number}[]=[];
 if(withSensitivity){for(let i=0;i<constraintsToTest.length;i++)for(let j=i+1;j<constraintsToTest.length;j++){
 const x=constraintsToTest[i],y=constraintsToTest[j];const gain=relax([x,y]);
 if(gain>1e-6&&bottlenecks.every(b=>b.name!==x&&b.name!==y))jointBottlenecks.push({names:[x,y],gain});
 }jointBottlenecks.sort((a,b)=>b.gain-a.gain)}
 // Local budget is a partition of astro demand/supply, NOT added to total demand.
 const frac=clamp(inputs.microdomainFraction,0,1);
 const microdomain={demand:load.astro*frac,allocatedSupply:flux.astroATP*frac,shortfall:Math.max(0,(load.astro-flux.astroATP)*frac)};
 const warnings=['All absolute enzyme capacities, cognitive demand and transport reference caps are hypothetical.','Maximum feasible ATP flux is not intracellular ATP concentration.'];
 if(inputs.ketones)warnings.push('Ketone oxidation module not validated: ketones are educational-only and do not contribute to calculated ATP.');
 if(inputs.fastingHours>0)warnings.push('Fasting duration alone does not lower glucose availability in this model.');
 return {inputs,flux,neuronDemand:load.neuron,astroDemand:load.astro,demand,glutamate:load.glutamate,recyclingCost:2*load.glutamate,ratio:flux.totalATP/demand,neuronShortfall,astroShortfall,totalShortfall:neuronShortfall+astroShortfall,constraints,bottlenecks,jointBottlenecks,glucoseBBBcap:b.glucoseBBBcap,glucoseCap:b.glucoseCap,microdomain,warnings};
}
export const scenarios=[
 {id:'rest',label:'Resting after breakfast',description:'Normal substrate availability and low cognitive demand.',load:'Low',fastingHours:0,glucoseFactor:1,bbbFactor:1,lactateFactor:1,ketones:false},
 {id:'study',label:'Intense studying',description:'Increased neuronal and astrocytic ATP requirements.',load:'High',fastingHours:0,glucoseFactor:1,bbbFactor:1,lactateFactor:1,ketones:false},
 {id:'skip',label:'Skip breakfast',description:'Longer fasting, but maintained brain glucose availability.',load:'Moderate',fastingHours:13,glucoseFactor:1,bbbFactor:1,lactateFactor:1,ketones:false},
 {id:'skipstudy',label:'Skip breakfast + study',description:'High demand with glucose availability still maintained.',load:'High',fastingHours:14,glucoseFactor:1,bbbFactor:1,lactateFactor:1,ketones:false},
 {id:'fast',label:'Prolonged fasting',description:'Ketones may contribute, but quantitative ketolysis is not yet validated.',load:'Moderate',fastingHours:30,glucoseFactor:1,bbbFactor:1,lactateFactor:1,ketones:true},
 {id:'glucose',label:'Reduced glucose delivery',description:'Explicitly reduce glucose supply, independently of meal timing.',load:'Moderate',fastingHours:0,glucoseFactor:.65,bbbFactor:1,lactateFactor:1,ketones:false},
 {id:'lactate',label:'More lactate available',description:'Optional extracellular lactate uptake, limited by mitochondrial oxidation.',load:'High',fastingHours:0,glucoseFactor:1,bbbFactor:1,lactateFactor:1.8,ketones:false},
 {id:'ketone',label:'More ketones available',description:'Educational-only until validated ketone oxidation reactions are added.',load:'Moderate',fastingHours:24,glucoseFactor:1,bbbFactor:1,lactateFactor:1,ketones:true},
 ] as const;
export function nudge(r:Result,minutes:number){
 const h=Math.max(60,Math.min(90,minutes));const b=r.bottlenecks[0];
 if(r.totalShortfall<1e-7)return {title:'Modelled demand is supportable',body:`For the next ${h} minutes, the selected constraints permit enough ATP supply for both compartments. This does not predict alertness or clinical performance.`,tone:'good'};
 const names=[...r.bottlenecks.map(x=>x.name),...r.jointBottlenecks.slice(0,2).flatMap(x=>x.names)];
 const enzyme=names.find(x=>x.startsWith('ACO2')||x.startsWith('CII')||x.startsWith('CIV'));
 const transport=names.find(x=>x.includes('GLUT')||x.includes('MCT')||x==='BBB_GLUT1');
 let body='The selected demand exceeds at least one compartment’s feasible ATP supply.';
 if(enzyme)body+=` Sensitivity analysis implicates ${enzyme.replace('_',' ')}; simply increasing circulating fuel may not overcome this capacity limit.`;
 else if(transport)body+=` Transport (${transport}) is limiting under the tested bounds; additional circulating substrate does not guarantee higher neuronal oxidation.`;
 else if(b)body+=` Relaxing ${b.name} increases modelled ATP capacity by ${b.gain.toFixed(3)} µmol/g/min.`;
 if(r.neuronShortfall>0)body+=` Neuronal unmet demand: ${r.neuronShortfall.toFixed(2)}.`;
 if(r.astroShortfall>0)body+=` Astrocytic unmet demand: ${r.astroShortfall.toFixed(2)}.`;
 body+=` Over ${h} minutes, this is an educational capacity mismatch, not predicted cellular ATP depletion or medical advice.`;
 return {title:'Explore a predicted metabolic constraint',body,tone:'warn'};
}
