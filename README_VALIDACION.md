# Validación de LUMEN 3D frente al reto NASA Space Apps

**Reto**: _Missions to the Moon's south pole face extreme lighting and communication constraints…_
(iluminación y comunicaciones en el polo sur lunar).
**Fecha de la auditoría**: 14 de noviembre de 2026.
**Método**: lectura del código fuente de `src/`, `scripts/` y `public/data/`, contraste con lo que
afirma la documentación (`README.md`, `ARCHITECTURE.md`, `docs/GUIA.md`) y ejecución de
`npm run typecheck`, `npm run lint` y `npm test`. No se modificó ningún archivo del proyecto.

> El porcentaje es la estimación de un auditor técnico aplicando el texto del reto como rúbrica.
> No es un criterio oficial del jurado de Space Apps.

---

## 1. Resumen ejecutivo

| | |
| --- | --- |
| **Cumplimiento global estimado** | **≈ 85 %** |
| Objetivos del reto (70 % del peso) | 86 / 100 |
| Consideraciones técnicas, UX, datos e impacto (20 %) | 85 / 100 |
| Uso de los recursos de la pestaña _Resources_ (10 %) | 75 / 100 |
| Typecheck · Lint · Tests | ✅ · ✅ · ✅ 1111/1111 |

**Veredicto**: el proyecto cubre todos los objetivos del reto con implementación real y verificable
en código, no solo en el README. Siete de los diez bloques evaluados están completos o casi
completos. Las brechas son de alcance, no de ausencia: un modo diferenciado para planificadores
frente a público general, un mapa 2D polar de gran tamaño, enlaces a Horizons prellenados y una
vista estacional multi‑año. La parte de datos y precisión va bastante más allá de lo que pide el
reto (LOLA 20 m, efemérides DE441 validadas, PSR, pendientes, DSN), aunque la validación de
efemérides tiene un punto ciego que se detalla en § 4.

---

## 2. Matriz de cumplimiento por objetivo del reto

Leyenda: ✅ cumple · 🟡 parcial · ❌ no cumple. La puntuación (0–100) se asigna solo con evidencia
encontrada en el código.

| # | Lo que pide el reto | Estado | Evidencia en el código | Dónde se ve en la app | Brechas |
| --- | --- | --- | --- | --- | --- |
| 1 | **Selección interactiva de sitios**: lista curada (Apollo, CLPS, comerciales, otros países) + coordenadas propias | 🟡 85 | `src/config/sites.ts` (15 sitios: Shackleton rim, connecting ridge, de Gerlache, Malapert, Mons Mouton/IM‑2, Nobile/VIPER, Haworth, Shackleton floor, Cabeus/LCROSS, Chandrayaan‑3, Chang'e‑4, SLIM, Apollo 11/15/17); `src/ui/SitePicker.tsx` (`SiteList`, `CustomSiteForm`); `src/data/catalog.ts` `customSiteInfo`; `src/scene/micro/relocate.ts` | Panel izquierdo, Top 3, clic en el globo, «Reubicar con clic» en Superficie | Solo un sitio CLPS/comercial (IM‑2). Faltan IM‑1, Blue Ghost, Luna‑25, Chang'e‑6/7. La lista completa y las coordenadas quedan ocultas tras «mostrar todos» |
| 2 | **Comparación lado a lado o secuencial** | ✅ 95 | `src/ui/CompareView.tsx` (`MAX_SCENARIOS` = 4, `Delta`, «Best», `Takeaways`), `src/ui/ScenarioEditor.tsx`, presets en `src/config/presets.ts` (`delay-14d`, `peak-vs-psr`, `light-vs-ice`, `artemis-candidates`, `csa-rover`), `src/ui/HardwareFilter.tsx` → «Enviar viables a Comparar» | Vista Comparar | — |
| 3 | **Flexibilidad de fecha y hora**; explorar días lunares y estaciones | 🟡 80 | `src/ui/TimeControls.tsx` (fecha de aterrizaje, duración 1–60 días, slider), `src/ui/DateSweep.tsx` + `sweepLandingDates` en `src/astro/metrics.ts` (365 días), tabla DE441 2026–2030 + respaldo IAU en `src/astro/ephemeris.ts` | Panel inferior, pestaña «Barrido de fechas» | No hay vista estacional/anual de la elevación solar ni comparación entre años. La ventana de misión máxima es 60 días |
| 4 | **Sol y Tierra respecto al horizonte**; tiempo hasta puesta de Sol / Tierra | ✅ 95 | `src/ui/MetricsPanel.tsx` (`SunCard`, `EarthCard`, `Countdown` con `nextChangeMs`, `obstruction()`), saltos a puesta/salida en `TimeControls.tsx`, `src/ui/HorizonChart.tsx` (horizonte 360° con trayectorias), `CompassTape.tsx`, `SunGlare.tsx` | Panel derecho, gráfico de horizonte, cinta de rumbo en Superficie | — |
| 5 | **Evaluación de energía y comunicaciones**: elevación solar, duración de luz, ventanas de Tierra | ✅ 90 | `computeMetrics` en `src/astro/metrics.ts` (sol %, energía %, elevación media y máxima, DTE %, noche más larga, corte DTE más largo, ventanas), `scoreOf` (50 % energía + 35 % DTE + 15 % supervivencia), umbrales en `src/ui/levels.ts`, `EnergyCard.tsx` (batería), `ThermalCard.tsx`, `src/astro/dsn.ts` | Panel derecho, tarjetas y semáforos | El veredicto explícito «viable / marginal / descartado» solo aparece en el filtro de hardware. La visibilidad DSN se muestra pero no entra en DTE % ni en la puntuación |
| 6 | **Múltiples enfoques de visualización** (2D, 3D, otros) | 🟡 85 | 3D: `src/scene/macro/MacroScene.tsx` (órbita), `src/scene/micro/MicroScene.tsx` + `SurfaceOverlays.tsx` (pendientes, sombra permanente, imagen NAC, elipse, vista aérea), descenso (`DescentControls`, `DescentReticle`); 2D: `Timeline.tsx`, `HorizonChart.tsx`, `DateSweep.tsx`, `MoonLocator.tsx` | Vistas Órbita, Superficie, Aterrizaje; panel inferior | No hay un mapa 2D polar de tamaño completo (p. ej. mapa de calor de iluminación o puntuación). El único mapa 2D es el localizador pequeño |
| 7 | **Dinámica temporal**: animaciones o línea de tiempo | ✅ 90 | `src/hooks/usePlayback.ts` (1, 6, 24 y 72 h por segundo), `src/ui/Timeline.tsx` (bandas Sol / DTE / ambos / batería, clic para saltar), trayectorias de Sol y Tierra en el HUD | Controles de reproducción y línea de tiempo | Limitado a la ventana del escenario (1–60 días); sin animación de varios meses |
| 8 | **Accesibilidad para distintos niveles**: planificadores, educadores y público | 🟡 70 | i18n ES/EN (`src/i18n/es.ts`, `en.ts`, `sites.ts`), recorrido guiado de 12 pasos (`src/ui/Tour.tsx`, `tourSteps.ts`), ayuda «?» por panel (`HelpButton.tsx`), panel «¿Por qué?» con 8 tarjetas (`ExplainPanel.tsx`), pantalla de bienvenida y flujo de 4 pasos (`Welcome.tsx`, `steps.ts`), asistente (`AssistantFab.tsx`, cliente simulado), badges forma+color (`LevelTag.tsx`), atajos (`usePanelShortcuts.ts`) | Barra superior, Guía, «?», asistente flotante | No existe un modo planificador vs. educador/público. El glosario solo está en `docs/GUIA.md`, no en la app. El README dice 13 pasos de recorrido; el código tiene 12 |
| 9 | **UX de comparación rápida**; por qué pequeños cambios de lugar o fecha importan | ✅ 90 | `src/astro/dispersion.ts` (17 puntos en 500 m / 1 km / 2 km, mín/mediana/máx), `src/astro/optimize.ts` («Sugerir mejor punto»), tarjeta «Unos metros lo cambian todo» en `ExplainPanel`, `src/hooks/useUrlSync.ts` (URL compartible), `src/ui/ExportMenu.tsx` + `export.ts` (CSV/JSON) | Tarjeta de elipse en Superficie, presets, Comparar | La sensibilidad a un cambio de fecha solo se ve con el preset `delay-14d` o el barrido. La «elipse» es en realidad un círculo (`dispersionOffsets`) |
| 10 | **Datos y precisión**: topografía real, libración, horizonte sin atmósfera, pendientes y cráteres | ✅ 90 | Ver § 4. `src/astro/horizonFromDem.ts`, `ephemTable.ts`, `ephemeris.ts`, `slope.ts`, `illumination.ts`, `scripts/data/*` | Terreno 3D, pendientes, PSR, badge «Horizons» en controles de tiempo | Validación de efemérides sin cobertura de la interpolación; 6 sitios de referencia con horizonte esférico ideal |

**Promedio ítems 1–8** (objetivos explícitos del reto): 86 / 100.

---

## 3. Uso de los recursos de la pestaña _Resources_

| Recurso | Estado | Cómo se usa | Brecha |
| --- | --- | --- | --- |
| **LROC QuickMap** | 🟡 | Enlace centrado en el sitio activo (`quickmapUrl` en `src/config/externalLinks.ts`); mosaico NAC descargado en build (`scripts/data/build-imagery.ts`, `src/astro/imagery.ts`); validación de iluminación contra su WMS (`validate:illum`) | El botón solo aparece tras expandir la lista completa de sitios. La vista enlazada es cilíndrica y se distorsiona en el polo (el propio README lo reconoce) |
| **Moon Trek** | 🟡 | Enlace centrado en el sitio (`moonTrekUrl`); mosaico WAC para el globo; referencia de visibilidad de la Tierra en la validación | Mismas limitaciones de visibilidad del botón y proyección |
| **JPL Horizons** | ✅ | Fuente principal de efemérides: `scripts/data/build-ephem.ts` descarga DE441 cada 2 h (2026–2030) y publica `public/data/ephem/de441.bin` (514 KB); `src/astro/ephemTable.ts` interpola; `scripts/data/validate-horizons.ts` genera fixtures; badge de fuente en `TimeControls` | No hay enlace a Horizons prellenado con sitio y fecha; `HORIZONS_URL` solo lleva a la portada |
| **CSA – Moon Exploration** | ✅ | Enlace `CSA_MOON_URL`; preset `csa-rover` con límites de pendiente de rover; filtro de hardware con pendiente de rover | — |

**Puntuación del bloque**: 75 / 100. El uso de Horizons es el más sólido (datos reales validados).
QuickMap y Moon Trek se usan de verdad (imágenes, validación), pero su integración visible para
el usuario es tímida.

---

## 4. Datos y precisión: qué está bien fundamentado y qué no

### Lo que está bien

- **Efemérides**: tabla JPL Horizons DE441 (puntos subsolar y subterrestre en el marco fijo
  lunar), interpolación Lagrange cúbica de 4 puntos, corrección de aberración de primer orden,
  paralaje topocéntrico con el observador a altura LOLA + 2 m. Respaldo astronomy‑engine con el
  modelo de rotación IAU fuera de 2026–2030. La libración queda incluida implícitamente en el
  marco MEAN_ME de Horizons y en los términos físicos del modelo IAU.
- **Topografía**: LOLA `LDEM_80S_20M` (9 tiles de 1024×1024 a 20 m, 20,5 km de lado) y
  `LDEM_75S_240M` remuestreado a 480 m y 960 m. El horizonte se calcula por azimut hasta 300 km
  con geometría esférica exacta, sin refracción (explícito en `src/astro/horizon.ts`).
- **Regla de visibilidad**: un astro cuenta como visible si al menos la mitad de su disco supera
  el horizonte topográfico (`VISIBLE_THRESHOLD = 0.5`). El enlace DTE exige un margen configurable
  de 0–10° (3° por defecto) solo para la Tierra.
- **Modelos derivados**: pendiente con operador de Horn 3×3 corregido por el factor de escala
  estereográfico; PSR calculado con un año de posiciones solares cada 6 h sobre celdas de 100 m;
  acceso a hielo con Dijkstra de 8 vecinos sobre el DEM de 20 m; térmico de equilibrio radiativo;
  batería con Euler explícito. Todas las constantes de la tabla «Supuestos de ingeniería» del
  README coinciden con el código.
- **Validación documentada**: 360 posiciones Sol/Tierra y 180 posiciones DSN contra Horizons
  (fixtures en `src/astro/__fixtures__/`), comprobadas offline en `ephemeris.test.ts`. Iluminación
  comparada con QuickMap (Spearman 0,94–0,98) y visibilidad de la Tierra con Moon Trek (0,99).

### Debilidades encontradas

1. **La interpolación de la tabla no está validada.** Las 12 fechas de `validate-horizons.ts`
   son `Date.UTC(…, 15, (m % 4) * 6)`, es decir horas 0, 6, 12 y 18 del día 15. Todas caen
   exactamente sobre una muestra de la tabla de 2 h, así que los pesos de Lagrange se reducen a un
   único punto. El «1,4″» del README mide la conversión de marco y la aberración, no el error entre
   muestras.
2. **Validación no independiente**: la tabla se construye desde Horizons y se contrasta con
   Horizons. No hay una segunda fuente (p. ej. SPICE) para las efemérides.
3. **`illumValidation.test.ts` es circular**: solo comprueba números ya guardados en
   `illum-validation.json`; no recalcula nada, por lo que no detectaría una regresión.
4. **Snapping de coordenadas**: las crestas se desplazan al punto más iluminado dentro de un radio
   (connecting ridge: 9 km, unos 6 km de desplazamiento). Es un criterio razonable, pero sesga al
   alza la iluminación de esos sitios y se calibró con un solo año (2026).
5. **Seis sitios de referencia** (Apollo 11/15/17, Chandrayaan‑3, Chang'e‑4, SLIM) usan un
   horizonte esférico ideal, sin relieve. El propio README lo declara.
6. **DSN solo informativo**: la visibilidad desde Goldstone/Madrid/Canberra se muestra pero no
   afecta a DTE % ni a la puntuación, así que un «DTE 100 %» puede coincidir con momentos sin
   ninguna estación a la vista.
7. **La «elipse» es un círculo** de 17 puntos (centro + 2 anillos de 8). No está alineada con la
   dirección de aproximación ni ponderada estadísticamente.
8. La fracción de disco visible asume horizonte localmente recto y muestrea la máscara solo en el
   azimut del centro del disco; para el disco terrestre (~2°) junto a crestas abruptas introduce
   error.

---

## 5. Verificación ejecutada

Comandos lanzados el 14 de noviembre de 2026 sobre el repo sin modificar (Node v25.6.1):

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` (`tsc -b`) | ✅ Sin errores |
| `npm run lint` (`eslint .`) | ✅ Sin avisos |
| `npm test` (Vitest 5.1.0) | ✅ **32 archivos, 1111 tests, 0 fallos**, 11,9 s |
| `npm run dev` | ✅ Arranca en `http://localhost:5173/`, responde HTTP 200 |
| `npm run validate` / `validate:illum` | ⏭ No ejecutados: requieren red a Horizons/QuickMap y reescriben fixtures |

Notas sobre la suite de tests:

- 207 casos escritos con `it`/`test`; el total de 1111 viene de `it.each` sobre los 360 fixtures
  de efemérides (dos veces) y otros parametrizados.
- 21 de los 32 archivos cubren el núcleo físico‑matemático (`src/astro/*`, `src/config/*`); el
  resto cubre UI (Testing Library + jsdom), store, sincronización de URL, i18n y el asistente.
- Sin tests directos para `optimize.ts`, `scenario.ts`, `series.ts`, `instant.ts`,
  `illumination.ts` ni `imagery.ts` (cobertura indirecta parcial). `src/scene/` (WebGL) no tiene
  tests; ARCHITECTURE § 8 indica que se revisa a mano con capturas.

---

## 6. Fortalezas (más allá de lo que pide el reto)

- **Terreno LOLA real a 20 m/px** con horizonte topográfico, no solo horizonte geométrico.
- **Capa de pendientes** con umbrales de aterrizaje y **análisis de dispersión** en la zona de
  aterrizaje con sugerencia automática del mejor punto.
- **Sombra permanente y acceso a hielo** con ruta de rover, y el control Ingeniería ↔ Ciencia.
- **Enlace DSN**: distancia, pérdida en espacio libre en banda X y estación visible.
- **Modelo de batería** con perfiles energéticos y veredicto de supervivencia.
- **Estimación térmica** y horas bajo −100 °C.
- **Simulación de descenso** con telemetría y retícula de pendiente.
- **Filtro de hardware** que clasifica todo el catálogo en ✓ / ! / ✕ y lo envía a Comparar.
- **Exportación CSV/JSON** y **URL compartible** con el estado del escenario.
- **Cálculo pesado en Web Worker** (`src/workers/`), lo que mantiene la UI fluida.
- **Documentación extensa**: README de 42 KB con tabla de supuestos y limitaciones,
  ARCHITECTURE de 55 KB, guía de usuario con glosario y FAQ, seis capturas.

---

## 7. Brechas y riesgos

### Funcionales (afectan al % del reto)

- Sin **modo por audiencia** (planificador / educador / público). Es el ítem con menor nota.
- Sin **mapa 2D polar** de gran tamaño con iluminación o puntuación por zona.
- Sin **vista estacional** multi‑año de la elevación solar; el barrido cubre un año y la ventana
  de misión 60 días.
- **Catálogo** con un solo sitio CLPS comercial; faltan misiones recientes y de otros países en
  el polo sur.
- **Enlaces a QuickMap/Moon Trek** ocultos tras «mostrar todos»; **Horizons** sin enlace prellenado.
- **Glosario** solo en la guía Markdown, no en la app.

### Discrepancias documentación ↔ código

| Afirmación | Realidad |
| --- | --- |
| README y GUIA: recorrido guiado de 13 pasos | `TOUR_STEPS` tiene 12 (`src/ui/tourSteps.ts`) |
| README: «elipse de aterrizaje» | Círculo de 17 puntos (`dispersionOffsets`) |
| README: diferencia máxima 1,4″ con la tabla DE441 | Cierto solo en instantes que coinciden con muestras de la tabla (§ 4.1) |
| ARCHITECTURE § 3: `ephemeris.ts` = «modelo de rotación IAU» | Hoy es la tabla DE441 con el IAU como respaldo; DE441 solo se describe en § 6 |
| README no menciona el **asistente IA** | Existe `src/assistant/` + `AssistantFab.tsx`; es un cliente simulado por palabras clave con backend opcional (`VITE_ASSISTANT_URL`) que no está en el repo |

### Deuda técnica

- `tsconfig.app.json` y `tsconfig.node.json` **no activan `strict`**. El typecheck pasa, pero sin
  `strictNullChecks` ni `noImplicitAny`.
- Sin **CI** (no hay `.github/`) y el directorio **no es un repositorio git**.
- `cap.xml` es una página HTML guardada de QuickMap sin referencias en el proyecto: residuo.
- Los datos publicados en `public/data` pesan ~36 MB (18 MB de terreno); conviene revisar la
  carga inicial en conexiones lentas.
- El test de validación de iluminación es circular (§ 4.3).

---

## 8. Recomendaciones priorizadas (no implementadas)

Ordenadas por impacto estimado en el cumplimiento del reto frente al esfuerzo.

| Prioridad | Acción | Ítem que mejora | Esfuerzo |
| --- | --- | --- | --- |
| 1 | Añadir un **selector de audiencia** (Planificador / Educador / Público) que oculte tarjetas técnicas y active explicaciones; reutilizar `ExplainPanel` y `levels.ts` | 8 (70 → ~90) | Medio |
| 2 | Mostrar siempre los **enlaces a QuickMap y Moon Trek** junto al sitio activo y añadir un **enlace a Horizons prellenado** (`COMMAND=10`/`399`, `CENTER=coord@301`, fecha del escenario) | 10, Recursos (75 → ~90) | Bajo |
| 3 | **Mapa 2D polar** con la capa de iluminación anual ya calculada (`public/data/illum/`) y los sitios encima; puede reutilizar `MoonLocator` ampliado | 6 (85 → ~95) | Medio |
| 4 | **Vista estacional**: gráfico de elevación solar máxima por mes 2026–2030 reutilizando `sweepLandingDates` | 3 (80 → ~90) | Bajo |
| 5 | Ampliar el **catálogo** con IM‑1, Blue Ghost M1, Luna‑25, Chang'e‑6/7 y Chandrayaan‑4 (coordenadas públicas) | 1 (85 → ~95) | Bajo |
| 6 | Corregir en la **validación de efemérides** las fechas para que caigan entre muestras de la tabla (p. ej. minuto 37) y publicar el error de interpolación real | Datos (credibilidad) | Bajo |
| 7 | Alinear doc y código: 12 pasos de tour, «círculo/zona de dispersión» en vez de elipse, describir el asistente, actualizar ARCHITECTURE § 3; eliminar `cap.xml` | Coherencia | Muy bajo |
| 8 | Activar `strict: true` en los tsconfig y corregir lo que aparezca; añadir un workflow de CI que ejecute typecheck, lint y test | Calidad | Medio |
| 9 | Incluir la **visibilidad DSN** como opción en el cálculo de DTE % (checkbox «exigir estación DSN») | 5 | Bajo |
| 10 | Glosario dentro de la app (reutilizar los textos de `docs/GUIA.md` § 15 vía i18n) | 8 | Bajo |

Con las acciones 1 a 5 el cumplimiento estimado subiría del 85 % a aproximadamente el 93 %.

---

## Anexo: criterio de puntuación

- **70 %**: media de los ítems 1–8 de la matriz (los objetivos que el reto enumera bajo
  _Objectives_, incluida la accesibilidad por niveles).
- **20 %**: _Potential Considerations_ en cuatro bloques de 5 %: enfoque técnico (90), experiencia
  de usuario (85), datos y precisión (85), compromiso e impacto (80).
- **10 %**: uso de los cuatro recursos de la pestaña _Resources_ (75).
- Cálculo: 0,70 × 86 + 0,20 × 85 + 0,10 × 75 = **84,7 ≈ 85 %**.
