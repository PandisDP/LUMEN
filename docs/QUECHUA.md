# Quechua en Killa Landing

Killa Landing está en español, inglés y **quechua** (_runasimi_). Este documento explica qué se
tradujo, con qué criterios, y qué debe revisar una persona quechuahablante.

> **Estado: en revisión.** La traducción la escribió un modelo de lenguaje, no un hablante nativo.
> Puede tener errores de gramática, de registro o de elección de palabras. Las listas de abajo
> señalan los puntos menos seguros. Las correcciones se hacen en `src/i18n/qu/`.

## Criterios

- **Variedad**: quechua sureño, Cusco-Collao, con la ortografía oficial de tres vocales (a, i, u).
- **Alcance**: 750 de los 949 textos de la interfaz (79 %). Lo que no está traducido se muestra en
  español: explicaciones largas de ingeniería, glosario técnico, fuentes de datos y nombres
  propios. Los nombres y descripciones de los sitios lunares también quedan en español.
- **Términos técnicos**: los que no tienen palabra quechua asentada son préstamos del español con
  sufijos quechuas (rover, batería, módulo, órbita, puntuación). No se acuñaron palabras nuevas.
- **Números**: el sustantivo queda en singular tras un número («3 muestra», «{n} p'unchaw»).
- **Fechas y cifras**: con el formato de Perú (`es-PE`).

## Cómo activarlo

Botón **QU** de la barra superior, o la dirección con `?lang=qu`. Un navegador configurado en
quechua lo abre directamente.

## Dónde está cada texto

| Archivo                | Contenido                                                                     |
| ---------------------- | ----------------------------------------------------------------------------- |
| `src/i18n/qu/core.ts`  | Barra, modos, paneles, recorrido guiado, tiempo, métricas, selector de sitios |
| `src/i18n/qu/scene.ts` | Bienvenida, controles de la escena, aterrizaje, rover, pestañas               |
| `src/i18n/qu/flow.ts`  | Planificador, pasos, retos, asistente, Killa, avisos                          |

Las claves son las mismas que en `src/i18n/es.ts`. Una prueba automática comprueba que cada
clave exista en español y que los `{parámetros}` coincidan.

## Glosario base

| Español                           | Quechua                                   |
| --------------------------------- | ----------------------------------------- |
| Luna                              | Killa                                     |
| Sol                               | Inti                                      |
| Tierra (planeta)                  | Tiqsimuyu                                 |
| estrella                          | ch'aska                                   |
| cielo                             | hanaq pacha                               |
| polo sur                          | uray polo (loan "polo")                   |
| hielo                             | chullunku                                 |
| agua                              | unu                                       |
| sombra                            | llanthu                                   |
| sombra permanente                 | wiñay llanthu                             |
| luz                               | k'anchay                                  |
| iluminado / con Sol               | k'anchasqa / Intiyuq                      |
| sin Sol                           | mana Intiyuq                              |
| día                               | p'unchaw                                  |
| noche                             | tuta                                      |
| hora                              | hora (loan)                               |
| tiempo                            | pacha                                     |
| fecha                             | p'unchaw / fecha (loan) when ambiguous    |
| hoy / ahora                       | kunan                                     |
| lugar, sitio                      | k'iti                                     |
| punto                             | chiqan                                    |
| camino, ruta                      | ñan                                       |
| ida y vuelta                      | riy-kutiy                                 |
| lejos / cerca                     | karu / kaylla                             |
| subida, pendiente                 | wichay / q'ata                            |
| terreno, suelo                    | allpa                                     |
| montaña / cráter                  | urqu / cráter (loan)                      |
| horizonte                         | horizonte (loan)                          |
| aterrizar, bajar                  | uraykuy                                   |
| aterrizaje                        | uraykuy                                   |
| lugar de aterrizaje               | uraykuna k'iti                            |
| volver                            | kutimuy                                   |
| ir                                | riy                                       |
| llegar                            | chayay                                    |
| salir                             | lluqsiy                                   |
| esperar                           | suyay                                     |
| empezar                           | qallariy                                  |
| terminar                          | tukuy                                     |
| siguiente                         | qatiq                                     |
| anterior / volver atrás           | ñawpaq / kutiy                            |
| elegir                            | akllay                                    |
| mirar, ver                        | qhaway                                    |
| mostrar                           | rikuchiy                                  |
| ocultar                           | pakay                                     |
| buscar                            | maskay                                    |
| comparar                          | tupachiy                                  |
| decidir (paso «Decidir»)          | tukuchay                                  |
| planificar                        | wakichiy                                  |
| plan                              | wakichiy / plan (loan)                    |
| misión                            | misión (loan)                             |
| órbita                            | órbita (loan)                             |
| superficie                        | pampa                                     |
| rover                             | rover (loan)                              |
| módulo (lander)                   | módulo (loan)                             |
| batería                           | batería (loan)                            |
| energía                           | kallpa                                    |
| enlace con la Tierra              | Tiqsimuyuwan rimay ("talking with Earth") |
| sin enlace                        | mana rimayniyuq                           |
| muestra(s)                        | muestra (loan; plural muestrakuna)        |
| recoger                           | pallay                                    |
| trabajar                          | llamk'ay                                  |
| calcular / calculando…            | yupay / yupachkan…                        |
| cargando…                         | Suyaykuy…                                 |
| sí / no                           | arí / mana                                |
| bueno, viable                     | allin                                     |
| al límite                         | pisillaña ("just barely")                 |
| malo, no sirve                    | mana allin                                |
| error                             | pantay                                    |
| reintentar                        | wakmanta ruway                            |
| ayuda                             | yanapay                                   |
| guía                              | pusaq                                     |
| más / menos                       | aswan / pisi                              |
| todo(s)                           | llapan                                    |
| primero / mejor                   | ñawpaq / aswan allin                      |
| reto                              | sasachakuy                                |
| ganar, lograr                     | atipay                                    |
| ¿quién eres?                      | ¿Pitaq kanki?                             |
| planificador / educador / público | wakichiq / yachachiq / llapan runa        |
| idioma                            | simi                                      |
| tema claro / oscuro               | k'anchay / tutayaq                        |
| cerrar / abrir                    | wichq'ay / kichay                         |
| guardar / exportar                | waqaychay / hurquy                        |
| reproducir / pausa                | purichiy / sayachiy                       |
| reiniciar                         | wakmanta qallariy                         |
| velocidad                         | utqay                                     |
| cámara / vista                    | qhawana                                   |
| bienvenido                        | allin hamusqayki                          |
| gracias                           | añay                                      |

## Notas para la revisión

Las tres secciones siguientes son las notas de trabajo de cada parte (en inglés): términos
elegidos fuera del glosario y las traducciones menos seguras, con su clave y el motivo.

### Barra, paneles, recorrido, métricas (`core.ts`)

#### 1. Terms not in the glossary (choice made)

- recorrido guiado → `pusasqa puriy` ("guided walk")
- herramientas → `llamk'anakuna`
- puesta / ocaso → `yaykuy` (`Inti yaykuy`, `Tiqsimuyu yaykuy`); amanecer / salida → `lluqsiy`
- saltar → `p'itay`; hacer clic / pulsar → `ñit'iy`; arrastrar → `aysay`; girar → `muyuchiy`
- cambiar (tema, sitio) → `t'ikray`
- estado → `kaynin`; duración → `unaynin`; más largo → `aswan unay`
- ventana (de misión) → loan `ventana`
- puntuación → loan `puntuación` (keys whose value would be just "Puntuación" were left out)
- veredicto → `taripay`
- colores → `q'umir`, `q'illu`, `puka`
- minimizar → `huch'uyachiy`; duplicar → `iskaychay`; quitar → `chinkachiy`
- usar (botón) → `churay`; activar → `akllay`
- restricción → `hark'aq`; recibe → `chaskin`; juntos → `kuska`; anual → `watantin`
- asistente → `yanapaq`; leer → `ñawinchay`; pregunta → `tapuy`
- relieve → `urqu` (`Mana urquyuq` = sin relieve)
- kept as Spanish loans: escenario, panel, tema, modo, tecla, paso, gráfico, deslizador, disco, margen, elipse, filtro, hardware, temperatura, elevación, coordenada, navegador, estación, foto, mapa, capa, control, fondo, rueda, equipo, textura, mín./máx.

#### 2. Least-sure translations (for native review)

| key                                                 | Español                                                 | Quechua                                            | why unsure                                                      |
| --------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| countdown.in                                        | {what} en                                               | {what}paq                                          | suffix glued to a parameter; assumes a duration follows         |
| countdown.paren                                     | ({what} en {dur})                                       | ({what}paq {dur})                                  | same                                                            |
| countdown.none                                      | Sin {what} en la ventana                                | Ventanapi mana {what} kanchu                       | loan "ventana"; {what} is lowercase mid-sentence                |
| ev.sunset / ev.earthset                             | ocaso / puesta de la Tierra                             | Inti yaykuy / Tiqsimuyu yaykuy                     | `yaykuy` vs `chinkaykuy`, `haykuy` (Cusco)                      |
| tour.step                                           | Paso {n} de {total}                                     | {n} kaq paso, {total} manta                        | word order / ordinal `kaq`                                      |
| tour.prev                                           | Anterior                                                | Ñawpaq                                             | glossary term, but as a button `Kutiy` may read better          |
| tour.later                                          | Ahora no                                                | Manaraq                                            | literally "not yet"                                             |
| tour.done.title                                     | ¡Listo!                                                 | ¡Tukusqaña!                                        | idiom                                                           |
| tour.time.title                                     | Controla el tiempo                                      | Pachata kamachiy                                   | `kamachiy` = "to command"; may sound odd                        |
| tour.hud.body                                       | Atajos de cámara y capas…                               | Qhawanapaq, capakunapaq utqay ñankuna…             | "atajos" as `utqay ñankuna` is a calque                         |
| tour.steps.body / tour.scene.body / tour.sites.body | (cite «Ir a…», «Fondo: Sol / Tierra», «Ver más sitios») | paraphrased without the quoted button labels       | those labels are in another translator's file; check they agree |
| tour.more.body                                      | «¿Por qué es difícil?»                                  | «¿Imarayku sasa?»                                  | must match the real label in the other file                     |
| topbar.guideTitle                                   | Recorrido guiado por la interfaz                        | Kay programata pusaspa riqsichiy                   | free rendering                                                  |
| topbar.themeLight/Dark                              | Cambiar a tema claro/oscuro                             | K'anchay / Tutayaq temaman t'ikray                 | `t'ikray` for "switch"                                          |
| panel.right, hw.col.verdict                         | Estado (del sitio)                                      | K'itipa kaynin / Kaynin                            | `kaynin` for "status"                                           |
| panel.collapse                                      | Minimizar {name}                                        | {name} huch'uyachiy                                | object without `-ta` because {name} is a parameter              |
| earth.title                                         | Tierra · enlace directo                                 | Tiqsimuyu · chiqan rimay                           | `chiqan` is also the glossary word for "punto"                  |
| earth.on                                            | DTE activo                                              | DTE kachkan                                        | "is there" for "active"                                         |
| thermal.badge.good / bad                            | Tolerable / Congelamiento crítico                       | Allinlla / Sinchi chiri                            | simplified; "freezing" not expressed                            |
| metrics.verdict                                     | Veredicto                                               | Taripay                                            | legal-sounding word                                             |
| metrics.verdictFails                                | falla: {what}                                           | mana atinchu: {what}                               | "cannot" for "fails"                                            |
| metrics.scoreTitle                                  | …15 % supervivencia (penaliza…)                         | …15 % kawsay (…pisiyachin)                         | `kawsay` = life; "penalise" as "reduces"                        |
| stats.energy                                        | Energía (vs. Sol continuo)                              | Kallpa (sapa pacha Intiwan tupachisqa)             | long, calque                                                    |
| stats.sunEl / row.maxSunEl                          | Elevación solar media / máx.                            | Intipa elevación: chawpi / máx.                    | `chawpi` = middle, not exactly "mean"                           |
| hw.col.notes                                        | Restricción                                             | Hark'aq                                            | "that which blocks"                                             |
| hw.title                                            | Viabilidad por hardware                                 | Hardwareman hina allinchu                          | question form as a title                                        |
| ice.blocked                                         | …las paredes superan los {deg}°…                        | …pirqankuna roverpa atisqan {deg}° nisqata llallin | `pirqa` for crater walls; `llalliy` for "exceed"                |
| opt.where                                           | a {d} al {dir}                                          | {d}, {dir} lawman                                  | {dir} is a compass abbreviation                                 |
| picker.use / compare.activate                       | Usar / Activar                                          | Churay / Akllay                                    | generic verbs                                                   |
| picker.customHint                                   | Al sur de 75,5°S…                                       | 75,5°S manta urayman…                              | `uray` = south here but also "down"                             |
| acc.spherical                                       | Sin relieve                                             | Mana urquyuq                                       | "without mountains"                                             |
| scene.earthNotToScale                               | (no a escala)                                           | (mana escalapichu)                                 | loan + negation                                                 |

#### 3. Counts

Range has 281 keys. Translated 226 (80 %); 55 left to Spanish fallback (long explanations, proper names, values that would be identical to Spanish).

### Bienvenida, escena, aterrizaje, rover (`scene.ts`)

#### 1. Terms needed that are NOT in the glossary (choice made)

| Español                                                                                                                    | Choice                                                   | Note                                            |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| paso (del flujo)                                                                                                           | paso (loan: «4 pasopi», «Ñawpaq paso», «pasokuna»)       | must match what flow.ts/core.ts use             |
| clic / pulsar                                                                                                              | ñit'iy ("press")                                         | used in existing Quechua software localisations |
| arrastrar                                                                                                                  | aysay ("pull")                                           | idem                                            |
| rueda (ratón)                                                                                                              | rueda (loan) + muyuchiy                                  |                                                 |
| acercarse / aproximación                                                                                                   | asuykuy                                                  |                                                 |
| mover el sitio / reubicar                                                                                                  | astay                                                    | "to move something elsewhere"                   |
| borde (de cráter)                                                                                                          | pata                                                     |                                                 |
| interior                                                                                                                   | ukhu                                                     |                                                 |
| línea / franja                                                                                                             | siq'i                                                    | «Pacha siq'i» = línea temporal                  |
| puntuación / puntos                                                                                                        | puntokuna / punto (loan)                                 | check against core.ts                           |
| objetivos (del reto)                                                                                                       | ruwanakuna ("things to do")                              |                                                 |
| pista (hint)                                                                                                               | yanapay (glossary "ayuda")                               |                                                 |
| pendiente (aún no hecho)                                                                                                   | manaraq                                                  |                                                 |
| atención (nivel)                                                                                                           | paqtataq ("careful!")                                    |                                                 |
| peligrosa                                                                                                                  | manchakuypaq                                             |                                                 |
| escenario, elipse, perfil, panel, control, simulador, efemérides, propelente, desnivel, mástil, zoom, clase, física, disco | Spanish loans + suffixes                                 |                                                 |
| simular                                                                                                                    | simulay (loan verb)                                      |                                                 |
| frenado                                                                                                                    | Frenay (loan verb)                                       |                                                 |
| probar                                                                                                                     | pruebay (loan verb, common in speech)                    |                                                 |
| desplegar (rover)                                                                                                          | lluqsichiy ("make go out")                               |                                                 |
| recorrido                                                                                                                  | purisqan ("what it has travelled")                       |                                                 |
| completo                                                                                                                   | hunt'asqa                                                |                                                 |
| forma                                                                                                                      | rikch'ay                                                 |                                                 |
| círculo                                                                                                                    | muyu                                                     |                                                 |
| pequeño / pesado                                                                                                           | huch'uy / llasaq                                         |                                                 |
| sobrevive                                                                                                                  | kawsan ("lives")                                         |                                                 |
| estaciones (del año)                                                                                                       | mit'akuna                                                |                                                 |
| crepúsculo / abrigo                                                                                                        | rankhi / amachay                                         |                                                 |
| azul                                                                                                                       | anqas                                                    |                                                 |
| jugar                                                                                                                      | pukllay                                                  |                                                 |
| lander                                                                                                                     | módulo (per glossary), including «Vista del lander»      |                                                 |
| Evidential                                                                                                                 | Cusco -n/-mi; progressive written -chka- as in the brief |                                                 |

#### 2. Least-sure translations (for a native reviewer)

| Key                              | Español                                                   | Quechua                                                                                 | Why unsure                                                                   |
| -------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| welcome.title                    | Toma la mejor decisión de alunizaje                       | Aswan allin uraykuna k'itita akllay                                                     | Rephrased as "choose the best landing place"; "decisión" has no natural noun |
| welcome.sub                      | …Lo verás en 4 pasos.                                     | …4 pasopi qhawanki.                                                                     | "paso" loan; -pas…-pas coordination with kananpaq                            |
| welcome.tour                     | Ver el recorrido guiado                                   | Pusasqa puriyta qhaway                                                                  | "guided walk" calque                                                         |
| choose.kicker                    | Paso previo                                               | Ñawpaq paso                                                                             | ñawpaq = "previous/first", may read as "first step"                          |
| step.aria                        | Pasos de la decisión                                      | Tukuchanapaq pasokuna                                                                   | built on glossary "tukuchay"                                                 |
| level.warn                       | atención                                                  | paqtataq                                                                                | interjection used as a status label                                          |
| hud.pick                         | Reubicar con clic                                         | Ñit'ispa astay                                                                          | ñit'iy for click, astay for relocating a site                                |
| hud.microHint                    | (el Sol mide 0,5°)                                        | (Intiqa 0,5° chhikallan)                                                                | "chhikan" for angular size                                                   |
| hud.aerialHint                   | activa «Reubicar con clic»…                               | «Ñit'ispa astay» nisqata hap'ichiy…                                                     | hap'ichiy ("light/switch on") for enabling a toggle                          |
| hud.wide                         | Vista amplia                                              | Hatun qhawana                                                                           | "big view" rather than "wide"                                                |
| hud.ellipseAspect                | Forma de la elipse                                        | Elipsepa rikch'aynin                                                                    | rikch'ay = appearance, not strictly geometric shape                          |
| hud.simulateDescent              | Simular descenso                                          | Uraykuyta simulay                                                                       | loan verb                                                                    |
| rover.deploy                     | Desplegar rover                                           | Roverta lluqsichiy                                                                      | "make the rover go out"                                                      |
| rover.power                      | Solar / consumo                                           | Intimanta kallpa / gastasqan                                                            | "gastay" loan for consumption; longer than Spanish                           |
| rover.profileCaption             | Ida de {d}… desnivel… franja azul                         | Riy {d} (kikin ñanninta kutimun) · desnivel {drop} · aswan q'ata {slope} · anqas siq'i… | "desnivel" left as loan; "aswan q'ata" for max slope                         |
| rover.cam.follow / .mast / .top  | seguimiento / mástil / cenital                            | qatispa / mástilmanta / hanaqmanta                                                      | terse adverbial labels                                                       |
| rover.progress, landing.progress | Progreso del recorrido / descenso                         | Hayk'atañan purin / uraykun                                                             | "how much it has already…" paraphrase (aria labels)                          |
| rover.card.ok                    | va, recoge {samples} y vuelve en {h} · batería mín. {soc} | rin, {samples} pallan, {h} nisqapi kutimun · aswan pisi batería {soc}                   | {samples} is inserted without accusative -ta; "{h} nisqapi"                  |
| landing.aria                     | Guiado de descenso                                        | Uraykuy pusay                                                                           | noun+verb compound                                                           |
| landing.dist                     | Al objetivo                                               | Chayanakama                                                                             | "up to the arrival place"                                                    |
| landing.phase.braking            | Frenado                                                   | Frenay                                                                                  | loan; "sayachiy" already used for pause                                      |
| landing.approachAuto / Ahead     | Sol de cola / Sol de frente                               | Inti qhipapi (auto) / Inti ñawpaqpi                                                     | "Sun behind / in front"                                                      |
| landing.contactLit               | Punto de contacto iluminado ({pct} del disco solar)       | Chayana chiqan k'anchasqa (Inti discopa {pct})                                          | genitive followed by a percentage placeholder                                |
| landing.hint                     | …la hora de misión queda fija durante el descenso         | …uraykuchkaptin misiónpa horan sayasqa                                                  | "sayasqa" = stopped                                                          |
| challenge.landing.title          | Aterriza con margen                                       | Puchuqniyuq uraykuy                                                                     | "land with something left over"                                              |
| challenge.success.hints          | (pistas usadas: {n}; cada una resta {cost})               | (mañasqa yanapaykuna: {n}; sapanka {cost} puntota qichun)                               | qichuy = take away                                                           |
| explain.c7.title                 | Sin aire: sin crepúsculo ni abrigo                        | Mana wayra kaptin: mana rankhipas, mana amachaypas kanchu                               | rankhi (twilight), amachay (shelter)                                         |
| explain.c4.title                 | …casi no se mueve… pero oscila                            | Tiqsimuyu yaqa mana purinchu… ichaqa kuyurin                                            | kuyuriy for "oscillate"                                                      |
| explain.c8.cta                   | Probar el rover canadiense                                | Canadápa roverninta pruebay                                                             | loan verb                                                                    |
| explain.source                   | Fuente                                                    | Maymanta                                                                                | "from where" as a label                                                      |
| link.dsn                         | Exigir estación DSN                                       | DSN estación kanan                                                                      | "there must be a DSN station"                                                |
| export.csv                       | Serie temporal (CSV)                                      | Pachaman hina datokuna (CSV)                                                            | paraphrase "data over time"                                                  |
| bottom.seasons                   | Estaciones                                                | Mit'akuna                                                                               | mit'a = period/season/turn                                                   |
| presets.delay.title              | ¿Y si Artemis III se retrasa 14 días?                     | ¿Artemis III 14 p'unchawta qhipakuptinri?                                               | qhipakuy for "be delayed"                                                    |

#### 3. Counts

Range: 343 keys. Translated: 202 (59 %). Left to Spanish fallback: 141.
Of the 202, 7 are intentionally identical to Spanish (loans/names): hud.ellipse, rover.battery, rover.vehicle, landing.vehicle, timeline.battery, timeline.horizon, bottom.horizon.
Left out: all long paragraphs (explain bodies, glossary definitions, challenge briefs/hints/why), data-source strings, Dispersion (all), most Energy fields, terrain detail lines, landing telemetry labels that are bare technical loans (Fase, Altura, Propelente, Δv, Modelo…), landing failure/hazard sentences except one.

### Planificador, retos, asistente (`flow.ts`)

#### 1. Terms not in the glossary (choice made)

| Español                                                                                       | Quechua used                                           | Note                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| puntuación                                                                                    | puntuación (loan)                                      | aligned with core.ts; "puntos" kept only for hint cost |
| objetivo (plan target with ice)                                                               | chayana ("place to arrive")                            | derived noun, not a loan                               |
| objetivos (challenge goals)                                                                   | ruwanakuna ("things to do")                            |                                                        |
| pista (hint)                                                                                  | yanapay                                                | same word as "ayuda"                                   |
| pendiente / pendiente segura                                                                  | q'ata / allin q'atayuq                                 | aligned with scene.ts                                  |
| pendiente máxima                                                                              | aswan q'ata                                            | aligned with core.ts                                   |
| veredicto                                                                                     | taripay                                                | aligned with core.ts `metrics.verdict`                 |
| luz continua                                                                                  | mana p'itiq k'anchay ("light that does not break off") |                                                        |
| noche más larga                                                                               | aswan unay tuta                                        | aligned with core.ts                                   |
| restricciones / límites                                                                       | límitekuna (loan)                                      |                                                        |
| radio de búsqueda                                                                             | maskana radio                                          |                                                        |
| mín. / máx.                                                                                   | mín. / máx. kept as abbreviations                      | in labels and chips only                               |
| escenario, relieve, mapa, calendario, margen, propelente, tile, CSV, demo, botón, fila, lista | loans                                                  |                                                        |
| rover utilitario / micro-rover                                                                | rover utilitario / micro-rover (loans)                 |                                                        |
| asistente                                                                                     | yanapaq                                                |                                                        |
| editar                                                                                        | allichay                                               | aligned with core.ts tour text                         |
| cambiar                                                                                       | t'ikray                                                | aligned with core.ts                                   |
| duplicar                                                                                      | iskaychay                                              | aligned with core.ts                                   |
| crear                                                                                         | ruway                                                  |                                                        |
| aplicar / usar (poner un valor)                                                               | churay                                                 |                                                        |
| usar / cambiar al rover utilitario                                                            | rover utilitariota akllay ("choose")                   |                                                        |
| cancelar                                                                                      | saqiy ("leave it")                                     |                                                        |
| enviar                                                                                        | apachiy                                                |                                                        |
| clic, pulsar                                                                                  | ñit'iy                                                 | aligned with core.ts / scene.ts                        |
| recargar (batería)                                                                            | hunt'achiy; "Recargando" = Batería hunt'achkan         |                                                        |
| ampliar / reducir                                                                             | hatunyachiy, yapay / huch'uyyachiy, pisiyachiy         |                                                        |
| alargar (misión)                                                                              | unayachiy                                              |                                                        |
| relajar (restricciones)                                                                       | llamp'uyachiy ("soften")                               |                                                        |
| sin solución                                                                                  | mana atikunchu ("cannot be done")                      |                                                        |
| descartado (punto)                                                                            | qarqusqa                                               |                                                        |
| con física                                                                                    | físicawan                                              | aligned with scene.ts                                  |
| libre (cámara)                                                                                | qispi                                                  |                                                        |
| azul                                                                                          | anqas                                                  | aligned with scene.ts                                  |
| ligero                                                                                        | chhalla                                                |                                                        |
| taladrar                                                                                      | t'uquy                                                 |                                                        |
| paso n de total                                                                               | {total} manta {n} kaq                                  |                                                        |
| tarde                                                                                         | tardeña (loan "tarde")                                 |                                                        |
| zona 3 (del planificador)                                                                     | 3 kaq t'aqa                                            |                                                        |

#### 2. Least-sure translations (for the native reviewer)

| Key                                  | Español                                                                  | Quechua                                                          | Why unsure                                                         |
| ------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| plan.target.legend                   | Objetivo con hielo                                                       | Chullunkuyuq chayana                                             | "chayana" for target: natural? or loan "objetivo"                  |
| plan.col.light                       | Luz continua                                                             | Mana p'itiq k'anchay                                             | wording of "continuous"                                            |
| plan.mission.minSun                  | Luz continua mín. tras aterrizar (días)                                  | Uraykuy qhipata mana p'itiq k'anchay mín. (p'unchaw)             | long, "mín." abbreviation left in Spanish                          |
| plan.noSolution                      | Sin solución                                                             | Mana atikunchu                                                   | sense "no feasible point", not "impossible"                        |
| plan.none.main                       | La que más descarta: {why} ({pct} % de los puntos rechazados).           | Aswanta hark'aq: {why} ({pct} % chiqankuna qarqusqa).            | hark'ay / qarquy for "discard"                                     |
| plan.none.days                       | En {n} de {total} días, el mejor punto se descarta porque {why}.         | {total} manta {n} p'unchawpi aswan allin chiqan qarqusqa: {why}. | causal "porque" replaced by a colon                                |
| plan.limits.science / editor.science | Peso de la ciencia                                                       | Cienciapa llasaynin                                              | "llasay" (physical weight) used figuratively                       |
| plan.limits.dsnOff                   | sin exigir DSN                                                           | mana DSNta mañaspa                                               |                                                                    |
| plan.table.byScore                   | Ordenar por puntuación                                                   | Puntuaciónman hina churay                                        | "churay" for sort                                                  |
| plan.none.unknown                    | …relaja las restricciones…                                               | …límitekunata llamp'uyachiy…                                     | figurative "soften"                                                |
| plan.why.roverBattery                | …su batería baja del mínimo durante el viaje                             | …puriypi bateríanqa mínimomanta uraykun                          |                                                                    |
| step.next                            | Ir a {name}                                                              | {name} nisqaman riy                                              | "nisqa" used to avoid a suffix on the placeholder                  |
| top.title                            | Top 3 para tu misión                                                     | Misiónniykipaq 3 aswan allin                                     |                                                                    |
| locator.nearSide                     | Cara visible de la Luna                                                  | Killapa rikukuq uyan                                             | "uya" (face) for near side                                         |
| frame.label / frame.free             | Ver con fondo: / Libre                                                   | Qhipapi qhaway: / Qispi                                          | "background" and "free camera"                                     |
| compare.edit                         | Editar                                                                   | Allichay                                                         | allichay = fix/arrange                                             |
| takeaways.energy                     | Tiene energía el {pct} % del tiempo y contacto con la Tierra el {dte} %. | Pachapa {pct} % kallpayuq, {dte} % taq Tiqsimuyuwan rimayniyuq.  | percent-of-time construction ("pachapa X %") used throughout       |
| takeaways.nightLong                  | Ojo: … El equipo debe resistirla.                                        | Qhawariy: aswan unay tutan {h}. Equipoqa chayta atipanan.        | "atipay" for withstand                                             |
| assistant.cta                        | ¿Te ayudo a elegir?                                                      | ¿Akllayta yanapasqaykichu?                                       | 1>2 future question form                                           |
| assistant.compareAll                 | Comparar las 3 opciones                                                  | Kimsantinta tupachiy                                             |                                                                    |
| killa.offline                        | Sin conexión a internet. Seguiré cargando cuando vuelva.                 | Mana internetniyuq. Kutimuptin qatisaq.                          | very compressed                                                    |
| band.ok / band.idle                  | En banda / Sin asignar                                                   | Bandapi / Mana churasqa                                          | technical labels, context unclear                                  |
| challenge.goals / challenge.hint     | Objetivos / Pista (−{cost} puntos)                                       | Ruwanakuna / Yanapay (−{cost} puntos)                            |                                                                    |
| challenge.night.goal.verdict         | El veredicto del sitio no es «Descartado»                                | K'itipa taripayninqa manan «Mana allin» nisqachu                 | double negation around the label «Mana allin»                      |
| challenge.how                        | Pulsa «Ir al simulador»… se marca solo cuando lo consigas.               | …atipaptiykitaq sapallan marcakun.                               | "marcakun" loan verb; "lluq'i ladopi"                              |
| challenge.ice.brief                  | (long)                                                                   | (long)                                                           | longest string translated; check flow and "2 horayuq 3 muestrawan" |
| challenge.landing.title              | Aterriza con margen                                                      | Margenniyuq uraykuy                                              | loan "margen" in a title                                           |
| rover.left.ice / rover.left.lander   | Falta al hielo / Falta al módulo                                         | Chullunkukama / Módulokama                                       | "until the ice" instead of "remaining"                             |
| rover.state.failLate                 | Volvió tarde                                                             | Tardeña kutimun                                                  | loan "tarde"                                                       |
| rover.state.wait                     | Recargando                                                               | Batería hunt'achkan                                              | hunt'ay for charging                                               |

Numerals: after a number the noun is left singular ("3 muestra", "{n} p'unchaw"), the usual Quechua pattern; "muestrakuna" only without a numeral.

#### 3. Counts

Range = 387 keys (es.ts from `plan.title` to the end, plus all `challenge.*`). Translated 355 (92 %); left to Spanish 32.
Left out: long prose (`challenge.intro`, the five `challenge.*.why`, `challenge.ice.hint.samples`, `plan.sub`, `plan.err.noGround`, `plan.err.expired`, `plan.map.aria`, `plan.empty.2`, `polar.noDem`, `polar.noIllum`, `polar.hint`, `assistant.answer.earth`, `assistant.answer.slope`) and values that would be identical to Spanish (`step.orbit`, `plan.target.lat/lon`, `plan.mission.legend`, `plan.th.dte/battery/samples`, `plan.map.title/titleNone`, `polar.relief`, `plan.samples.one`, `plan.table.margin`, `rover.sum.sample/margin/minSoc`).
