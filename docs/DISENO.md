# Sistema visual de Killa Landing

Killa Landing usa el sistema visual de la familia **Genius Mining AI** (origen: Operational AI). El
documento de referencia asume Tailwind 4; aquí se aplica la regla de «otro stack»: se conservan
los valores exactos (colores HSL, radios, tipografía, sombras, tiempos) y se traducen las clases a
CSS propio. No se inventan colores.

## Dónde vive cada cosa

| Archivo                  | Contenido                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `src/styles/tokens.css`  | Tokens copiados del documento: `:root` (claro), `.dark` (oscuro), foco y movimiento reducido |
| `src/styles/index.css`   | Cabina, botones, paneles, tarjetas, controles sobre la escena                                |
| `src/styles/flow.css`    | Bienvenida, elegir sitio, barra de pasos, retos, comparar                                    |
| `src/styles/planner.css` | Paso «Planificar»                                                                            |
| `src/styles/kit.css`     | `Notice`, `Empty`, `Stat`, `Busy` (`src/ui/kit/`)                                            |
| `src/styles/killa.css`   | Killa, asistente, pantalla de inicio y carga                                                 |
| `src/ui/theme.ts`        | Tema claro / oscuro (`lumen-theme` en `localStorage`)                                        |
| `src/ui/chartTheme.ts`   | Paleta de las gráficas en canvas, leída de los tokens                                        |

## Tema

- Oscuro por defecto («cristal y neón»); claro como alternativa. Se cambia con la clase `.dark`
  en `<html>` y se recuerda en `localStorage`. Un script en `index.html` lo aplica antes de pintar.
- La escena 3D es el espacio y **siempre es oscura**: su contenedor lleva su propia clase `dark`
  (`<div class="stage dark">`), así que los controles y rótulos sobre la escena usan la paleta
  oscura también en tema claro. Paneles, barra superior y pantallas completas siguen el tema.
- Los tokens con tema son tripletas HSL: se usan como `hsl(var(--primary))` o con transparencia
  `hsl(var(--primary) / 0.3)`. Las series son hex validados: `var(--series-1)`.

## Reparto de color

| Trabajo                             | Token                                    | En Killa Landing                            |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------- |
| Dato, enlace, foco, selección       | violeta `--primary`, `--accent`          | enlaces, foco, fila o tarjeta elegida       |
| Acción principal, **una por vista** | degradado `--bg-action` (`.btn--accent`) | Empezar, Planificar, siguiente paso         |
| Marca y elemento activo             | degradado `--bg-neon`                    | paso activo, puesto n.º 1, regla de sección |
| Estado                              | bandas `--band-*` con glifo y texto      | viable, al límite, descartado               |
| Oro `--lamp`                        | solo la lámpara de Killa                 | —                                           |
| Rojo `--destructive`                | error y borrar                           | —                                           |

### Series (el color sigue a la entidad)

| Entidad                | Token                                                  |
| ---------------------- | ------------------------------------------------------ |
| Sol y Tierra a la vez  | `--series-1` violeta                                   |
| Ruta del rover, hielo  | `--series-2` cian                                      |
| Sol, energía solar     | `--series-4` ámbar                                     |
| Batería                | `--series-5` verde                                     |
| Tierra, enlace directo | `--series-6` azul                                      |
| Escenarios A, B, C, D  | `--series-1`, `--series-2`, `--series-3`, `--series-7` |

### Estados

| Nivel (`src/ui/levels.ts`) | Banda            | Glifo |
| -------------------------- | ---------------- | ----- |
| `good`                     | `--band-ok`      | ✓     |
| `warn` (al límite)         | `--band-excess`  | ▲     |
| `bad`                      | `--band-deficit` | ▼     |
| sin dato, detenido         | `--band-stopped` | ■ ○   |

El estado nunca va solo en color: siempre lleva glifo y texto. El sistema no tiene ámbar de
aviso; «al límite» es la banda azul de exceso.

## Piezas

- **Botones** (píldoras): `.btn` contorno, `.btn--primary` violeta, `.btn--accent` acción,
  `.btn--ghost`, `.btn--destructive`, tamaños `.btn--small` (30 px) y `.btn--big` (44 px).
- **Superficies**: `.panel` (radio 22, cristal en oscuro), cajas internas con radio 14, campos con
  radio 11 y alto de 36 px.
- **Títulos de sección**: `.cfg-heading` con `.cfg-rule` (regla neón de 40 × 4 px).
- **Avisos**: `Notice` (aviso, nota, éxito, error). Todo aviso de problema trae su botón de
  arreglo. `Empty` para estados vacíos y `Busy` para esperas.
- **Tipografía**: Inter (texto), DM Sans (títulos), DM Mono (cifras, con `tabular-nums`).
- **Movimiento**: `--duration-fast` 120 ms, `--duration-base` 200 ms, `--ease-out`; entrada
  escalonada de 55 ms. Todo se detiene con `prefers-reduced-motion`.

## Logotipo

La marca junto a «KILLA LANDING» es una luna llena con cráteres (`public/favicon.svg`, y en grande
en la pantalla de inicio). Sus grises son color de imagen, como el disco lunar de los mapas, no
tokens de interfaz.

## Killa

Mascota hermana de Wayra: misma geometría, cuerpo cobre y una media luna en la pantalla del
pecho. Killa significa «Luna» en quechua. Estados: `idle`, `thinking`, `ok`, `alert`, `offline`.
Aparece solo donde la aplicación habla o espera (asistente, cargas, estados vacíos, error) y como
favicon. Nunca decora tablas ni gráficas.

## Lista de comprobación antes de entregar

1. Tokens exactos, sin colores nuevos.
2. Un solo botón de acción por vista.
3. Neón solo en lo activo o prioritario.
4. Ningún estado solo por color.
5. Cifras en `tabular-nums` y títulos con `.cfg-heading`.
6. Paneles `.panel` de cristal.
7. Oscuro y claro mediante `.dark`.
8. Movimiento reducido respetado.
9. Foco visible.
10. Mascota solo donde la aplicación habla.
11. Cada aviso de problema con su botón de arreglo.
12. Español claro, sin jerga.
