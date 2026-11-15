# Mission planning as an optimisation problem

Formal statement of the mission-planning problem that Killa Landing solves, with every rule and
number taken from the code. The planner covers the **surface phase** of a mission to the lunar
south pole: where and when to land so that a rover can fetch ice samples and bring them back.

Related documents: [README](../README.md) · [Architecture](../ARCHITECTURE.md) ·
[User guide](GUIDE.md) · [Design](DESIGN.md).

---

## 1. Mission statement

A lander touches down near permanently shadowed ground, where water ice can survive. A rover
leaves the lander at touchdown, drives to the ice, takes `n` samples, and drives back to the
lander along the same route. The mission succeeds only if **all** of the following hold:

- the rover reaches the ice,
- it completes every one of the `n` samples,
- it is back at the lander before the surface mission ends,
- its battery never drops below a minimum over the whole trip,
- the landing point is safe, lit at touchdown and for long enough afterwards, and within the
  lander's hardware limits for night length and direct-to-Earth link.

> **Given** a point with ice, a range of candidate landing days, a rover and its workload,
> **choose** for every day the landing point around the ice that meets every constraint with the
> highest score, and **rank** the days.

The contract is `PlanProblem` → `PlanResult` in `src/astro/plannerTypes.ts`; the engine is
`src/astro/planner.ts`.

---

## 2. Inputs and data

### 2.1 Problem parameters (`PlanProblem`)

| Symbol  | Field                       | Meaning                                                             | Default                                         | Accepted values                                                       |
| ------- | --------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| `T`     | `target`                    | The ice the mission is after (lat, lon)                             | none: the user chooses it                       | a suggested target (`iceTargetsOf`) or a point covered by a 20 m tile |
| —       | `tileSiteId`                | Curated site whose 20 m terrain tile and illumination map cover `T` | from `tileForPoint`                             | sites with a 20 m polar tile and an illumination map                  |
| `t₀`    | `fromMs`                    | First candidate landing day, 00:00 UTC                              | today (UTC)                                     | 2026-01-01 … 2030-12-31 (`PLAN_RANGE`, `src/ui/plannerView.ts`)       |
| `N`     | `days`                      | Number of consecutive candidate days                                | 30 (`PLAN_DEFAULTS.days`)                       | 1 … 90 (`PLAN_MAX_DAYS`)                                              |
| `M`     | `missionDays`               | Length of the surface mission, days                                 | 14 (`MISSION_DAYS.default`)                     | 1 … 365 (`MISSION_DAYS`, `src/store/useMissionStore.ts`)              |
| `S_min` | `minSunDays`                | Continuous sunlight required from touchdown, days                   | 15 (`PLAN_DEFAULTS.minSunDays`)                 | ≥ 0                                                                   |
| `R`     | `radiusM`                   | Landing points are searched within this distance of `T`             | 2000 m (`PLAN_DEFAULTS.radiusM`)                | 1000, 2000, 3000 m (`PLAN_RADII_M`)                                   |
| —       | `roverId`                   | Rover: its vehicle and its power budget                             | `csa-rover` (`src/store/useRoverStore.ts`)      | `rover` (micro rover), `csa-rover` (utility rover)                    |
| `n`     | `samples`                   | Samples the rover must take at the ice                              | 3 (`SAMPLING_DEFAULTS.samples`)                 | 1 … 10, integer (`SAMPLING_LIMITS.samples`)                           |
| `h_s`   | `sampleH`                   | Hours of work per sample (drilling plus analysis)                   | 2 (`SAMPLING_DEFAULTS.sampleH`)                 | 0.5 … 6 in steps of 0.5 (`SAMPLING_LIMITS.sampleH`)                   |
| `B_min` | `minRoverSocPct`            | Lowest battery the rover may reach over the whole trip, %           | 20 (`PLAN_DEFAULTS.minRoverSocPct`)             | ≥ 0                                                                   |
| `σ_max` | `hardware.maxSlopeDeg`      | Steepest landing slope the lander tolerates                         | 15° (`DEFAULT_LIMITS`, `src/astro/hardware.ts`) | 1 … 30 (`LIMIT_RANGES`)                                               |
| `D_max` | `hardware.maxNightH`        | Longest continuous night the lander survives                        | 120 h                                           | 1 … 720                                                               |
| `L_min` | `hardware.minDtePct`        | Minimum share of the mission with a direct-to-Earth link            | 30 %                                            | 0 … 100                                                               |
| `ρ_max` | `hardware.roverMaxSlopeDeg` | Steepest slope the rover drives                                     | 20°                                             | 5 … 35                                                                |
| `μ`     | `linkMarginDeg`             | Clearance of the Earth above the terrain horizon for a usable link  | 3° (`LINK_MARGIN.default`)                      | 0 … 10                                                                |
| —       | `requireDsn`                | Count the link only while a DSN complex has the Moon in view        | `false`                                         | boolean                                                               |
| `w`     | `scienceWeight`             | 0 = engineering score only … 1 = science (ice access) score only    | 0                                               | 0 … 1                                                                 |

The problem is assembled by `buildProblem` in `src/hooks/usePlanner.ts` from the planner's own
inputs (`src/store/usePlannerStore.ts`), the mission settings of the active scenario
(`src/store/useMissionStore.ts`) and the rover with its workload (`src/store/useRoverStore.ts`).

Suggested targets come from `src/config/iceTargets.ts`: for each curated polar site with a
reachable ice route, either the shadowed ground a rover reaches from that site (`near-site`) or
the site itself when it lies in permanent shadow (`psr-floor`). A free point is accepted when a
20 m tile covers it with room for the search: its distance to the tile centre must not exceed
`10 240 − R − ICE_TARGET_SNAP_M − ICE_TARGET_MARGIN_M` metres (`tileForPoint`).

### 2.2 Fixed data

| Data                    | Content                                                                                                                                            | Where                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Fine terrain            | LOLA digital elevation model, 20 m per pixel, 1024 × 1024 px tile (±10.24 km) per curated polar site                                               | `public/data/terrain`, `src/astro/dem.ts`        |
| Far terrain             | LOLA south-polar DEM at 480 m per pixel, behind the tile in every horizon computation                                                              | `public/data/dem`                                |
| Yearly illumination map | 100 m cells; mean visible fraction of the solar disc over a year. Value 0 = permanently shadowed region (PSR), 255 = no data                       | `public/data/illum`, `src/astro/illumination.ts` |
| Ephemeris               | Sun and Earth in the Moon-fixed frame from a JPL Horizons DE441 table, 2 h step, 2025-12-31 to 2031-01-02; an analytic IAU model outside that span | `public/data/ephem`, `src/astro/ephemeris.ts`    |
| DSN complexes           | Goldstone, Madrid, Canberra; a complex sees the Moon when it is at least `DSN_MIN_EL_DEG` = 10° above its horizon                                  | `src/astro/dsn.ts`                               |
| Rovers                  | Vehicle (`ROVER_VEHICLES`, `src/astro/traverse.ts`) and power budget (`ENERGY_PRESETS`, `src/config/energyProfiles.ts`), § 7.1                     | —                                                |

A cell is a PSR when the solar disc never shows more than `PSR_MAX_FRAC` = 0.01 of itself over
the year. A body counts as visible at an instant when at least half of its disc clears the local
horizon (`VISIBLE_THRESHOLD` = 0.5, `src/astro/metrics.ts`).

---

## 3. Decision variables

| Variable | Domain                                                 | Meaning                           |
| -------- | ------------------------------------------------------ | --------------------------------- |
| `d`      | `{0, …, N − 1}`; landing instant `t_d = t₀ + d · 24 h` | Landing day (touchdown 00:00 UTC) |
| `p`      | the candidate set `P` of § 4                           | Landing point                     |

Everything else follows from `(p, d)`: the rover leaves `p` at `t_d`, drives the route of `p`
to the ice and back, and must be at `p` again by `t_d + M · 24 h`.

The ice cell `c*` is not a decision: it is the PSR cell of the illumination map nearest to `T`
(the cell under `T` if it is one), within `ICE_TARGET_SNAP_M` = 1500 m (`nearestPsrCell`,
`src/astro/iceAccess.ts`). Without one, the plan ends with the error `no-ice-near-target`.

---

## 4. Candidate landing points

`prepareCandidates` (`src/astro/planner.ts`) builds `P` once per plan; it does not depend on the
date.

**Grid.** Points of the 20 m tile every `PLAN_SPACING_M` = 40 m, inside the circle of radius
`R` around `T`, not on the tile border. Coordinates are rounded to 4 decimals of a degree
(≤ 3 m).

**Safe-terrain rule** (the same as `src/astro/optimize.ts`). A grid point is safe when

- its slope is below `SLOPE_SAFE_DEG` = 10°, and
- no pixel of its 3 × 3 neighbourhood reaches `SLOPE_CAUTION_DEG` = 15°.

Slopes are Horn's 3 × 3 operator on the 20 m tile, i.e. over a 40 m baseline
(`src/astro/slope.ts`).

**Light rule.** The illumination cell under the point must be neither a PSR (value 0) nor
missing (value 255): a lander never sets down in permanent shadow.

If no grid point passes both rules the plan ends with the error `no-safe-ground`.

**Preselection.** At most `PLAN_MAX_CANDIDATES` = 60 points are kept, at least
`PLAN_MIN_SEPARATION_M` = 80 m apart, filled in three passes over the safe points:

1. up to 20 by yearly light, brightest first (ties: higher ground);
2. up to 40 in total by terrain height, highest first;
3. up to 60 in total by straight distance to `c*`, nearest first.

**Per-candidate data.** For each preselected point, in this order:

1. the rover route to `c*` (§ 4.1); a point without one is dropped and counted under
   `no-route`;
2. the terrain horizon: 360 azimuths (1° step) ray-marched over the 20 m tile and the 480 m DEM
   out to 300 km, observer 2 m above the ground (`computeHorizonMask`,
   `src/astro/horizonFromDem.ts`);
3. the landing slope `σ₉₀(p)`: the 90th percentile of the slope inside a circle of
   `PLAN_SLOPE_RADIUS_M` = 500 m around the point (`slopeStats`);
4. the science score `S(p)` (§ 6.2).

### 4.1 Route to the ice

`computeIceAccess` (`src/astro/iceAccess.ts`) runs Dijkstra on the 20 m pixel grid with 8
neighbours, from the landing pixel to any tile pixel that falls in the cell `c*`:

- a pixel is passable when its slope is finite and at most `ρ_max`; the goal pixels may be
  entered whatever their slope;
- the cost of stepping onto a pixel of slope `s` is `ℓ · (1 + s / ρ_max)`, with `ℓ` = 20 m
  (or 20·√2 m diagonally), so the route goes around steep ground rather than across it;
- the search window is a circle around the landing point of radius
  `max(ICE_RADIUS_M, dist(p, c*) + ICE_TARGET_MARGIN_M)` = `max(2000, dist + 600)` m;
- other shadowed ground on the way is driven over like any terrain.

Outputs: the one-way route length `r(p)` (sum of the pixel steps, m), the steepest slope on it
`s_max(p)` (goal pixels excluded), and the route vertices (every fourth pixel of the chain).

---

## 5. Constraints

A pair `(p, d)` is feasible when it violates none of the constraints below. They are applied in
the order of the table (`PLAN_STAGES`); a candidate is counted under the **first** one it fails.
The violation id is what the app reports.

Sky quantities at `p` come from one hourly series per candidate (`evaluateSite`,
`src/astro/series.ts`): `f☉(t)` and `f⊕(t)` are the visible fractions of the Sun and Earth
discs over the candidate's horizon. For the Earth the horizon is raised by `μ`, and with
`requireDsn` the fraction is 0 whenever no DSN complex sees the Moon. The mission window of day
`d` is `W_d = [t_d, t_d + M · 24 h)`.

| #   | Violation id        | Rule (feasible when…)                                                                                      | Limit and default    | Source                                  |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------- |
| g0  | `no-route`          | a drivable route from `p` to `c*` exists (§ 4.1)                                                           | `ρ_max` = 20°        | `computeIceAccess`                      |
| g1  | `no-sun-at-landing` | `f☉(t_d) ≥ 0.5`                                                                                            | `VISIBLE_THRESHOLD`  | `sweepLandingDates`, `cheapViolation`   |
| g2  | `short-light`       | `H☉(p, d) ≥ S_min · 24 h`, with `H☉` the unbroken run of lit hourly samples from `t_d` (`sunFromLandingH`) | `S_min` = 15 days    | `sweepLandingDates`, `cheapViolation`   |
| g3  | `slope`             | `σ₉₀(p) ≤ σ_max`                                                                                           | `σ_max` = 15°        | `classifySite`, `src/astro/hardware.ts` |
| g4  | `night`             | `D(p, d) ≤ D_max`, with `D` the longest run of samples with `f☉ < 0.5` inside `W_d`                        | `D_max` = 120 h      | `classifySite`                          |
| g5  | `dte`               | `L(p, d) ≥ L_min`, with `L` the share of the samples of `W_d` with `f⊕ ≥ 0.5`, %                           | `L_min` = 30 %       | `classifySite`                          |
| g6  | `rover-unreachable` | the rover arrives at the ice (§ 7)                                                                         | —                    | `roverViolation`                        |
| g7  | `rover-samples`     | it completes all `n` samples                                                                               | `n` = 3, `h_s` = 2 h | `roverViolation`                        |
| g8  | `rover-no-return`   | it arrives back at the lander                                                                              | —                    | `roverViolation`                        |
| g9  | `rover-late`        | its return instant is at or before `t_d + M · 24 h`                                                        | `M` = 14 days        | `roverViolation`                        |
| g10 | `rover-battery`     | the lowest battery over the whole trip is at least `B_min`                                                 | `B_min` = 20 %       | `roverViolation`                        |

Notes:

- `H☉` looks past the mission window. The series reach `Λ = max(M, S_min, PLAN_LIGHT_LOOKAHEAD_DAYS)`
  days after every landing day (`lightSpanDays`, with `PLAN_LIGHT_LOOKAHEAD_DAYS` = 30), and
  `H☉` is capped at `Λ · 24 h`, the same cap for every day of the range.
- g0 and g3 do not depend on the day, but they are counted on every day so that each day's
  breakdown is complete.
- g6 – g10 are decided by one simulated round trip (§ 7), leaving at `t_d` with the deadline
  `t_d + M · 24 h`.
- The rover's own Earth link and its time in shadow are reported, not constrained.

**Hardware verdict.** `classifySite` also flags a satisfied limit as _tight_ when it has less
than `MARGIN` = 20 % to spare: a slope or night above 0.8 × its maximum, or a link below
`min(100, 1.2 × L_min)`. A feasible pick carries the verdict `good` (nothing tight) or `warn`
(some limit tight), with the tight limits listed.

---

## 6. Objective and ranking

### 6.1 Engineering score

`scoreOf` (`src/astro/metrics.ts`), on the mission window `W_d`:

```
E(p, d) = round( 0.50 · e + 0.35 · L + 15 · (1 − min(D / 120, 1)) )        0 … 100
```

- `e` (`energyPct`): mean of `f☉` over `W_d`, in %. It stands for the energy a Sun-tracking
  panel collects relative to permanent full sunlight.
- `L` (`dtePct`): share of `W_d` with `f⊕ ≥ 0.5`, in %.
- `D` (`longestDarkH`): longest night inside `W_d`, in hours; the survival term falls to 0 for
  a night of 120 h (5 days) or longer.

### 6.2 Science score

`scienceScore` (`src/astro/iceAccess.ts`), from the route of the candidate; it does not depend
on the day:

```
near(p)  = 1                                   if r(p) ≤ 500 m
           max(0, 1 − (r(p) − 500) / 1500)     otherwise          (0 at ICE_RADIUS_M = 2000 m)
steep(p) = min(1, s_max(p) / ρ_max)
S(p)     = round( 100 · near(p) · (1 − 0.5 · steep(p)) )          0 … 100
```

### 6.3 Blended score

`combinedScore`:

```
F(p, d) = round( (1 − w) · E(p, d) + w · S(p) )
```

### 6.4 The optimisation problem

For each day `d`:

```
p*(d) = argmax F(p, d)      over p ∈ P      subject to g0 … g10
```

with ties broken by the shorter route `r(p)`, then by the candidate's index. The search over the
rover constraints is bounded (§ 8.3), so `p*(d)` is the best candidate among those tried.

Across days, `rankDays` orders the days that have a solution by

1. `F(p*(d), d)`, highest first;
2. the rover's time margin at the lander (deadline minus return), largest first;
3. the rover's lowest battery over the trip, highest first;
4. the earlier day.

The first `PLAN_TOP` = 5 form the shortlist.

---

## 7. Rover round-trip model

`src/astro/traverse.ts`. A first-order model: it answers whether the rover gets there and back,
and with how much charge.

### 7.1 Vehicles and power budgets

| Quantity                                          | Micro rover (`rover`) | Utility rover (`csa-rover`) |
| ------------------------------------------------- | --------------------- | --------------------------- |
| Mass `m`                                          | 40 kg                 | 350 kg                      |
| Commanded speed on flat ground `v₀`               | 0.1 m/s               | 0.2 m/s                     |
| Rolling resistance `C_rr`                         | 0.15                  | 0.15                        |
| Drivetrain efficiency `η`                         | 0.6                   | 0.6                         |
| Solar array                                       | two-axis tracking     | two-axis tracking           |
| Array output in full Sun `P_pk` (`peakW`)         | 120 W                 | 400 W                       |
| Battery `C` (`batteryWh`)                         | 600 Wh                | 5000 Wh                     |
| Load while operating `P_act` (`activeW`)          | 70 W                  | 200 W                       |
| Survival load `P_hib` (`hibernateW`)              | 18 W                  | 10 W                        |
| Hibernation threshold `b_h` (`hibernateBelowPct`) | 20 %                  | 30 %                        |
| Sampling instrument `P_s` (`sampleW`)             | 30 W                  | 150 W                       |
| Initial charge (`initialSocPct`)                  | 100 %                 | 100 %                       |

Vehicle rows: `ROVER_VEHICLES` in `src/astro/traverse.ts`. Power rows: `ENERGY_PRESETS` in
`src/config/energyProfiles.ts`. Both are illustrative orders of magnitude, not the
specifications of a real vehicle. Lunar gravity: `MOON_GRAVITY` = 1.62 m/s².

### 7.2 Route as driven

`planTraverse` resamples the route of § 4.1 every 10 m along the ground (great-circle
interpolation) and gives every point:

- its height (bilinear sample of the DEM stack) and its slope `s` (Horn, same stack);
- its along-track grade `γ` in the direction driven (positive uphill);
- the PSR flag of the illumination cell under it;
- its speed
  ```
  v(s) = v₀ · clamp(1 − s / ρ_max, 0.2, 1)        (MIN_SPEED_FACTOR = 0.2)
  ```

The length of a step is its 3-D length; its duration is that length over the mean of the speeds
at its two ends. The way back reuses the outbound points in reverse order, with the sign of the
grade flipped. The round trip is therefore twice the one-way 3-D length.

### 7.3 Power and battery

- **Traction** (`tractionPowerW`):
  ```
  P_tr = max(0, m · g · (sin γ + C_rr · cos γ) · v / η)
  ```
  It is never negative: downhill the brakes take the energy, nothing returns to the battery.
- **Solar input**: `P_sun = P_pk · f☉ · k`, with `k` the incidence factor of the array (1 for a
  tracking array, `incidenceFactor` in `src/astro/energy.ts`). On a PSR point `f☉` is forced to
  0: the illumination map is the authority on permanent shadow.
- **Battery** (`stepBattery`, `src/astro/energy.ts`): explicit Euler,
  `E ← clamp(E + (P_sun − P_load) · Δt, 0, C)`; surplus is curtailed.
- **Sky along the route** (`traverseSky`): the Sun and Earth directions are exact for the
  rover's position, height and time; the terrain horizon is the distance-weighted blend of the
  two nearest of the horizons computed every ~200 m of route (2° azimuth step). The link margin
  `μ` and `requireDsn` apply as in § 5.

### 7.4 Phases

The simulation (`simulateTraverse`) starts at `t_d` with a full battery and walks through:

| Phase    | What happens                                        | Load           | Time step                            |
| -------- | --------------------------------------------------- | -------------- | ------------------------------------ |
| `out`    | drive from the lander to the ice                    | `P_act + P_tr` | one 10 m route step                  |
| `sample` | `n` samples of `h_s` hours each, stopped at the ice | `P_act + P_s`  | ≤ 10 min, cut at the end of a sample |
| `back`   | drive from the ice to the lander                    | `P_act + P_tr` | one 10 m route step                  |
| `wait`   | hibernation stop to recharge, wherever the rover is | `P_hib`        | 10 min                               |

**Hibernation rule.** When the battery is below `b_h` at the start of a step, the rover stops
where it is, drops to `P_hib` and waits until the battery is back at `b_h + 10` points; then it
resumes what it was doing (the drive, or the same sample).

**Failure rules.**

| Situation                                                     | Result                                                    | Planner violation                                              |
| ------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| Battery below `b_h` while **sampling on PSR ground**          | the work stops at once, reason `samples`                  | `rover-samples`                                                |
| Hibernating on PSR ground during a drive (no Sun to wait for) | given up after one step, reason `battery`                 | `rover-unreachable` (outbound) or `rover-no-return` (way back) |
| Hibernation longer than 14 days (`maxWaitDays`) on lit ground | reason `battery`, or `samples` if it interrupted a sample | as above, or `rover-samples`                                   |
| Back at the lander after the deadline                         | reason `late`                                             | `rover-late`                                                   |

There is no recharge in permanent shadow: this is what bounds the number of samples a rover can
take (§ 10).

**Deadline.** The return instant `t_ret` is compared with `t_d + M · 24 h`; the margin is
`(t_d + M · 24 h − t_ret)` in hours.

**Success** (`TraverseSummary.success`): reaches the ice ∧ `samplesDone = n` ∧ returns ∧ on
time. The planner adds `minSocPct ≥ B_min` (g10). Handing the samples over to the lander is
taken for granted on arrival.

### 7.5 Outputs (`TraverseSummary`)

Reached / samples completed / returned / on time; arrival and return instants; margin (h);
one-way and total 3-D length (m); driving time out and back, hibernation time, sampling time and
total time (h); lowest and final battery (%); energy drawn (Wh); time without direct sunlight
(h); share of the trip with a usable Earth link (%); distance at which the route enters
permanent shadow (m).

---

## 8. Algorithm and cost

| Stage | Function (`src/astro/planner.ts`) | Runs                         | Work                                                                                                     |
| ----- | --------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1 – 3 | `prepareCandidates`               | once per plan                | ice cell, safe lit grid, preselection; per candidate one route (Dijkstra) and one 1° horizon (§ 4)       |
| 4     | `evaluateRange`                   | once per plan                | per candidate one hourly series of `(N + Λ) · 24 + 1` samples, swept into one `DateCandidate` per day    |
| 5 – 6 | `planDay`                         | once per day                 | cheap constraints g1 – g5 for every candidate, ranking, at most `PLAN_ROVER_TRIES` = 3 rover round trips |
| 7     | `rankDays`                        | after every batch of days    | shortlist of `PLAN_TOP` = 5 days                                                                         |
| 8     | `refinePick`, `withRefined`       | once, for the shortlist only | finer recomputation of each shortlisted pick                                                             |

### 8.1 Once per candidate

Routes and horizons do not depend on the date, so they are computed once. One ephemeris series
at a 1 h step covers the whole range plus the look-ahead `Λ`; `sweepLandingDates`
(`src/astro/metrics.ts`) slides the mission window over it one day at a time with prefix sums,
giving for every day `e`, `L`, `D`, `E`, the Sun at touchdown and `H☉`.

### 8.2 Once per day: cheap constraints

`cheapViolation` applies g1 – g5 to every candidate from the tables of § 8.1: no simulation is
run. The survivors are sorted by `F` (ties: shorter route, then index).

### 8.3 Once per day: rover tries

The round trip is simulated for the survivors in score order until one passes g6 – g10; that
one is the pick of the day. At most `PLAN_ROVER_TRIES` = 3 simulations per day: after a
failure, the next try is the best-scored survivor whose route is **shorter than every route
that failed** (a longer drive from a lower-scored point is not expected to do better).
Survivors never tried are not counted as rejected.

### 8.4 Refinement of the shortlist

`refinePick` recomputes each of the (at most 5) shortlisted picks the way the rest of the app
evaluates a point: horizon at a 0.5° azimuth step, and the scenario at its default time step
(`scenarioStepMinutes`: 10 min for `M` ≤ 60 days, 30 min up to 180 days, 60 min beyond). Score,
energy, sunlit share, link, longest night and continuous light are overwritten; the rover
figures are kept. The shortlist is then re-sorted among itself. A pick that the finer figures put
over a hardware limit is kept, with that limit listed as tight and the verdict `warn`. Days
outside the shortlist keep their hourly figures.

### 8.5 Caches

- `PlanInternals.traverses`: the resampled route and its sky, per candidate, rover and link
  settings (independent of the date and of the workload).
- `PlanInternals.roverCache`: round-trip summaries per candidate, rover, link settings, `n`,
  `h_s`, `M` and day.
- The DSN visibility of a time grid is computed once and shared by every candidate (`dsnMask`,
  `src/astro/dsn.ts`).

### 8.6 Execution

The plan runs in a web worker through three jobs (`src/workers/handlers.ts`, driven by `runPlan`
in `src/hooks/usePlanner.ts`):

1. `planPrepare`: stages 1 – 4; the heavy per-candidate data stays in the worker under a plan
   id. The worker keeps the last `PLAN_KEEP` = 2 plans.
2. `planDays`: stages 5 – 6 in batches of `PLAN_BATCH_DAYS` = 3 days. After each batch the
   partial result, the shortlist so far and the progress are published, and the run can be
   cancelled; what has been computed stays on screen.
3. `planFinish`: stage 8.

### 8.7 Size of the search

With `K ≤ 60` candidates and `N ≤ 90` days the search space has at most 5400 pairs `(p, d)`.
The cost is `K` routes and horizons, `K` hourly series, `K · N` constant-time constraint checks,
at most `3 · N` rover simulations and 5 refinements.

---

## 9. Outputs

### 9.1 Result (`PlanResult`)

- `ice`: the PSR cell `c*` every route goes to.
- `candidates`: the set `P`, each with position, height, slope, straight distance to `T`,
  one-way route length and steepest route slope.
- `days`: one `PlanDay` per day, in date order.
- `top`: indices of the shortlisted days, best first.

### 9.2 Per day (`PlanDay`)

- `best`: the pick `p*(d)` or `null`. A pick (`PlanPick`) carries the landing point, the
  one-way route length, `F`, `E`, `S`, `e`, the sunlit share of the mission, `L`, `D`, `H☉`,
  the verdict with its tight limits, and the rover's round trip: reaches, samples completed,
  returns, lowest and final battery, outbound travel time, total time, margin, hours in shadow
  and link share.
- `rejected`: how many candidates each constraint rejected that day (by the first one failed).
- `mainViolation`, on a day without a pick: if some candidate got as far as the rover, the
  rover constraint with most rejections; otherwise the constraint with most rejections overall
  (ties go to the later stage).

### 9.3 Diagnosis and fixes

When days have no solution, the app shows the rejections as a histogram
(`violationHistogram`, `src/ui/plannerView.ts`) and offers at most `FIX_MAX` = 3 one-click
changes to the inputs (`src/ui/plannerFixes.ts`), chosen from the violations that sink most
days. A fix only changes an input; the plan is run again by the user.

| Violation           | Fixes offered, most direct first                                              |
| ------------------- | ----------------------------------------------------------------------------- |
| `no-route`          | widen the radius                                                              |
| `no-sun-at-landing` | widen the date range                                                          |
| `short-light`       | lower the minimum light; widen the date range                                 |
| `night`             | widen the date range                                                          |
| `dte`               | widen the date range                                                          |
| `slope`             | widen the radius                                                              |
| `rover-unreachable` | narrow the radius                                                             |
| `rover-samples`     | switch to the utility rover; fewer samples; shorter time per sample           |
| `rover-no-return`   | switch to the utility rover; fewer samples; narrow the radius                 |
| `rover-late`        | longer mission; fewer samples                                                 |
| `rover-battery`     | switch to the utility rover; lower the rover's minimum battery; fewer samples |

Step sizes: date range +30 days (`FIX_RANGE_STEP_DAYS`, up to 90); minimum light −5 days
(`FIX_SUN_STEP_DAYS`); minimum battery −10 points (`FIX_SOC_STEP_PCT`); mission +7 days
(`FIX_MISSION_STEP_DAYS`); radius to the next value of `PLAN_RADII_M`; samples −1; time per
sample −0.5 h. A fix whose input is already at its limit is not offered, and widening and
narrowing the radius are never offered together.

### 9.4 Using a pick

A pick opens as a scenario in the rest of the app (landing point as a custom site on the 20 m
tile, landing date, mission length, rover and ice target), and up to four picks can be sent to
the comparison view (`src/hooks/planActions.ts`).

### 9.5 CSV export

`planCsv` (`src/ui/plannerView.ts`) writes the problem's parameters as `#` header lines and one
row per day with the columns of `PLAN_CSV_COLUMNS`:

```
landing_utc, has_solution, lat_deg, lon_deg, height_m, landing_slope_deg, route_to_ice_m,
route_round_trip_m, score, engineering_score, science_score, energy_pct, sunlit_pct, dte_pct,
longest_night_h, sun_from_landing_h, rover_reaches, rover_min_battery_pct, rover_travel_h,
rover_hours_in_shadow, rover_samples_done, rover_returns, rover_total_h, rover_margin_h,
rover_end_battery_pct, verdict, tight_limits, top_rank, rejection_reason
```

A day without a solution has only `landing_utc`, `has_solution = 0` and `rejection_reason`
(its `mainViolation`).

### 9.6 Errors

| Error                | Meaning                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `no-ice-near-target` | no PSR cell within 1500 m of `T`                                     |
| `no-safe-ground`     | no safe, lit grid point within `R` of `T`                            |
| `no-tile`            | the tile site is unknown or lacks a 20 m tile or an illumination map |
| `plan-expired`       | the worker dropped the plan because two later ones were started      |

---

## 10. Reference results

Rover round trips of § 7 on the published data (LOLA 20 m tiles, DE441 ephemeris), reproduced
with the model as it stands in the code. Conditions: the lander at the curated site point, the
route to the nearest PSR ground with `ρ_max` = 20°, departure on 2027-03-01 00:00 UTC, a
14-day mission (deadline 336 h after departure), `μ` = 3°, no DSN requirement.

### 10.1 Shackleton rim, 3 samples × 2 h

One-way route: 1401 m on the pixel grid, 1390 m as driven (3-D, resampled every 10 m).

| Figure                       | Utility rover (`csa-rover`) | Micro rover (`rover`)        |
| ---------------------------- | --------------------------- | ---------------------------- |
| Reaches the ice              | yes                         | yes                          |
| Samples completed            | 3 / 3                       | 1 / 3                        |
| Returns to the lander        | yes                         | no (reason `samples`)        |
| Outbound driving time        | 3.6 h                       | 7.1 h                        |
| Total time                   | 13.1 h                      | stops 10.1 h after departure |
| Margin to the end of mission | 322.9 h                     | —                            |
| Lowest battery               | 47.1 %                      | 19.7 %                       |
| Final battery                | 54.7 %                      | 19.7 %                       |
| Time without direct sunlight | 8.5 h                       | 5.6 h                        |

The micro rover fails by the rule of § 7.4: during the second sample its battery falls below
its 20 % hibernation threshold on PSR ground, where it cannot recharge. In planner terms this
is the violation `rover-samples`.

### 10.2 Samples each rover can bring back

Largest `n` (within the accepted 1 … 10) for which the round trip succeeds with the lowest
battery at or above 20 %; 0 means not even one sample.

| Site             | Micro, 2 h per sample | Micro, 1 h | Utility, 2 h per sample | Utility, 1 h |
| ---------------- | --------------------- | ---------- | ----------------------- | ------------ |
| Shackleton rim   | 0                     | 1          | 4                       | 8            |
| Connecting ridge | 1                     | 3          | 4                       | 9            |
| de Gerlache rim  | 2                     | 4          | 5                       | 10           |
| Malapert massif  | 1                     | 3          | 4                       | 9            |
| Mons Mouton      | 0                     | 0          | 4                       | 8            |
| Nobile rim       | 0                     | 0          | 3                       | 7            |

The micro rover completes 3 samples of 2 h at none of these sites; the utility rover does at
all of them. From the curated Chang'e-7 site point there is no drivable route to permanent
shadow with `ρ_max` = 20°.

---

## 11. Assumptions and limits

**Search.**

- Landing instants are the 00:00 UTC of each day; the rover leaves at touchdown.
- `P` holds at most 60 points on a 40 m grid, so the landing point is the best of a
  preselection, not of the continuum.
- At most 3 rover simulations per day (§ 8.3): a day reported without a solution may still have
  a feasible candidate that was not tried.
- Days are chosen on hourly series and 1° horizons; only the shortlist is recomputed finer
  (§ 8.4).

**Landing point.**

- Landing feasibility is terrain and light only: the safe-terrain rule, the p90 slope within
  500 m and the Sun at touchdown. The descent itself is not part of the plan.
- Nothing smaller than the 20 m pixels is seen: no boulders, no small craters.

**Lander.**

- The lander's power is represented by the score terms `e` and `D` and by the limits `D_max`
  and `S_min`; its battery is not integrated by the planner.
- The Earth link is geometric: disc fraction above a horizon raised by `μ`, optionally gated by
  DSN visibility (10° minimum elevation at the complex). No antenna gain, noise, data volume or
  scheduling.

**Rover.**

- Constant commanded speed derated by slope; rigid-wheel rolling resistance; no slip or
  sinkage; no obstacle avoidance below the DEM resolution; no regenerative braking.
- Heater power is inside the loads of the profile; temperatures are estimated along the trip
  but constrain nothing.
- The rover returns by the outbound route and starts with a full battery.
- The horizon along the route is interpolated between anchors ~200 m apart at a 2° azimuth
  step; inside a PSR cell of the 100 m illumination map the Sun is taken as absent.
- The sampling figures (`n`, `h_s`, `P_s`) and both rovers are assumptions the user can change,
  not the figures of a real instrument or vehicle.
- Transfer of the samples to the lander is taken for granted on arrival.

**Data.**

- Landing days are limited to 2026 – 2030, the span of the DE441 table.
- A target must lie on a curated 20 m tile with an illumination map, far enough from its edge
  for the search radius, the snap to the ice and the route window (§ 2.1).

---

## 12. Outside the model

The planner does not consider:

- the Earth-to-Moon transfer, its trajectory classes, or launch dates and launch windows;
- Δv, propellant or mass budgets of any phase;
- waiting in lunar orbit and its cost;
- relay satellites or any link other than direct-to-Earth;
- the powered descent, its guidance, its propellant or the landing dispersion ellipse;
- the lander's battery state through the mission, and thermal limits of lander or rover;
- link budget, data rate or data volume;
- more than one rover, more than one ice target per plan, or a return route different from the
  outbound one;
- the return of the samples to Earth;
- cost, schedule or risk figures.
