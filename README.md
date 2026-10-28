# NeuroFuel: The Iron–Energy Connection

Interactive educational website (React + TypeScript + Tailwind + Vite + Recharts).

## Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run test
npm run dev
```

Open the localhost URL shown by Vite (typically http://localhost:5173).

## Production build

```bash
npm run build
npm run preview
```

Deploy the generated `dist/` folder to Netlify, Cloudflare Pages or Vercel. Build command: `npm run build`; output directory: `dist`. No server-side secret keys are needed.

## Model

`src/lib/model.ts` is the single source of truth for ATP equations, transport bounds, cellular enzyme constraints, bottleneck sensitivity and nudges.

- Glycolysis: 2 ATP per glucose.
- Oxidation: 14 oxidative ATP plus 1 TCA GTP per oxidized pyruvate equivalent, assuming paired glycolytic/lactate-derived NADH.
- Cell ATP: `2 * glucose_flux + 15 * oxidized_pyruvate_flux`.
- NAID ACO2 50%, CII 70%, CIV 70%, TH 70% of reference. TH is separate from ATP.
- Separate neuron and astrocyte capacities and ATP demands.
- Baseline 1:1 cycling/neuronal glucose-equivalent oxidation is a calibration choice, not a universal stoichiometric identity.
- Glutamate recycling costs 2 ATP per cycling event in the simplified model, included within astrocyte demand.
- Fixed normal-condition glucose bounds are hypothetical: neuron .25, astrocyte .18 µmol/g/min.
- BBB GLUT1 is represented as a transport **capacity bound**. `reversibleTransport()` provides a simplified kinetic equation, but full concentration-driven transport is not wired to the scenario UI yet.
- External lactate uptake is a bounded illustrative flux; transporter-specific proton coupling is not modelled.
- Ketone oxidation is explicitly **not implemented**; ketone scenarios are labelled educational-only and do not change ATP.
- Microdomain model partitions astrocyte demand and supply; no explicit diffusion-limited microdomain mechanism is claimed.
- Historical PVT and fatigue outcomes remain unrecalibrated exploratory outputs.

### Important validation boundary

The flux engine solves a reduced piecewise-linear optimization analytically under a fixed glucose-priority allocation. It is **not** a general-purpose full stoichiometric LP solver. The underlying Python SciPy solver from the prior phase remains the reference for further cross-validation. Tests are in `src/lib/model.test.ts`.

The mathematical model is a classroom demonstration, not a clinical predictor or medical advice.

## Project structure

```
index.html
src/
  main.tsx
  index.css
  App.tsx
  lib/
    model.ts
    model.test.ts
public/data/
  neurofuel_21day_reconciled.csv
  neurofuel_16hour_reconciled.csv
```

## Next increments

1. Cross-validate the TypeScript solver against the Python SciPy reference over randomized bounds.
2. Replace fixed transport multipliers with concentration-driven GLUT1/MCT kinetics and unit-tested conversion of concentration to flux.
3. Implement fully balanced ketone reactions (β-hydroxybutyrate and acetoacetate separately).
4. Implement explicit microdomain diffusion/transport capacity instead of a proportional illustrative partition.
5. Extend bottleneck classification to compare feasibility restoration (not only total ATP objective gain), including multi-way constraints.
6. Recompute behavioural outcomes only after explicitly selecting a new hypothetical behavioural mapping.
