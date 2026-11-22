# Los del Desguace — Taller El Yunke

Juego indie 3D de **ingeniería y creatividad en un desguace**. Resolvés problemas físicos (cruzar un abismo, romper un muro de autos, subir una montaña) armando inventos con chatarra, solo o en cooperativo.

## Stack

- React 19 + TypeScript + Vite
- Three.js con React Three Fiber y Drei
- Física con Rapier (`@react-three/rapier`) y control de personaje con `ecctrl`
- Tests con Vitest, lint con Oxlint

## Cómo correrlo en local

```bash
npm install
npm run dev      # servidor local, normalmente en http://localhost:5173
```

Otros comandos:

```bash
npm test         # tests (Vitest)
npm run lint     # lint (Oxlint)
npm run build    # chequeo de tipos + build de producción
npm run preview  # previsualizar el build
```

> Probá siempre en `localhost:5173`: la versión publicada puede estar desactualizada.

## Documentación

- [docs/VISION_MVP.md](./docs/VISION_MVP.md): objetivo y pilares de diseño del MVP.
- [PENDIENTES.md](./PENDIENTES.md): bugs conocidos y trabajo pendiente, por prioridad.
- [ROADMAP.md](./ROADMAP.md): hoja de ruta hacia el juego final.
- [docs/RECURSOS_Y_REPOS.md](./docs/RECURSOS_Y_REPOS.md): librerías y repos de referencia.
- [CLAUDE.md](./CLAUDE.md): especificación técnica y guía de identidad visual.
