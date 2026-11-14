# Planificación de misión como problema de optimización

Formulación del problema «aterrizar con éxito con el mínimo de recursos» para LUMEN 3D.
Documento de trabajo para revisar con el asesor antes de implementar el optimizador.

Estado: **propuesta v0.1** (14 de noviembre de 2026). Las secciones marcadas con ❓ son decisiones
abiertas.

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

| Símbolo                | Dato                                                                           | Fuente en LUMEN                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `T = (lat_T, lon_T)`   | Objetivo con hielo                                                             | PSR del catálogo: Shackleton floor, Haworth, Cabeus (`src/config/sites.ts`); mapas de sombra permanente `public/data/illum/` |
| `R`                    | Radio de búsqueda del punto de aterrizaje alrededor de `T`                     | Parámetro (500 m – 5 km); limitado por el tile LOLA de 20 m (±10 km)                                                         |
| DEM, iluminación anual | Topografía 20 m y 480 m, sombra permanente                                     | `public/data/terrain`, `public/data/dem`, `public/data/illum`; `src/astro/horizonFromDem.ts`, `illumination.ts`              |
| Efemérides             | Posición de Sol y Tierra en el marco lunar, distancia Tierra‑Luna              | JPL Horizons DE441 2026–2030 (`src/astro/ephemTable.ts`, `bodyFixedEphemeris`)                                               |
| `H`                    | Límites de hardware: pendiente máx., noche máx., DTE mín., pendiente del rover | `src/astro/hardware.ts` (`HardwareLimits`, `DEFAULT_LIMITS`)                                                                 |
| `E`                    | Perfil energético: tipo de panel, potencia pico, batería, consumos             | `src/config/energyProfiles.ts`, `src/astro/energy.ts`                                                                        |
| `D`                    | Duración de la misión en superficie (días)                                     | `MISSION_DAYS` en `useMissionStore.ts` (1–60, defecto 14)                                                                    |
| `N_luz`                | Días de **luz continua** requeridos desde el aterrizaje                        | Nuevo parámetro; defecto **15**                                                                                              |
| `C = {c_i}`            | Clases de trayectoria Tierra → Luna                                            | Nueva tabla (§ 2.1)                                                                                                          |
| `θ_enlace`             | Margen mínimo de la Tierra sobre el relieve para el enlace DTE                 | `LINK_MARGIN` (0–10°, defecto 3°)                                                                                            |

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

---

## 3. Variables de decisión

| Variable         | Dominio                                                                        | Significado                          |
| ---------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| `t_L`            | `[t_L^min, t_L^max]` = fecha deseada ± holgura (defecto ± 30 días), paso 1 día | Fecha de lanzamiento desde la Tierra |
| `c`              | `C`                                                                            | Clase de trayectoria                 |
| `t_A`            | `t_A ≥ t_O`, hasta `t_O + 60 días`, paso 1 día (refinable a 1 h)               | Fecha de aterrizaje                  |
| `p = (lat, lon)` | `dist(p, T) ≤ R`, rejilla de 40 m                                              | Punto de aterrizaje                  |

Variables derivadas:

- `t_O = t_L + τ(c)`: llegada a órbita lunar.
- `t_A − t_O`: **espera en órbita** (loiter). Puede ser cero.

Un candidato es la tupla `x = (t_L, c, t_A, p)`.

---

## 4. Objetivos (vector a minimizar)

|      | Objetivo                          | Expresión                              | Cómo se calcula                                                                                                                                                                       |
| ---- | --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f₁` | Tiempo total hasta el aterrizaje  | `t_A − t_L` = viaje + espera en órbita | Aritmética sobre `τ(c)` y `t_A`; se reporta desglosado                                                                                                                                |
| `f₂` | Distancia transitable al objetivo | `ruta(p → T)` en metros                | Dijkstra de 8 vecinos sobre el DEM de 20 m con límite de pendiente del rover (`computeIceAccess` en `src/astro/iceAccess.ts`). Si no hay ruta: distancia geodésica y marca «sin ruta» |
| `f₃` | Recurso propulsivo                | `Δv_base(c) · k(d_TL(t_O))` en km/s    | Tabla de clases + distancia Tierra‑Luna del DE441                                                                                                                                     |

❓ **Sobre `f₁`**: la formulación original dice «minimizar el tiempo para estar en órbita». Con la
fecha de lanzamiento fijada, ese tiempo es `τ(c)` y solo toma tres valores. La variable que de
verdad se decide es la espera en órbita `t_A − t_O`, que también consume recursos (propelente de
mantenimiento, exposición térmica, operaciones). Se propone usar el **total** `t_A − t_L` como `f₁`
y mostrar siempre ambos componentes. Alternativa: `f₁ = τ(c)` y la espera como restricción
`t_A − t_O ≤ L_max`.

❓ **Sobre `f₃`**: si el equipo ya tiene un presupuesto de Δv fijo por clase, `f₃` puede pasar a
ser una restricción `Δv ≤ Δv_max` y quedar fuera del vector.

Los tres objetivos están en unidades distintas (días, metros, km/s). Para el punto recomendado
(§ 6) se normalizan a `[0, 1]` dentro del conjunto viable: `f̂ᵢ = (fᵢ − min fᵢ) / (max fᵢ − min fᵢ)`.

---

## 5. Restricciones duras

Un candidato que viole cualquiera de estas se descarta antes de comparar objetivos. Cada una se
evalúa con código que ya existe en LUMEN, salvo g5.

| Id     | Restricción                     | Expresión                                                     | Cómo se evalúa                                                                                                                                                                                                                            |
| ------ | ------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **g1** | Luz continua tras el aterrizaje | `luz_continua(p, t_A) ≥ N_luz`                                | `evaluateSite` → serie `sunFrac` → `findWindows(≥ 0,5)` → `stateAt(t_A)`: si `on`, `nextChangeMs − t_A ≥ N_luz · 24 h` (`src/astro/series.ts`, `windows.ts`)                                                                              |
| **g2** | Pendiente segura en `p`         | `pendiente(p) < H.maxSlopeDeg` y ningún vecino 3×3 ≥ 15°      | `src/astro/slope.ts`; mismo criterio que `computeOptimize` en `optimize.ts`                                                                                                                                                               |
| **g3** | Enlace directo con la Tierra    | `DTE%(p, [t_A, t_A + D]) ≥ H.minDtePct` con margen `θ_enlace` | `computeMetrics(...).dtePct` (`src/astro/metrics.ts`)                                                                                                                                                                                     |
| **g4** | Energía                         | la batería no se agota en `[t_A, t_A + D]`                    | `simulateBattery(series, E).depletedAtMs === null` (`src/astro/energy.ts`)                                                                                                                                                                |
| **g5** | Ventana de lanzamiento          | `t_L ∈ ventanas(c)`                                           | **Nuevo**: regla aproximada por clase. Directa: fase lunar en `t_O` tal que la Luna esté a ≤ 30° del nodo adecuado para inclinación polar; alargada y baja energía: siempre abierta. Se puede sustituir por una tabla externa de ventanas |
| **g6** | Acceso al objetivo              | existe ruta `p → T` con pendiente ≤ `H.roverMaxSlopeDeg`      | `computeIceAccess(...).reachable`                                                                                                                                                                                                         |
| **g7** | Cobertura de efemérides         | `t_A + D` dentro de 2026–2030                                 | `tableCovers` (`ephemTable.ts`); fuera, se evalúa con el modelo IAU y se marca «precisión reducida»                                                                                                                                       |
| **g8** | Cobertura de terreno            | `p` dentro de `R` y del tile LOLA 20 m                        | `demCovers` (`src/astro/dem.ts`)                                                                                                                                                                                                          |

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
aterrizar), con el color por `f₃` (Δv) y el punto recomendado resaltado. Con tres objetivos, dos
ejes y color bastan.

---

## 7. Espacio de búsqueda y separabilidad

Tamaño con los defectos:

| Variable | Valores                                                                                  |
| -------- | ---------------------------------------------------------------------------------------- |
| `t_L`    | 61 (± 30 días, diario)                                                                   |
| `c`      | 3                                                                                        |
| `t_A`    | ≤ 60 por `(t_L, c)`                                                                      |
| `p`      | rejilla de 40 m dentro de `R = 2 km` ≈ 7 800 puntos; tras g2 y g8, típicamente 500–3 000 |

Producto bruto: ~10⁷–10⁸ tuplas. Parece mucho, pero el problema es **separable**:

- La iluminación, el enlace y la batería en `p` dependen solo de `(p, t_A)`, **no** de cómo se
  llegó. Se precalcula una vez por `p` la serie solar/terrestre de todo el rango de `t_A` (como
  hace `sweepLandingDates`) y se obtiene `luz_continua(p, t)` y `DTE%(p, t)` para todos los `t`.
- `f₂` y g6 dependen solo de `p`. Se calculan una vez por `p`.
- `f₁`, `f₃` y g5 dependen solo de `(t_L, c, t_A)`. Son aritmética.

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

| PlanningAI                                                                     | Misión lunar                                                                                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PlanningProblem` (dataclass congelada; `__post_init__` valida datos y rangos) | `MissionProblem { target, radiusM, launchRange, classes, hardware, energy, missionDays, minSunDays, weights }` con validación al construir |
| `PROBLEM_PARAMETER_REGISTRY` (tipo, defecto, mín, máx, unidad, alias)          | Tabla de parámetros § 9, declarada en código como registro                                                                                 |
| Acción por periodo: ley de corte                                               | Tupla `(t_L, c, t_A, p)`; si se usa búsqueda en árbol, secuencia lanzamiento → clase → aterrizaje → punto                                  |
| `PlanEvaluator.evaluate` → `feasible`, `violations[]`                          | `evaluateMission(x)` → `{ feasible, violations: ('g1' … 'g8')[], objectives: {f1, f2, f3}, metrics }`                                      |
| Objetivo único: VAN descontado                                                 | Vector `(f₁, f₂, f₃)` con dominancia de Pareto                                                                                             |
| Ranking: factibles → mayor VAN → desempates                                    | Factibles → no dominados → punto recomendado por pesos                                                                                     |
| Modos `fast / auto / search / exact / learned`                                 | `fast / exact` (§ 7); `search` futuro                                                                                                      |
| `PlanResult` con `provenance` (hash de datos, parámetros, commit)              | `MissionPlan` con versión del DE441, tiles LOLA usados, parámetros y fecha de cálculo                                                      |
| Servidor MCP (`Create_Mine_Plan`, `Get_Planning_Result`)                       | Job `planMission` en el worker de LUMEN; opcionalmente endpoint MCP si se expone fuera de la app                                           |

Diferencia clave: PlanningAI tiene un objetivo escalar y penalizaciones blandas para guiar el
aprendizaje. Aquí los objetivos son tres y las restricciones son duras, así que la ordenación es
por dominancia, no por una sola cifra.

---

## 9. Parámetros

| Nombre                 | Tipo           | Defecto                                  | Mín        | Máx        | Unidad | Descripción                               |
| ---------------------- | -------------- | ---------------------------------------- | ---------- | ---------- | ------ | ----------------------------------------- |
| `target`               | id de sitio    | `shackleton-floor`                       | —          | —          | —      | PSR objetivo del catálogo                 |
| `radiusM`              | número         | 2 000                                    | 500        | 5 000      | m      | Radio de búsqueda del punto de aterrizaje |
| `launchDate`           | fecha          | hoy + 90 d                               | 2026‑01‑01 | 2030‑12‑31 | UTC    | Fecha deseada de lanzamiento              |
| `launchSlackDays`      | entero         | 30                                       | 0          | 180        | d      | Holgura ± alrededor de `launchDate`       |
| `classes`              | lista          | las 3 de § 2.1                           | 1          | —          | —      | Clases de trayectoria admitidas           |
| `maxLoiterDays`        | entero         | 60                                       | 0          | 180        | d      | Espera máxima en órbita                   |
| `minSunDays` (`N_luz`) | número         | 15                                       | 1          | 60         | d      | Luz continua mínima tras aterrizar        |
| `missionDays` (`D`)    | entero         | 14                                       | 1          | 60         | d      | Duración en superficie                    |
| `hardware`             | objeto         | `DEFAULT_LIMITS` (15°, 120 h, 30 %, 20°) | —          | —          | —      | Límites del vehículo                      |
| `energy`               | id de perfil   | `lander`                                 | —          | —          | —      | Perfil energético                         |
| `linkMarginDeg`        | número         | 3                                        | 0          | 10         | °      | Margen DTE sobre el relieve               |
| `weights`              | `[w₁, w₂, w₃]` | `[0,4, 0,4, 0,2]`                        | 0          | 1          | —      | Pesos para el punto recomendado (suman 1) |
| `mode`                 | enum           | `fast`                                   | —          | —          | —      | `fast` o `exact`                          |

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

## 11. Preguntas abiertas para el asesor

1. **`f₁`**: ¿tiempo total hasta aterrizar, o solo el viaje con la espera en órbita como
   restricción? ¿Cuánto cuesta un día en órbita frente a un día de viaje?
2. **`N_luz` = 15 días**: ¿es un requisito fijo de la misión o deriva del vehículo (batería `E` y
   duración `D`)? Si deriva, g1 podría sustituirse por g4 con un margen.
3. **Objetivo `T`**: ¿punto exacto de una detección previa o región PSR? ¿Qué distancia de rover es
   aceptable (hoy `ICE_RADIUS_M` = 2 km)?
4. **Recursos**: ¿qué pesa más, Δv, tiempo o distancia del rover? Define los pesos por defecto y
   si `f₃` es objetivo o restricción.
5. **Comunicaciones**: ¿solo enlace directo con la Tierra o también relé orbital? Con relé, g3
   cambia de forma.
6. **Clases de trayectoria**: ¿cuáles considera realistas para este vehículo? ¿Existe un
   presupuesto de Δv ya cerrado?
7. **Ventanas de lanzamiento**: ¿las da el proveedor de lanzamiento como fechas concretas? Si es
   así, g5 pasa a ser una lista y no una regla.

---

## 12. Implementación prevista (fuera de esta iteración)

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
