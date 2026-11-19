# Auditoría Visual, Gráfica y de Físicas — Los del Desguace (Objetivo: Juego Indie)

Fecha: 2026-11-18  
Estado: **Base técnica sólida**, lista para dar el salto de prototipo funcional a estética y game-feel indie.

---

## 1. Gráficas e Iluminación

### Lo que ya está bien
- Pipeline en `src/scene/DesguaceScene.tsx`: `ACESFilmicToneMapping` (`1.05`), IBL offline con `Environment` + 3 `Lightformer`s (sol cálido, cielo frío, rebote de tierra), `hemisphereLight`, niebla (`36–84 m`) y 3 presets en `src/config/visualConfig.ts` (`low`, `medium`, `high`).

### Brechas detectadas
1. **Cielo sin gradiente (`ProceduralSkyDome`):** `PALETTE.skyHorizon` (`#f5cfa0`) existe en `src/config/visualConfig.ts`, pero el domo usa `meshBasicMaterial` plano con `PALETTE.skyTop` (`#6bb5e8`), generando un corte duro contra la niebla del horizonte.
   - *Acción:* Reemplazar por shader/gradiente vertical entre `skyHorizon` y `skyTop`.
2. **Sin post-procesado:** No está instalado `@react-three/postprocessing`.
   - *Acción:* Agregar `Bloom` selectivo (`luminanceThreshold > 1.0`) para hacer brillar chispas emisivas de la batería, balizas de agarre, indicadores de cables/lógica y lámparas del taller, más `Vignette` suave en `high`.
3. **Resolución efectiva de sombras:** La `directionalLight` cubre un frustum fijo de `52×54 m` (`[-26, 26] × [-26, 28]`). En `medium` (`shadowMapSize: 1024`) eso da ~`5 cm/texel`.
   - *Acción:* Hacer que la cámara de sombras siga al jugador en un frustum más cerrado (`±16 m`) para ganar nitidez sin subir costo de GPU.
4. **Contraste entre materiales 2D y GLB:** El suelo (`256×256` `CanvasTexture`) y las estructuras de `src/environment/ScrapyardWorkshop.tsx` no tienen `normalMap` ni `roughnessMap`.
   - *Acción:* Añadir `roughnessMap` / `bumpMap` sutil al hormigón y chapas del taller para empatar con los props horneados en Blender.

---

## 2. Arte 3D y Coherencia de Props

### Lo que ya está bien
- `src/props/PropModels.tsx` comparte geometría, material y texturas entre instancias (`scene.clone(true)` + `anisotropy = 4`).
- Los GLB horneados en `public/models/props/variants/` pesan **188–482 KB** (`1 864` a `4 088` triángulos, WebP + `KHR_mesh_quantization`).

### Brechas detectadas
1. **Separación semántica `battery` vs `engine`:** `part` en `src/invention/workshopAssembly.ts` mapea a `'engine'`, pero su visual es una batería. Separar `battery` (energía/chispas) y `engine` (tracción) dará mucha más claridad de juego.
2. **Barriles de escena:** En `src/environment/ScrapyardWorkshop.tsx` (`renderBarrel`), los barriles decorativos/dinámicos usan primitivas Three.js (`<cylinderGeometry>`), pudiendo reutilizar `wood_barrel-v001.glb`, `barrel-v002.glb` y `barrel-v003.glb`.
3. **Peso de `cabeza_base_v002.glb`:** Pesa `2.67 MB` en `public/models/cabeza_base_v002.glb`; conviene optimizarlo con WebP + `KHR_mesh_quantization`.
4. **Draw calls en props repetitivos:** Agrupar neumáticos/barriles decorativos repetidos en `ScrapyardWorkshop.tsx` con `InstancedMesh`.

---

## 3. Físicas y Game Feel

### Lo que ya está bien
- `Physics timeStep={1/60} interpolate gravity={[0, -18, 0]}` con colliders explícitos (`colliders={false}`), joints `revolute`/`fixed` en `src/invention/workshopPhysics.ts` y desacople visual/físico en `src/props/GrabbableProps.tsx`.

### Brechas detectadas
1. **Conducción y estabilidad del carrito (`WorkshopChassis.tsx` + `workshopPhysics.ts`):** El chasis es un único `CuboidCollider` rígido (`mass={14}`) sin dirección en el eje delantero ni suspensión, y la rueda tiene `restitution: 0.36` (algo saltarina).
2. **Sin audio procedural / SFX:** Faltan sonidos ligados a físicas (ralentí del motor, chisporroteo eléctrico, impactos por velocidad).
3. **Dependencia energética batería ↔ motor y lógica libre:** Actualmente no existe un grafo lógico donde baterías, sensores, puertas lógicas y actuadores (motores, pistones, propulsores) se conecten libremente. *(Prioridad 1 actual.)*

---

## 4. Orden de Prioridades Acordado
1. **Motor de Creaciones Locas con Lógicas** (grafo de señales + bloques/actuadores + construcción modular libre en Rapier).
2. **Audio procedural / SFX físicos** (motor, chispas, impactos, acoples).
3. **Pulido visual indie** (gradiente de cielo, shadow-follow, Bloom selectivo, optimización de `cabeza_base_v002.glb` e instancing).
