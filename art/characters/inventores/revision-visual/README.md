# Inventores personalizables · revisión visual

La [lámina](tres-inventores.png) muestra las tres propuestas a la misma escala de busto. Cada fila repite su conjunto de rasgos y accesorios en neutral, cierre completo de ambos ojos y sonrisa. La lámina se generó con ImageGen para aprobar la dirección artística. La verificación de deformaciones y holguras queda pendiente sobre la malla evaluada.

## Las tres apariencias

- **Inventor despistado.** Cara algo más larga, mandíbula estrecha, nariz larga y redondeada y cejas levantadas a distinta altura. Pelo cobrizo con un mechón rebelde y anteojos finos de puente bajo. Sonrisa ladeada.
- **Mecánico desconfiado.** Mandíbula ancha, nariz corta y ancha, ojos entrecerrados y una ceja más baja. Pelo oscuro corto, gorra oliva y barba recortada que deja libres los labios. Sonrisa contenida.
- **Inventor entusiasmado.** Mejillas más anchas y mentón afinado, nariz respingada, ojos más abiertos con la misma pupila pequeña. Pelo oscuro, casco amarillo y gafas de taller sobre el casco. Sonrisa amplia con apertura de boca.

## Base y controles

La propuesta parte de una única cabeza y un rig facial común. Las shape keys de apariencia mantienen el orden de vértices y las zonas de deformación de párpados, labios y mejillas. Los límites iniciales de modelado son ±12 % para el ancho de mandíbula, ±7 % para el ancho de mejillas y ±15 mm para el volumen de la coronilla y la altura del mentón respecto de la base. La unión al cuello queda fija. La silueta de la lámina orienta el ajuste final de esos rangos sobre la malla.

- **Apariencia guardada por personaje.** Pesos de las shape keys de proporción, perfiles neutros de ojos, cejas y nariz, módulos de pelo, barba, sombrero y anteojos, y colores de piel y pelo. La piel comparte el mismo tono en cara, orejas, cuello, brazos y párpados.
- **Expresión por pose.** Conservar `blink_L`, `blink_R`, `smile` y `mouth_open` como controles independientes de la apariencia, con valores de 0 a 1. Evaluar primero la forma personalizada. Calcular el cierre desde los bordes ajustados de cada ojo para que los párpados se encuentren al llegar a 1. Evaluar sonrisa y apertura desde las comisuras y el contorno de labios ajustados. Usar correctivos locales en los extremos que los requieran.
- **Cuerpo común.** Reutilizar el esqueleto, las posiciones de reposo, el pivote de cabeza y la escala de Chispa v001. Los tres presets comparten la cápsula del juego, con radio de 0,32 m y semialtura del tramo recto de 0,34 m. Las piezas decorativas siguen el rig como elementos visuales.

## Anclajes y holguras propuestas

Usar 5 mm como margen inicial entre piezas rígidas y superficies que se mueven durante la expresión, medido en la posición de mayor acercamiento. Se permiten contactos de montaje puntuales en el puente nasal, las orejas y el asiento del sombrero. Evaluar las distancias sobre cada variante deformada.

- **Pelo y sombreros.** Pelo parentado a la cabeza y sombrero en `anchor_hat`, con ajuste de asiento por variante. Para gorra y casco, limitar el pelo bajo la copa al volumen interior y dejar los mechones visibles fuera del borde. Mantener el ala al menos 5 mm por encima del recorrido de las cejas. Respetar los máximos de 0,34 m de radio, 0,28 m por encima de la coronilla y 0,34 m hacia adelante para el ala, definidos en `characterAppearance.ts`.
- **Anteojos del despistado.** Ajustar el anclaje del puente a la nariz personalizada y las patillas a los puntos cercanos a las orejas. Mantener la montura a 5 mm como mínimo del recorrido de párpados y mejillas, salvo en los apoyos de montaje. Comprobar desde el frente que el aro deje leer las dos líneas de cierre.
- **Barba del mecánico.** Ajustar el borde al perfil mandibular y hacer que el tramo inferior acompañe la apertura de la mandíbula. Mantener 5 mm de margen respecto del borde de los labios y las comisuras durante la sonrisa y la apertura. La gorra lleva pelo de perfil bajo para alojarlo bajo la copa.
- **Casco y gafas del entusiasmado.** Montar las gafas sobre el casco con el punto de referencia de `anchor_goggles`. Reservar el contacto al apoyo de montaje y mantener el marco por encima del ala. Usar los máximos existentes de 0,34 m de ancho, 0,14 m de alto y 0,16 m de profundidad hacia adelante en el espacio local del anclaje de gafas.

El control de aceptación en 3D incluye neutral, cierre total, sonrisa, apertura de boca y la combinación de cierre con sonrisa y apertura. Revisar cada pose de frente y en tres cuartos, con los extremos de los ajustes habilitados. Las pruebas deben cubrir cierre de los párpados, lectura de las comisuras, conservación de las proporciones y holgura de cada pieza.

<details>
<summary>Prompt de la lámina generada con ImageGen</summary>

Create ONE cohesive landscape 3×3 CHARACTER APPROVAL SHEET for the original Argentine multiplayer junkyard invention comedy game Los del Desguace. This is a single polished game-art sheet, visually look like nine viewport renders from one SHARED modular low-poly to mid-poly 3D facial mesh and facial rig. Neutral slate-blue-gray studio background, subtle light separators, soft broad lighting, crisp readable facial details, simple softly beveled low-poly game geometry, matte painted finish, no surface noise, no realism. Consistent straight-on orthographic eye-level camera in EVERY cell, identical framing, scale, neck width, head pivot and shoulders. Same teal blue overalls with brass fasteners and cream undershirt on every bust, cropped at upper chest. All are adult mechanics in an absurd physical comedy game, with expressive asymmetry, distinctive silhouettes, straightforward slightly off-white eyes, tiny matte black dot pupils, compact eyelids, readable simple mouths. No anime, no oversized irises, no sparkle or reflective eyes, no baby or child look, no Pixar-style baby proportions.

Grid requirements: exactly three columns and three rows, nine distinct well-sized bust renders with comfortable whitespace. Include just three small header words at the top 'NEUTRAL', 'PARPADEO', 'SONRISA'. If you include name labels, put names in a narrow separate left margin aligned to each row: 'INVENTOR DESPISTADO', 'MECÁNICO DESCONFIADO', 'INVENTOR ENTUSIASMADO'. Do not put labels over the heads. No extra legends, titling, perspective shifts or panels. Columns show EXACTLY the same person, accessories, face proportions, camera, head rotation, outfit and placements in the three cells within each row. First column eyes open, natural resting mouth, no posed smile. Second column a full blink with BOTH eyes completely closed using sculpted skin-colored upper eyelids and thin curved dark lid creases, retain the first column's mouth and eyebrows. Third column eyes open, clear asymmetrical smile with parted lips (small dark negative shape and a single upper teeth block) and raised cheeks, maintain all identity features. Mouth corners and eyelids are visible and unobstructed, accessories must hold their fit across each expression. Smiles differ in intensity in each row.

Row 1 Inventor despistado: warm light tan skin, slightly elongated narrow face, narrow jaw, small asymmetric eyebrows mostly raised, thin droopy off-white eyelid aperture and slightly wandering tiny pupils, longer rounded drooping nose, full rusty auburn irregular hair with one bent forelock and smooth sides, bare chin, small thin circular brass glasses with completely clear lenses, no hat. The glasses sit low enough so the top rim does not hide brows, but leave the eyelids readable and the small low bridge nests above the nose tip. Modest lopsided smile.

Row 2 Mecánico desconfiado: darker warm brown skin, slightly broad square jaw, heavier cheekbones, cranky shallow off-white eyelid aperture with tiny pupils, stout short broad nose, one lowered thick dark eyebrow and the other at a skeptic angle; coal-black tight sideburns and a short trimmed jawline/chin beard (keep both lips and corners exposed, no mustache); simple dull olive mechanic's short-brim cap with brim above brow, no eyewear. Tight crooked reluctant smile.

Row 3 Inventor entusiasmado: medium golden warm skin, moderately broad cheekbones taper to small firm adult chin, short upturned nose, off-white eyes a touch rounder and more open (same human-size eye sockets, tiny near black pupils), short asymmetric black-blue curly hair at temples, yellow worn hard hat and clear desaturated slate workshop goggles parked on the hard hat above the brim with visible low profile mount, no facial hair. Side-to-side wide delighted smile.

Family resemblance through identical ear forms, neck connection, eyeball construction, material style and facial feature layout. Differences via restrained cheek width, jaw taper, cranial height, and interchangeable feature modules, no wholesale skull or body redesign. Maintain all row identities precisely across all three columns. Render readable even when viewed at thumbnail scale.

</details>
