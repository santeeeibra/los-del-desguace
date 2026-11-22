import { useEffect } from 'react';
import { snapshotPrimaryInteractRequest, type InteractRequest } from '../invention/interactResolution';
import type { ContraptionBlueprint } from '../logic/blueprintManager';
import type { ContractId } from '../modes/contracts';
import { gameStore, HOTBAR_TOOLS } from '../state/gameStore';
import { buildToolsLocked } from '../modes/gameModes';
import { playWoodClick } from '../audio/sfxEngine';
import { sprayUi } from '../invention/paintStore';
import { bodyworkStore } from '../invention/bodywork';

export interface PlayerInputSnapshot {
  forward: boolean;
  backward: boolean;
  leftward: boolean;
  rightward: boolean;
  jump: boolean;
  run: boolean;
  joystick: { x: number; y: number };
}

export type CartAction =
  | 'toggle'
  | 'rotate'
  | 'rotate-back'
  | 'rotate-base'
  | 'rotate-base-back'
  | 'rotate-base-x'
  | 'rotate-base-z'
  | 'position'
  | 'push'
  | 'undo'
  | 'repair'
  | 'retry'
  | 'return-workshop'
  | 'bench'
  | 'move-fwd'
  | 'move-back'
  | 'move-left'
  | 'move-right'
  | 'move-up'
  | 'move-down';

export type PartContextAction =
  | 'toggle-switch'
  | 'timer-fast'
  | 'timer-med'
  | 'timer-slow'
  | 'test-pulse'
  | 'invert-motor'
  | 'unwire'
  | 'weld'
  | 'smart-use'
  | 'cycle-timer'
  | 'ride'
  | 'drop'
  | 'unmount';

type MovementKey = 'forward' | 'backward' | 'leftward' | 'rightward';
type BlueprintAction = { type: 'save'; name: string }
  | { type: 'load'; blueprint: ContraptionBlueprint }
  | { type: 'preset'; blueprint: ContraptionBlueprint; startContract?: ContractId };
const MOVEMENT_KEYS: Partial<Record<string, MovementKey>> = {
  KeyW: 'forward', w: 'forward', ArrowUp: 'forward',
  KeyS: 'backward', s: 'backward', ArrowDown: 'backward',
  KeyA: 'leftward', a: 'leftward', ArrowLeft: 'leftward',
  KeyD: 'rightward', d: 'rightward', ArrowRight: 'rightward',
};

class PlayerInputBus {
  private blueprintAction: BlueprintAction | null = null;
  menuOpen = false;
  lastPointerLockExitAt = 0;
  interactHeld = false;
  /**
   * Solo táctil: mantener apretado automático de la Sierra, la Amoladora y la Soldadora. Un toque lo
   * enciende y otro lo apaga, así el pulgar queda libre para girar la cámara. En PC nunca se usa.
   */
  touchToolLatch = false;
  /** Toque corto con el aerosol (un disparo de pintura). */
  sprayTap = false;
  /** Desde el asiento: alternar interruptor / piezas robóticas del vehículo (F o botón Accionar). */
  seatRoboticsToggle = false;
  /** Soltar el gancho del cabrestante (N o botón Soltar gancho). */
  winchRelease = false;
  /** Solo táctil: pedido de cancelar el corte de la Sierra que está armado. */
  touchSawCancel = false;
  /** F mantenida (soldar con la soldadora). */
  weldHeld = false;

  triggerBlueprintAction(action: BlueprintAction) {
    this.blueprintAction = action;
  }

  consumeBlueprintAction() {
    const action = this.blueprintAction;
    this.blueprintAction = null;
    return action;
  }

  keys = {
    forward: false,
    backward: false,
    leftward: false,
    rightward: false,
    jump: false,
    run: false,
  };

  touch = {
    joystickX: 0,
    joystickY: 0,
    jump: false,
    run: false,
    descend: false,
  };

  private interactCount = 0;
  private interactRequest: InteractRequest | null = null;
  private cartAction: CartAction | null = null;
  private partAction: PartContextAction | null = null;
  private inventoryAction: number | 'store' | null = null;
  private wireRequested = false;
  readonly logicKeys: Record<string, boolean> = {};

  requestWire() {
    if (buildToolsLocked()) return;
    this.wireRequested = true;
  }

  consumeWire(): boolean {
    const requested = this.wireRequested;
    this.wireRequested = false;
    return requested;
  }

  setMovementKey(code: string, key: string, pressed: boolean) {
    const movement = MOVEMENT_KEYS[code] ?? MOVEMENT_KEYS[key.toLowerCase()];
    if (!movement) return false;
    this.keys[movement] = pressed;
    return true;
  }

  triggerInventoryAction(action: number | 'store') {
    this.inventoryAction = action;
  }

  consumeInventoryAction() {
    const action = this.inventoryAction;
    this.inventoryAction = null;
    return action;
  }

  triggerCartAction(action: CartAction) {
    this.cartAction = action;
  }

  consumeCartAction() {
    const action = this.cartAction;
    this.cartAction = null;
    return action;
  }

  triggerPartAction(action: PartContextAction) {
    this.partAction = action;
  }

  consumePartAction() {
    const action = this.partAction;
    this.partAction = null;
    return action;
  }

  triggerInteract(request?: InteractRequest) {
    this.interactCount += 1;
    this.interactRequest = request ?? snapshotPrimaryInteractRequest(gameStore.getState());
  }

  consumeInteractRequest(): InteractRequest | null {
    if (this.interactCount > 0) {
      this.interactCount = 0;
      const req = this.interactRequest ?? { intent: 'default', targetId: null };
      this.interactRequest = null;
      return req;
    }
    return null;
  }

  consumeInteract(): boolean {
    return this.consumeInteractRequest() !== null;
  }

  setTouchJoystick(x: number, y: number) {
    this.touch.joystickX = Number.isFinite(x) ? x : 0;
    this.touch.joystickY = Number.isFinite(y) ? y : 0;
  }

  setTouchSteer(steer: number) {
    const clamped = Number.isFinite(steer) ? Math.max(-1, Math.min(1, steer)) : 0;
    this.touch.joystickX = clamped;
  }

  setTouchThrottle(throttle: number) {
    const clamped = Number.isFinite(throttle) ? Math.max(-1, Math.min(1, throttle)) : 0;
    this.touch.joystickY = clamped;
  }

  setTouchJump(pressed: boolean) {
    this.touch.jump = pressed;
  }

  setTouchRun(pressed: boolean) {
    this.touch.run = pressed;
  }

  setTouchDescend(pressed: boolean) {
    this.touch.descend = pressed;
  }

  fillMovement(out: PlayerInputSnapshot) {
    out.forward = this.keys.forward;
    out.backward = this.keys.backward;
    out.leftward = this.keys.leftward;
    out.rightward = this.keys.rightward;
    out.jump = this.keys.jump || this.touch.jump;
    out.run = this.keys.run || this.touch.run;
    out.joystick.x = this.touch.joystickX;
    out.joystick.y = this.touch.joystickY;
  }

  resetKeyboard() {
    this.keys.forward = false;
    this.keys.backward = false;
    this.keys.leftward = false;
    this.keys.rightward = false;
    this.keys.jump = false;
    this.keys.run = false;
    for (const code of Object.keys(this.logicKeys)) delete this.logicKeys[code];
  }

  resetAll() {
    this.resetKeyboard();
    this.resetTouchAndActions();
  }

  resetTouchAndActions() {
    this.interactHeld = false;
    this.touchToolLatch = false;
    this.touchSawCancel = false;
    this.weldHeld = false;
    this.touch.joystickX = 0;
    this.touch.joystickY = 0;
    this.touch.jump = false;
    this.touch.run = false;
    this.touch.descend = false;
    this.interactCount = 0;
    this.interactRequest = null;
    this.partAction = null;
    this.cartAction = null;
    this.inventoryAction = null;
    this.wireRequested = false;
  }
}

export const playerInput = new PlayerInputBus();

export interface KeyDownLike {
  code: string;
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  target?: EventTarget | null;
  preventDefault?: () => void;
}

export function dispatchGameKeyDown(e: KeyDownLike) {
  if (e.code === 'Escape') {
    playerInput.resetAll();
    return;
  }
  if (playerInput.menuOpen) return;
  if (
    typeof HTMLElement !== 'undefined' &&
    e.target instanceof HTMLElement &&
    (e.target.matches('input, textarea, select') || e.target.isContentEditable)
  ) {
    playerInput.resetKeyboard();
    return;
  }
  if (!e.ctrlKey && !e.metaKey && !e.altKey) playerInput.logicKeys[e.code] = true;
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') { e.preventDefault?.(); playerInput.triggerCartAction('move-fwd'); return; }
    if (e.code === 'KeyS' || e.code === 'ArrowDown') { e.preventDefault?.(); playerInput.triggerCartAction('move-back'); return; }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') { e.preventDefault?.(); playerInput.triggerCartAction('move-left'); return; }
    if (e.code === 'KeyD' || e.code === 'ArrowRight') { e.preventDefault?.(); playerInput.triggerCartAction('move-right'); return; }
    if (e.code === 'Space') { e.preventDefault?.(); playerInput.triggerCartAction('move-up'); return; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault?.(); playerInput.triggerCartAction('move-down'); return; }
  }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && playerInput.setMovementKey(e.code, e.key, true)) {
    e.preventDefault?.();
    return;
  }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
    const hud = gameStore.getState();
    if (!hud.seated) {
      if (e.code === 'Digit0' || e.code === 'Backquote') {
        gameStore.selectTool('hand');
        playWoodClick();
        return;
      }
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit) {
        const n = Number(digit[1]);
        if (n >= 1 && n <= 5) {
          if (buildToolsLocked()) {
            playerInput.triggerInventoryAction(n - 1);
          } else {
            gameStore.selectTool(HOTBAR_TOOLS[n - 1]);
            playWoodClick();
          }
          return;
        }
        if (n === 6) {
          playerInput.triggerInventoryAction(5);
          return;
        }
        // Teclas 7, 8, 9 → bolsillos rápidos de piezas (slots 0, 1, 2)
        playerInput.triggerInventoryAction(n - 7);
        return;
      }
    }
    if (e.code === 'KeyI') {
      playerInput.triggerInventoryAction('store');
      return;
    }
  }
  switch (e.code) {
    case 'Space':
      e.preventDefault?.();
      playerInput.keys.jump = true;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      playerInput.keys.run = true;
      break;
    case 'KeyE':
      if (!e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey) {
        playerInput.interactHeld = true;
        playerInput.triggerInteract();
      }
      break;
    case 'KeyQ':
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) gameStore.selectPreviousInventory();
      break;
    case 'KeyN':
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) playerInput.winchRelease = true;
      break;
    case 'KeyF':
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && gameStore.getState().seated) {
        playerInput.seatRoboticsToggle = true;
        break;
      }
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        playerInput.weldHeld = true;
        playerInput.triggerPartAction('smart-use');
      }
      break;
    case 'KeyV':
      if (!e.repeat) {
        gameStore.cycleCameraMode();
      }
      break;
    case 'KeyR':
      if (!e.ctrlKey && !e.metaKey) {
        const hudR = gameStore.getState();
        // Con el aerosol en la mano (y nada cargado), R cambia de modo: Pintar todo ↔ Mano alzada.
        if (hudR.sprayEquipped && !hudR.carriedKind) {
          if (!e.repeat) { sprayUi.toggleMode(); playWoodClick(); }
          break;
        }
        // Con una chapa de carrocería en la mano, R elige el ángulo de encastre al borde (0°, ±45°, ±90°).
        if (hudR.carriedKind === 'bodywork') {
          if (!e.repeat) {
            const angle = bodyworkStore.cycleSnapAngle(e.shiftKey ? -1 : 1);
            gameStore.setWireHint(`Ángulo de encastre: ${Math.round(angle * 180 / Math.PI)}°`);
            playWoodClick();
          }
          break;
        }
        playerInput.triggerCartAction(e.shiftKey ? 'rotate-back' : 'rotate');
      }
      break;
    case 'KeyY':
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !gameStore.getState().seated && !buildToolsLocked()) {
        gameStore.selectTool('spray');
        playWoodClick();
      }
      break;
    case 'KeyB':
      if (!e.ctrlKey && !e.metaKey && gameStore.getState().wrenchEquipped) {
        playerInput.triggerCartAction(e.shiftKey ? 'rotate-base-back' : 'rotate-base');
      }
      break;
    case 'KeyX':
      if (!e.repeat && !e.ctrlKey && !e.metaKey) {
        if (e.shiftKey) gameStore.toggleWelder();
        else gameStore.selectTool('wrench');
      }
      break;
    case 'KeyM':
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) gameStore.toggleWrenchAimLock();
      break;
    case 'KeyZ':
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.repeat) {
        e.preventDefault?.();
        playerInput.triggerCartAction('undo');
      } else if (!e.repeat && !e.ctrlKey && !e.metaKey) gameStore.cycleWrenchAxis();
      break;
    case 'KeyU':
      if (!e.repeat && !e.ctrlKey && !e.metaKey) playerInput.triggerCartAction('undo');
      break;
    case 'PageUp':
      playerInput.triggerCartAction('move-up');
      break;
    case 'PageDown':
      playerInput.triggerCartAction('move-down');
      break;
    case 'KeyT':
      if (!e.repeat) playerInput.triggerCartAction('toggle');
      break;
    case 'KeyP':
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) playerInput.triggerCartAction('push');
      break;
    case 'KeyL':
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (gameStore.getState().wiringActive) playerInput.requestWire();
        else gameStore.selectTool('wire');
      }
      break;
    case 'KeyK':
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) playerInput.triggerPartAction('unwire');
      break;
    case 'KeyO':
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) playerInput.triggerPartAction('cycle-timer');
      break;
    case 'KeyH':
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) playerInput.triggerCartAction('repair');
      break;
    case 'KeyJ':
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) playerInput.triggerPartAction('ride');
      break;
  }
}

export function useKeyboardInput() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => dispatchGameKeyDown(e);

    const onKeyUp = (e: KeyboardEvent) => {
      delete playerInput.logicKeys[e.code];
      if (playerInput.setMovementKey(e.code, e.key, false)) return;
      switch (e.code) {
        case 'KeyE':
          playerInput.interactHeld = false;
          break;
        case 'KeyF':
          playerInput.weldHeld = false;
          break;
        case 'Space':
          playerInput.keys.jump = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          playerInput.keys.run = false;
          break;
      }
    };

    const resetInput = () => playerInput.resetAll();

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', resetInput);
    window.addEventListener('focus', resetInput);
    window.addEventListener('pagehide', resetInput);
    document.addEventListener('visibilitychange', resetInput);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', resetInput);
      window.removeEventListener('focus', resetInput);
      window.removeEventListener('pagehide', resetInput);
      document.removeEventListener('visibilitychange', resetInput);
      resetInput();
    };
  }, []);
}
