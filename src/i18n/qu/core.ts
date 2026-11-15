import type { QuDict } from '../qu.ts'

export const core: QuDict = {
  // App shell
  'app.scenarios': 'Escenariokuna',
  'app.sitePanel': "Uraykuna k'iti",
  'app.loadingSites': "K'itikuna chayamuchkan…",
  'loader.textures': 'Texturakuna chayamuchkan… {pct}%',
  'splash.loading': 'Killa Landing kichakuchkan…',
  'common.close': "Wichq'ay",
  'common.computing': 'Yupachkan…',

  // Top bar
  'topbar.tag': 'Inti, Tiqsimuyu ima Killapa uray polonpi',
  'topbar.viewAria': 'Qhawana',
  'topbar.orbit': 'Órbita',
  'topbar.surface': 'Pampa',
  'topbar.landing': 'Uraykuy',
  'topbar.hidePanels': 'Panelkunata pakay',
  'topbar.showPanels': 'Panelkunata rikuchiy',
  'topbar.panelsTitle': "Panelkunata pakay utaq rikuchiy, 3D escenata hunt'asqata qhawanapaq",
  'topbar.compare': 'Tupachiy',
  'topbar.why': '¿Imarayku?',
  'topbar.lang': 'Simi',
  'topbar.guide': 'Pusaq',
  'topbar.guideTitle': 'Kay programata pusaspa riqsichiy',
  'topbar.tools': "Llamk'anakuna",
  'topbar.audience': 'Modo',
  'topbar.themeLight': "K'anchay temaman t'ikray",
  'topbar.themeDark': "Tutayaq temaman t'ikray",

  // Audience mode (what is shown, never what is computed)
  'audience.planner': 'Wakichiq',
  'audience.educator': 'Yachachiq',
  'audience.public': 'Llapan runa',
  'audience.planner.desc':
    'Llapan datokuna: DSN, térmico, uraykuy elipse, hardware filtro, hurquy ima.',
  'audience.educator.desc':
    "K'itipa físican: Inti, Tiqsimuyu, horizonte, k'anchay, chullunku ima; mana ingenieríapa detallenkunawan.",
  'audience.public.desc':
    'Aswan chaniyuqlla: ¿Inti kanchu?, ¿Tiqsimuyu rikukunchu?, imaraykutaq chay chaniyuq.',
  'audience.who': '¿Pitaq kanki?',

  // Collapsible panels
  'panel.left': "Uraykuna k'itikuna",
  'panel.right': "K'itipa kaynin",
  'panel.bottom': 'Pacha, gráficokuna ima',
  'panel.expand': '{name} kichay',
  'panel.collapse': "{name} huch'uyachiy",
  'panel.key': 'tecla {key}',
  'panel.scenarios': '{n} escenario',
  'panel.sunEl': 'Inti {el}',
  'panel.sunDown': 'Inti pakasqa',
  'panel.earthUp': 'Tiqsimuyu rikukun',
  'panel.earthDown': 'Tiqsimuyu pakasqa',

  // Contextual help
  'help.open': 'Yanapay: {topic}',
  'help.tour': 'Pusasqa puriypi qhaway',

  // Guided tour
  'tour.aria': 'Pusasqa puriy',
  'tour.step': '{n} kaq paso, {total} manta',
  'tour.next': 'Qatiq',
  'tour.prev': 'Ñawpaq',
  'tour.skip': "P'itay",
  'tour.finish': 'Tukuy',
  'tour.invite':
    "¿Ñawpaq kutichu Killa Landingpi? 1 minuto pusasqa puriy sapa t'aqata rikuchisunki.",
  'tour.start': 'Puriyta qallariy',
  'tour.later': 'Manaraq',
  'tour.welcome.title': 'Allin hamusqayki Killa Landingman',
  'tour.welcome.body':
    "Huk tapuylla: kaypi, kay p'unchawpi uraykuspa, ¿kallpapaq Intiyuqchu kanki, rimanaykipaq Tiqsimuyuta rikunkichu?",
  'tour.steps.title': '4 paso',
  'tour.steps.body':
    "Órbita → Pampa → Uraykuy → Tukuchay. Qatiq pasoman riy, utaq mayqin pasomanpas p'itay.",
  'tour.scene.title': '3D escena',
  'tour.scene.body':
    "Muyuchinapaq aysay, kayllachanapaq ruedata muyuchiy. Huk chiqanta ñit'iy chay k'itiman phawanapaq. Fondopaq Intita utaq Tiqsimuyuta akllay.",
  'tour.sites.title': "K'itikuna",
  'tour.sites.body':
    "Misiónniykipaq Top 3. Aswan k'itikunata kichaspa llapanta, kikiykipa coordenadaykikunatapas tarinki.",
  'tour.metrics.title': "K'itipa kaynin",
  'tour.metrics.body':
    "¿Inti kanchu? ¿Tiqsimuyu rikukunchu? Q'umir = allin, q'illu = pisillaña, puka = mana allin.",
  'tour.time.title': 'Pachata kamachiy',
  'tour.time.body':
    "Deslizadorta kuyuchiy utaq Purichiy nisqata ñit'iy, misiónpa p'unchawninkuna pasasqanta qhawanaykipaq.",
  'tour.charts.title': 'Gráficokuna',
  'tour.charts.body':
    "Hayk'aq Inti, Tiqsimuyu, batería ima kasqanta. Chay pachaman p'itanapaq ñit'iy.",
  'tour.hud.title': 'Qhawanapa controlninkuna',
  'tour.hud.body':
    "Qhawanapaq, capakunapaq utqay ñankuna: Intita utaq Tiqsimuyuta qhaway, q'atakuna, uraykuna k'iti ima.",
  'tour.compare.title': 'Tukuchay',
  'tour.compare.body':
    "Huk k'itiwan, p'unchawwan utaq equipowan escenariokunata ruway, allichay, mayqin atipasqanta qhaway. Tukukuypi, hurquy.",
  'tour.assistant.title': 'Yanapaq',
  'tour.assistant.body':
    '3 escenario akllasqa, churanapaq utaq tupachinapaq wakichisqaña. Tapukuykunatapas kutichin.',
  'tour.more.title': 'Aswan',
  'tour.more.body': "K'itita t'ikray, hardware filtro, «¿Imarayku?», panelkunata pakay ima.",
  'tour.done.title': '¡Tukusqaña!',
  'tour.fullGuide': "Sistemapa hunt'asqa pusaqninta ñawinchay",
  'tour.done.body':
    'Kay puriyta «Pusaq» nisqamanta wakmanta ruway. Sapa panelpi «?» kan, yanapayninwan.',

  // 3D labels
  'scene.sun': 'Inti',
  'scene.earth': 'Tiqsimuyu',
  'scene.earthNotToScale': 'Tiqsimuyu (mana escalapichu)',

  // Time controls
  'time.aria': "P'unchaw, hora ima",
  'time.landing': 'Uraykuy (UTC)',
  'time.duration': "Unaynin (p'unchaw)",
  'time.play': '▶ Purichiy',
  'time.pause': '❚❚ Sayachiy',
  'time.lunarDay': "☾ Killa p'unchaw",
  'time.lunarDayTitle':
    "Uraykuymantapacha huk hunt'asqa Killa p'unchawta purichiy (29,5 Tiqsimuyu p'unchaw): k'anchaypa llanthupa hunt'asqa muyuynin, Tiqsimuyupa kuyuyninpas.",
  'time.speed': 'Utqay',
  'time.jumpSunTitle': "Qatiq Inti lluqsiyman utaq Inti yaykuyman p'itay",
  'time.jumpEarthTitle': "Qatiq Tiqsimuyu lluqsiyman utaq yaykuyman p'itay",
  'time.sunset': '⏭ Inti yaykuy',
  'time.sunrise': '⏭ Inti lluqsiy',
  'time.earthset': '⏭ Tiqsimuyu yaykuy',
  'time.earthrise': '⏭ Tiqsimuyu lluqsiy',
  'time.scrub': 'Uraykuymantapacha pacha',
  'time.ephemIau': 'Efemérides: IAU modelo (2026–2030 hawapi)',

  // Events / countdowns
  'ev.sunset': 'Inti yaykuy',
  'ev.sunrise': 'Inti lluqsiy',
  'ev.earthset': 'Tiqsimuyu yaykuy',
  'ev.earthrise': 'Tiqsimuyu lluqsiy',
  'ev.set': 'yaykuy',
  'ev.rise': 'lluqsiy',
  'countdown.none': 'Ventanapi mana {what} kanchu',
  'countdown.in': '{what}paq',
  'countdown.paren': '({what}paq {dur})',

  // Metrics panel
  'metrics.aria': 'Escenariopa yupayninkuna',
  'metrics.now': "Kunan k'itipi",
  'metrics.error': 'Mana yupayta atikunchu: {msg}',
  'metrics.window': "{days} p'unchaw ventana",
  'metrics.scoreTitle':
    "50 % kallpa + 35 % rimay + 15 % kawsay (5 p'unchawmanta aswan unay tutakunata pisiyachin)",
  'metrics.obstruction': 'urqu {km} km karupi',
  'sun.title': 'Inti',
  'sun.lit': "K'anchasqa",
  'sun.shadow': 'Llanthupi',
  'sun.shadowShort': 'Llanthu',
  'sun.meterAria': 'Intipa rikukuq discon',
  'sun.disc': 'Rikukuq disco {pct} · horizonte {hz} (margen {m})',
  'earth.title': 'Tiqsimuyu · chiqan rimay',
  'earth.on': 'DTE kachkan',
  'earth.off': 'Mana rimayniyuq',
  'earth.disc': 'rikukuq disco {pct}',
  'thermal.title': 'Temperatura yupasqa',
  'thermal.badge.good': 'Allinlla',
  'thermal.badge.warn': 'Chiri tutakuna',
  'thermal.badge.bad': 'Sinchi chiri',
  'thermal.range': 'Ventanapi: mín. {min} · máx. {max}',
  'thermal.psr': "Llapan ventanapi mana k'anchayniyuq: wiñay llanthu allpa (~−233 °C)",
  'horizon.earthToggle': 'Tiqsimuyu kanman chayqa',
  'dsn.aria': 'Deep Space Network estacionkuna',
  'dsn.receiving': 'chaskin',
  'dsn.none': 'Tiqsimuyu rikukun, ichaqa mana ima DSN estaciónpas Killata 10° hawapi rikunchu',

  // Hardware filter
  'topbar.hardwareTitle': "Llapan k'itikunata módulopa atisqanman hina akllay",
  'hw.title': "Hardwareman hina allinchu · {days} p'unchaw misión",
  'hw.field.slope': "Aswan q'ata (°, p90 500 m ukhupi)",
  'hw.field.night': 'Aswan unay tuta (h)',
  'hw.field.dte': 'Aswan pisi DTE rimay (%)',
  'hw.field.rover': "Roverpa aswan q'atan (°)",
  'hw.c.slope': "q'ata",
  'hw.c.night': 'tuta',
  'hw.c.dte': 'rimay',
  'hw.verdict.good': 'Allin',
  'hw.verdict.warn': 'Pisillaña',
  'hw.verdict.bad': 'Mana allin',
  'hw.col.verdict': 'Kaynin',
  'hw.col.site': "K'iti",
  'hw.col.slope': "Q'ata p90",
  'hw.col.night': 'Aswan unay tuta',
  'hw.col.notes': "Hark'aq",
  'hw.send': '{n} allinta Tupachiyman apachiy',

  // Ice access / science
  'ice.title': 'Chullunkuman chayay (PSR)',
  'ice.badge.inside': 'PSR ukhupi',
  'ice.badge.reachable': 'Chayay atikun',
  'ice.badge.none': 'Mana chayay atikunchu',
  'ice.inside':
    'Uraykuna chiqan wiñay llanthupi kachkan: chullunku módulopa chakinpi, ichaqa mana Inti kallpayuq.',
  'ice.noneInRadius': "{r} ukhupi mana wiñay llanthu k'iti kanchu.",
  'ice.straight': "Aswan kaylla PSR {d} karupi, chiqan siq'ipi",
  'ice.route': "roverpa ñannin {d} (aswan q'ata {slope})",
  'ice.blocked': 'Kayllapi PSR kan, ichaqa pirqankuna roverpa atisqan {deg}° nisqata llallin.',
  'science.noData': "Kay k'itiqa mana k'anchay mapayuqchu: puntuaciónqa ingenieríallamanta.",

  // Landing-point optimizer
  'opt.button': 'Aswan allin chiqanta maskay',
  'opt.loading': 'Allin allpata maskachkan, sapa chiqanpi misiónta yupachkan…',
  'opt.none': "Uraykuy elipse ukhupi mana < 10° q'atayuq allpa kanchu.",
  'opt.where': '{d}, {dir} lawman',
  'opt.stats': "q'ata {slope} · k'anchay {sun} · DTE {dte} · tuta {night}",
  'opt.go': 'Kay chiqanman riy',

  // Compare rows (new)
  'row.minTemp': 'Temp. mín. yupasqa',
  'row.ice': 'Chullunkuman chayay',
  'row.iceNoData': "mana k'anchay mapayuq",
  'row.combined': 'Huñusqa puntuación ({pct} % ciencia)',

  // Illumination layer
  'hud.illum': 'Wiñay llanthu',
  'hud.nac': 'LRO órbita foto',
  'hud.nacCredit': '{source}. Llanthukunaqa fotopa, manam simulasqachu.',
  'illum.legend.title': "Watantin k'anchay",
  'illum.legend.psr': 'Wiñay llanthu (PSR, ichapas chullunku)',
  'illum.legend.dim': "Pisi k'anchay",
  'illum.legend.bright': "Yaqa sapa kuti k'anchasqa",
  'illum.legend.route': 'Roverpa ñannin chullunkuman',
  'scene.ice': 'Chullunku · {d} m',
  'stats.energy': 'Kallpa (sapa pacha Intiwan tupachisqa)',
  'stats.sunlit': 'Intiyuq pacha',
  'stats.dte': 'DTE rimayniyuq pacha',
  'shift.label': "P'unchaw kuyuptin: {min}–{max}",
  'shift.now': 'kunan',
  'shift.cell': "{days} p'unchaw: puntuación {score}",
  'metrics.verdict': 'Taripay',
  'metrics.verdictFails': 'mana atinchu: {what}',
  'metrics.verdictTight': 'pisillaña: {what}',
  'stats.both': 'Inti + Tiqsimuyu kuska',
  'stats.night': 'Aswan unay tuta',
  'stats.noDte': 'Aswan unay mana rimayniyuq',
  'stats.sunEl': 'Intipa elevación: chawpi / máx.',

  // Compare
  'compare.aria': 'Escenariokunata tupachiy',
  'compare.title': "Escenariokunata tupachiy · {days} p'unchaw ventana",
  'compare.activate': 'Akllay',
  'compare.landing': 'Uraykuy {date}',
  'row.energy': 'Kallpa',
  'row.sunlit': 'Intiyuq pacha',
  'row.dte': 'DTE rimay',
  'row.both': 'Inti + Tiqsimuyu',
  'row.night': 'Aswan unay tuta',
  'row.noDte': 'Aswan unay mana DTE',
  'row.maxSunEl': 'Inti elev. máx.',
  'row.battery': 'Aswan pisi batería',
  'row.batteryDead': '0 % · {h} mana kallpayuq',

  // Date sweep
  'sweep.computing': '12 killata yupachkan…',
  'sweep.aria': "Qatiq 12 killapi sapa uraykuy p'unchawpa puntuaciónnin",
  'sweep.item': 'kallpa {e} · DTE {d} · tuta máx. {n}',
  'sweep.noEarth': 'uraykuspa mana Tiqsimuyuyuq',

  // Seasons (2026–2030 by month)
  'season.computing': '60 killata yupachkan…',
  'season.noDetail': "K'itipa horizontenta suyachkan…",
  'season.aria': 'Sapa killa kallpa, Tiqsimuyuwan rimay, Intipa aswan hanaq kaynin, 2026–2030',
  'season.legend.energy': 'Kallpa (%)',
  'season.legend.sunEl': 'Inti máx. (°)',
  'season.best': 'Aswan allin killa: {month} (kallpa {e}, Inti {el} kama).',
  'season.worst': 'Aswan mana allin killa: {month} ({e}, Inti {el} kama).',

  // Site picker
  'picker.remove': '{label} escenariota chinkachiy',
  'picker.addTitle': 'Kunan escenariota iskaychay, tupachinapaq',
  'picker.customTitle': 'Kikiykipa coordenadakuna',
  'picker.use': 'Churay',
  'links.title': 'Kay chiqanta LRO qhawanakunapi, JPL Horizonspipas qhaway',
  'picker.customHint': '75,5°S manta urayman horizonteqa LOLAwan navegadorniykipi yupakun.',
  'picker.group.pole': 'Uray Polo',
  'picker.group.custom': 'Kikiykipa',
  'picker.group.ref': 'Referencia (polo hawapi)',
  'acc.spherical': 'Mana urquyuq',
}
