# Planificación de misión como problema de optimización

Formulación del problema «aterrizar con éxito con el mínimo de recursos» para LUMEN 3D.
Documento de trabajo para revisar con el asesor antes de implementar el optimizador.

Estado: **propuesta v0.2** (14 de noviembre de 2026). Incorpora las respuestas del equipo a la
primera ronda de preguntas (§ 11). Las marcas ❓ señalan lo que sigue abierto.

---

## 1. Enunciado

Una misión tiene un **objetivo** y unas **restricciones**. Aquí el objetivo es científico: llegar
con un vehículo a un punto del polo sur lunar donde una misión previa detectó hielo. Las
restricciones vienen del vehículo (batería, pendiente tolerable, enlace con la Tierra) y de la
geometría Sol‑Tierra‑Luna.

> **Dada** una fecha deseada de lanzamiento desde la Tierra y un objetivo con hielo,
> **elegir** la trayectoria, la fecha de aterrizaje y el punto de aterrizaje
> **que cumplan la misión con el mínimo de recursos**.

LUMEN hoy evalúa un escenario (sitio + fecha) y permite compararlos a mano. Este documento define
el paso siguiente: que el sistema **busque** el escenario en lugar de que el usuario lo adivine.

---

## 2. Datos del problema (fijos, no se deciden)

| Símbolo                | Dato                                                                                                    | Fuente en LUMEN                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `T = (lat_T, lon_T)`   | Objetivo con hielo: un lugar **nuevo**, región de sombra permanente o punto con características propias | PSR del catálogo (Shackleton floor, Haworth, Cabeus) **o coordenadas introducidas** (`customSiteInfo`); si cae en una PSR, la celda PSR más cercana (`computeIceAccess`) |
| `R`                    | Radio de búsqueda del punto de aterrizaje alrededor de `T`                                              | Parámetro (500 m – 5 km); limitado por el tile LOLA de 20 m (±10 km)                                                                                                     |
| DEM, iluminación anual | Topografía 20 m y 480 m, sombra permanente                                                              | `public/data/terrain`, `public/data/dem`, `public/data/illum`; `src/astro/horizonFromDem.ts`, `illumination.ts`                                                          |
| Efemérides             | Posición de Sol y Tierra en el marco lunar, distancia Tierra‑Luna                                       | JPL Horizons DE441 2026–2030 (`src/astro/ephemTable.ts`, `bodyFixedEphemeris`)                                                                                           |
| `H`                    | Límites de hardware: pendiente máx., noche máx., DTE mín., pendiente del rover                          | `src/astro/hardware.ts` (`HardwareLimits`, `DEFAULT_LIMITS`)                                                                                                             |
| `E`                    | Perfil energético: tipo de panel, potencia pico, batería, consumos                                      | `src/config/energyProfiles.ts`, `src/astro/energy.ts`                                                                                                                    |
| `D`                    | Duración de la misión en superficie (días)                                                              | `MISSION_DAYS` en `useMissionStore.ts` (1–365, defecto 14)                                                                                                               |
| `N_luz`                | Días de **luz continua** requeridos desde el aterrizaje                                                 | Nuevo parámetro; defecto **15**                                                                                                                                          |
| `C = {c_i}`            | Clases de trayectoria Tierra → Luna                                                                     | Nueva tabla (§ 2.1)                                                                                                                                                      |
| `θ_enlace`             | Margen mínimo de la Tierra sobre el relieve para el enlace DTE                                          | `LINK_MARGIN` (0–10°, defecto 3°)                                                                                                                                        |
| `W_L`                  | **Ventanas de lanzamiento del proveedor** (lista de intervalos)                                         | Nuevo dato de entrada; la misión depende de ellas                                                                                                                        |
| `κ`                    | Coste de un día de espera en órbita (§ 2.2)                                                             | Nuevo parámetro                                                                                                                                                          |

### 2.1 Clases de trayectoria (modelo paramétrico)

LUMEN no calcula trayectorias. El viaje se modela con clases de referencia tomadas de misiones
reales. Valores aproximados, a validar:

| Clase `c`                  | Duración `τ(c)` | Δv aprox. TLI + inserción | Ventanas de lanzamiento                             | Ejemplos                    |
| -------------------------- | --------------- | ------------------------- | --------------------------------------------------- | --------------------------- |
| Directa                    | 3–5 días        | ≈ 3,1 + 0,8–0,9 km/s      | 1–2 por mes (geometría de fase y declinación lunar) | Apollo, Chang'e 3/4/5, IM‑1 |
| Alargada (órbitas de fase) | 15–30 días      | ≈ 3,1 + 0,7 km/s          | casi diaria                                         | Chandrayaan‑3, SLIM         |
| Baja energía (WSB / BLT)   | 90–120 días     | ≈ 3,1 + 0,4–0,5 km/s      | mensual, amplia                                     | CAPSTONE, Hakuto‑R M1       |

Cada clase se declara con `{ id, tauDays: [min, max], dvBaseKms, windowRule }`. El Δv de TLI
(≈ 3,1 km/s desde LEO) es común; la diferencia está en la inserción orbital y en el tiempo.

**Dependencia de la fecha**: la distancia Tierra‑Luna en el momento de la llegada `d_TL(t_O)`
varía entre ≈ 363 000 km (perigeo) y ≈ 405 000 km (apogeo). Llegar cerca del perigeo reduce la
velocidad relativa en la inserción. Se modela con un factor `k(d_TL) ∈ [0,95, 1,05]` lineal entre
ambos extremos, leyendo `d_TL` del DE441 (`norm(bodyFixedEphemeris(t).earth)`).

### 2.2 Coste de esperar en órbita

Esperar en órbita lunar hasta la fecha de aterrizaje consume recursos por dos vías:

| Vía                                                                          | Magnitud de referencia                                                                                                  | Fuente                                                                    |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Mantenimiento de órbita** (los _mascons_ desestabilizan las órbitas bajas) | 10–50 m/s por año en órbitas «congeladas» de 100–200 km → ≈ 0,03–0,14 m/s por día; 35–65 m/s por año a 30 km de altitud | Estudios de órbitas congeladas y constelaciones lunares (ver referencias) |
| **Evaporación de propelente criogénico** (_boil‑off_)                        | O₂ ≈ 1,2 % por mes, H₂ ≈ 4,3 % por mes (estimaciones NASA); con propelentes almacenables ≈ 0                            | Estudios de módulos de aterrizaje NASA/Langley                            |

Modelo propuesto: `Δv_espera = κ_sk · L + β · L` donde `L = t_A − t_O` en días, `κ_sk` es el
mantenimiento diario (defecto **0,1 m/s/día**, órbita de aparcamiento de 100 km) y `β` convierte el
_boil‑off_ en Δv equivalente (0 para almacenables; para criogénicos, `β ≈ Δv_descenso · b/30` con
`b` el % mensual). Referencias de misiones: Starship HLS prevé esperar hasta 100 días; un concepto
de los 90 esperaba la ventana en una órbita polar de 200 km.

❓ El valor exacto de `κ_sk` y `β` depende del vehículo. Hasta tener el dato, se usa el defecto y
se muestra siempre la espera en días para que el equipo juzgue.

### 2.3 Modos de comunicación

**Decidido**: el sistema contempla **todas** las opciones de comunicación y las evalúa en
combinación con las clases de trayectoria. El modo `m` es una variable de decisión (§ 3), no un
dato. Cada modo define cómo se calcula la cobertura y qué coste añade:

| Modo `m`                      | Cobertura `cov(m, p, t)`                                                                                           | Coste añadido                                                                                       | Ejemplos                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **DTE** (directo a la Tierra) | `DTE%(p, t)` de LUMEN: Tierra ≥ `θ_enlace` sobre el relieve y estación DSN visible                                 | Ninguno en Δv; multitrayecto y cortes de hasta 2 semanas (Anexo A)                                  | IM‑1, SLIM, Chandrayaan‑3 (con su orbitador como apoyo)              |
| **Relé de terceros**          | `relay%(p, t)` de la órbita del relé: fracción del tiempo en que el relé está ≥ `θ_relé` sobre el horizonte de `p` | Ninguno en Δv; coste económico y **dependencia** externa (disponibilidad, tarifas, compatibilidad)  | Queqiao‑2 (CNSA), Lunar Pathfinder / Moonlight (ESA), LunaNet (NASA) |
| **Relé propio**               | Igual que el anterior, con la órbita que se elija                                                                  | **Δv y masa**: el relé viaja con la misión y necesita su propia inserción; se suma `Δv_relé` a `f₃` | Chang'e‑4 + Queqiao, VIPER (previsto con relé comercial)             |
| **Híbrido** (DTE + relé)      | Unión de ventanas: `max(DTE, relay)` en cada instante                                                              | El del relé elegido; a cambio, la cobertura más alta y redundancia                                  | Artemis (DTE + Gateway/LunaNet), misiones CLPS con relé de respaldo  |

La cobertura del relé se modela de forma **paramétrica**, igual que las trayectorias: cada relé se
declara con `{ id, orbitKind, coveragePolarPct, minElDeg, dvKms (solo propio), external: bool }`.
Valores de referencia para un sitio polar sur:

| Órbita del relé                                | Cobertura típica del polo sur             | Nota                        |
| ---------------------------------------------- | ----------------------------------------- | --------------------------- |
| Elíptica congelada 12 h, apolunio sobre el sur | 70–90 %                                   | Queqiao‑2, Lunar Pathfinder |
| Halo L2 Tierra‑Luna                            | ≈ 100 % del lado oculto, polo sur parcial | Queqiao‑1                   |
| NRHO 6,5 días (Gateway)                        | ≈ 85–90 % del polo sur                    | Artemis                     |
| Constelación 3–4 satélites                     | ≈ 100 %                                   | Moonlight / LunaNet         |

❓ Los porcentajes son de orden de magnitud. Cuando se conozca la órbita del relé candidato, la
cobertura se puede calcular con las mismas rutinas de horizonte de LUMEN a partir de su efeméride.

---

## 3. Variables de decisión

| Variable         | Dominio                                                                        | Significado                          |
| ---------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| `t_L`            | `[t_L^min, t_L^max]` = fecha deseada ± holgura (defecto ± 30 días), paso 1 día | Fecha de lanzamiento desde la Tierra |
| `c`              | `C`                                                                            | Clase de trayectoria                 |
| `m`              | `M` = {DTE, relé de terceros, relé propio, híbrido} (§ 2.3)                    | Modo de comunicación                 |
| `t_A`            | `t_A ≥ t_O`, hasta `t_O + 60 días`, paso 1 día (refinable a 1 h)               | Fecha de aterrizaje                  |
| `p = (lat, lon)` | `dist(p, T) ≤ R`, rejilla de 40 m                                              | Punto de aterrizaje                  |

Variables derivadas:

- `t_O = t_L + τ(c)`: llegada a órbita lunar.
- `t_A − t_O`: **espera en órbita** (loiter). Puede ser cero.

Un candidato es la tupla `x = (t_L, c, m, t_A, p)`. Las combinaciones `(c, m)` son el núcleo de la
comparación: por ejemplo «directa + DTE» frente a «baja energía + relé de terceros» representan dos
filosofías de misión distintas, y el optimizador debe mostrarlas lado a lado.

---

## 4. Objetivos (vector a minimizar)

|      | Objetivo                          | Expresión                                                           | Cómo se calcula                                                                                                                                                                       |
| ---- | --------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f₁` | Tiempo total hasta el aterrizaje  | `t_A − t_L` = viaje + espera en órbita                              | Aritmética sobre `τ(c)` y `t_A`; se reporta desglosado                                                                                                                                |
| `f₂` | Distancia transitable al objetivo | `ruta(p → T)` en metros                                             | Dijkstra de 8 vecinos sobre el DEM de 20 m con límite de pendiente del rover (`computeIceAccess` en `src/astro/iceAccess.ts`). Si no hay ruta: distancia geodésica y marca «sin ruta» |
| `f₃` | Recurso propulsivo (Δv total)     | `Δv_base(c) · k(d_TL(t_O)) + Δv_espera(L) + Δv_relé(m)` en km/s     | Tabla de clases + distancia Tierra‑Luna del DE441 + coste de espera (§ 2.2) + Δv del relé propio si `m` lo incluye (0 en los demás modos)                                             |
| `f₄` | Dependencia externa (opcional)    | `0` si DTE o relé propio; `1` si relé de terceros; `0,5` si híbrido | Indicador ordinal; permite que el frente de Pareto separe «autónomo» de «dependiente». Se puede apagar y mostrar solo como atributo                                                   |

**Decidido**: `f₁` es el **tiempo total** `t_A − t_L`, porque los recursos son limitados y la
espera en órbita también los consume. Se muestra siempre desglosado en viaje `τ(c)` y espera `L`.

**Decidido**: el recurso se mide en **Δv** (§ Anexo A). `f₃` incluye el Δv del viaje y el de la
espera. ❓ Si el equipo cierra un presupuesto `Δv_max`, `f₃` pasa además a ser restricción.

Los tres objetivos están en unidades distintas (días, metros, km/s). Para el punto recomendado
(§ 6) se normalizan a `[0, 1]` dentro del conjunto viable: `f̂ᵢ = (fᵢ − min fᵢ) / (max fᵢ − min fᵢ)`.

---

## 5. Restricciones duras

Un candidato que viole cualquiera de estas se descarta antes de comparar objetivos. Cada una se
evalúa con código que ya existe en LUMEN, salvo g5.

| Id     | Restricción                                                                                                                                  | Expresión                                                                  | Cómo se evalúa                                                                                                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **g1** | Luz continua tras el aterrizaje (**requisito de la misión**, no derivado de la batería: menos días de luz desaprovecharían la investigación) | `luz_continua(p, t_A) ≥ N_luz`                                             | `evaluateSite` → serie `sunFrac` → `findWindows(≥ 0,5)` → `stateAt(t_A)`: si `on`, `nextChangeMs − t_A ≥ N_luz · 24 h` (`src/astro/series.ts`, `windows.ts`)                                                      |
| **g2** | Pendiente segura en `p`                                                                                                                      | `pendiente(p) < H.maxSlopeDeg` y ningún vecino 3×3 ≥ 15°                   | `src/astro/slope.ts`; mismo criterio que `computeOptimize` en `optimize.ts`                                                                                                                                       |
| **g3** | Comunicación suficiente en el modo `m`                                                                                                       | `cov(m, p, [t_A, t_A + D]) ≥ H.minCovPct` y corte más largo ≤ `maxOutageH` | DTE: `computeMetrics(...).dtePct` y `longestNoDteH`; relé: `relay%` paramétrico (§ 2.3); híbrido: unión de ventanas con `findWindows` sobre `max(earthFrac, relayVisible)`                                        |
| **g4** | Energía                                                                                                                                      | la batería no se agota en `[t_A, t_A + D]`                                 | `simulateBattery(series, E).depletedAtMs === null` (`src/astro/energy.ts`)                                                                                                                                        |
| **g5** | Ventana de lanzamiento                                                                                                                       | `t_L ∈ W_L`                                                                | **Decidido**: lista de intervalos del **proveedor de lanzamiento** (dato de entrada). Si no se ha cargado ninguna, se usa como respaldo una regla geométrica aproximada por clase y se marca «ventanas estimadas» |
| **g6** | Acceso al objetivo                                                                                                                           | existe ruta `p → T` con pendiente ≤ `H.roverMaxSlopeDeg`                   | `computeIceAccess(...).reachable`                                                                                                                                                                                 |
| **g7** | Cobertura de efemérides                                                                                                                      | `t_A + D` dentro de 2026–2030                                              | `tableCovers` (`ephemTable.ts`); fuera, se evalúa con el modelo IAU y se marca «precisión reducida»                                                                                                               |
| **g8** | Cobertura de terreno                                                                                                                         | `p` dentro de `R` y del tile LOLA 20 m                                     | `demCovers` (`src/astro/dem.ts`)                                                                                                                                                                                  |

Restricciones opcionales (parametrizables, apagadas por defecto):

- g9 Noche máxima en la ventana: `longestDarkH ≤ H.maxNightH` (ya existe en `classifySite`).
- g10 Temperatura: horas bajo −100 °C ≤ límite (`src/astro/thermal.ts`).
- g11 Estación DSN visible al menos X % del tiempo de DTE (`src/astro/dsn.ts`).

---

## 6. Salida del optimizador

1. **Conjunto viable** `F = { x : g1 … g8 se cumplen }`.
2. **Frente de Pareto** `P* ⊆ F`: candidatos no dominados. `x` domina a `y` si `fᵢ(x) ≤ fᵢ(y)` para
   todo `i` y `fⱼ(x) < fⱼ(y)` para algún `j`.
3. **Punto recomendado** `x* = argmin_{x ∈ P*} Σ wᵢ · f̂ᵢ(x)` con pesos por defecto
   `w = (0,4, 0,4, 0,2)` ajustables por el usuario. Los pesos **no cambian `P*`**; solo eligen qué
   punto destacar.
4. Para cada `x ∈ P*`: las métricas completas de LUMEN (`ScenarioMetrics`, batería, térmico, DSN,
   pendiente, ruta al hielo), para que el escenario pueda abrirse en Comparar con un clic.
5. **Diagnóstico si `F = ∅`**: conteo de candidatos descartados por cada restricción, para saber
   qué relajar (igual que `violations[]` en PlanningAI).

Representación visual propuesta: gráfico XY de `f₂` (distancia al hielo) frente a `f₁` (días hasta
aterrizar), con el color por `f₃` (Δv), la forma del marcador por combinación `(c, m)` y el punto
recomendado resaltado.

Además, una **matriz de combinaciones** trayectoria × comunicación con el mejor candidato de cada
celda (o «inviable» y la restricción que lo descarta), para que el equipo vea de un vistazo qué
filosofías de misión sobreviven:

|                  | DTE | Relé de terceros | Relé propio | Híbrido |
| ---------------- | --- | ---------------- | ----------- | ------- |
| **Directa**      | …   | …                | …           | …       |
| **Alargada**     | …   | …                | …           | …       |
| **Baja energía** | …   | …                | …           | …       |

Cada celda muestra `f₁ / f₂ / f₃` del mejor punto y un enlace para abrirlo en Comparar.

---

## 7. Espacio de búsqueda y separabilidad

Tamaño con los defectos:

| Variable | Valores                                                                                  |
| -------- | ---------------------------------------------------------------------------------------- |
| `t_L`    | 61 (± 30 días, diario)                                                                   |
| `c`      | 3                                                                                        |
| `m`      | 4 (o menos si el equipo descarta alguno)                                                 |
| `t_A`    | ≤ 60 por `(t_L, c)`                                                                      |
| `p`      | rejilla de 40 m dentro de `R = 2 km` ≈ 7 800 puntos; tras g2 y g8, típicamente 500–3 000 |

Producto bruto: ~10⁷–10⁸ tuplas. Parece mucho, pero el problema es **separable**:

- La iluminación, el enlace y la batería en `p` dependen solo de `(p, t_A)`, **no** de cómo se
  llegó. Se precalcula una vez por `p` la serie solar/terrestre de todo el rango de `t_A` (como
  hace `sweepLandingDates`) y se obtiene `luz_continua(p, t)` y `DTE%(p, t)` para todos los `t`.
- `f₂` y g6 dependen solo de `p`. Se calculan una vez por `p`.
- `f₁`, `f₃` y g5 dependen solo de `(t_L, c, m, t_A)`. Son aritmética.
- `m` solo cambia g3 y los sumandos `Δv_relé` y `f₄`: la cobertura DTE se calcula una vez por
  `(p, t_A)` y la del relé una vez por `t_A`; los cuatro modos se derivan de esas dos series sin
  recalcular nada. Multiplicar por `|M| = 4` no multiplica el coste.

Con eso, el cruce final es un bucle sobre `(t_L, c, t_A)` × `p` con operaciones O(1), que cabe en
segundos dentro del worker. La **enumeración exhaustiva es viable**, así que no hacen falta
metaheurísticas ni aprendizaje por refuerzo para este tamaño. Se dejan como extensión si `R` o
la holgura crecen mucho.

Modos propuestos (paralelos a PlanningAI):

| Modo     | Qué hace                                                                                  | Para qué                          |
| -------- | ----------------------------------------------------------------------------------------- | --------------------------------- |
| `fast`   | `t_A` diario, `p` en 17 puntos (centro + 2 anillos, como `dispersion.ts`), horizonte a 1° | Respuesta en < 2 s para explorar  |
| `exact`  | Rejilla completa de 40 m, `t_A` horario alrededor de los mejores días                     | Resultado final                   |
| `search` | Metaheurística sobre `(t_A, p)`                                                           | Solo si el espacio crece (futuro) |

---

## 8. Correspondencia con PlanningAI

PlanningAI (`/Users/jl/Developer/GMiningAI/PlanningAI`) resuelve planes mineros con un problema
congelado, un evaluador único y un ranking «factible primero». El mismo esqueleto sirve aquí:

| PlanningAI                                                                     | Misión lunar                                                                                                                                                                 |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlanningProblem` (dataclass congelada; `__post_init__` valida datos y rangos) | `MissionProblem { target, radiusM, launchRange, launchWindows, classes, commModes, relays, hardware, energy, missionDays, minSunDays, weights }` con validación al construir |
| `PROBLEM_PARAMETER_REGISTRY` (tipo, defecto, mín, máx, unidad, alias)          | Tabla de parámetros § 9, declarada en código como registro                                                                                                                   |
| Acción por periodo: ley de corte                                               | Tupla `(t_L, c, t_A, p)`; si se usa búsqueda en árbol, secuencia lanzamiento → clase → aterrizaje → punto                                                                    |
| `PlanEvaluator.evaluate` → `feasible`, `violations[]`                          | `evaluateMission(x)` → `{ feasible, violations: ('g1' … 'g8')[], objectives: {f1, f2, f3}, metrics }`                                                                        |
| Objetivo único: VAN descontado                                                 | Vector `(f₁, f₂, f₃)` con dominancia de Pareto                                                                                                                               |
| Ranking: factibles → mayor VAN → desempates                                    | Factibles → no dominados → punto recomendado por pesos                                                                                                                       |
| Modos `fast / auto / search / exact / learned`                                 | `fast / exact` (§ 7); `search` futuro                                                                                                                                        |
| `PlanResult` con `provenance` (hash de datos, parámetros, commit)              | `MissionPlan` con versión del DE441, tiles LOLA usados, parámetros y fecha de cálculo                                                                                        |
| Servidor MCP (`Create_Mine_Plan`, `Get_Planning_Result`)                       | Job `planMission` en el worker de LUMEN; opcionalmente endpoint MCP si se expone fuera de la app                                                                             |

Diferencia clave: PlanningAI tiene un objetivo escalar y penalizaciones blandas para guiar el
aprendizaje. Aquí los objetivos son tres y las restricciones son duras, así que la ordenación es
por dominancia, no por una sola cifra.

---

## 9. Parámetros

| Nombre                 | Tipo                       | Defecto                                  | Mín        | Máx        | Unidad | Descripción                               |
| ---------------------- | -------------------------- | ---------------------------------------- | ---------- | ---------- | ------ | ----------------------------------------- |
| `target`               | id de sitio o `{lat, lon}` | `shackleton-floor`                       | —          | —          | —      | PSR del catálogo o coordenadas nuevas     |
| `launchWindows`        | lista de intervalos        | vacía (→ regla estimada)                 | —          | —          | UTC    | Ventanas del proveedor de lanzamiento     |
| `loiterSkPerDay`       | número                     | 0,1                                      | 0          | 1          | m/s/d  | Mantenimiento de órbita por día de espera |
| `boilOffPctPerMonth`   | número                     | 0 (almacenables)                         | 0          | 10         | %/mes  | Evaporación de propelente criogénico      |
| `radiusM`              | número                     | 2 000                                    | 500        | 5 000      | m      | Radio de búsqueda del punto de aterrizaje |
| `launchDate`           | fecha                      | hoy + 90 d                               | 2026‑01‑01 | 2030‑12‑31 | UTC    | Fecha deseada de lanzamiento              |
| `launchSlackDays`      | entero                     | 30                                       | 0          | 180        | d      | Holgura ± alrededor de `launchDate`       |
| `classes`              | lista                      | las 3 de § 2.1                           | 1          | —          | —      | Clases de trayectoria admitidas           |
| `commModes`            | lista                      | los 4 de § 2.3                           | 1          | —          | —      | Modos de comunicación a evaluar           |
| `relays`               | lista                      | Queqiao‑2, Lunar Pathfinder (terceros)   | 0          | —          | —      | Relés disponibles con su cobertura y Δv   |
| `minCovPct`            | número                     | 30 (= `minDtePct` actual)                | 0          | 100        | %      | Cobertura mínima de comunicación          |
| `maxOutageH`           | número                     | 336 (14 días)                            | 1          | 720        | h      | Corte de comunicación más largo admisible |
| `maxLoiterDays`        | entero                     | 60                                       | 0          | 180        | d      | Espera máxima en órbita                   |
| `minSunDays` (`N_luz`) | número                     | 15                                       | 1          | 60         | d      | Luz continua mínima tras aterrizar        |
| `missionDays` (`D`)    | entero                     | 14                                       | 1          | 60         | d      | Duración en superficie                    |
| `hardware`             | objeto                     | `DEFAULT_LIMITS` (15°, 120 h, 30 %, 20°) | —          | —          | —      | Límites del vehículo                      |
| `energy`               | id de perfil               | `lander`                                 | —          | —          | —      | Perfil energético                         |
| `linkMarginDeg`        | número                     | 3                                        | 0          | 10         | °      | Margen DTE sobre el relieve               |
| `weights`              | `[w₁, w₂, w₃]`             | `[0,4, 0,4, 0,2]`                        | 0          | 1          | —      | Pesos para el punto recomendado (suman 1) |
| `mode`                 | enum                       | `fast`                                   | —          | —          | —      | `fast` o `exact`                          |

---

## 10. Supuestos y límites del modelo

- **Trayectoria paramétrica**: `τ` y Δv son valores de clase, no de una trayectoria calculada.
  Error esperado: ±1 día en tiempo, ±10 % en Δv. Las ventanas de lanzamiento (g5) son una regla
  geométrica aproximada, no un análisis de misión.
- **Sin perturbaciones ni maniobras intermedias**; sin inclinación ni fase de la órbita de
  aparcamiento. Un cambio de plano para un aterrizaje polar no se modela.
- **Enlace**: solo geometría (línea de vista con margen). Sin presupuesto de enlace ni relés.
- **Energía**: el modelo de batería de LUMEN, sin pérdidas térmicas ni degradación.
- **Horizonte y terreno**: las limitaciones ya documentadas en el README (LOLA 20 m solo en los
  tiles curados, 480 m en el campo lejano, snapping de coordenadas en las crestas).
- **Objetivo puntual**: `T` es un punto. Si el hielo es una región, se puede usar la celda PSR más
  cercana a `p` (ya lo hace `computeIceAccess`).

**Camino de mejora sin cambiar la formulación**: sustituir `f₃` y g5 por un módulo externo de
mecánica orbital (Lambert / cónicas empalmadas, estilo porkchop) que devuelva `τ` y Δv reales
para cada `(t_L, t_O)`. La interfaz `evaluateMission` no cambia; solo la función que da `τ` y Δv.

---

## 11. Decisiones tomadas y preguntas abiertas

### Decidido (primera ronda, 14 de noviembre de 2026)

| #   | Pregunta                                | Decisión                                                                                                                                                    |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ¿`f₁` total o solo viaje?               | **Total**: la espera en órbita consume recursos. Coste de la espera según § 2.2 con valores de referencia bibliográficos hasta tener los del vehículo       |
| 2   | ¿`N_luz` fijo o derivado de la batería? | **Requisito fijo de la misión**: 15 días para completar la investigación. Quedarse con menos sería desaprovechar la misión                                  |
| 3   | ¿`T` punto o región?                    | **Lugar nuevo**: región PSR o punto con características variables. Se admite id del catálogo o coordenadas                                                  |
| 4   | ¿En qué se miden los recursos?          | **Δv**                                                                                                                                                      |
| 5   | ¿Enlace directo o relé?                 | **Todos los modos** (DTE, relé de terceros, relé propio, híbrido) como variable de decisión, evaluados en combinación con las clases de trayectoria (§ 2.3) |
| 6   | ¿Qué clases de trayectoria?             | **Todas** las de § 2.1 se evalúan; el equipo restringe la lista cuando conozca el vehículo                                                                  |
| 7   | ¿Ventanas del proveedor?                | **Sí**: la misión depende de ellas. Son dato de entrada; la regla geométrica es solo respaldo                                                               |

### Sigue abierto ❓

- **Pesos** `w` por defecto entre tiempo total, distancia al hielo y Δv. Mientras no se fijen,
  `(0,4, 0,4, 0,2)` y la frontera completa a la vista.
- **Presupuesto de Δv** cerrado del vehículo: si existe, `f₃` pasa también a restricción.
- **Clases de trayectoria realistas** para este vehículo y tipo de propelente (almacenable o
  criogénico), que fija `β` en § 2.2.
- **Relés concretos** a cargar en `relays`: cuáles estarán operativos en la fecha de la misión, su
  órbita y, si son de terceros, condiciones de acceso.
- **Valores de `κ_sk` y `β`** del vehículo real.

---

## 12. Estado de la implementación

**Implementada la fase de superficie** (paso «Planificar», `src/astro/planner.ts`): variables `t_A`
(día de aterrizaje dentro de un rango) y `p` (punto alrededor del objetivo con hielo), restricciones
g1 (luz continua), g2 (pendiente), g3 (enlace), g6 (ruta y, además, que el rover llegue con una
batería mínima) y g8 (cobertura de terreno), y objetivo = puntuación de misión con filtro de
viabilidad. Salida: mejor punto por día, diagnóstico cuando no hay solución y los 5 mejores días.

**Pendiente**: fecha de lanzamiento, clase de trayectoria, espera en órbita, Δv como objetivo,
modos de comunicación con relé y el frente de Pareto (hoy se ordena por una sola puntuación).

Con datos reales (hielo junto al borde de Shackleton, marzo de 2027, misión de 14 días): con 15
días de luz continua exigidos hay solución 3 de 30 días; con 10, 10 de 30; con 5, 14 de 30. En el
verano polar (noviembre) la exigencia no restringe.

### Plan original de implementación

| Pieza                                                           | Dónde                                                      | Reutiliza                                                                                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `MissionProblem`, `evaluateMission`, `paretoFront`, `recommend` | `src/astro/mission.ts` (nuevo)                             | `evaluateSite`, `findWindows`, `stateAt`, `computeMetrics`, `simulateBattery`, `computeIceAccess`, criterio de pendiente de `optimize.ts` |
| Clases de trayectoria y ventanas                                | `src/config/trajectories.ts` (nuevo)                       | `bodyFixedEphemeris` para `d_TL` y fase                                                                                                   |
| Job `planMission`                                               | `src/workers/protocol.ts`, `handlers.ts`, `astroClient.ts` | Patrón de `optimize`                                                                                                                      |
| Hook `usePlanMission`                                           | `src/hooks/useScience.ts`                                  | Patrón de `useOptimize` con `useAsync`                                                                                                    |
| UI «Planificar misión»                                          | `src/ui/MissionPlanner.tsx` (nuevo)                        | Gráfico XY estilo `DateSweep`; «Abrir en Comparar» vía `setScenarios`                                                                     |
| Tests                                                           | `src/astro/mission.test.ts`                                | Casos sintéticos: g1 corta por noche, dominancia, `F = ∅` con diagnóstico                                                                 |

Orden sugerido: primero `mission.ts` con tests y un CLI de prueba en `scripts/`, después el
worker, por último la UI.

---

## Anexo A. Conceptos

### Δv (delta‑v): la moneda de los recursos

El Δv es el **cambio total de velocidad** que el vehículo debe producir con sus motores a lo largo
de la misión. Se mide en km/s y es la forma estándar de contar el «combustible» porque no depende
del motor: la ecuación del cohete lo convierte en masa de propelente,
`m_prop = m_final · (e^{Δv / (I_sp · g₀)} − 1)`. Cada maniobra suma: inyección translunar desde
órbita baja terrestre (≈ 3,1 km/s), inserción en órbita lunar (0,4–0,9 km/s según la clase de
trayectoria), mantenimiento de la órbita mientras se espera, y descenso y aterrizaje
(≈ 1,9–2,1 km/s desde 100 km). Cuanto menor sea el Δv total, más carga útil o más margen. Por eso
«mínimo de recursos» se traduce en «mínimo Δv» y, con propelente criogénico, también en «mínimo
tiempo», porque el propelente se evapora.

### El enlace directo con la Tierra desde el polo sur

Desde el polo sur la Tierra **nunca sube mucho**: oscila entre unos +7° y −7° sobre el horizonte
por la libración de la Luna, así que la mitad del tiempo (unas dos semanas al mes) está oculta
tras el limbo lunar. En la práctica el relieve recorta aún más: una cresta de 2° en la dirección
de la Tierra puede eliminar días de enlace. Las dificultades concretas:

1. **Elevación baja**: las antenas apuntan a 2–10° sobre el horizonte. Parte de la señal rebota en
   el regolito y llega desfasada (**multitrayecto**), con desvanecimientos que pueden superar
   20 dB. Por eso LUMEN exige un margen `θ_enlace` (3° por defecto) sobre el relieve, y no solo
   línea de vista.
2. **Interrupciones largas**: no son cortes de minutos sino de días o semanas. El vehículo debe
   almacenar datos y sobrevivir sin comandos.
3. **Estaciones en Tierra**: hace falta que una antena de la red de espacio profundo (Goldstone,
   Madrid, Canberra) vea la Luna en ese momento. LUMEN ya lo calcula (`src/astro/dsn.ts`).
4. **Alternativa**: un satélite relé en órbita lunar (como el que usan las misiones chinas al lado
   oculto). Elimina g3 pero añade coste y dependencia de otro sistema.

### Clases de trayectoria Tierra → Luna

| Clase                              | Cómo funciona                                                                                                                                                      | Tiempo                  | Δv de inserción                               | Cuándo conviene                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| **Directa**                        | Un solo encendido de inyección y un viaje tipo Hohmann; inserción con un gran frenado                                                                              | 2–5 días (óptimo ≈ 4,5) | el mayor (≈ 0,8–0,9 km/s)                     | Carga sensible al tiempo, propelente criogénico, tripulación                     |
| **Alargada (órbitas de fase)**     | La inyección o la inserción se reparten en varios encendidos menores en órbitas intermedias; reduce pérdidas por gravedad y **amplía las ventanas de lanzamiento** | 2–10 semanas            | algo menor (≈ 0,7 km/s)                       | Lanzadores pequeños, flexibilidad de fecha, vehículos con motores de bajo empuje |
| **Baja energía (WSB / balística)** | Se sale más allá de la Luna hasta donde la gravedad del Sol dobla la trayectoria y la Luna «captura» al vehículo casi sin frenar                                   | 3–4 meses               | el menor (ahorra 100–150 m/s, ≈ 0,4–0,5 km/s) | Masa muy limitada, sin prisa, propelente almacenable                             |

La elección de clase es el primer gran trade‑off tiempo ↔ Δv de la misión, y por eso es una
variable de decisión y no un dato.

### Lo que LUMEN ya calcula del descenso y del rover

Desde la versión con simulación (`src/astro/descentPhysics.ts`, `traverse.ts`) dos de los datos
de este documento dejan de ser supuestos y pasan a calcularse por sitio:

- **Δv de la aproximación final**: ~300 m/s desde 3,5 km de altura y 170 m/s (módulo tipo CLPS,
  guiado ZEM/ZEV), más ~24 m/s si hay desvío de 300 m a terreno seguro. Sumado al frenado desde
  una órbita de 100 km (~1 700 m/s, no simulado) da el ≈ 2 000 m/s de descenso usado en `f₃`.
- **`f₂` con energía**: la distancia transitable al objetivo se acompaña del resultado del
  recorrido (si el rover llega, batería mínima, horas en sombra, enlace). La restricción g6 puede
  endurecerse a «llega con batería ≥ X %».

### Referencias

- Órbitas congeladas y mantenimiento: [Frozen orbit (Wikipedia)](https://en.wikipedia.org/wiki/Frozen_orbit); [Exploring the Design Space of Lunar GNSS in Frozen Orbit Conditions](https://arxiv.org/pdf/2010.08706); [Analysis on Delta‑Vs to Maintain Extremely Low Altitude on the Moon](https://www.researchgate.net/publication/335832756_Analysis_on_Delta-Vs_to_Maintain_Extremely_Low_Altitude_on_the_Moon_and_Its_Application_to_CubeSat_Mission).
- Espera en órbita y _boil‑off_: [Starship HLS (Wikipedia)](https://en.wikipedia.org/wiki/Starship_HLS); [NASA NTRS 20050205845](https://ntrs.nasa.gov/api/citations/20050205845/downloads/20050205845.pdf); [NASA NTRS 20070016643](https://ntrs.nasa.gov/api/citations/20070016643/downloads/20070016643.pdf).
- Enlace directo desde el polo sur: [Mitigating Fading in Cislunar Communications (JPL)](https://openpolar.no/Record/ftnasajpl:oai:trs.jpl.nasa.gov:2014%2F52271); [Coded Communications over Fading Channels, Lunar South Pole (JPL)](https://openpolar.no/Record/ftnasajpl:oai:trs.jpl.nasa.gov:2014%2F56086); [VIPER lunar operations (NASA)](https://science.nasa.gov/mission/viper/lunar-operations/); [IPN Progress Report 42‑243A](https://ipnpr.jpl.nasa.gov/progress_report/42-243/42-243A.pdf).
- Clases de trayectoria: [A Comparison of Lunar Landing Trajectory Strategies (AGI)](https://www.agi.com/getmedia/b3f1c131-cfb3-4183-aba9-860fbcd89be6/A-Comparison-of-Lunar-landing-Trajectory-Strategies-Using-Numerical-Simulations.pdf?ext=.pdf); [ISSFD 2024 18‑1](https://issfd.org/ISSFD_2024/ISSFD2024_18-1.pdf); [Weak Stability Boundary transfer (glosario)](https://www.cislunarspace.cn/en/glossary/orbits/weak-stability-boundary-transfer-trajectory/).
