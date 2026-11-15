/** Spanish (source) dictionary. Keys are grouped by area; `{name}` marks a parameter. */
export const es = {
  // App shell
  'app.scenarios': 'Escenarios',
  'app.sitePanel': 'Sitio de alunizaje',
  'app.loadingSites': 'Cargando sitios…',
  'loader.textures': 'Cargando texturas… {pct}%',
  'splash.label': 'LUMEN 3D',
  'splash.loading': 'Cargando LUMEN 3D…',
  'common.close': 'Cerrar',
  'common.computing': 'Calculando…',

  // Top bar
  'topbar.tag': 'Sol y Tierra en el polo sur lunar',
  'topbar.viewAria': 'Vista',
  'topbar.orbit': 'Órbita',
  'topbar.surface': 'Superficie',
  'topbar.landing': 'Aterrizaje',
  'topbar.hidePanels': 'Ocultar paneles',
  'topbar.showPanels': 'Mostrar paneles',
  'topbar.panelsTitle': 'Ocultar o mostrar los paneles para ver la escena 3D completa',
  'topbar.compare': 'Comparar',
  'topbar.why': '¿Por qué?',
  'topbar.lang': 'Idioma',
  'topbar.guide': 'Guía',
  'topbar.guideTitle': 'Recorrido guiado por la interfaz',
  'topbar.tools': 'Herramientas',
  'topbar.audience': 'Modo',

  // Audience mode (what is shown, never what is computed)
  'audience.planner': 'Planificador',
  'audience.educator': 'Educador',
  'audience.public': 'Público',
  'audience.planner.desc':
    'Todos los datos: DSN, térmico, elipse de aterrizaje, filtro de hardware y exportación.',
  'audience.educator.desc':
    'La física del lugar: Sol, Tierra, horizonte, iluminación y hielo, sin los detalles de ingeniería.',
  'audience.public.desc': 'Lo esencial: ¿hay Sol?, ¿se ve la Tierra?, y por qué eso importa.',
  'audience.who': '¿Quién eres?',

  // Collapsible panels
  'panel.left': 'Sitios de alunizaje',
  'panel.right': 'Estado del sitio',
  'panel.bottom': 'Tiempo y gráficas',
  'panel.expand': 'Expandir {name}',
  'panel.collapse': 'Minimizar {name}',
  'panel.key': 'tecla {key}',
  'panel.scenarios': '{n} escenarios',
  'panel.sunEl': 'Sol {el}',
  'panel.sunDown': 'Sol oculto',
  'panel.earthUp': 'Tierra visible',
  'panel.earthDown': 'Tierra oculta',

  // Contextual help
  'help.open': 'Ayuda: {topic}',
  'help.tour': 'Verlo en el recorrido',
  'help.sites':
    'Elige dónde alunizar. El Top 3 se calcula para tu fecha y misión; «Ver más sitios» muestra todos y tus coordenadas. El mapa pequeño indica en qué parte del polo sur está. Para comparar sitios ve al paso «Decidir».',
  'help.metrics':
    'Qué ve el sitio en el instante actual: elevación del Sol y fracción visible de su disco, si la Tierra está sobre el horizonte (enlace directo, DTE) y cuándo cambia. Debajo, el resumen de toda la ventana de misión, la batería y la seguridad del terreno.',
  'help.charts':
    'Mueve el tiempo de la misión con el deslizador o pulsa Reproducir. «Línea temporal» muestra Sol, Tierra y batería a lo largo de los días; «Horizonte 360°» dibuja el relieve con las trayectorias; «Fechas alternativas» puntúa cada día de alunizaje de los próximos 12 meses.',
  'help.hud':
    'Controles de la vista 3D. En Órbita: arrastra para girar, rueda para acercar y clic en un punto para viajar al sitio. En Superficie: mira al Sol o a la Tierra, activa la línea de horizonte, las pendientes, la elipse de aterrizaje o reubica el sitio con un clic.',

  // Guided tour
  'tour.aria': 'Recorrido guiado',
  'tour.step': 'Paso {n} de {total}',
  'tour.next': 'Siguiente',
  'tour.prev': 'Anterior',
  'tour.skip': 'Saltar',
  'tour.finish': 'Terminar',
  'tour.invite': '¿Primera vez en LUMEN 3D? Un recorrido de 1 minuto te enseña cada parte.',
  'tour.start': 'Empezar recorrido',
  'tour.later': 'Ahora no',
  'tour.welcome.title': 'Bienvenido a LUMEN 3D',
  'tour.welcome.body':
    'Una sola pregunta: si aterrizas aquí y en esta fecha, ¿tendrás Sol para la energía y la Tierra a la vista para comunicarte?',
  'tour.steps.title': '4 pasos',
  'tour.steps.body':
    'Órbita → Superficie → Aterrizaje → Decidir. Avanza con «Ir a…» o salta a cualquier paso.',
  'tour.scene.title': 'La escena 3D',
  'tour.scene.body':
    'Arrastra para girar, rueda para acercar. Clic en un punto para volar a ese sitio. Usa «Fondo: Sol / Tierra».',
  'tour.sites.title': 'Sitios',
  'tour.sites.body':
    'El Top 3 para tu misión. «Ver más sitios» abre todos y las coordenadas propias.',
  'tour.metrics.title': 'Estado del sitio',
  'tour.metrics.body':
    '¿Hay Sol? ¿Se ve la Tierra? Verde = bien, amarillo = al límite, rojo = mal.',
  'tour.time.title': 'Controla el tiempo',
  'tour.time.body': 'Mueve el deslizador o pulsa Reproducir para ver pasar los días de la misión.',
  'tour.charts.title': 'Gráficas',
  'tour.charts.body': 'Cuándo hay Sol, Tierra y batería. Haz clic para saltar a ese momento.',
  'tour.hud.title': 'Controles de la vista',
  'tour.hud.body':
    'Atajos de cámara y capas: mirar al Sol o a la Tierra, pendientes y zona de aterrizaje.',
  'tour.compare.title': 'Decidir',
  'tour.compare.body':
    'Crea escenarios con otro sitio, fecha o equipo, edítalos y mira cuál gana. Al final, exporta.',
  'tour.assistant.title': 'Asistente',
  'tour.assistant.body':
    '3 escenarios recomendados listos para aplicar o comparar. También responde preguntas.',
  'tour.more.title': 'Más',
  'tour.more.body':
    'Cambiar de sitio, filtro de hardware, «¿Por qué es difícil?» y ocultar paneles.',
  'tour.done.title': '¡Listo!',
  'tour.fullGuide': 'Leer la guía completa del sistema',
  'tour.done.body': 'Repite este recorrido desde «Guía». Cada panel tiene un «?» con su ayuda.',

  // 3D labels
  'scene.sun': 'Sol',
  'scene.earth': 'Tierra',
  'scene.earthNotToScale': 'Tierra (no a escala)',

  // Time controls
  'time.aria': 'Fecha y hora',
  'time.landing': 'Alunizaje (UTC)',
  'time.duration': 'Duración (días)',
  'time.play': '▶ Reproducir',
  'time.pause': '❚❚ Pausa',
  'time.lunarDay': '☾ Día lunar',
  'time.lunarDayTitle':
    'Reproduce un día lunar completo (29,5 días terrestres) desde el alunizaje: el ciclo entero de luz y sombra, y la oscilación de la Tierra.',
  'time.speed': 'Velocidad',
  'time.jumpSunTitle': 'Saltar al siguiente amanecer u ocaso',
  'time.jumpEarthTitle': 'Saltar a la siguiente salida o puesta de la Tierra',
  'time.sunset': '⏭ Ocaso',
  'time.sunrise': '⏭ Amanecer',
  'time.earthset': '⏭ Puesta Tierra',
  'time.earthrise': '⏭ Salida Tierra',
  'time.scrub': 'Tiempo desde el alunizaje',
  'time.ephemHorizons': 'Efemérides: JPL Horizons DE441',
  'time.ephemIau': 'Efemérides: modelo IAU (fuera de 2026–2030)',
  'time.ephemTitle':
    'Posiciones del Sol y la Tierra. Entre 2026 y 2030 vienen de JPL Horizons (DE441, NASA/JPL); fuera de ese rango, del modelo analítico IAU.',

  // Events / countdowns
  'ev.sunset': 'ocaso',
  'ev.sunrise': 'amanecer',
  'ev.earthset': 'puesta de la Tierra',
  'ev.earthrise': 'salida de la Tierra',
  'ev.set': 'puesta',
  'ev.rise': 'salida',
  'countdown.none': 'Sin {what} en la ventana',
  'countdown.in': '{what} en',
  'countdown.paren': '({what} en {dur})',

  // Metrics panel
  'metrics.aria': 'Métricas del escenario',
  'metrics.now': 'Ahora en el sitio',
  'metrics.error': 'No se pudo calcular: {msg}',
  'metrics.window': 'Ventana de {days} días',
  'metrics.scoreTitle':
    '50 % energía + 35 % enlace + 15 % supervivencia (penaliza noches de más de 5 días)',
  'metrics.obstruction': 'relieve a {km} km',
  'card.elevAz': 'elevación · az {az}° ({card})',
  'sun.title': 'Sol',
  'sun.lit': 'Iluminado',
  'sun.shadow': 'En sombra',
  'sun.shadowShort': 'Sombra',
  'sun.meterAria': 'Disco solar visible',
  'sun.disc': 'Disco visible {pct} · horizonte {hz} (margen {m})',
  'earth.title': 'Tierra · enlace directo',
  'earth.on': 'DTE activo',
  'earth.off': 'Sin enlace',
  'earth.phase': 'fase {pct}',
  'earth.horizon': 'Horizonte {hz}',
  'earth.disc': 'disco visible {pct}',
  'thermal.title': 'Temperatura estimada',
  'thermal.badge.good': 'Tolerable',
  'thermal.badge.warn': 'Noches frías',
  'thermal.badge.bad': 'Congelamiento crítico',
  'thermal.face': 'Cara vertical orientada al Sol (lateral del módulo, radiador)',
  'thermal.regolith': 'Regolito horizontal: {t}',
  'thermal.range': 'En la ventana: mín. {min} · máx. {max}',
  'thermal.freeze': 'Bajo {limit} °C sin calefacción: {total} en total, {longest} seguidas',
  'thermal.psr': 'Sin luz en toda la ventana: suelo de sombra permanente (~−233 °C)',
  'thermal.note':
    'Equilibrio radiativo simplificado (albedo 0,12, emisividad 0,95, enfriamiento de 4 h). Orden de magnitud, no un modelo térmico.',
  'horizon.earthToggle': 'Si fuera la Tierra',
  'horizon.earthLegend': 'Con atmósfera: Sol refractado y cielo aún claro (crepúsculo)',
  'dsn.range':
    'Distancia {km} km · pérdida en espacio libre {db} dB en banda X ({rel} dB vs. la media)',
  'dsn.aria': 'Estaciones de la Deep Space Network',
  'dsn.goldstone': 'Goldstone',
  'dsn.madrid': 'Madrid',
  'dsn.canberra': 'Canberra',
  'dsn.receiving': 'recibe',
  'dsn.none': 'La Tierra es visible, pero ninguna estación DSN ve la Luna sobre 10°',

  // Hardware filter
  'topbar.hardware': 'Hardware',
  'topbar.hardwareTitle': 'Filtrar todos los sitios por los límites del módulo',
  'hw.aria': 'Filtro de viabilidad por hardware',
  'hw.title': 'Viabilidad por hardware · misión de {days} días',
  'hw.intro':
    'Fija lo que tolera tu módulo y cada sitio del catálogo se marca al instante: ✓ viable, ! al límite (menos de un 20 % de margen), ✕ descartado. Se usan la fecha de alunizaje y el margen de enlace activos.',
  'hw.field.slope': 'Pendiente máx. (°, p90 en 500 m)',
  'hw.field.night': 'Noche continua máx. (h)',
  'hw.field.dte': 'Enlace DTE mín. (%)',
  'hw.field.rover': 'Pendiente máx. del rover (°)',
  'hw.c.slope': 'pendiente',
  'hw.c.night': 'noche',
  'hw.c.dte': 'enlace',
  'hw.verdict.good': 'Viable',
  'hw.verdict.warn': 'Al límite',
  'hw.verdict.bad': 'Descartado',
  'hw.col.verdict': 'Estado',
  'hw.col.site': 'Sitio',
  'hw.col.score': 'Puntuación',
  'hw.col.slope': 'Pendiente p90',
  'hw.col.night': 'Noche más larga',
  'hw.col.dte': 'DTE',
  'hw.col.notes': 'Restricción',
  'hw.send': 'Enviar {n} viables a Comparar',
  'hw.note':
    'Pendiente con el DEM de 20 m (los sitios de referencia se tratan como llanos). La puntuación incluye la ciencia si mueves el control Ingeniería ↔ Ciencia.',

  // Ice access / science
  'ice.title': 'Acceso a hielo (PSR)',
  'ice.badge.inside': 'Dentro de una PSR',
  'ice.badge.reachable': 'Alcanzable',
  'ice.badge.none': 'Fuera de alcance',
  'ice.score': 'Puntuación ciencia: hielo a menos de 500 m de ruta = 100, a 2 km = 0',
  'ice.inside':
    'El punto de alunizaje está en sombra permanente: hielo al pie del módulo, pero sin energía solar.',
  'ice.noneInRadius': 'Ninguna zona en sombra permanente a menos de {r}.',
  'ice.straight': 'PSR más cercana a {d} en línea recta',
  'ice.route': 'ruta del rover {d} (pendiente máx. {slope})',
  'ice.blocked': 'Hay PSR cerca, pero las paredes superan los {deg}° que admite el rover.',
  'ice.note':
    'Mapa de iluminación de un año (celdas de ~100 m) y ruta de menor coste sobre el DEM de 20 m, sin pasar por pendientes > {deg}°.',
  'science.engineering': 'Ingeniería',
  'science.science': 'Ciencia',
  'science.aria': 'Peso de la ciencia en la puntuación',
  'science.valueText': '{pct} % ciencia',
  'science.noData':
    'Este sitio no tiene mapa de iluminación: la puntuación sigue siendo la de ingeniería.',
  'science.combined':
    'Puntuación combinada {score}/100 = ingeniería {eng} y ciencia {sci} con un {pct} % de peso científico',

  // Landing-point optimizer
  'opt.button': 'Sugerir mejor punto',
  'opt.loading': 'Buscando terreno seguro y evaluando la misión en cada punto…',
  'opt.summary': '{safe} puntos con pendiente < 10° · se evaluaron los {n} más altos',
  'opt.none': 'No hay terreno con pendiente < 10° dentro de la elipse de aterrizaje.',
  'opt.where': 'a {d} al {dir}',
  'opt.stats': 'pendiente {slope} · luz {sun} · DTE {dte} · noche {night}',
  'opt.go': 'Ir a este punto',
  'opt.note':
    'Entre paréntesis, la diferencia con el punto objetivo. Horizontes a 1° y serie de 30 min: los números pueden diferir un poco al reubicar.',

  // Compare rows (new)
  'row.minTemp': 'Temp. mínima estimada',
  'row.ice': 'Acceso a hielo',
  'row.iceNoData': 'sin mapa de iluminación',
  'row.combined': 'Puntuación combinada ({pct} % ciencia)',

  // Illumination layer
  'hud.illum': 'Sombra permanente',
  'hud.illumTitle':
    'Colorear el terreno por la iluminación media de un año y mostrar la ruta al hielo',
  'hud.nac': 'Imagen orbital LRO',
  'hud.nacTitle':
    'Foto real del Lunar Reconnaissance Orbiter vía LROC QuickMap: mosaico NAC del polo sur (10 m/px) y, al norte de 85,5° S, mosaico WAC (100 m/px). Sus sombras son las de la foto, no las de la fecha simulada.',
  'hud.nacCredit': '{source}. Las sombras son las de la foto, no las simuladas.',
  'illum.legend.title': 'Iluminación anual',
  'illum.legend.psr': 'Sombra permanente (PSR, posible hielo)',
  'illum.legend.dim': 'Poca luz',
  'illum.legend.bright': 'Casi siempre iluminado',
  'illum.legend.route': 'Ruta del rover al hielo',
  'scene.ice': 'Hielo · {d} m',
  'stats.energy': 'Energía (vs. Sol continuo)',
  'stats.sunlit': 'Tiempo con Sol',
  'stats.dte': 'Tiempo con enlace DTE',
  'shift.label': 'Si la fecha se mueve: {min}–{max}',
  'shift.title':
    'Puntuación de la misma misión aterrizando unos días antes o después. Clic en un valor para usar esa fecha.',
  'shift.now': 'hoy',
  'shift.cell': '{days} días: puntuación {score}',
  'metrics.verdict': 'Veredicto',
  'metrics.verdictTitle':
    'Frente a los límites de hardware (pendiente, noche más larga y enlace mínimo). Se ajustan en Más → Hardware.',
  'metrics.verdictFails': 'falla: {what}',
  'metrics.verdictTight': 'justo en: {what}',
  'stats.both': 'Sol + Tierra a la vez',
  'stats.night': 'Noche más larga',
  'stats.noDte': 'Mayor corte de enlace',
  'stats.sunEl': 'Elevación solar media / máx.',

  // Compare
  'compare.aria': 'Comparación de escenarios',
  'compare.title': 'Comparar escenarios · ventana de {days} días',
  'compare.add': '+ Escenario',
  'compare.hint':
    'Añade un escenario y cambia su sitio o su fecha en el panel izquierdo para comparar. Todos los escenarios comparten el mismo tiempo de misión (T+), así se ve qué pasa con cada opción en el mismo momento.',
  'compare.activate': 'Activar',
  'compare.landing': 'Alunizaje {date}',
  'row.score': 'Puntuación',
  'row.energy': 'Energía',
  'row.sunlit': 'Tiempo con Sol',
  'row.dte': 'Enlace DTE',
  'row.both': 'Sol + Tierra',
  'row.night': 'Noche más larga',
  'row.noDte': 'Mayor corte DTE',
  'row.maxSunEl': 'Elev. solar máx.',
  'row.battery': 'Batería mín.',
  'row.batteryDead': '0 % · {h} sin energía',

  // Date sweep
  'sweep.hint':
    'Puntuación de una misión de {days} días según el día de alunizaje (12 meses desde hoy) en {site}. Barras tenues: el Sol no ilumina el sitio al tocar suelo. Franja azul: Tierra visible al alunizar. Haz clic para elegir esa fecha.',
  'sweep.computing': 'Calculando 12 meses…',
  'sweep.aria': 'Puntuación de cada fecha de alunizaje durante los próximos 12 meses',
  'sweep.item': 'energía {e} · DTE {d} · noche máx. {n}',
  'sweep.noEarth': 'sin Tierra al alunizar',

  // Seasons (2026–2030 by month)
  'season.hint':
    'Mes a mes, 2026–2030, en {site}: barras = energía media de una misión de {days} días que alunice ese mes (más tenues cuando pocos días tienen Sol al tocar suelo); línea azul = Tierra visible (DTE); línea blanca = altura máxima del Sol. Haz clic en un mes para fijar esa fecha.',
  'season.computing': 'Calculando 60 meses…',
  'season.noDetail': 'Esperando el horizonte del sitio…',
  'season.aria': 'Energía, enlace con la Tierra y altura máxima del Sol por mes, 2026–2030',
  'season.legend.energy': 'Energía (%)',
  'season.legend.dte': 'DTE (%)',
  'season.legend.sunEl': 'Sol máx. (°)',
  'season.best': 'Mejor mes: {month} ({e} de energía, Sol hasta {el}).',
  'season.worst': 'Peor mes: {month} ({e}, Sol hasta {el}).',
  'season.why':
    'El eje de la Luna está inclinado solo 1,54°, así que en el polo sur el Sol de «verano» sube hasta +1,54° y el de «invierno» se queda en −1,54°, en un ciclo anual. Esa diferencia tan pequeña decide cuánto asoma el Sol sobre las montañas del horizonte y, con ello, la energía de cada mes.',

  // Site picker
  'picker.remove': 'Quitar escenario {label}',
  'picker.addTitle': 'Duplicar el escenario activo para compararlo',
  'picker.customTitle': 'Coordenadas personalizadas',
  'picker.lat': 'Latitud (°)',
  'picker.lon': 'Longitud (°E)',
  'picker.use': 'Usar',
  'links.title': 'Ver este punto en los visores del LRO y en JPL Horizons',
  'links.horizonsTitle':
    'Consulta en JPL Horizons el acimut y la elevación aparentes de este cuerpo desde el sitio, hora a hora, para la ventana de misión actual (texto, misma API que usa LUMEN).',
  'links.quickmapTitle':
    'Abre las mismas coordenadas en LROC QuickMap (ASU): imágenes NAC, iluminación, PSR y topografía del LRO.',
  'links.trekTitle':
    'Abre las mismas coordenadas en Moon Trek (NASA/JPL): visor 3D del terreno con las capas del LRO.',
  'picker.customHint': 'Al sur de 75,5°S el horizonte se calcula con LOLA en tu navegador.',
  'picker.group.pole': 'Polo Sur',
  'picker.group.custom': 'Personalizados',
  'picker.group.ref': 'Referencia (fuera del polo)',
  'acc.lola': 'LOLA 20 m',
  'acc.lola480': 'LOLA 480 m',
  'acc.spherical': 'Sin relieve',

  // Horizon chart
  'horizon.scale': 'escala vertical ×{k}',
  'horizon.aria': 'Panorama del horizonte con las trayectorias del Sol y la Tierra',
  'horizon.legend': '● visible  ○ oculto',

  // Sites and data sources
  'site.custom.name': 'Personalizado {coords}',
  'site.custom.mission': 'Coordenadas del usuario',
  'site.custom.descDem': 'Horizonte calculado en tu navegador con el DEM LOLA.',
  'site.custom.descFlat': 'Fuera del DEM polar: se usa un horizonte esférico ideal.',
  'source.lola20': 'LOLA LDEM_80S_20M (±10 km) + LDEM_75S_240M (hasta 300 km)',
  'source.tile': 'LOLA LDEM_80S_20M (tile de {site}) + 480 m/px, calculado en el navegador',
  'source.coarse': 'LOLA LDEM_75S_240M remuestreado a 480 m/px (calculado en el navegador)',
  'source.spherical': 'Horizonte esférico ideal (sin topografía local)',
  'source.noData': 'Sin datos: ejecuta `npm run data`. Horizonte esférico ideal.',

  // Explain overlay
  'explain.aria': 'Por qué la Luna es distinta',
  'explain.title': '¿Por qué el polo sur lunar es tan difícil?',
  'explain.data':
    'Datos: topografía LOLA (Lunar Reconnaissance Orbiter, NASA/GSFC) y efemérides JPL Horizons DE441 (NASA/JPL-Caltech) para 2026–2030; fuera de ese rango, modelo de rotación IAU con astronomy-engine (ver README).',
  'explain.c1.title': '¿Por qué en el polo el Sol nunca sube?',
  'explain.c1.body':
    'El eje de la Luna está inclinado solo 1,54° respecto a la eclíptica. En el polo el Sol da vueltas alrededor del horizonte durante el mes, sin pasar de ~1,6° de altura. En la Tierra el Sol del mediodía sube decenas de grados.',
  'explain.c1.cta': 'Ver el borde de Shackleton',
  'explain.c2.title': 'Pocos metros lo cambian todo',
  'explain.c2.body':
    'Con el Sol tan bajo, una cresta de unos cientos de metros a 20 km basta para taparlo. El borde de Shackleton recibe luz ~87 % del año. Su interior, a pocos km, está en sombra permanente desde hace miles de millones de años.',
  'explain.c2.cta': 'Bajar al interior de Shackleton',
  'explain.c3.title': 'Sin atmósfera, el horizonte es el terreno',
  'explain.c3.body':
    'En la Luna no hay refracción: lo visible se decide solo con geometría. Desde un pico el horizonte queda por debajo de 0° (unos −2,7° desde 2 km de altura), así que se ve el Sol aunque "astronómicamente" ya se haya puesto.',
  'explain.c3.cta': 'Subir al macizo Malapert',
  'explain.c4.title': 'La Tierra casi no se mueve… pero oscila',
  'explain.c4.body':
    'La Luna siempre muestra la misma cara, así que la Tierra no sale ni se pone como el Sol. Solo oscila unos ±7° por la libración. Desde el polo sur queda rozando el horizonte, y basta una montaña en la dirección de la Tierra para cortar el enlace directo.',
  'explain.c4.cta': 'Ver la cresta de conexión',
  'explain.c5.title': 'Cara oculta: nunca hay Tierra',
  'explain.c5.body':
    "Desde la cara oculta la Tierra está siempre bajo el horizonte. Chang'e-4 necesitó el satélite repetidor Queqiao para comunicarse.",
  'explain.c5.cta': "Ir a Chang'e-4",
  'explain.c6.title': 'Día y noche de dos semanas',
  'explain.c6.body':
    'Un día lunar dura 29,5 días terrestres. Lejos del polo hay ~14 días de luz y ~14 de noche a −170 °C: la batería y el calentamiento deciden si la misión sobrevive. En el polo, elegir bien sitio y fecha puede reducir esa noche a pocas horas.',
  'explain.c6.cta': 'Comparar con Apolo 11',
  'explain.c7.title': 'Sin aire: sin crepúsculo ni abrigo',
  'explain.c7.body':
    'En la Tierra la atmósfera dobla la luz (~0,6° en el horizonte) y el cielo sigue claro hasta que el Sol baja 18°. En la Luna, cuando el disco se oculta tras una cresta, la oscuridad es inmediata. Una pared al Sol llega a ~+110 °C; en sombra cae hacia −180 °C en horas, y el fondo de un cráter en sombra permanente ronda −233 °C (40 K).',
  'explain.c7.cta': 'Ver Shackleton por dentro',
  'explain.c8.title': 'Canadá en la Luna',
  'explain.c8.body':
    'La Agencia Espacial Canadiense aporta Canadarm3, el brazo robótico de la estación Gateway, y a cambio tiene dos vuelos de astronautas a la Luna: Jeremy Hansen la rodeó en Artemis II (abril de 2026). También prepara un rover utilitario para la década de 2030 que deberá sobrevivir a la noche lunar de dos semanas a unos −200 °C y buscar hielo, justo lo que mide esta herramienta.',
  'explain.c8.cta': 'Probar el rover canadiense',
  'explain.source': 'Fuente',
  'glossary.title': 'Glosario',
  'glossary.mask.term': 'Máscara de horizonte',
  'glossary.mask.def':
    'Elevación del relieve en cada dirección vista desde el sitio (0,5° de resolución, hasta 300 km). Decide cuándo el Sol o la Tierra quedan tapados.',
  'glossary.frac.term': 'Fracción visible',
  'glossary.frac.def':
    'Parte del disco del Sol (o de la Tierra) que asoma sobre el horizonte; un astro cuenta como visible desde el 50 %.',
  'glossary.dte.term': 'DTE',
  'glossary.dte.def': 'Direct-to-Earth: comunicación directa con la Tierra, sin satélite relé.',
  'glossary.margin.term': 'Margen de enlace',
  'glossary.margin.def':
    'Grados que la Tierra debe superar sobre el relieve para un enlace utilizable; evita que la señal rebote en el suelo (multitrayecto).',
  'glossary.dsn.term': 'DSN',
  'glossary.dsn.def':
    'Deep Space Network: las antenas de la NASA en Goldstone, Madrid y Canberra. Para hablar con la Luna, al menos una debe tenerla a la vista.',
  'glossary.dispersion.term': 'Elipse de aterrizaje',
  'glossary.dispersion.def':
    'Zona donde puede acabar el módulo por la imprecisión del guiado (3σ). Es alargada: el error a lo largo de la trayectoria de aproximación es mayor que el transversal.',
  'glossary.psr.term': 'PSR',
  'glossary.psr.def':
    'Región en sombra permanente: fondos de cráter donde nunca da el Sol y puede conservarse hielo.',
  'glossary.slope.term': 'Pendiente',
  'glossary.slope.def':
    'Inclinación del terreno calculada sobre el relieve de 20 m. Menos de 10° es seguro para aterrizar; más de 15°, peligroso.',
  'glossary.lola.term': 'LOLA',
  'glossary.lola.def':
    'Lunar Orbiter Laser Altimeter: el altímetro láser del orbitador LRO, de donde sale toda la topografía.',
  'glossary.tplus.term': 'T+',
  'glossary.tplus.def':
    'Tiempo transcurrido desde el alunizaje; todos los escenarios lo comparten.',
  'explain.sources.title': 'Recursos de la NASA y la CSA que usa LUMEN 3D',
  'explain.sources.horizons':
    'Efemérides DE441: posiciones del Sol y la Tierra vistas desde cada sitio (2026–2030), validación al segundo de arco y geometría de la DSN.',
  'explain.sources.quickmap':
    'Mosaico NAC del polo sur (10 m/px) como capa «Imagen LROC NAC» en Superficie, mapa de iluminación de Speyerer y Robinson (2013) para validar el nuestro y enlace a cada sitio.',
  'explain.sources.trek':
    'Mosaicos WAC del globo y del casquete polar en la vista Órbita, mapa de visibilidad de la Tierra para validar el enlace DTE y enlace a cada sitio.',
  'explain.sources.csa':
    'Aportes de Canadá a Artemis (Canadarm3, Gateway, Jeremy Hansen en Artemis II) y concepto de rover utilitario: tarjeta «Canadá en la Luna» y perfil de energía del rover.',

  // Link margin
  'link.label': 'Elev. mín. enlace (°)',
  'link.dsn': 'Exigir estación DSN',
  'link.dsnTitle':
    'El enlace solo cuenta cuando Goldstone, Madrid o Canberra ven la Luna a 10° o más. Sin estación a la vista (≈1,6 % del tiempo, huecos de hasta ~90 min) no hay enlace aunque la Tierra esté sobre el horizonte.',
  'link.title':
    'Elevación mínima de la Tierra sobre el relieve para un enlace DTE utilizable (evita el multitrayecto por rebote en el regolito). Típico: 3–5°.',
  'link.required': 'enlace requiere ≥ {deg}',
  'horizon.linkLine': 'umbral de enlace (+{deg}°)',

  // Export / share
  'export.menu': 'Exportar',
  'export.csv': 'Serie temporal (CSV)',
  'export.json': 'Escenario completo (JSON)',
  'export.horizon': 'Perfil de horizonte (CSV)',
  'export.compareJson': 'Todos los escenarios (JSON)',
  'export.notReady': 'Espera a que termine el cálculo',

  // Presets
  'presets.title': 'Escenarios rápidos',
  'presets.delay.title': '¿Y si Artemis III se retrasa 14 días?',
  'presets.delay.desc':
    'Mismo sitio, alunizaje hoy vs. 14 días después: la geometría Sol-Tierra cambia por completo.',
  'presets.peakVsPsr.title': 'Pico de luz casi eterna vs. interior de cráter',
  'presets.peakVsPsr.desc':
    'Cresta de conexión (Shackleton–de Gerlache) frente al fondo de Shackleton, en sombra permanente.',
  'presets.artemis.title': 'Candidatos Artemis III',
  'presets.artemis.desc': 'Cuatro regiones candidatas de la NASA en la misma fecha.',
  'presets.csaRover.title': 'Rover canadiense: ¿pasa la noche?',
  'presets.csaRover.desc':
    'El rover utilitario de la Agencia Espacial Canadiense debe sobrevivir a la noche lunar. Cresta iluminada, macizo orientado a la Tierra y cráter con hielo, 30 días.',
  'presets.lightIce.title': 'Luz vs. hielo',
  'presets.lightIce.desc':
    'Crestas iluminadas junto a cráteres en sombra, con un 30 % de peso científico en la puntuación.',
  'presets.apply': 'Comparar',

  // Levels (shape + text companion to colours)
  'level.good': 'bueno',
  'level.warn': 'atención',
  'level.bad': 'crítico',

  // Surface view HUD
  'hud.macroHint':
    'Arrastra para orbitar · rueda para acercarte al polo · haz clic en un punto para bajar a la superficie',
  'hud.more': 'Controles',
  'hud.less': 'Ocultar controles',
  'hud.microHint': 'Arrastra para mirar alrededor · rueda para hacer zoom (el Sol mide 0,5°)',
  'hud.aerialHint':
    'Vista aérea a 3 km (no es lo que ve el lander) · activa «Reubicar con clic» y pulsa en el terreno para reubicar el sitio',
  'hud.compass': 'Orientación de la cámara',
  'hud.elev': 'elev.',
  'hud.lookSun': 'Mirar al Sol',
  'hud.lookEarth': 'Mirar a la Tierra',
  'hud.wide': 'Vista amplia',
  'hud.horizonLine': 'Línea de horizonte',
  'hud.paths': 'Trayectorias',
  'hud.landingTools': 'Herramientas de aterrizaje',
  'hud.aerialView': 'Vista aérea',
  'hud.landerView': 'Vista del lander',
  'hud.slope': 'Pendientes',
  'hud.ellipse': 'Elipse',
  'hud.ellipseOff': 'sin elipse',
  'hud.ellipseAspect': 'Forma de la elipse',
  'hud.ellipseAspectTitle':
    'Relación entre el error a lo largo de la trayectoria de aproximación y el transversal. El eje mayor sigue el acimut de aproximación.',
  'hud.ellipseCircle': 'círculo',
  'hud.pick': 'Reubicar con clic',
  'hud.pickActive': 'Haz clic en el terreno…',
  'hud.pickTitle':
    'Haz clic en el terreno para mover el sitio ahí: se recalcula el horizonte con LOLA 20 m',

  'hud.simulateDescent': 'Simular descenso',

  // Landing (descent) view
  'landing.aria': 'Guiado de descenso',
  'landing.phase': 'Fase',
  'landing.alt': 'Altura',
  'landing.dist': 'Al objetivo',
  'landing.vspeed': 'V. vertical',
  'landing.hspeed': 'V. horizontal',
  'landing.prop': 'Propelente',
  'landing.dv': 'Δv gastado',
  'landing.throttle': 'Empuje · inclinación',
  'landing.mode': 'Modelo',
  'landing.modeTitle':
    'Con física: masa puntual con empuje, gravedad lunar y ecuación del cohete, guiada hasta el contacto. Rápido: recorrido ilustrativo de 45 s sin física.',
  'landing.mode.physics': 'con física',
  'landing.mode.kinematic': 'rápido',
  'landing.vehicle': 'Módulo',
  'landing.vehicleTitle': 'Masa, propelente, empuje e impulso específico. Valores ilustrativos.',
  'landing.vehicle.clps': 'clase CLPS (700 kg)',
  'landing.vehicle.small': 'pequeño (200 kg)',
  'landing.vehicle.heavy': 'pesado (6 t)',
  'landing.summary':
    'Contacto a {vz} m/s tras {s} s. Δv de la aproximación simulada: {dv} m/s; con el frenado desde la órbita (~{braking} m/s, no simulado), ≈ {total} m/s. Propelente restante: {left} kg ({margin} % de la carga).',
  'landing.fail.propellant': 'El módulo se queda sin propelente antes del contacto.',
  'landing.fail.terrain': 'El relieve bajo la aproximación corta la trayectoria guiada.',
  'landing.fail.hard-landing': 'El contacto supera la velocidad admisible.',
  'landing.fail.timeout': 'El guiado no llega a cerrar el descenso.',
  'landing.fallback': 'Se muestra el recorrido ilustrativo.',
  'landing.hazard':
    'El punto objetivo no es terreno seguro. El guiado se desviaría {d} (+{dv} m/s de Δv).',
  'landing.hazardGo': 'Aterrizar ahí',
  'landing.noSafe': 'Objetivo con pendiente insegura y sin terreno seguro a menos de 300 m.',
  'landing.phase.braking': 'Frenado',
  'landing.phase.approach': 'Aproximación',
  'landing.phase.terminal': 'Descenso final',
  'landing.phase.landed': 'En superficie',
  'landing.reticle': 'Pendiente bajo la retícula',
  'landing.noData': 'sin datos',
  'landing.sunInFov': '☀ Sol en el campo de visión ({deg} del eje)',
  'landing.sunClear': 'Sol fuera de cámara ({deg} del eje)',
  'landing.contactLit': 'Punto de contacto iluminado ({pct} del disco solar)',
  'landing.contactDark': 'Punto de contacto en sombra',
  'landing.play': 'Reproducir',
  'landing.pause': 'Pausa',
  'landing.restart': 'Reiniciar',
  'landing.speed': 'Velocidad',
  'landing.progress': 'Progreso del descenso',
  'landing.approach': 'Aproximación',
  'landing.approachAuto': 'Sol de cola (auto)',
  'landing.approachAhead': 'Sol de frente',
  'landing.approachFrom': 'desde {dir}',
  'landing.eye': 'Vista desde la nave',
  'landing.orbit': 'Órbita alrededor',
  'landing.panels': 'Luz directa en paneles: superior {top} · lateral orientado al Sol {side}',
  'landing.toSurface': 'Ir a la vista de superficie',
  'landing.hint':
    'Arrastra para desviar la mirada · rueda para zoom · la hora de misión queda fija durante el descenso',
  'landing.orbitHint': 'Arrastra para girar alrededor del lander · rueda para acercarte',

  // Slope layer
  'slope.legend.title': 'Pendiente del terreno',
  'slope.legend.safe': '< {deg}° segura',
  'slope.legend.caution': '{a}–{b}° marginal',
  'slope.legend.steep': '> {deg}° peligrosa',

  // Terrain card
  'terrain.title': 'Terreno · aterrizaje',
  'terrain.badge.good': 'Pendiente segura',
  'terrain.badge.warn': 'Pendiente marginal',
  'terrain.badge.bad': 'Demasiado inclinado',
  'terrain.localSlope': 'pendiente local (Horn, DEM {res} m/px)',
  'terrain.withinRadius': 'En r = {r}: p90 {p90} · máx. {max} · área < 10°: {safe}',
  'terrain.coarse':
    'DEM de {res} m/px: la pendiente queda suavizada y subestima la real a escala del lander.',

  // Dispersion
  'dispersion.title': 'Elipse de aterrizaje 3σ ({a} × {b})',
  'dispersion.loading': 'Calculando horizontes de los puntos de la elipse…',
  'dispersion.spread': 'Puntuación entre {min} y {max} en {n} puntos de aterrizaje posibles.',
  'dispersion.range': 'mín · mediana · máx',
  'dispersion.expected': 'Puntuación esperada',
  'dispersion.pGood': 'Prob. de puntuación ≥ {score}',
  'dispersion.pSafe': 'Prob. de pendiente < {deg}°',
  'dispersion.score': 'Puntuación',
  'dispersion.sun': 'Tiempo con Sol',
  'dispersion.dte': 'Enlace DTE',
  'dispersion.night': 'Noche más larga',
  'dispersion.slope': 'Pendiente',
  'dispersion.note':
    'Elipse 3σ con el eje mayor en la dirección de aproximación; cada punto pesa según la probabilidad de caer ahí. Análisis rápido: horizonte a 1° y paso de 30 min por punto. Los marcadores de la vista de superficie muestran cada punto; haz clic en uno para mover el sitio ahí.',
  // Energy / battery
  'energy.title': 'Energía · batería',
  'energy.profile': 'Perfil energético',
  'energy.preset.lander': 'Lander tipo CLPS (caja, 4 caras verticales)',
  'energy.preset.rover': 'Rover pequeño (panel con seguimiento)',
  'energy.preset.csaRover': 'Rover utilitario canadiense (concepto CSA, ilustrativo)',
  'energy.preset.fixed': 'Panel vertical fijo (una cara)',
  'energy.preset.custom': 'Personalizado',
  'energy.badge.ok': 'Sobrevive',
  'energy.badge.dead': 'Sin energía',
  'energy.depleted': 'Batería agotada el {when} (T+{after}). {dead} sin energía en la ventana.',
  'energy.survives': 'Sobrevive a toda la ventana: carga mínima {min}.',
  'energy.stats': 'Ahora {now} · mín. {min} · operativo {active} del tiempo · {wh} Wh generados',
  'energy.edit': 'Editar perfil',
  'energy.field.panel': 'Paneles',
  'energy.field.az': 'Orientación (° desde N)',
  'energy.field.peak': 'Potencia por panel (W)',
  'energy.field.battery': 'Batería (Wh)',
  'energy.field.active': 'Consumo operando (W)',
  'energy.field.hibernate': 'Consumo hibernando (W)',
  'energy.field.threshold': 'Hibernar bajo (%)',
  'energy.field.initial': 'Carga inicial (%)',
  'energy.panel.tracking': 'Con seguimiento solar',
  'energy.panel.vertical-box': 'Caja: 4 caras verticales',
  'energy.panel.vertical-fixed': 'Una cara vertical fija',
  'energy.panel.horizontal': 'Horizontal (en cubierta)',
  'energy.modelNote':
    'Modelo de primer orden: potencia = panel × fracción visible del disco × coseno de incidencia. Opera con Sol y batería sobre el umbral; si no, hiberna. Sin pérdidas térmicas ni de conversión. Valores ilustrativos.',

  // Timeline
  'timeline.sun': 'Sol',
  'timeline.earth': 'Tierra',
  'timeline.both': 'Ambos',
  'timeline.battery': 'Batería',
  'timeline.horizon': 'horizonte',
  'timeline.depleted': 'Sin energía',
  'timeline.aria': 'Línea temporal: Sol visible {sun} del tiempo, enlace DTE {dte}, ambos {both}.',
  'timeline.ariaBattery': 'La batería nunca baja de {min}.',
  'timeline.ariaDepleted': 'La batería se agota el {when}.',

  // Bottom panel
  'bottom.aria': 'Análisis temporal',
  'bottom.timeline': 'Línea temporal',
  'bottom.horizon': 'Horizonte 360°',
  'bottom.dates': 'Fechas alternativas',
  'bottom.seasons': 'Estaciones',
  'bottom.map': 'Mapa polar',
  'bottom.computing': 'Calculando efemérides…',
  'bottom.loadingHorizon': 'Cargando horizonte…',

  'dispersion.marker':
    'Puntuación {score} · Sol {sun} % · DTE {dte} % · pendiente {slope}°. Clic para mover el sitio aquí.',

  // Guided flow: welcome, site choice and the four steps
  'welcome.kicker': 'Misión al polo sur de la Luna',
  'welcome.title': 'Toma la mejor decisión de alunizaje',
  'welcome.sub':
    'Elige dónde aterrizar para tener luz del Sol y contacto con la Tierra. Lo verás en 4 pasos.',
  'welcome.start': 'Empezar',
  'welcome.tour': 'Ver el recorrido guiado',
  'choose.kicker': 'Paso previo',
  'choose.title': '¿Dónde quieres aterrizar?',
  'choose.sub': 'Los 3 mejores sitios para hoy. Elige uno para empezar.',
  'choose.back': 'Volver',
  'step.aria': 'Pasos de la decisión',
  'step.orbit': 'Órbita',
  'step.surface': 'Superficie',
  'step.landing': 'Aterrizaje',
  'step.decide': 'Decidir',
  'step.of': 'Paso {n} de {total}',
  'step.next': 'Ir a {name}',
  'step.orbit.hint': 'Ubica tu sitio en el polo sur y mira hacia dónde quedan el Sol y la Tierra.',
  'step.surface.hint': 'Párate en el sitio: ¿ves el Sol y la Tierra sobre el horizonte?',
  'step.landing.hint': 'Simula el descenso y revisa que el terreno sea seguro.',
  'step.decide.hint': 'Compara escenarios, elige el mejor y exporta tu decisión.',
  'more.title': 'Más',
  'more.aria': 'Más herramientas',
  'more.changeSite': 'Cambiar de sitio',

  // Top 3 and where on the Moon
  'top.title': 'Top 3 para tu misión',
  'top.more': 'Ver más sitios ({n})',
  'top.less': 'Ver solo el Top 3',
  'top.computing': 'Calculando…',
  'fact.sun': 'Tiempo con Sol',
  'fact.earth': 'Tiempo con contacto con la Tierra',
  'fact.night': 'Noche más larga',
  'picker.current': 'Tu sitio',
  'locator.pole': 'Polo sur lunar',
  'locator.nearSide': 'Cara visible de la Luna',
  'polar.aria': 'Mapa del polo sur lunar',
  'polar.illum': 'Iluminación anual',
  'polar.psr': 'Sombra permanente (PSR)',
  'polar.lit': 'Sol medio anual: 0 % → 100 %',
  'polar.relief': 'Relieve (LOLA 960 m/px)',
  'polar.active': 'Sitio activo',
  'polar.scenarios': 'Sitios de los escenarios (A, B…)',
  'polar.sites': 'Otros sitios: clic para seleccionar',
  'polar.loading': 'Cargando el relieve polar…',
  'polar.noDem': 'Sin relieve: ejecuta `npm run data` para generar el DEM polar.',
  'polar.noIllum': 'Sin mapas de iluminación anual: ejecuta `npm run data`.',
  'polar.hint':
    'Proyección estereográfica polar, 80°S-90°S; la Tierra queda hacia 0° (arriba). Anillos cada 2°.',
  'scene.southPole': 'Polo Sur lunar',
  'frame.aria': 'Encuadre de la vista',
  'frame.label': 'Ver con fondo:',
  'frame.sun': 'Sol',
  'frame.earth': 'Tierra',
  'frame.free': 'Libre',

  // Decide (comparison) and the scenario editor
  'compare.title2': 'Decide: compara y elige',
  'compare.sub': 'Mismo instante de misión para todos. Edita cualquier dato y mira cómo cambia.',
  'compare.new': '+ Nuevo escenario',
  'compare.hint2': 'Crea un segundo escenario con otro sitio, fecha o equipo para comparar.',
  'compare.ideas': 'Ideas rápidas para comparar',
  'compare.edit': 'Editar',
  'compare.duplicate': 'Duplicar',
  'compare.best': 'Mejor',
  'compare.days': '{n} días',
  'compare.detail': 'Ver detalle',
  'compare.ended': 'Esta misión ya terminó en este instante.',
  'editor.newTitle': 'Nuevo escenario',
  'editor.editTitle': 'Editar escenario {label}',
  'editor.newHint': 'Parte del escenario actual. Cambia lo que quieras.',
  'editor.liveHint': 'Los cambios se aplican al momento.',
  'editor.where': '¿Dónde?',
  'editor.how': '¿Cuándo y con qué equipo?',
  'editor.date': 'Fecha de alunizaje (UTC)',
  'editor.days': 'Duración (días)',
  'editor.science': 'Peso de la ciencia (hielo)',
  'editor.hardware': 'Límites del módulo y del rover',
  'editor.cancel': 'Cancelar',
  'editor.create': 'Crear escenario',
  'takeaways.title': 'Lo que debes recordar',
  'takeaways.best': '{name} es la mejor opción ({score}/100).',
  'takeaways.energy': 'Tiene energía el {pct} % del tiempo y contacto con la Tierra el {dte} %.',
  'takeaways.nightLong': 'Ojo: su noche más larga dura {h}. El equipo debe resistirla.',
  'takeaways.nightShort': 'Su noche más larga es corta ({h}).',
  'takeaways.nightNone': 'No tiene noche en toda la misión.',
  'night.none': 'sin noche',
  'export.final': 'Exportar mi decisión',
  'export.finalHint': '¿Listo? Descarga los datos de tu elección.',

  // Floating assistant
  'assistant.cta': '¿Te ayudo a elegir?',
  'assistant.open': 'Abrir el asistente',
  'assistant.title': 'Asistente',
  'assistant.sub': '3 escenarios recomendados para tu misión',
  'assistant.apply': 'Aplicar',
  'assistant.compareAll': 'Comparar las 3 opciones',
  'assistant.loading': 'Preparando recomendaciones…',
  'assistant.placeholder': 'Pregunta algo (p. ej. ¿cuál tiene más luz?)',
  'assistant.send': 'Enviar',
  'assistant.mockNote': 'Modo demo: respuestas calculadas en tu equipo.',
  'assistant.kind.balanced': 'Mejor en general',
  'assistant.kind.earth': 'Mejor contacto con la Tierra',
  'assistant.kind.ice': 'Luz + hielo',
  'assistant.why.balanced':
    '{name}: la mejor puntuación ({score}/100) con Sol el {sun} % del tiempo.',
  'assistant.why.earth': '{name}: contacto con la Tierra el {dte} % del tiempo.',
  'assistant.why.ice': '{name}: buena luz y hielo cerca (puntuación con ciencia {score}/100).',
  'assistant.answer.light':
    'Para tener más luz, busca sitios altos en bordes de cráter o crestas. Ahora {name} tiene Sol el {sun} % del tiempo.',
  'assistant.answer.earth':
    'La Tierra se ve baja en el polo sur: un sitio alto y sin montañas hacia la Tierra ayuda. {name} tiene contacto el {dte} %.',
  'assistant.answer.slope':
    'Para aterrizar seguro, la pendiente debe ser menor de 10°. Activa "Pendiente" en Superficie para verla en colores.',
  'assistant.answer.ice':
    'El hielo está en cráteres siempre en sombra. Lo ideal: aterrizar con luz cerca de uno. Prueba la opción "Luz + hielo".',
  'assistant.answer.night':
    'Las noches largas enfrían y agotan la batería. Compara la "Noche más larga" de cada escenario en Decidir.',
  'assistant.answer.best':
    'Ahora mismo la mejor opción es {name} ({score}/100). Pulsa "Comparar las 3 opciones" para verlo frente a otras.',
  'assistant.answer.default':
    'Te recomiendo empezar por {name} ({score}/100). Pregúntame sobre luz, Tierra, pendiente, hielo o noche.',
} as const
