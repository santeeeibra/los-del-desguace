import { useEffect } from 'react';
import type { ContraptionBlueprint } from '../logic/blueprintManager';
import { gameStore } from '../state/gameStore';
import { buildToolsLocked } from '../modes/gameModes';
import { INVENTORY_SIZE } from '../state/inventory';

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
  | 'push'
  | 'undo'
  | 'repair'
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
  | 'ride';

type MovementKey = 'forward' | 'backward' | 'leftward' | 'rightward';
type BlueprintAction = { type: 'save'; name: string } | { type: 'load'; blueprint: ContraptionBlueprint };
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

  triggerInteract() {
    this.interactCount += 1;
  }

  consumeInteract(): boolean {
    if (this.interactCount > 0) {
      this.interactCount = 0;
      return true;
    }
    return false;
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
    this.touch.joystickX = 0;
    this.touch.joystickY = 0;
    this.touch.jump = false;
    this.touch.run = false;
    this.touch.descend = false;
    this.interactCount = 0;
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
    const slot = /^Digit([1-6])$/.exec(e.code);
    const index = slot ? Number(slot[1]) - 1 : -1;
    if (index >= 0 && index < INVENTORY_SIZE) {
      playerInput.triggerInventoryAction(index);
      return;
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
      if (!e.repeat) {
        playerInput.triggerInteract();
      }
      break;
    case 'KeyF':
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        playerInput.triggerPartAction('smart-use');
      }
      break;
    case 'KeyV':
      if (!e.repeat) {
        gameStore.cycleCameraMode();
      }
      break;
    case 'KeyR':
      if (!e.ctrlKey && !e.metaKey && (!e.repeat || gameStore.getState().wrenchEquipped)) {
        playerInput.triggerCartAction(e.shiftKey ? 'rotate-back' : 'rotate');
      }
      break;
    case 'KeyB':
      if (!e.ctrlKey && !e.metaKey && gameStore.getState().wrenchEquipped) {
        playerInput.triggerCartAction(e.shiftKey ? 'rotate-base-back' : 'rotate-base');
      }
      break;
    case 'KeyX':
      if (!e.repeat && !e.ctrlKey && !e.metaKey) gameStore.toggleWrench();
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
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) playerInput.requestWire();
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
