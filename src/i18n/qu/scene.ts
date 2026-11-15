import type { QuDict } from '../qu.ts'

export const scene: QuDict = {
  // Horizon chart
  'horizon.aria': 'Horizonte qhawana: Intipa, Tiqsimuyupa ñanninkuna',
  'horizon.legend': '● rikukun  ○ pakasqa',

  // Sites and data sources
  'site.custom.name': 'Akllasqayki {coords}',
  'site.custom.mission': 'Qampa coordenadaykikuna',

  // Explain overlay
  'explain.aria': 'Imarayku Killa huk niraq',
  'explain.title': '¿Imaraykutaq Killapa uray polon ancha sasa?',
  'explain.c1.title': "¿Imaraykutaq polopi Inti mana hayk'aqpas wicharinchu?",
  'explain.c1.cta': 'Shackletonpa patanta qhaway',
  'explain.c2.title': 'Pisi metrolla llapanta tikran',
  'explain.c2.cta': 'Shackletonpa ukhunman uraykuy',
  'explain.c3.title': 'Mana atmósfera kaptin, allpan horizonte',
  'explain.c3.cta': 'Malapert urquman wichay',
  'explain.c4.title': 'Tiqsimuyu yaqa mana purinchu… ichaqa kuyurin',
  'explain.c4.cta': 'Cresta de conexión nisqata qhaway',
  'explain.c5.title': "Pakasqa uya: mana hayk'aqpas Tiqsimuyu kanchu",
  'explain.c5.cta': "Chang'e-4 k'itiman riy",
  'explain.c6.title': "Iskay semana p'unchaw, iskay semana tuta",
  'explain.c6.cta': 'Apolo 11-wan tupachiy',
  'explain.c7.title': 'Mana wayra kaptin: mana rankhipas, mana amachaypas kanchu',
  'explain.c7.cta': 'Shackletonta ukhunmanta qhaway',
  'explain.c8.title': 'Canadá Killapi',
  'explain.c8.cta': 'Canadápa roverninta pruebay',
  'explain.source': 'Maymanta',
  'glossary.title': 'Simikuna',
  'glossary.dispersion.term': 'Uraykuna elipse',
  'glossary.slope.term': "Q'ata",

  // Link margin
  'link.dsn': 'DSN estación kanan',

  // Export / share
  'export.menu': 'Hurquy',
  'export.csv': 'Pachaman hina datokuna (CSV)',
  'export.json': "Hunt'asqa escenario (JSON)",
  'export.horizon': 'Horizontepa perfilnin (CSV)',
  'export.compareJson': 'Llapan escenariokuna (JSON)',
  'export.notReady': 'Yupay tukunankama suyay',

  // Presets
  'presets.title': 'Utqay escenariokuna',
  'presets.delay.title': "¿Artemis III 14 p'unchawta qhipakuptinri?",
  'presets.peakVsPsr.title': "Yaqa wiñay k'anchayniyuq urqu vs. cráterpa ukhun",
  'presets.artemis.title': "Artemis III-paq k'itikuna",
  'presets.artemis.desc': "NASApa tawa akllasqa k'itin, kikin p'unchawpi.",
  'presets.csaRover.title': 'Canadápa rovernin: ¿tutata atipanchu?',
  'presets.lightIce.title': "K'anchay vs. chullunku",
  'presets.apply': 'Tupachiy',

  // Levels (shape + text companion to colours)
  'level.good': 'allin',
  'level.warn': 'paqtataq',
  'level.bad': 'mana allin',

  // Surface view HUD
  'hud.macroHint':
    "Aysay muyunapaq · ruedata muyuchiy poloman asuykunapaq · chiqanta ñit'iy pampaman uraykunapaq",
  'hud.more': 'Controlkuna',
  'hud.less': 'Controlkunata pakay',
  'hud.microHint':
    'Aysay muyuriqniykita qhawanapaq · ruedata muyuchiy zoom ruwanapaq (Intiqa 0,5° chhikallan)',
  'hud.aerialHint':
    "3 km hanaqmanta qhawana (manan módulopa rikusqanchu) · «Ñit'ispa astay» nisqata hap'ichiy, hinaspa allpata ñit'iy k'itita astanapaq",
  'hud.lookSun': 'Intita qhaway',
  'hud.lookEarth': 'Tiqsimuyuta qhaway',
  'hud.wide': 'Hatun qhawana',
  'hud.horizonLine': "Horizonte siq'i",
  'hud.paths': 'Ñankuna',
  'hud.landingTools': 'Uraykunapaq herramientakuna',
  'hud.aerialView': 'Hanaqmanta qhawana',
  'hud.landerView': 'Módulopa qhawanan',
  'hud.slope': "Q'atakuna",
  'hud.ellipse': 'Elipse',
  'hud.ellipseOff': 'mana elipseyuq',
  'hud.ellipseAspect': "Elipsepa rikch'aynin",
  'hud.ellipseCircle': 'muyu',
  'hud.pick': "Ñit'ispa astay",
  'hud.pickActive': "Allpata ñit'iy…",
  'hud.pickTitle':
    "Allpata ñit'iy k'itita chayman astanapaq: horizonte wakmanta yupakun LOLA 20 m nisqawan",

  'hud.simulateDescent': 'Uraykuyta simulay',

  // Landing (descent) view
  // Rover traverse to the ice
  'rover.aria': 'Roverpa purisqan',
  'rover.loading': 'Roverpa purinanta yupachkan…',
  'rover.deploy': 'Roverta lluqsichiy',
  'rover.fullMission': "Hunt'asqa misión",
  'rover.fullMissionTitle':
    'Uraykuyta purichin, pampaman chayaspataq roverpa chullunkukama purisqanta.',
  'rover.goal': 'chullunku · {d}',
  'rover.dist': 'Purisqan',
  'rover.slope': "Q'ata",
  'rover.speed': 'Utqay',
  'rover.battery': 'Batería',
  'rover.power': 'Intimanta kallpa / gastasqan',
  'rover.sunOn': 'Intipi',
  'rover.sunOff': 'llanthupi',
  'rover.psr': 'wiñay llanthu',
  'rover.linkOn': 'Tiqsimuyuwan rimay',
  'rover.linkOff': 'mana rimayniyuq',
  'rover.profile': 'Ñanpa altura perfilnin',
  'rover.profileCaption':
    "Riy {d} (kikin ñanninta kutimun) · desnivel {drop} · aswan q'ata {slope} · anqas siq'i: wiñay llanthu",
  'rover.vehicle': 'Rover',
  'rover.vehicle.rover': "huch'uy rover (40 kg)",
  'rover.vehicle.csa-rover': "CSA llamk'aq rover (350 kg)",
  'rover.cam': 'Qhawana',
  'rover.cam.follow': 'qatispa',
  'rover.cam.mast': 'mástilmanta',
  'rover.cam.top': 'hanaqmanta',
  'rover.progress': "Hayk'atañan purin",
  'rover.backToLander': 'Móduloman kutiy',
  'rover.hint':
    'Aysay roverpa muyuriqninta muyunapaq · ruedata muyuchiy asuykunapaq · misiónpa horan paywan kuska purin',
  'rover.card.ok': 'rin, {samples} pallan, {h} nisqapi kutimun · aswan pisi batería {soc}',
  'rover.card.see': 'Purisqanta qhaway',
  'landing.aria': 'Uraykuy pusay',
  'landing.dist': 'Chayanakama',
  'landing.mode.physics': 'físicawan',
  'landing.mode.kinematic': 'utqaylla',
  'landing.vehicle': 'Módulo',
  'landing.vehicle.clps': 'CLPS clase (700 kg)',
  'landing.vehicle.small': "huch'uy (200 kg)",
  'landing.vehicle.heavy': 'llasaq (6 t)',
  'landing.fail.propellant': 'Manaraq pampaman chayachkaspa módulopa propelenten tukukun.',
  'landing.hazardGo': 'Chaypi uraykuy',
  'landing.phase.braking': 'Frenay',
  'landing.phase.approach': 'Asuykuy',
  'landing.phase.terminal': 'Qhipa uraykuy',
  'landing.phase.landed': 'Pampapi',
  'landing.noData': 'mana datoyuq',
  'landing.contactLit': "Chayana chiqan k'anchasqa (Inti discopa {pct})",
  'landing.contactDark': 'Chayana chiqan llanthupi',
  'landing.play': 'Purichiy',
  'landing.pause': 'Sayachiy',
  'landing.restart': 'Wakmanta qallariy',
  'landing.speed': 'Utqay',
  'landing.progress': "Hayk'atañan uraykun",
  'landing.approach': 'Asuykuy',
  'landing.approachAuto': 'Inti qhipapi (auto)',
  'landing.approachAhead': 'Inti ñawpaqpi',
  'landing.approachFrom': '{dir} manta',
  'landing.eye': 'Navemanta qhawana',
  'landing.orbit': 'Muyuspa qhaway',
  'landing.toSurface': 'Pampa qhawanaman riy',
  'landing.hint':
    'Aysay huk ladoman qhawanapaq · ruedawan zoom · uraykuchkaptin misiónpa horan sayasqa',
  'landing.orbitHint': 'Aysay módulopa muyuriqninta muyunapaq · ruedata muyuchiy asuykunapaq',

  // Slope layer
  'slope.legend.title': "Allpapa q'atan",
  'slope.legend.safe': '< {deg}° allin',
  'slope.legend.caution': '{a}–{b}° pisillaña',
  'slope.legend.steep': '> {deg}° manchakuypaq',

  // Terrain card
  'terrain.title': 'Allpa · uraykuy',
  'terrain.badge.good': "Allin q'ata",
  'terrain.badge.warn': "Pisillaña q'ata",
  'terrain.badge.bad': "Sinchi q'ata",

  // Energy / battery
  'energy.title': 'Kallpa · batería',
  'energy.preset.custom': 'Akllasqayki',
  'energy.badge.ok': 'Kawsan',
  'energy.badge.dead': 'Mana kallpayuq',
  'energy.edit': 'Perfilta allichay',
  'energy.field.panel': 'Panelkuna',

  // Timeline
  'timeline.sun': 'Inti',
  'timeline.earth': 'Tiqsimuyu',
  'timeline.both': 'Iskaynin',
  'timeline.battery': 'Batería',
  'timeline.horizon': 'horizonte',
  'timeline.depleted': 'Mana kallpayuq',
  'timeline.aria': "Pacha siq'i: Inti {sun} pachapi rikukun, DTE rimay {dte}, iskaynin {both}.",
  'timeline.ariaBattery': "Batería mana hayk'aqpas {min} manta uraykunchu.",
  'timeline.ariaDepleted': 'Batería {when} tukukun.',

  // Bottom panel
  'bottom.aria': 'Pachaman hina qhaway',
  'bottom.timeline': "Pacha siq'i",
  'bottom.horizon': 'Horizonte 360°',
  'bottom.dates': "Huk p'unchawkuna",
  'bottom.seasons': "Mit'akuna",
  'bottom.map': 'Polo mapa',
  'bottom.computing': 'Efemérides yupachkan…',
  'bottom.loadingHorizon': 'Horizonteta suyaykuy…',

  // Guided flow: welcome, site choice and the four steps
  'welcome.kicker': 'Killapa uray polonman misión',
  'welcome.title': "Aswan allin uraykuna k'itita akllay",
  'welcome.sub':
    "Maypi uraykunaykita akllay, Intipa k'anchayninpas Tiqsimuyuwan rimaypas kananpaq. {n} pasopi qhawanki.",
  'welcome.start': 'Qallariy',
  'welcome.tour': 'Pusasqa puriyta qhaway',
  'choose.kicker': 'Ñawpaq paso',
  'choose.title': '¿Maypitaq uraykuyta munanki?',
  'choose.sub': "Kunanpaq 3 aswan allin k'itikuna. Hukta akllay qallarinapaq.",
  'choose.back': 'Kutiy',
  'step.aria': 'Tukuchanapaq pasokuna',
  'step.plan': 'Wakichiy',
}
