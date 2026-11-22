# Recursos y repositorios de referencia

Librerías y repos que evaluamos para **consultar o integrar**. Nada de esto está agregado como dependencia salvo que se indique. Antes de integrar cualquiera, validarlo con el creador.

## Física de vehículos y arrastre (Rapier / React Three Fiber)

| Recurso | Para qué sirve en el proyecto |
|---|---|
| [`pmndrs/react-three-rapier`](https://github.com/pmndrs/react-three-rapier) | Librería que ya usamos. Referencia de juntas y del ejemplo del auto: [`CarExample.tsx`](https://github.com/pmndrs/react-three-rapier/blob/main/demo/src/examples/car/CarExample.tsx). |
| [`dimforge/rapier`](https://github.com/dimforge/rapier) → [`vehicle_controller3.rs`](https://github.com/dimforge/rapier/blob/master/examples3d/vehicle_controller3.rs) | Controlador de vehículo oficial de Rapier. Referencia si se migra suspensión/dirección. |
| [Dynamic Raycast Vehicle Controller (Isaac Mason)](https://sketches.isaacmason.com/sketch/rapier/dynamic-raycast-vehicle-controller) | Sketch de un vehículo con raycast sobre Rapier. Misma idea: referencia para suspensión/dirección. |
| [`niccolofanton/DraggableRigidBody`](https://github.com/niccolofanton/DraggableRigidBody) | Arrastre físico con *spring joints* en R3F + Rapier. Referencia para el agarre con el láser. |
| [`bridge-mind/leonida`](https://github.com/bridge-mind/leonida) | Ejemplo completo de vehículo en Three.js + Rapier. |
| [`Yashparmar1125/Car-Game-ThreeJS`](https://github.com/Yashparmar1125/Car-Game-ThreeJS) | Otro ejemplo completo de juego de autos en Three.js. |

## Corte de geometrías / CSG

- [`gkjohnson/three-bvh-csg`](https://github.com/gkjohnson/three-bvh-csg), construido sobre [`gkjohnson/three-mesh-bvh`](https://github.com/gkjohnson/three-mesh-bvh): para optimizar o ampliar el recorte de chapas (`src/invention/SceneCutter.tsx`). El rebanado actual de piezas usa casco convexo propio (`src/invention/sliceGeometry.ts`).

## Multijugador web

Todas las opciones se enchufan en la interfaz `NetTransport` de `src/multiplayer/netProtocol.ts`. Hoy hay dos implementaciones: `createBroadcastTransport` (entre pestañas del mismo navegador, es la que usa `multiplayerStore.ts`) y `createWebSocketTransport` (ya existe, falta un servidor).

| Recurso | Cuándo conviene |
|---|---|
| [`dmotz/trystero`](https://github.com/dmotz/trystero) | **Opción principal.** P2P por WebRTC sin backend; salas por código para jugar con amigos. |
| [`partykit/partykit`](https://github.com/partykit/partykit) | Alternativa con WebSockets en el edge, si se busca autoridad de servidor. |
| [`grayhatdevelopers/awesome-playroom`](https://github.com/grayhatdevelopers/awesome-playroom) | Lista de recursos y plantillas multijugador. |
| [`grayhatdevelopers/vite-react-ts-multiplayer-game`](https://github.com/grayhatdevelopers/vite-react-ts-multiplayer-game) | Plantilla Vite + React + TypeScript, parecida a nuestro stack. |
