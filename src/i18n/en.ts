import type { es } from './es.ts'

/** English dictionary. Typed against the Spanish one: every key must exist, no extras. */
export const en: Record<keyof typeof es, string> = {
  // App shell
  'app.scenarios': 'Scenarios',
  'app.sitePanel': 'Landing site',
  'app.loadingSites': 'Loading sites…',
  'loader.textures': 'Loading textures… {pct}%',
  'splash.label': 'LUMEN 3D',
  'splash.loading': 'Loading LUMEN 3D…',
  'common.close': 'Close',
  'common.computing': 'Computing…',

  // Top bar
  'topbar.tag': 'Sun and Earth at the lunar south pole',
  'topbar.viewAria': 'View',
  'topbar.orbit': 'Orbit',
  'topbar.surface': 'Surface',
  'topbar.landing': 'Landing',
  'topbar.hidePanels': 'Hide panels',
  'topbar.showPanels': 'Show panels',
  'topbar.panelsTitle': 'Hide or show the panels to see the whole 3D scene',
  'topbar.compare': 'Compare',
  'topbar.why': 'Why?',
  'topbar.lang': 'Language',
  'topbar.guide': 'Guide',
  'topbar.guideTitle': 'Guided tour of the interface',
  'topbar.tools': 'Tools',
  'topbar.audience': 'Mode',

  // Audience mode (what is shown, never what is computed)
  'audience.planner': 'Planner',
  'audience.educator': 'Educator',
  'audience.public': 'Public',
  'audience.planner.desc': 'Everything: DSN, thermal, landing ellipse, hardware filter and export.',
  'audience.educator.desc':
    'The physics of the place: Sun, Earth, horizon, illumination and ice, without the engineering detail.',
  'audience.public.desc': 'The essentials: is there Sun? can you see Earth? and why that matters.',
  'audience.who': 'Who are you?',

  // Collapsible panels
  'panel.left': 'Landing sites',
  'panel.right': 'Site status',
  'panel.bottom': 'Time & charts',
  'panel.expand': 'Expand {name}',
  'panel.collapse': 'Minimise {name}',
  'panel.key': 'key {key}',
  'panel.scenarios': '{n} scenarios',
  'panel.sunEl': 'Sun {el}',
  'panel.sunDown': 'Sun down',
  'panel.earthUp': 'Earth in view',
  'panel.earthDown': 'Earth hidden',

  // Contextual help
  'help.open': 'Help: {topic}',
  'help.tour': 'Show me in the tour',
  'help.sites':
    'Choose where to land. The Top 3 is computed for your date and mission; “See more sites” shows all of them and your own coordinates. The small map shows where on the south pole it is. To compare sites, go to the “Decide” step.',
  'help.metrics':
    'What the site sees right now: Sun elevation and visible fraction of its disc, whether the Earth is above the horizon (direct-to-Earth link, DTE) and when that changes. Below: a summary of the whole mission window, the battery and terrain safety.',
  'help.charts':
    'Move mission time with the slider or press Play. “Timeline” shows Sun, Earth and battery over the days; “360° horizon” draws the terrain with the paths; “Alternative dates” scores every landing day over the next 12 months.',
  'help.hud':
    '3D view controls. In Orbit: drag to rotate, scroll to zoom and click a dot to fly to the site. On the Surface: look at the Sun or the Earth, toggle the horizon line, slopes, landing ellipse, or relocate the site with a click.',

  // Guided tour
  'tour.aria': 'Guided tour',
  'tour.step': 'Step {n} of {total}',
  'tour.next': 'Next',
  'tour.prev': 'Back',
  'tour.skip': 'Skip',
  'tour.finish': 'Finish',
  'tour.invite': 'First time in LUMEN 3D? A 1-minute tour shows you every part.',
  'tour.start': 'Start tour',
  'tour.later': 'Not now',
  'tour.welcome.title': 'Welcome to LUMEN 3D',
  'tour.welcome.body':
    'One question: if you land here on this date, will you have sunlight for power and the Earth in view to communicate?',
  'tour.steps.title': '4 steps',
  'tour.steps.body':
    'Orbit → Surface → Landing → Decide. Move on with “Go to…” or jump to any step.',
  'tour.scene.title': 'The 3D scene',
  'tour.scene.body':
    'Drag to rotate, scroll to zoom. Click a dot to fly to that site. Try “Background: Sun / Earth”.',
  'tour.sites.title': 'Sites',
  'tour.sites.body':
    'The Top 3 for your mission. “See more sites” opens all of them and your own coordinates.',
  'tour.metrics.title': 'Site status',
  'tour.metrics.body':
    'Is there Sun? Is the Earth in view? Green = good, yellow = marginal, red = bad.',
  'tour.time.title': 'Control time',
  'tour.time.body': 'Drag the slider or press Play to watch the mission days go by.',
  'tour.charts.title': 'Charts',
  'tour.charts.body': 'When there is Sun, Earth and battery. Click to jump to that moment.',
  'tour.hud.title': 'View controls',
  'tour.hud.body':
    'Camera shortcuts and layers: look at the Sun or the Earth, slopes and the landing zone.',
  'tour.compare.title': 'Decide',
  'tour.compare.body':
    'Create scenarios with another site, date or hardware, edit them and see which one wins. Then export.',
  'tour.assistant.title': 'Assistant',
  'tour.assistant.body':
    '3 recommended scenarios, ready to apply or compare. It also answers questions.',
  'tour.more.title': 'More',
  'tour.more.body': 'Change site, hardware filter, “Why is it hard?” and hide panels.',
  'tour.done.title': 'All set!',
  'tour.fullGuide': 'Read the full user guide (Spanish, with English summary)',
  'tour.done.body': 'Replay this tour from “Guide”. Each panel has a “?” with its help.',

  // 3D labels
  'scene.sun': 'Sun',
  'scene.earth': 'Earth',
  'scene.earthNotToScale': 'Earth (not to scale)',

  // Time controls
  'time.aria': 'Date and time',
  'time.landing': 'Landing (UTC)',
  'time.duration': 'Duration (days)',
  'time.play': '▶ Play',
  'time.pause': '❚❚ Pause',
  'time.lunarDay': '☾ Lunar day',
  'time.lunarDayTitle':
    'Plays one full lunar day (29.5 Earth days) from the landing: the whole cycle of light and shadow, and the swing of the Earth.',
  'time.speed': 'Speed',
  'time.jumpSunTitle': 'Jump to the next sunrise or sunset',
  'time.jumpEarthTitle': 'Jump to the next Earthrise or Earthset',
  'time.sunset': '⏭ Sunset',
  'time.sunrise': '⏭ Sunrise',
  'time.earthset': '⏭ Earthset',
  'time.earthrise': '⏭ Earthrise',
  'time.scrub': 'Time since landing',
  'time.ephemHorizons': 'Ephemeris: JPL Horizons DE441',
  'time.ephemIau': 'Ephemeris: IAU model (outside 2026–2030)',
  'time.ephemTitle':
    'Sun and Earth positions. From 2026 to 2030 they come from JPL Horizons (DE441, NASA/JPL); outside that span, from the analytic IAU model.',

  // Events / countdowns
  'ev.sunset': 'sunset',
  'ev.sunrise': 'sunrise',
  'ev.earthset': 'Earthset',
  'ev.earthrise': 'Earthrise',
  'ev.set': 'set',
  'ev.rise': 'rise',
  'countdown.none': 'No {what} in the window',
  'countdown.in': '{what} in',
  'countdown.paren': '({what} in {dur})',

  // Metrics panel
  'metrics.aria': 'Scenario metrics',
  'metrics.now': 'Now at the site',
  'metrics.error': 'Could not compute: {msg}',
  'metrics.window': '{days}-day window',
  'metrics.scoreTitle':
    '50 % energy + 35 % link + 15 % survival (penalises nights longer than 5 days)',
  'metrics.obstruction': 'terrain {km} km away',
  'card.elevAz': 'elevation · az {az}° ({card})',
  'sun.title': 'Sun',
  'sun.lit': 'Sunlit',
  'sun.shadow': 'In shadow',
  'sun.shadowShort': 'Shadow',
  'sun.meterAria': 'Visible solar disc',
  'sun.disc': 'Visible disc {pct} · horizon {hz} (margin {m})',
  'earth.title': 'Earth · direct link',
  'earth.on': 'DTE active',
  'earth.off': 'No link',
  'earth.phase': 'phase {pct}',
  'earth.horizon': 'Horizon {hz}',
  'earth.disc': 'visible disc {pct}',
  'thermal.title': 'Estimated temperature',
  'thermal.badge.good': 'Tolerable',
  'thermal.badge.warn': 'Cold nights',
  'thermal.badge.bad': 'Critical freeze',
  'thermal.face': 'Vertical face pointed at the Sun (lander side, radiator)',
  'thermal.regolith': 'Flat regolith: {t}',
  'thermal.range': 'Over the window: min {min} · max {max}',
  'thermal.freeze': 'Below {limit} °C unheated: {total} in total, {longest} in a row',
  'thermal.psr': 'No light in the whole window: permanent-shadow floor (~−233 °C)',
  'thermal.note':
    'Simplified radiative equilibrium (albedo 0.12, emissivity 0.95, 4 h cooling). An order of magnitude, not a thermal model.',
  'horizon.earthToggle': 'If this were Earth',
  'horizon.earthLegend': 'With an atmosphere: refracted Sun and a sky still bright (twilight)',
  'dsn.range': 'Range {km} km · free-space loss {db} dB at X band ({rel} dB vs. mean)',
  'dsn.aria': 'Deep Space Network stations',
  'dsn.goldstone': 'Goldstone',
  'dsn.madrid': 'Madrid',
  'dsn.canberra': 'Canberra',
  'dsn.receiving': 'receiving',
  'dsn.none': 'Earth is visible, but no DSN station sees the Moon above 10°',

  // Hardware filter
  'topbar.hardware': 'Hardware',
  'topbar.hardwareTitle': 'Filter every site by the lander limits',
  'hw.aria': 'Hardware viability filter',
  'hw.title': 'Hardware viability · {days}-day mission',
  'hw.intro':
    'Set what your lander tolerates and every catalogue site is marked at once: ✓ viable, ! marginal (less than 20 % headroom), ✕ ruled out. The active landing date and link margin are used.',
  'hw.field.slope': 'Max slope (°, p90 within 500 m)',
  'hw.field.night': 'Max continuous night (h)',
  'hw.field.dte': 'Min DTE link (%)',
  'hw.field.rover': 'Rover max slope (°)',
  'hw.c.slope': 'slope',
  'hw.c.night': 'night',
  'hw.c.dte': 'link',
  'hw.verdict.good': 'Viable',
  'hw.verdict.warn': 'Marginal',
  'hw.verdict.bad': 'Ruled out',
  'hw.col.verdict': 'Status',
  'hw.col.site': 'Site',
  'hw.col.score': 'Score',
  'hw.col.slope': 'Slope p90',
  'hw.col.night': 'Longest night',
  'hw.col.dte': 'DTE',
  'hw.col.notes': 'Constraint',
  'hw.send': 'Send {n} viable to Compare',
  'hw.note':
    'Slope from the 20 m DEM (reference sites count as level). The score includes science if you move the Engineering ↔ Science control.',

  // Ice access / science
  'ice.title': 'Ice access (PSR)',
  'ice.badge.inside': 'Inside a PSR',
  'ice.badge.reachable': 'Reachable',
  'ice.badge.none': 'Out of reach',
  'ice.score': 'Science score: ice within 500 m of driving = 100, at 2 km = 0',
  'ice.inside':
    'The landing point is permanently shadowed: ice at the lander’s feet, but no solar power.',
  'ice.noneInRadius': 'No permanently shadowed ground within {r}.',
  'ice.straight': 'Nearest PSR {d} in a straight line',
  'ice.route': 'rover route {d} (max slope {slope})',
  'ice.blocked': 'There is a PSR nearby, but its walls exceed the rover’s {deg}°.',
  'ice.note':
    'One-year illumination map (~100 m cells) and least-cost route on the 20 m DEM, never over slopes > {deg}°.',
  'science.engineering': 'Engineering',
  'science.science': 'Science',
  'science.aria': 'Weight of science in the score',
  'science.valueText': '{pct} % science',
  'science.noData': 'This site has no illumination map: the score stays the engineering one.',
  'science.combined':
    'Combined score {score}/100 = engineering {eng} and science {sci} at {pct} % science weight',

  // Landing-point optimizer
  'opt.button': 'Suggest a better point',
  'opt.loading': 'Looking for safe ground and evaluating the mission at each point…',
  'opt.summary': '{safe} points with slope < 10° · the {n} highest were evaluated',
  'opt.none': 'No ground below 10° of slope inside the landing ellipse.',
  'opt.where': '{d} to the {dir}',
  'opt.stats': 'slope {slope} · light {sun} · DTE {dte} · night {night}',
  'opt.go': 'Go to this point',
  'opt.note':
    'In brackets, the difference from the target point. 1° horizons and a 30 min series: numbers may shift slightly after relocating.',

  // Compare rows (new)
  'row.minTemp': 'Estimated min. temp.',
  'row.ice': 'Ice access',
  'row.iceNoData': 'no illumination map',
  'row.combined': 'Combined score ({pct} % science)',

  // Illumination layer
  'hud.illum': 'Permanent shadow',
  'hud.illumTitle': 'Colour the terrain by mean yearly illumination and show the route to the ice',
  'hud.nac': 'LRO orbital image',
  'hud.nacTitle':
    'Real Lunar Reconnaissance Orbiter photo via LROC QuickMap: south pole NAC mosaic (10 m/px) and, north of 85.5° S, the WAC mosaic (100 m/px). Its shadows are those of the photo, not of the simulated date.',
  'hud.nacCredit': '{source}. Shadows are those of the photo, not simulated.',
  'illum.legend.title': 'Yearly illumination',
  'illum.legend.psr': 'Permanent shadow (PSR, possible ice)',
  'illum.legend.dim': 'Little light',
  'illum.legend.bright': 'Almost always lit',
  'illum.legend.route': 'Rover route to the ice',
  'scene.ice': 'Ice · {d} m',
  'stats.energy': 'Energy (vs. continuous Sun)',
  'stats.sunlit': 'Time in sunlight',
  'stats.dte': 'Time with DTE link',
  'shift.label': 'If the date moves: {min}–{max}',
  'shift.title':
    'Score of the same mission landing a few days earlier or later. Click a value to use that date.',
  'shift.now': 'now',
  'shift.cell': '{days} days: score {score}',
  'metrics.verdict': 'Verdict',
  'metrics.verdictTitle':
    'Against the hardware limits (slope, longest night and minimum link). Adjust them in More → Hardware.',
  'metrics.verdictFails': 'fails: {what}',
  'metrics.verdictTight': 'tight on: {what}',
  'stats.both': 'Sun + Earth at once',
  'stats.night': 'Longest night',
  'stats.noDte': 'Longest link outage',
  'stats.sunEl': 'Mean / max Sun elevation',

  // Compare
  'compare.aria': 'Scenario comparison',
  'compare.title': 'Compare scenarios · {days}-day window',
  'compare.add': '+ Scenario',
  'compare.hint':
    'Add a scenario and change its site or date in the left panel to compare. All scenarios share the same mission time (T+), so you see what happens with each option at the same moment.',
  'compare.activate': 'Activate',
  'compare.landing': 'Landing {date}',
  'row.score': 'Score',
  'row.energy': 'Energy',
  'row.sunlit': 'Time in sunlight',
  'row.dte': 'DTE link',
  'row.both': 'Sun + Earth',
  'row.night': 'Longest night',
  'row.noDte': 'Longest DTE outage',
  'row.maxSunEl': 'Max Sun elev.',
  'row.battery': 'Min battery',
  'row.batteryDead': '0 % · {h} without power',

  // Date sweep
  'sweep.hint':
    'Score of a {days}-day mission by landing day (12 months from today) at {site}. Faint bars: the Sun does not light the site at touchdown. Blue strip: Earth visible at landing. Click to pick that date.',
  'sweep.computing': 'Computing 12 months…',
  'sweep.aria': 'Score of each landing date over the next 12 months',
  'sweep.item': 'energy {e} · DTE {d} · max night {n}',
  'sweep.noEarth': 'no Earth at landing',

  // Seasons (2026–2030 by month)
  'season.hint':
    'Month by month, 2026–2030, at {site}: bars = mean energy of a {days}-day mission landing that month (fainter when few days have the Sun up at touchdown); blue line = Earth visible (DTE); white line = maximum Sun elevation. Click a month to set that date.',
  'season.computing': 'Computing 60 months…',
  'season.noDetail': 'Waiting for the site horizon…',
  'season.aria': 'Energy, Earth link and maximum Sun elevation by month, 2026–2030',
  'season.legend.energy': 'Energy (%)',
  'season.legend.dte': 'DTE (%)',
  'season.legend.sunEl': 'Max Sun (°)',
  'season.best': 'Best month: {month} ({e} energy, Sun up to {el}).',
  'season.worst': 'Worst month: {month} ({e}, Sun up to {el}).',
  'season.why':
    "The Moon's axis is tilted only 1.54°, so at the south pole the 'summer' Sun climbs to +1.54° and the 'winter' Sun stays at −1.54°, in a yearly cycle. That tiny difference decides how much of the Sun clears the mountains on the horizon and, with it, each month's energy.",

  // Site picker
  'picker.remove': 'Remove scenario {label}',
  'picker.addTitle': 'Duplicate the active scenario to compare it',
  'picker.customTitle': 'Custom coordinates',
  'picker.lat': 'Latitude (°)',
  'picker.lon': 'Longitude (°E)',
  'picker.use': 'Use',
  'links.title': 'See this point in the LRO map viewers and in JPL Horizons',
  'links.horizonsTitle':
    'Query JPL Horizons for the apparent azimuth and elevation of this body from the site, hourly, over the current mission window (plain text, the same API LUMEN uses).',
  'links.quickmapTitle':
    'Opens the same coordinates in LROC QuickMap (ASU): LRO NAC images, illumination, PSRs and topography.',
  'links.trekTitle':
    'Opens the same coordinates in Moon Trek (NASA/JPL): 3D terrain viewer with the LRO layers.',
  'picker.customHint': 'South of 75.5°S the horizon is computed from LOLA in your browser.',
  'picker.group.pole': 'South Pole',
  'picker.group.custom': 'Custom',
  'picker.group.ref': 'Reference (away from the pole)',
  'acc.lola': 'LOLA 20 m',
  'acc.lola480': 'LOLA 480 m',
  'acc.spherical': 'No relief',

  // Horizon chart
  'horizon.scale': 'vertical scale ×{k}',
  'horizon.aria': 'Horizon panorama with the paths of the Sun and the Earth',
  'horizon.legend': '● visible  ○ hidden',

  // Sites and data sources
  'site.custom.name': 'Custom {coords}',
  'site.custom.mission': 'User coordinates',
  'site.custom.descDem': 'Horizon computed in your browser from the LOLA DEM.',
  'site.custom.descFlat': 'Outside the polar DEM: an ideal spherical horizon is used.',
  'source.lola20': 'LOLA LDEM_80S_20M (±10 km) + LDEM_75S_240M (up to 300 km)',
  'source.tile': 'LOLA LDEM_80S_20M ({site} tile) + 480 m/px, computed in the browser',
  'source.coarse': 'LOLA LDEM_75S_240M resampled to 480 m/px (computed in the browser)',
  'source.spherical': 'Ideal spherical horizon (no local topography)',
  'source.noData': 'No data: run `npm run data`. Ideal spherical horizon.',

  // Explain overlay
  'explain.aria': 'Why the Moon is different',
  'explain.title': 'Why is the lunar south pole so hard?',
  'explain.data':
    'Data: LOLA topography (Lunar Reconnaissance Orbiter, NASA/GSFC) and JPL Horizons DE441 ephemerides (NASA/JPL-Caltech) for 2026–2030; outside that span, the IAU rotation model with astronomy-engine (see README).',
  'explain.c1.title': 'Why does the Sun never climb at the pole?',
  'explain.c1.body':
    "The Moon's axis is tilted only 1.54° to the ecliptic. At the pole the Sun circles the horizon during the month, never higher than ~1.6°. On Earth the noon Sun climbs tens of degrees.",
  'explain.c1.cta': 'See the Shackleton rim',
  'explain.c2.title': 'A few metres change everything',
  'explain.c2.body':
    "With the Sun so low, a ridge a few hundred metres high 20 km away is enough to hide it. Shackleton's rim is lit ~87 % of the year. Its floor, a few km away, has been in permanent shadow for billions of years.",
  'explain.c2.cta': 'Go down into Shackleton',
  'explain.c3.title': 'No atmosphere: the horizon is the terrain',
  'explain.c3.body':
    'The Moon has no refraction: visibility is pure geometry. From a peak the horizon is below 0° (about −2.7° from 2 km up), so you can see the Sun even after it has "astronomically" set.',
  'explain.c3.cta': 'Climb the Malapert massif',
  'explain.c4.title': 'The Earth barely moves… but it wobbles',
  'explain.c4.body':
    'The Moon always shows the same face, so the Earth does not rise and set like the Sun. It only wobbles about ±7° due to libration. From the south pole it grazes the horizon, and one mountain in its direction is enough to cut the direct link.',
  'explain.c4.cta': 'See the connecting ridge',
  'explain.c5.title': 'Far side: never any Earth',
  'explain.c5.body':
    "From the far side the Earth is always below the horizon. Chang'e-4 needed the Queqiao relay satellite to communicate.",
  'explain.c5.cta': "Go to Chang'e-4",
  'explain.c6.title': 'Two-week days and nights',
  'explain.c6.body':
    'A lunar day lasts 29.5 Earth days. Away from the pole there are ~14 days of light and ~14 of night at −170 °C: batteries and heaters decide whether the mission survives. At the pole, choosing site and date well can shrink that night to a few hours.',
  'explain.c6.cta': 'Compare with Apollo 11',
  'explain.c7.title': 'No air: no twilight, no blanket',
  'explain.c7.body':
    'On Earth the atmosphere bends light (~0.6° at the horizon) and the sky stays bright until the Sun is 18° down. On the Moon, the moment the disc drops behind a ridge it is dark. A wall facing the Sun reaches ~+110 °C; in shadow it falls towards −180 °C within hours, and the floor of a permanently shadowed crater sits near −233 °C (40 K).',
  'explain.c7.cta': 'See inside Shackleton',
  'explain.c8.title': 'Canada on the Moon',
  'explain.c8.body':
    'The Canadian Space Agency contributes Canadarm3, Gateway\x27s robotic arm, and in return gets two astronaut flights to the Moon: Jeremy Hansen flew around it on Artemis II (April 2026). It is also preparing a utility rover for the 2030s that must survive the two-week lunar night at about −200 °C and scout for ice, exactly what this tool measures.',
  'explain.c8.cta': 'Try the Canadian rover',
  'explain.source': 'Source',
  'glossary.title': 'Glossary',
  'glossary.mask.term': 'Horizon mask',
  'glossary.mask.def':
    'Elevation of the terrain in every direction seen from the site (0.5° resolution, out to 300 km). It decides when the Sun or the Earth are blocked.',
  'glossary.frac.term': 'Visible fraction',
  'glossary.frac.def':
    'Share of the disc of the Sun (or the Earth) above the horizon; a body counts as visible from 50 %.',
  'glossary.dte.term': 'DTE',
  'glossary.dte.def': 'Direct-to-Earth: communication straight to Earth, with no relay satellite.',
  'glossary.margin.term': 'Link margin',
  'glossary.margin.def':
    'Degrees the Earth must clear above the terrain for a usable link; it keeps the signal from bouncing off the ground (multipath).',
  'glossary.dsn.term': 'DSN',
  'glossary.dsn.def':
    'Deep Space Network: NASA’s antennas at Goldstone, Madrid and Canberra. To talk to the Moon at least one must have it in view.',
  'glossary.dispersion.term': 'Landing ellipse',
  'glossary.dispersion.def':
    'Area where the lander may end up because of guidance error (3σ). It is elongated: the error along the approach track is larger than the cross-track one.',
  'glossary.psr.term': 'PSR',
  'glossary.psr.def':
    'Permanently shadowed region: crater floors the Sun never reaches, where ice can survive.',
  'glossary.slope.term': 'Slope',
  'glossary.slope.def':
    'Tilt of the ground computed on the 20 m terrain. Under 10° is safe to land on; over 15° is hazardous.',
  'glossary.lola.term': 'LOLA',
  'glossary.lola.def':
    'Lunar Orbiter Laser Altimeter: the laser altimeter on the LRO orbiter, the source of all the topography.',
  'glossary.tplus.term': 'T+',
  'glossary.tplus.def': 'Time elapsed since touchdown; shared by every scenario.',
  'explain.sources.title': 'NASA and CSA resources used by LUMEN 3D',
  'explain.sources.horizons':
    'DE441 ephemerides: Sun and Earth positions seen from each site (2026–2030), arcsecond-level validation and DSN geometry.',
  'explain.sources.quickmap':
    'South pole NAC mosaic (10 m/px) as the “LROC NAC image” layer in Surface, Speyerer & Robinson (2013) illumination map to validate ours, and a link to each site.',
  'explain.sources.trek':
    'WAC mosaics of the globe and the polar cap in the Orbit view, Earth visibility map to validate the DTE link, and a link to each site.',
  'explain.sources.csa':
    'Canada\x27s contributions to Artemis (Canadarm3, Gateway, Jeremy Hansen on Artemis II) and the utility rover concept: “Canada on the Moon” card and the rover energy profile.',

  // Link margin
  'link.label': 'Min. link elev. (°)',
  'link.dsn': 'Require a DSN station',
  'link.dsnTitle':
    'The link only counts while Goldstone, Madrid or Canberra see the Moon at 10° or more. With no station in view (≈1.6 % of the time, gaps of up to ~90 min) there is no link even with the Earth above the horizon.',
  'link.title':
    'Minimum Earth elevation above the terrain for a usable DTE link (avoids multipath off the regolith). Typical: 3–5°.',
  'link.required': 'link needs ≥ {deg}',
  'horizon.linkLine': 'link threshold (+{deg}°)',

  // Export / share
  'export.menu': 'Export',
  'export.csv': 'Time series (CSV)',
  'export.json': 'Full scenario (JSON)',
  'export.horizon': 'Horizon profile (CSV)',
  'export.compareJson': 'All scenarios (JSON)',
  'export.notReady': 'Wait for the computation to finish',

  // Presets
  'presets.title': 'Quick scenarios',
  'presets.delay.title': 'What if Artemis III slips 14 days?',
  'presets.delay.desc':
    'Same site, landing today vs. 14 days later: the Sun–Earth geometry changes completely.',
  'presets.peakVsPsr.title': 'Near-eternal-light peak vs. crater floor',
  'presets.peakVsPsr.desc':
    'Connecting ridge (Shackleton–de Gerlache) vs. the permanently shadowed floor of Shackleton.',
  'presets.artemis.title': 'Artemis III candidates',
  'presets.artemis.desc': 'Four NASA candidate regions on the same date.',
  'presets.csaRover.title': 'Canadian rover: does it survive the night?',
  'presets.csaRover.desc':
    'The Canadian Space Agency utility rover must survive the lunar night. Lit ridge, Earth-facing massif and icy crater, 30 days.',
  'presets.lightIce.title': 'Light vs. ice',
  'presets.lightIce.desc':
    'Sunlit ridges next to shadowed craters, with 30 % science weight in the score.',
  'presets.apply': 'Compare',

  // Levels (shape + text companion to colours)
  'level.good': 'good',
  'level.warn': 'caution',
  'level.bad': 'critical',

  // Surface view HUD
  'hud.macroHint': 'Drag to orbit · scroll to zoom into the pole · click a site to land on it',
  'hud.more': 'Controls',
  'hud.less': 'Hide controls',
  'hud.microHint': 'Drag to look around · scroll to zoom (the Sun is 0.5° wide)',
  'hud.aerialHint':
    'Aerial view from 3 km (not what the lander sees) · turn on “Click to relocate” and click the terrain to move the site',
  'hud.compass': 'Camera orientation',
  'hud.elev': 'elev.',
  'hud.lookSun': 'Look at the Sun',
  'hud.lookEarth': 'Look at the Earth',
  'hud.wide': 'Wide view',
  'hud.horizonLine': 'Horizon line',
  'hud.paths': 'Paths',
  'hud.landingTools': 'Landing tools',
  'hud.aerialView': 'Aerial view',
  'hud.landerView': 'Lander view',
  'hud.slope': 'Slopes',
  'hud.ellipse': 'Ellipse',
  'hud.ellipseOff': 'no ellipse',
  'hud.ellipseAspect': 'Ellipse shape',
  'hud.ellipseAspectTitle':
    'Ratio of the error along the approach track to the cross-track one. The major axis follows the approach azimuth.',
  'hud.ellipseCircle': 'circle',
  'hud.pick': 'Click to relocate',
  'hud.pickActive': 'Click the terrain…',
  'hud.pickTitle':
    'Click the terrain to move the site there: the horizon is recomputed with LOLA 20 m',

  'hud.simulateDescent': 'Simulate descent',

  // Landing (descent) view
  'landing.aria': 'Descent guidance',
  'landing.phase': 'Phase',
  'landing.alt': 'Altitude',
  'landing.dist': 'To target',
  'landing.vspeed': 'V. speed',
  'landing.phase.braking': 'Braking',
  'landing.phase.approach': 'Approach',
  'landing.phase.terminal': 'Terminal descent',
  'landing.phase.landed': 'On the surface',
  'landing.reticle': 'Slope under the reticle',
  'landing.noData': 'no data',
  'landing.sunInFov': '☀ Sun in the field of view ({deg} off-axis)',
  'landing.sunClear': 'Sun out of frame ({deg} off-axis)',
  'landing.contactLit': 'Touchdown point sunlit ({pct} of the solar disc)',
  'landing.contactDark': 'Touchdown point in shadow',
  'landing.play': 'Play',
  'landing.pause': 'Pause',
  'landing.restart': 'Restart',
  'landing.speed': 'Speed',
  'landing.progress': 'Descent progress',
  'landing.approach': 'Approach',
  'landing.approachAuto': 'Sun behind (auto)',
  'landing.approachAhead': 'Sun ahead',
  'landing.approachFrom': 'from {dir}',
  'landing.eye': 'View from the craft',
  'landing.orbit': 'Orbit around',
  'landing.panels': 'Direct sunlight on panels: top {top} · side facing the Sun {side}',
  'landing.toSurface': 'Go to the surface view',
  'landing.hint': 'Drag to look away · scroll to zoom · mission time is frozen during the descent',
  'landing.orbitHint': 'Drag to orbit the lander · scroll to zoom',

  // Slope layer
  'slope.legend.title': 'Terrain slope',
  'slope.legend.safe': '< {deg}° safe',
  'slope.legend.caution': '{a}–{b}° marginal',
  'slope.legend.steep': '> {deg}° hazardous',

  // Terrain card
  'terrain.title': 'Terrain · landing',
  'terrain.badge.good': 'Safe slope',
  'terrain.badge.warn': 'Marginal slope',
  'terrain.badge.bad': 'Too steep',
  'terrain.localSlope': 'local slope (Horn, {res} m/px DEM)',
  'terrain.withinRadius': 'Within r = {r}: p90 {p90} · max {max} · area < 10°: {safe}',
  'terrain.coarse':
    '{res} m/px DEM: slopes are smoothed and underestimate the real one at lander scale.',

  // Dispersion
  'dispersion.title': '3σ landing ellipse ({a} × {b})',
  'dispersion.loading': 'Computing horizons for the ellipse points…',
  'dispersion.spread': 'Score between {min} and {max} across {n} possible touchdown points.',
  'dispersion.range': 'min · median · max',
  'dispersion.expected': 'Expected score',
  'dispersion.pGood': 'Prob. of score ≥ {score}',
  'dispersion.pSafe': 'Prob. of slope < {deg}°',
  'dispersion.score': 'Score',
  'dispersion.sun': 'Time in sunlight',
  'dispersion.dte': 'DTE link',
  'dispersion.night': 'Longest night',
  'dispersion.slope': 'Slope',
  'dispersion.note':
    '3σ ellipse with the major axis along the approach; each point is weighted by the probability of landing there. Quick analysis: 1° horizon and 30-min step per point. Markers in the surface view show each point; click one to move the site there.',
  // Energy / battery
  'energy.title': 'Power · battery',
  'energy.profile': 'Power profile',
  'energy.preset.lander': 'CLPS-class lander (box, 4 vertical faces)',
  'energy.preset.rover': 'Small rover (sun-tracking panel)',
  'energy.preset.csaRover': 'Canadian utility rover (CSA concept, illustrative)',
  'energy.preset.fixed': 'Fixed vertical panel (one face)',
  'energy.preset.custom': 'Custom',
  'energy.badge.ok': 'Survives',
  'energy.badge.dead': 'Out of power',
  'energy.depleted': 'Battery empty on {when} (T+{after}). {dead} without power in the window.',
  'energy.survives': 'Survives the whole window: minimum charge {min}.',
  'energy.stats': 'Now {now} · min {min} · operating {active} of the time · {wh} Wh generated',
  'energy.edit': 'Edit profile',
  'energy.field.panel': 'Arrays',
  'energy.field.az': 'Facing (° from N)',
  'energy.field.peak': 'Power per panel (W)',
  'energy.field.battery': 'Battery (Wh)',
  'energy.field.active': 'Operating load (W)',
  'energy.field.hibernate': 'Survival load (W)',
  'energy.field.threshold': 'Hibernate below (%)',
  'energy.field.initial': 'Initial charge (%)',
  'energy.panel.tracking': 'Sun-tracking',
  'energy.panel.vertical-box': 'Box: 4 vertical faces',
  'energy.panel.vertical-fixed': 'One fixed vertical face',
  'energy.panel.horizontal': 'Horizontal (on deck)',
  'energy.modelNote':
    'First-order model: power = panel × visible disc fraction × incidence cosine. Operates with Sun and battery above the threshold; otherwise hibernates. No thermal or conversion losses. Illustrative values.',

  // Timeline
  'timeline.sun': 'Sun',
  'timeline.earth': 'Earth',
  'timeline.both': 'Both',
  'timeline.battery': 'Battery',
  'timeline.horizon': 'horizon',
  'timeline.depleted': 'Out of power',
  'timeline.aria': 'Timeline: Sun visible {sun} of the time, DTE link {dte}, both {both}.',
  'timeline.ariaBattery': 'The battery never drops below {min}.',
  'timeline.ariaDepleted': 'The battery runs out on {when}.',

  // Bottom panel
  'bottom.aria': 'Time analysis',
  'bottom.timeline': 'Timeline',
  'bottom.horizon': '360° horizon',
  'bottom.dates': 'Alternative dates',
  'bottom.seasons': 'Seasons',
  'bottom.map': 'Polar map',
  'bottom.computing': 'Computing ephemerides…',
  'bottom.loadingHorizon': 'Loading horizon…',

  'dispersion.marker':
    'Score {score} · Sun {sun} % · DTE {dte} % · slope {slope}°. Click to move the site here.',

  // Guided flow: welcome, site choice and the four steps
  'welcome.kicker': 'Mission to the Moon’s south pole',
  'welcome.title': 'Make the best landing decision',
  'welcome.sub':
    'Choose where to land to get sunlight and contact with Earth. You’ll see it in 4 steps.',
  'welcome.start': 'Start',
  'welcome.tour': 'Take the guided tour',
  'choose.kicker': 'Before you start',
  'choose.title': 'Where do you want to land?',
  'choose.sub': 'The 3 best sites for today. Pick one to begin.',
  'choose.back': 'Back',
  'step.aria': 'Decision steps',
  'step.orbit': 'Orbit',
  'step.surface': 'Surface',
  'step.landing': 'Landing',
  'step.decide': 'Decide',
  'step.of': 'Step {n} of {total}',
  'step.next': 'Go to {name}',
  'step.orbit.hint': 'Find your site at the south pole and see where the Sun and Earth are.',
  'step.surface.hint': 'Stand on the site: can you see the Sun and Earth above the horizon?',
  'step.landing.hint': 'Simulate the descent and check that the ground is safe.',
  'step.decide.hint': 'Compare scenarios, pick the best and export your decision.',
  'more.title': 'More',
  'more.aria': 'More tools',
  'more.changeSite': 'Change site',

  // Top 3 and where on the Moon
  'top.title': 'Top 3 for your mission',
  'top.more': 'See more sites ({n})',
  'top.less': 'Show only the Top 3',
  'top.computing': 'Computing…',
  'fact.sun': 'Time in sunlight',
  'fact.earth': 'Time in contact with Earth',
  'fact.night': 'Longest night',
  'picker.current': 'Your site',
  'locator.pole': 'Lunar south pole',
  'locator.nearSide': 'Near side of the Moon',
  'polar.aria': 'Map of the lunar south pole',
  'polar.illum': 'Yearly illumination',
  'polar.psr': 'Permanently shadowed (PSR)',
  'polar.lit': 'Mean yearly Sun: 0 % → 100 %',
  'polar.relief': 'Relief (LOLA 960 m/px)',
  'polar.active': 'Active site',
  'polar.scenarios': 'Scenario sites (A, B…)',
  'polar.sites': 'Other sites: click to select',
  'polar.loading': 'Loading the polar relief…',
  'polar.noDem': 'No relief: run `npm run data` to generate the polar DEM.',
  'polar.noIllum': 'No yearly illumination maps: run `npm run data`.',
  'polar.hint':
    'Polar stereographic projection, 80°S-90°S; the Earth lies towards 0° (up). Rings every 2°.',
  'scene.southPole': 'Lunar South Pole',
  'frame.aria': 'View framing',
  'frame.label': 'Background:',
  'frame.sun': 'Sun',
  'frame.earth': 'Earth',
  'frame.free': 'Free',

  // Decide (comparison) and the scenario editor
  'compare.title2': 'Decide: compare and choose',
  'compare.sub': 'Same mission time for all. Edit any value and watch what changes.',
  'compare.new': '+ New scenario',
  'compare.hint2': 'Create a second scenario with another site, date or hardware to compare.',
  'compare.ideas': 'Quick comparison ideas',
  'compare.edit': 'Edit',
  'compare.duplicate': 'Duplicate',
  'compare.best': 'Best',
  'compare.days': '{n} days',
  'compare.detail': 'See detail',
  'compare.ended': 'This mission has already ended at this time.',
  'editor.newTitle': 'New scenario',
  'editor.editTitle': 'Edit scenario {label}',
  'editor.newHint': 'Starts from the current scenario. Change anything.',
  'editor.liveHint': 'Changes apply instantly.',
  'editor.where': 'Where?',
  'editor.how': 'When, and with what hardware?',
  'editor.date': 'Landing date (UTC)',
  'editor.days': 'Duration (days)',
  'editor.science': 'Science weight (ice)',
  'editor.hardware': 'Lander and rover limits',
  'editor.cancel': 'Cancel',
  'editor.create': 'Create scenario',
  'takeaways.title': 'What to remember',
  'takeaways.best': '{name} is the best option ({score}/100).',
  'takeaways.energy': 'It has power {pct} % of the time and contact with Earth {dte} %.',
  'takeaways.nightLong': 'Watch out: its longest night lasts {h}. The hardware must survive it.',
  'takeaways.nightShort': 'Its longest night is short ({h}).',
  'takeaways.nightNone': 'It has no night during the whole mission.',
  'night.none': 'no night',
  'export.final': 'Export my decision',
  'export.finalHint': 'Ready? Download the data for your choice.',

  // Floating assistant
  'assistant.cta': 'Help me choose?',
  'assistant.open': 'Open the assistant',
  'assistant.title': 'Assistant',
  'assistant.sub': '3 recommended scenarios for your mission',
  'assistant.apply': 'Apply',
  'assistant.compareAll': 'Compare the 3 options',
  'assistant.loading': 'Preparing recommendations…',
  'assistant.placeholder': 'Ask something (e.g. which has the most light?)',
  'assistant.send': 'Send',
  'assistant.mockNote': 'Demo mode: answers computed on your device.',
  'assistant.kind.balanced': 'Best overall',
  'assistant.kind.earth': 'Best contact with Earth',
  'assistant.kind.ice': 'Light + ice',
  'assistant.why.balanced': '{name}: the top score ({score}/100), sunlit {sun} % of the time.',
  'assistant.why.earth': '{name}: in contact with Earth {dte} % of the time.',
  'assistant.why.ice': '{name}: good light with ice nearby (science score {score}/100).',
  'assistant.answer.light':
    'For more light, look for high ground on crater rims or ridges. Right now {name} is sunlit {sun} % of the time.',
  'assistant.answer.earth':
    'Earth sits low in the sky at the south pole: high ground with no mountains towards Earth helps. {name} has contact {dte} %.',
  'assistant.answer.slope':
    'To land safely, the slope should be under 10°. Turn on "Slope" in Surface to see it in colour.',
  'assistant.answer.ice':
    'Ice sits in craters that are always in shadow. Ideal: land in sunlight near one. Try the "Light + ice" option.',
  'assistant.answer.night':
    'Long nights freeze the hardware and drain the battery. Compare each scenario’s "Longest night" in Decide.',
  'assistant.answer.best':
    'Right now the best option is {name} ({score}/100). Press "Compare the 3 options" to see it against others.',
  'assistant.answer.default':
    'I suggest starting with {name} ({score}/100). Ask me about light, Earth, slope, ice or night.',
}
