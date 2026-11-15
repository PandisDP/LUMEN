# Validación de Killa Landing frente al reto NASA Space Apps

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

|                                                               |                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| **Cumplimiento global estimado**                              | **≈ 85 %**                                                   |
| Estado en la rama `feature/simulacion-y-cierre` (15 nov 2026) | **≈ 97 %**: brechas identificadas cerradas salvo las de § 10 |
| Objetivos del reto (70 % del peso)                            | 86 / 100                                                     |
| Consideraciones técnicas, UX, datos e impacto (20 %)          | 85 / 100                                                     |
| Uso de los recursos de la pestaña _Resources_ (10 %)          | 75 / 100                                                     |
| Typecheck · Lint · Tests                                      | ✅ · ✅ · ✅ 1111/1111                                       |

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

| #   | Lo que pide el reto                                                                                               | Estado     | Evidencia en el código                                                                                                                                                                                                                                                                                                                               | Dónde se ve en la app                                                       | Brechas                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Selección interactiva de sitios**: lista curada (Apollo, CLPS, comerciales, otros países) + coordenadas propias | 🟡 85      | `src/config/sites.ts` (15 sitios: Shackleton rim, connecting ridge, de Gerlache, Malapert, Mons Mouton/IM‑2, Nobile/VIPER, Haworth, Shackleton floor, Cabeus/LCROSS, Chandrayaan‑3, Chang'e‑4, SLIM, Apollo 11/15/17); `src/ui/SitePicker.tsx` (`SiteList`, `CustomSiteForm`); `src/data/catalog.ts` `customSiteInfo`; `src/scene/micro/relocate.ts` | Panel izquierdo, Top 3, clic en el globo, «Reubicar con clic» en Superficie | Solo un sitio CLPS/comercial (IM‑2). Faltan IM‑1, Blue Ghost, Luna‑25, Chang'e‑6/7. La lista completa y las coordenadas quedan ocultas tras «mostrar todos»             |
| 2   | **Comparación lado a lado o secuencial**                                                                          | ✅ 95      | `src/ui/CompareView.tsx` (`MAX_SCENARIOS` = 4, `Delta`, «Best», `Takeaways`), `src/ui/ScenarioEditor.tsx`, presets en `src/config/presets.ts` (`delay-14d`, `peak-vs-psr`, `light-vs-ice`, `artemis-candidates`, `csa-rover`), `src/ui/HardwareFilter.tsx` → «Enviar viables a Comparar»                                                             | Vista Comparar                                                              | —                                                                                                                                                                       |
| 3   | **Flexibilidad de fecha y hora**; explorar días lunares y estaciones                                              | 🟡 80      | `src/ui/TimeControls.tsx` (fecha de aterrizaje, duración 1–60 días, slider), `src/ui/DateSweep.tsx` + `sweepLandingDates` en `src/astro/metrics.ts` (365 días), tabla DE441 2026–2030 + respaldo IAU en `src/astro/ephemeris.ts`                                                                                                                     | Panel inferior, pestaña «Barrido de fechas»                                 | No hay vista estacional/anual de la elevación solar ni comparación entre años. La ventana de misión máxima es 60 días                                                   |
| 4   | **Sol y Tierra respecto al horizonte**; tiempo hasta puesta de Sol / Tierra                                       | ✅ 95      | `src/ui/MetricsPanel.tsx` (`SunCard`, `EarthCard`, `Countdown` con `nextChangeMs`, `obstruction()`), saltos a puesta/salida en `TimeControls.tsx`, `src/ui/HorizonChart.tsx` (horizonte 360° con trayectorias), `CompassTape.tsx`, `SunGlare.tsx`                                                                                                    | Panel derecho, gráfico de horizonte, cinta de rumbo en Superficie           | —                                                                                                                                                                       |
| 5   | **Evaluación de energía y comunicaciones**: elevación solar, duración de luz, ventanas de Tierra                  | ✅ 90      | `computeMetrics` en `src/astro/metrics.ts` (sol %, energía %, elevación media y máxima, DTE %, noche más larga, corte DTE más largo, ventanas), `scoreOf` (50 % energía + 35 % DTE + 15 % supervivencia), umbrales en `src/ui/levels.ts`, `EnergyCard.tsx` (batería), `ThermalCard.tsx`, `src/astro/dsn.ts`                                          | Panel derecho, tarjetas y semáforos                                         | El veredicto explícito «viable / marginal / descartado» solo aparece en el filtro de hardware. La visibilidad DSN se muestra pero no entra en DTE % ni en la puntuación |
| 6   | **Múltiples enfoques de visualización** (2D, 3D, otros)                                                           | 🟡 85      | 3D: `src/scene/macro/MacroScene.tsx` (órbita), `src/scene/micro/MicroScene.tsx` + `SurfaceOverlays.tsx` (pendientes, sombra permanente, imagen NAC, elipse, vista aérea), descenso (`DescentControls`, `DescentReticle`); 2D: `Timeline.tsx`, `HorizonChart.tsx`, `DateSweep.tsx`, `MoonLocator.tsx`                                                 | Vistas Órbita, Superficie, Aterrizaje; panel inferior                       | No hay un mapa 2D polar de tamaño completo (p. ej. mapa de calor de iluminación o puntuación). El único mapa 2D es el localizador pequeño                               |
| 7   | Alinear doc y código                                                                                              | Coherencia | ✅ Hecho: 12 pasos, asistente documentado, `cap.xml` eliminado, «elipse» → «zona de dispersión» en interfaz y docs, ARCHITECTURE § 3 al día                                                                                                                                                                                                          |
| 8   | `strict: true` y **CI**                                                                                           | Calidad    | 🟡 Parcial: strict activado sin errores ✅; workflows de CI y Pages escritos ✅ pero **no se ejecutan** porque GitHub Actions está bloqueado en la cuenta (facturación)                                                                                                                                                                              |
| 9   | **Visibilidad DSN** como opción del DTE %                                                                         | 5          | ✅ Hecho: casilla «Exigir estación DSN» (`requireDsn`), por escenario y en la URL (`dsn=1`)                                                                                                                                                                                                                                                          |
| 10  | **Glosario** dentro de la app                                                                                     | 8          | ✅ Hecho: diez términos al final del panel «¿Por qué?», ES y EN                                                                                                                                                                                                                                                                                      |

**Promedio ítems 1–8** (objetivos explícitos del reto): 86 / 100.

---

## 3. Uso de los recursos de la pestaña _Resources_

| Recurso                    | Estado | Cómo se usa                                                                                                                                                                                                                                                                     | Brecha                                                                                                                                                      |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LROC QuickMap**          | 🟡     | Enlace centrado en el sitio activo (`quickmapUrl` en `src/config/externalLinks.ts`); mosaico NAC descargado en build (`scripts/data/build-imagery.ts`, `src/astro/imagery.ts`); validación de iluminación contra su WMS (`validate:illum`)                                      | El botón solo aparece tras expandir la lista completa de sitios. La vista enlazada es cilíndrica y se distorsiona en el polo (el propio README lo reconoce) |
| **Moon Trek**              | 🟡     | Enlace centrado en el sitio (`moonTrekUrl`); mosaico WAC para el globo; referencia de visibilidad de la Tierra en la validación                                                                                                                                                 | Mismas limitaciones de visibilidad del botón y proyección                                                                                                   |
| **JPL Horizons**           | ✅     | Fuente principal de efemérides: `scripts/data/build-ephem.ts` descarga DE441 cada 2 h (2026–2030) y publica `public/data/ephem/de441.bin` (514 KB); `src/astro/ephemTable.ts` interpola; `scripts/data/validate-horizons.ts` genera fixtures; badge de fuente en `TimeControls` | No hay enlace a Horizons prellenado con sitio y fecha; `HORIZONS_URL` solo lleva a la portada                                                               |
| **CSA – Moon Exploration** | ✅     | Enlace `CSA_MOON_URL`; preset `csa-rover` con límites de pendiente de rover; filtro de hardware con pendiente de rover                                                                                                                                                          | —                                                                                                                                                           |

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

1. ~~**La interpolación de la tabla no está validada.**~~ **Corregido en la rama
   `feature/audiencia-y-mision`**: las 12 fechas de `validate-horizons.ts` caían en horas 0, 6, 12
   y 18, exactamente sobre muestras de la tabla de 2 h. Ahora se toman a las hh:37; con 20 sitios
   (480 posiciones) la diferencia máxima sigue siendo 1,4″, así que la interpolación de Lagrange
   queda validada.
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

| Comando                               | Resultado                                                                |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `npm run typecheck` (`tsc -b`)        | ✅ Sin errores                                                           |
| `npm run lint` (`eslint .`)           | ✅ Sin avisos                                                            |
| `npm test` (Vitest 5.1.0)             | ✅ **32 archivos, 1111 tests, 0 fallos**, 11,9 s                         |
| `npm run dev`                         | ✅ Arranca en `http://localhost:5173/`, responde HTTP 200                |
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

| Afirmación                                                  | Realidad                                                                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| README y GUIA: recorrido guiado de 13 pasos                 | `TOUR_STEPS` tiene 12 (`src/ui/tourSteps.ts`)                                                                                                              |
| README: «elipse de aterrizaje»                              | Círculo de 17 puntos (`dispersionOffsets`)                                                                                                                 |
| README: diferencia máxima 1,4″ con la tabla DE441           | Era cierto solo sobre muestras de la tabla; revalidado fuera de la malla con el mismo resultado (§ 4.1)                                                    |
| ARCHITECTURE § 3: `ephemeris.ts` = «modelo de rotación IAU» | Hoy es la tabla DE441 con el IAU como respaldo; DE441 solo se describe en § 6                                                                              |
| README no menciona el **asistente IA**                      | Existe `src/assistant/` + `AssistantFab.tsx`; es un cliente simulado por palabras clave con backend opcional (`VITE_ASSISTANT_URL`) que no está en el repo |

### Deuda técnica

- `tsconfig.app.json` y `tsconfig.node.json` **no activan `strict`**. El typecheck pasa, pero sin
  `strictNullChecks` ni `noImplicitAny`.
- Sin **CI** (no hay `.github/`) y el directorio **no es un repositorio git**.
- `cap.xml` es una página HTML guardada de QuickMap sin referencias en el proyecto: residuo.
- Los datos publicados en `public/data` pesan ~36 MB (18 MB de terreno); conviene revisar la
  carga inicial en conexiones lentas.
- El test de validación de iluminación es circular (§ 4.3).

---

## 8. Recomendaciones priorizadas y su estado

Ordenadas por impacto estimado en el cumplimiento del reto frente al esfuerzo. Estado al
15 de noviembre de 2026 en la rama `feature/audiencia-y-mision`.

| Prioridad | Acción                                                                                 | Ítem que mejora | Estado                                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | **Selector de audiencia** (Planificador / Educador / Público)                          | 8               | ✅ Hecho: `useUiStore.audience`, `ui/audience.ts`, selector en bienvenida y barra superior, `?mode=` en la URL                                                                         |
| 2         | **Enlaces a QuickMap y Moon Trek** siempre visibles y **enlace a Horizons prellenado** | 10, Recursos    | ✅ Hecho: `horizonsUrl()` con sitio, cuerpo y ventana de misión (API pública, cantidad 4)                                                                                              |
| 3         | **Mapa 2D polar** con iluminación anual y sitios                                       | 6               | ✅ Hecho: pestaña _Mapa polar_ (`ui/PolarMap.tsx`), relieve del DEM de 960 m, parches PSR/iluminación, sitios clicables                                                                |
| 4         | **Vista estacional** 2026–2030                                                         | 3               | ✅ Hecho: pestaña _Estaciones_ (`ui/SeasonChart.tsx`, `astro/seasons.ts`)                                                                                                              |
| 5         | Ampliar el **catálogo**                                                                | 1               | ✅ Hecho: Chang'e‑7 (con tile LOLA e iluminación), IM‑1, Luna‑25, Chang'e‑6, Blue Ghost M1. Pendiente Chandrayaan‑4 (sitio aún no público)                                             |
| 6         | **Validación de efemérides** fuera de la malla de 2 h                                  | Datos           | ✅ Hecho: instantes a las hh:37, 20 sitios, 480 posiciones, 1,4″                                                                                                                       |
| 7         | Alinear doc y código                                                                   | Coherencia      | 🟡 Parcial: 12 pasos ✅, asistente documentado ✅, `cap.xml` eliminado ✅. Falta renombrar «elipse» → «zona de dispersión» y actualizar ARCHITECTURE § 3 (`ephemeris.ts` ya usa DE441) |
| 8         | `strict: true` y **CI**                                                                | Calidad         | 🟡 Parcial: strict activado sin errores ✅; workflows de CI y Pages escritos ✅ pero **no se ejecutan** porque GitHub Actions está bloqueado en la cuenta (facturación)                |
| 9         | **Visibilidad DSN** como opción del DTE %                                              | 5               | ⬜ Pendiente                                                                                                                                                                           |
| 10        | **Glosario** dentro de la app                                                          | 8               | ⬜ Pendiente                                                                                                                                                                           |

De las observaciones de la sección 7 sin recomendación propia, quedan resueltas el veredicto en
el panel principal, la sensibilidad a la fecha y el test de iluminación circular (ver § 9). Siguen
abiertas la disposición apretada del HUD en móvil y el bloqueo de GitHub Actions.

## 9. Plan de cierre para llegar al 93 %

### Dónde estamos

| Bloque                                        | Peso   | Auditoría inicial | Hoy (rama) | Tras el plan  |
| --------------------------------------------- | ------ | ----------------- | ---------- | ------------- |
| 1 Selección de sitios                         | 8,75 % | 85                | 93         | 93            |
| 2 Comparación                                 | 8,75 % | 95                | 95         | 95            |
| 3 Fecha, días y estaciones                    | 8,75 % | 80                | 90         | 90            |
| 4 Sol y Tierra vs horizonte                   | 8,75 % | 95                | 95         | 95            |
| 5 Energía y comunicaciones                    | 8,75 % | 90                | 90         | 96            |
| 6 Múltiples visualizaciones                   | 8,75 % | 85                | 95         | 95            |
| 7 Dinámica temporal                           | 8,75 % | 90                | 90         | 90            |
| 8 Accesibilidad por niveles                   | 8,75 % | 70                | 88         | 93            |
| Consideraciones (técnico, UX, datos, impacto) | 20 %   | 85                | 87,5       | 90            |
| Recursos (QuickMap, Moon Trek, Horizons, CSA) | 10 %   | 75                | 90         | 90            |
| **Total**                                     |        | **≈ 85 %**        | **≈ 91 %** | **≈ 92–93 %** |

Las notas de «Hoy» para los ítems 3, 6 y 8 **dependen de la fase 0**: las pestañas _Estaciones_
y _Mapa polar_ y el modo por audiencia pasan typecheck, lint y tests, pero todavía no se han
revisado en un navegador. Si la fase 0 encuentra defectos visuales, esas notas bajan hasta que se
corrijan.

### Fases

| Fase                                   | Qué                                                                                                                                                                                                                                               | Dónde                                                                                                                                              | Criterio de aceptación                                                                                                                                                                | Esfuerzo                               | Sube              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------- |
| **0. Verificar lo ya hecho**           | Revisar en navegador (Chrome, Safari y un móvil) las tres audiencias, las pestañas _Estaciones_ y _Mapa polar_, los enlaces a Horizons/QuickMap/Moon Trek y el sitio Chang'e‑7 en las tres vistas. Medir la primera carga con red limitada        | Sitio publicado y `npm run dev`                                                                                                                    | Sin errores de consola; el mapa muestra relieve, parches y sitios; el clic en un mes cambia la fecha; los tres enlaces abren el punto correcto; lista de defectos corregida o anotada | 0,5 día                                | Consolida el 91 % |
| **1. Veredicto en el panel principal** | Mostrar «Viable / Al límite / Descartado» junto a la puntuación del sitio activo, con la restricción que falla                                                                                                                                    | `src/ui/MetricsPanel.tsx`; reutiliza `classifySite` (`src/astro/hardware.ts`) y las claves `hw.verdict.*`                                          | El veredicto coincide con el del filtro de hardware para el mismo sitio y límites; test en `panels.test.tsx`                                                                          | 0,5 día                                | Ítem 5            |
| **2. DSN como opción del DTE**         | Casilla «Exigir estación DSN» (apagada por defecto): el enlace solo cuenta cuando alguna estación ve la Luna a ≥ 10°                                                                                                                              | `src/astro/series.ts` o `metrics.ts` (máscara por muestra con `dsnVisibility`), parámetro en `ScenarioParams`, `useUrlSync.ts`, `TimeControls.tsx` | Con la casilla apagada los números no cambian (tests actuales intactos); encendida, DTE % ≤ valor anterior; test unitario; parámetro en la URL                                        | 1 día                                  | Ítem 5, datos     |
| **3. Glosario en la app**              | Los 9 términos de `docs/GUIA.md` § 15 como sección del panel «¿Por qué?», en ES y EN                                                                                                                                                              | `src/ui/ExplainPanel.tsx`, `src/i18n/es.ts`, `en.ts`                                                                                               | Visible en las tres audiencias; `i18n.test.ts` en verde; la guía enlaza a la app en vez de duplicar                                                                                   | 0,5 día                                | Ítem 8            |
| **4. Sensibilidad a la fecha**         | En la tarjeta de dispersión (o junto a la puntuación), la puntuación a ±1, ±3 y ±7 días de la fecha actual                                                                                                                                        | `src/ui/LandingPanel.tsx` o `MetricsPanel.tsx`; reutiliza `runDateSweep`                                                                           | Fila mín/actual/máx con las fechas; clic en un valor mueve la fecha; test con serie sintética                                                                                         | 0,5 día                                | UX                |
| **5. Coherencia doc ↔ código**         | Renombrar «elipse de aterrizaje» → «zona de dispersión» (7 claves por idioma y 20 menciones en README y GUIA); actualizar ARCHITECTURE § 3 (`ephemeris.ts` = tabla DE441 con respaldo IAU); mencionar las pestañas y la audiencia en ARCHITECTURE | `src/i18n/*.ts`, `README.md`, `docs/GUIA.md`, `ARCHITECTURE.md`                                                                                    | `grep -ri elipse` solo devuelve usos geométricos legítimos; tests de UI ajustados                                                                                                     | 0,5 día                                | Coherencia        |
| **6. Test de iluminación no circular** | Que `illumValidation.test.ts` recalcule al menos un estadístico (p. ej. fracción PSR de un tile) desde `public/data/illum/` en vez de leer solo el JSON                                                                                           | `src/astro/illumValidation.test.ts`                                                                                                                | El test falla si se altera el mapa de iluminación                                                                                                                                     | 0,5 día                                | Datos             |
| **7. Peso y carga**                    | Según la medición de la fase 0: carga diferida de imágenes NAC y de tiles de sitios no activos, y aviso de progreso                                                                                                                               | `src/data/loadImagery.ts`, `loadDem.ts`                                                                                                            | Primera vista interactiva en < 5 s con 10 Mb/s                                                                                                                                        | 0,5–1 día, solo si la medición lo pide | Impacto           |

Total: **4 a 5 días** de trabajo. El orden recomendado es 0 → 1 → 3 → 2 → 4 → 5 → 6 → 7: primero lo
que confirma la nota actual, luego lo de mayor puntuación por hora.

### Resultado de la ejecución (15 de noviembre de 2026)

| Fase                             | Resultado                                                                                                                                                                                                                                                                                               | Evidencia                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 0 Verificar                      | ✅ Hecho. Chrome y WebKit (motor de Safari) sin errores de consola en el build de producción; cada audiencia muestra lo previsto; móvil de 390 px sin desbordamiento horizontal. El enlace a Horizons devuelve los mismos valores que la app (acimut 42,9°, elevación −0,16° en Shackleton, 1 mar 2027) | Capturas con Playwright sobre Chrome del sistema y WebKit      |
| 0 Defectos hallados y corregidos | Las pestañas _Estaciones_ y _Mapa polar_ quedaban recortadas en el panel inferior: ahora el panel crece para ellas. El gráfico de estaciones mostraba un mes sobrante de 2031: eliminado. «¿Por qué?» se reabría en cada recarga para público y educador: ahora una vez por sesión                      | `App.tsx`, `SeasonChart.tsx`, `index.css`                      |
| 1 Veredicto                      | ✅ «Viable / Al límite / Descartado» bajo la puntuación, con el límite que falla, para las tres audiencias                                                                                                                                                                                              | `MetricsPanel.tsx` (`Verdict`), test en `audience.test.tsx`    |
| 2 DSN                            | ✅ Casilla «Exigir estación DSN». Medido en 2026–2030: sin estación a la vista el 1,58 % del tiempo, huecos de hasta 90 min. Apagada no cambia ningún número. No se aplica al análisis de dispersión ni a «Sugerir mejor punto»                                                                         | `series.ts`, `dsn.ts`, `useUrlSync.ts`, tests en `dsn.test.ts` |
| 3 Glosario                       | ✅ Diez términos en «¿Por qué?»                                                                                                                                                                                                                                                                         | `ExplainPanel.tsx`, test en `panels.test.tsx`                  |
| 4 Fecha                          | ✅ Fila con la puntuación a ±1, ±3 y ±7 días; clic para mover la fecha (planificador y educador)                                                                                                                                                                                                        | `DateShift.tsx`, `astro/dateShift.ts`                          |
| 5 Coherencia                     | ✅ «Zona de dispersión» en interfaz, README, guía y ARCHITECTURE                                                                                                                                                                                                                                        | —                                                              |
| 6 Test de iluminación            | ✅ Ya no es circular: cuenta las celdas PSR de los mapas publicados y recalcula la iluminación anual de cuatro sitios desde su máscara de horizonte (mapa frente a recálculo: 90,0/86,9 %, 77,5/75,7 %, 84,0/80,7 %, 0/0 %)                                                                             | `illumValidation.test.ts`                                      |
| 7 Peso y carga                   | ⏭ No hizo falta. A 10 Mb/s el panel de métricas responde en 1,5 s; la carga completa son 9,4 MB en 14,6 s                                                                                                                                                                                               | Medición con limitación de red                                 |

Verificación final: typecheck y lint limpios, **36 archivos de test, 1385 tests, 0 fallos**, build
de producción correcto.

Con esto las notas de la columna «Tras el plan» quedan confirmadas y la estimación es **≈ 93 %**.
Lo que no se pudo comprobar: Safari real (se probó WebKit de Playwright, no la aplicación Safari)
y un dispositivo móvil físico (se probó un viewport de 390 × 844). En ese viewport la app
funciona, pero los controles de la vista de superficie se solapan con las etiquetas de la escena.

### Fuera del plan (no dependen del código)

- **GitHub Actions bloqueado por facturación** en la cuenta: hasta resolverlo, CI y despliegue
  automático no corren y la publicación es manual desde `gh-pages`.
- **Chandrayaan‑4**: se añadirá al catálogo cuando ISRO publique el sitio.
- **Fusión a `main`** y nuevo despliegue: tras la fase 0.
- **Planificador de misión** (`docs/MISION.md`): es funcionalidad nueva más allá del reto; no
  entra en este porcentaje.

### Techo realista

Con este plan la estimación queda en 92–93 %. Lo que impide ir más allá con la rúbrica actual:
los seis sitios de referencia con horizonte esférico ideal (ítem 1), la ventana de misión máxima
de 60 días (ítems 3 y 7), y la «elipse» que es un círculo sin orientación ni ponderación
estadística (consideraciones técnicas). Son cambios de más alcance que no compensan su coste para
el reto.

---

## 10. Cierre de brechas hacia el 100 % y simulación (rama `feature/simulacion-y-cierre`)

El 100 % no es una cifra afirmable: la rúbrica es una estimación propia y quien puntúa es quien
hizo el trabajo. Lo que sí se puede afirmar es qué brechas de las secciones 7 y 9 quedan cerradas
con evidencia y cuáles no.

### Nuevo: simulación de aterrizaje y de rover

| Función             | Qué hace                                                                                                                                                                                                                                   | Evidencia                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descenso con física | Masa puntual con empuje, gravedad lunar y ecuación del cohete, guiado ZEM/ZEV hasta el contacto; tres módulos; telemetría de propelente y Δv; aviso de desvío a terreno seguro                                                             | `descentPhysics.ts` (23 tests), `descentPlan.ts` (5 tests). En Shackleton: 115 s, contacto a 1,0 m/s, 300 m/s de Δv simulado, 25 % de propelente restante                                                                                                                                                                                      |
| Recorrido del rover | Viaje de ida y vuelta: el rover va al hielo, recoge las muestras (3 × 2 h por defecto) y regresa al módulo antes del fin de la misión, con batería, potencia, temperatura, Sol/sombra permanente y enlace; la hora de misión avanza con él | `traverse.ts` (31 tests). En el borde de Shackleton (ruta de 1,4 km, 1 de marzo de 2027, 14 días), rover utilitario: 3 de 3 muestras, viaje completo en 13,1 h, margen de 322,9 h hasta el fin de la misión, batería mínima 47,1 %. El micro-rover de 40 kg solo completa 1 de 3 y fracasa (batería al 19,7 % sin poder recargar en la sombra) |

### Brechas

| Brecha (origen)                                           | Estado       | Evidencia                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sitios de referencia con horizonte esférico (§ 9 «Techo») | ✅ Cerrada   | Los 11 sitios fuera del polo usan LOLA global (tile de 60 m + campo lejano de 480 m). Apollo 15: 13,6° hacia Hadley Delta; Apollo 17: 14,2° hacia el macizo Norte; Apollo 11: 1,6°. Registro comprobado contra el DEM polar (rms 4 m)                                                                                                                       |
| Ventana de misión de 60 días                              | ✅ Cerrada   | Hasta 365 días con muestreo adaptativo; escenario de un año con DSN en 2,4 s                                                                                                                                                                                                                                                                                |
| «Elipse» que era un círculo                               | ✅ Cerrada   | Elipse 3σ orientada según la aproximación, ponderada por probabilidad; puntuación esperada y probabilidades                                                                                                                                                                                                                                                 |
| Móvil: controles solapados                                | ✅ Cerrada   | HUD sobre los rótulos 3D y plegable bajo 640 px; prueba e2e a 390 px                                                                                                                                                                                                                                                                                        |
| DSN fuera de dispersión y «mejor punto»                   | ✅ Cerrada   | `requireDsn` en ambos                                                                                                                                                                                                                                                                                                                                       |
| Animación de un día lunar / cuenta atrás visible          | ✅ Cerrada   | Botón «Día lunar»; cuenta atrás de ocaso y puesta de la Tierra en la escena                                                                                                                                                                                                                                                                                 |
| «Juego educativo» que sugiere el reto                     | ✅ Cerrada   | Modo Retos: cinco misiones con objetivos, pistas y puntuación (32 tests)                                                                                                                                                                                                                                                                                    |
| Sin pruebas de extremo a extremo                          | ✅ Cerrada   | Seis pruebas Playwright sobre el build, sin errores de consola                                                                                                                                                                                                                                                                                              |
| Catálogo incompleto                                       | 🟡 Parcial   | Añadidos Nobile Rim 2 e IM-3 (22 sitios) y etiquetadas las listas Artemis de 2022 y 2024, LUPEX, Griffin‑1 y Chang'e‑8 sobre los sitios existentes. **No añadidas**: Peak near Cabeus B, Mons Mouton Plateau, de Gerlache Rim 2 y Slater Plain, porque NASA solo publica un mapa y no encontré coordenadas citables; tampoco Blue Ghost M2 ni Chandrayaan‑4 |
| CI en GitHub                                              | 🟡 Bloqueada | Workflows listos (incluido el job e2e); GitHub Actions sigue bloqueado por facturación en la cuenta                                                                                                                                                                                                                                                         |

### Verificación

| Comprobación                                   | Resultado                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| typecheck (`strict`) y lint                    | limpios                                                                       |
| Tests unitarios                                | **45 archivos, 1586 tests, 0 fallos**                                         |
| Pruebas de extremo a extremo                   | **6 de 6** (Chrome, build de producción)                                      |
| `npm run validate` (22 sitios, 528 posiciones) | 1,5″ con DE441, 24″ con IAU, 0,0012° DSN                                      |
| Navegador                                      | Descenso, rover, retos, Apollo 15 y misión de 365 días revisados con capturas |

### Rúbrica recalculada

| Bloque                      | Peso   | § 9        | Ahora      | Por qué                                                                |
| --------------------------- | ------ | ---------- | ---------- | ---------------------------------------------------------------------- |
| 1 Selección de sitios       | 8,75 % | 93         | 96         | 22 sitios, todos con relieve real; faltan cuatro regiones Artemis 2024 |
| 2 Comparación               | 8,75 % | 95         | 96         | Sin cambios de fondo                                                   |
| 3 Fecha, días y estaciones  | 8,75 % | 90         | 97         | Hasta un año                                                           |
| 4 Sol y Tierra vs horizonte | 8,75 % | 95         | 98         | Cuenta atrás en la escena; horizonte real en todos los sitios          |
| 5 Energía y comunicaciones  | 8,75 % | 96         | 97         | Batería del rover en movimiento                                        |
| 6 Visualizaciones           | 8,75 % | 95         | 98         | Rover y descenso físico en 3D                                          |
| 7 Dinámica temporal         | 8,75 % | 90         | 97         | Día lunar, un año, descenso y recorrido animados                       |
| 8 Accesibilidad por niveles | 8,75 % | 93         | 97         | Retos; móvil                                                           |
| Consideraciones             | 20 %   | 90         | 96         | Elipse real, relieve global, e2e                                       |
| Recursos                    | 10 %   | 90         | 92         | LOLA global además del polar                                           |
| **Total**                   |        | **≈ 93 %** | **≈ 97 %** |                                                                        |

### Lo que impide decir 100 %

- Cuatro regiones Artemis de 2024 sin coordenadas publicadas, y misiones futuras sin sitio fijado.
- Modelos simplificados y declarados como tales: guiado sin dinámica de actitud ni errores de
  navegación; el frenado desde la órbita no se simula; rover sin hundimiento ni patinaje;
  trayectoria Tierra–Luna aún sin modelar (`docs/MISION.md`).
- En los sitios fuera del polo, la elipse y «Sugerir mejor punto» ven el relieve solo hasta
  ~30 km (el campo lejano no se publica); sin mapas de sombra permanente ni imagen NAC.
- Los datos publicados suben a 66 MB (2 MB por sitio de referencia).
- Sin probar en Safari real ni en un móvil físico; CI de GitHub sin ejecutar.
- La puntuación no es independiente.

---

## 11. Paso «Planificar» (rama `feature/planificar`)

El modo Planificador gana un paso inicial que invierte la pregunta: dado un punto con hielo y un
rango de fechas, entrega para cada día el mejor punto de aterrizaje que cumple todas las
restricciones (incluido que el rover llegue al hielo, recoja las muestras y vuelva al módulo antes
del fin de la misión con batería) y los cinco mejores días. Con los valores por defecto (rover
utilitario, 3 muestras de 2 h), el recorrido de referencia desde el borde de Shackleton (1 de marzo
de 2027, misión de 14 días) da 3 de 3 muestras, 13,1 h de viaje completo, 322,9 h de margen y
batería mínima del 47,1 %; el micro-rover solo completa 1 de 3 muestras y falla. Es la
fase de superficie de `docs/MISION.md`. Verificación: 1846 tests unitarios, 7 pruebas de extremo
a extremo (una recorre planificar → abrir en Órbita), y una ejecución real de 30 días en ~7 s.
No cambia la rúbrica del reto: refuerza los bloques de comparación rápida y de coordinación
ciencia–ingeniería.

---

## Anexo: criterio de puntuación

- **70 %**: media de los ítems 1–8 de la matriz (los objetivos que el reto enumera bajo
  _Objectives_, incluida la accesibilidad por niveles).
- **20 %**: _Potential Considerations_ en cuatro bloques de 5 %: enfoque técnico (90), experiencia
  de usuario (85), datos y precisión (85), compromiso e impacto (80).
- **10 %**: uso de los cuatro recursos de la pestaña _Resources_ (75).
- Cálculo: 0,70 × 86 + 0,20 × 85 + 0,10 × 75 = **84,7 ≈ 85 %**.
