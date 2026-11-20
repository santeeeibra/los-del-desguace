# Prueba mínima de red

Comprueba, con 2 a 4 dispositivos, que una caja física simulada por el anfitrión
se ve igual en todos, que el agarre tiene un solo dueño y que reconectar y
cerrar la sala funcionan. **No es el juego** ni usa servicios externos.

- `relayCore.ts`: salas, anfitrión, reenvío en estrella y conteo de mensajes y bytes. Sin E/S, para poder montarlo después en otro servicio.
- `relay.ts`: servidor WebSocket local en Node 22+, sin dependencias.
- `src/dev/netLab/`: escena de prueba en el navegador (`?lab=net`, solo en `npm run dev`).

## Cómo ejecutarla en la misma red Wi‑Fi

1. En la PC, en dos terminales:
   ```
   npm run relay              # relay en el puerto 8787
   npm run dev -- --host      # Vite visible en la red local
   ```
2. Averiguá la IP local de la PC: en Windows, `ipconfig` (Dirección IPv4, por ejemplo 192.168.0.20).
3. **Anfitrión** (en la PC): abrí `http://localhost:5173/?lab=net&room=PRUEBA`.
4. **Invitado** (en el celular, con el mismo Wi‑Fi): abrí `http://192.168.0.20:5173/?lab=net&room=PRUEBA`.
   El relay se busca en la misma IP, puerto 8787. Para otro relay: `&relay=ws://IP:PUERTO`.
5. Si Windows pregunta por el firewall, permití Node en redes privadas.

Para probarlo en una sola PC, abrí una ventana normal y otra de incógnito con la misma sala.

**Controles**
- Movimiento: WASD o flechas; en el celular, arrastrando en la mitad inferior izquierda.
- Agarrar o soltar: botón o tecla `E`.

## Guion de 5 minutos

1. Los dos se mueven y empujan la caja (1 min).
2. El invitado la agarra, la lleva y la suelta. Después lo mismo el anfitrión.
3. El anfitrión toca **Prueba de conflicto**: los dos piden la caja en el mismo instante.
4. El invitado toca **Simular corte**: se desconecta 3 s y reconecta.
5. Repetir el corte de verdad: apagar el Wi‑Fi del celular unos 5 s.
6. El anfitrión cierra la pestaña.
7. En el invitado, tocá **Copiar resultados** antes del paso 6 y pegalos en un archivo o mensaje.

## Criterios de aprobación (medidos en el invitado)

| Medida | Qué es | Aprueba si |
|---|---|---|
| RTT p95 | Ida y vuelta invitado → anfitrión pasando por el relay | ≤ 60 ms en la misma Wi‑Fi; ≤ 250 ms entre redes distintas |
| Snapshots/s | Frecuencia con la que llega el estado de la caja (se envía a 20/s) | ≥ 18 |
| Huecos > 250 ms | Pausas perceptibles sin estado nuevo | ≤ 3 en 5 min (no cuenta el corte simulado) |
| Saltos | Cuadros donde la caja se desplaza más de 15 cm por encima de su velocidad real | ≤ 5 en 5 min |
| Teletransportes | Lo mismo, pero más de 50 cm | 0 (las reubicaciones intencionales del anfitrión se informan aparte) |
| Error en reposo p95 | Con la caja quieta, distancia entre lo dibujado y el estado del anfitrión | ≤ 2 cm |
| Conflicto | Dueños tras pedir la caja a la vez | Exactamente 1 y todos ven el mismo («todos coinciden: SÍ») |
| Reconexión | Desde que vuelve la conexión hasta el primer estado | ≤ 5 s, con la caja en su lugar correcto al primer cuadro |
| Salida del anfitrión | Aviso «El anfitrión salió. La ronda terminó.» | ≤ 1 s si cierra la pestaña; ≤ 7 s si pierde la red de golpe (latido cada 1,5 s, corte a los 5 s) |

El panel del relay muestra mensajes recibidos/s, reenvíos/s y bytes por mensaje,
para recalcular costos con datos reales. `http://IP:8787/stats` devuelve lo mismo en JSON.

## Prueba entre redes distintas (pendiente)

Necesita que el relay sea accesible desde internet: un servicio alojado o un
túnel. No se creó ninguna cuenta ni se contrató nada. `vite.config.ts` ya
permite un host `*.trycloudflare.com`, así que el proyecto usó antes un túnel
rápido de Cloudflare. Hay que verificar en la documentación oficial si ese
túnel admite WebSockets y qué límites tiene antes de usarlo para esta prueba.
