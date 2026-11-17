import { useEffect } from 'react';

export interface PlayerInputSnapshot {
  forward: boolean;
  backward: boolean;
  leftward: boolean;
  rightward: boolean;
  jump: boolean;
  run: boolean;
  joystick: { x: number; y: number };
}

class PlayerInputBus {
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
  };

  private interactCount = 0;

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
    this.touch.joystickX = x;
    this.touch.joystickY = y;
  }

  setTouchJump(pressed: boolean) {
    this.touch.jump = pressed;
  }

  setTouchRun(pressed: boolean) {
    this.touch.run = pressed;
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

  resetAll() {
    this.keys.forward = false;
    this.keys.backward = false;
    this.keys.leftward = false;
    this.keys.rightward = false;
    this.keys.jump = false;
    this.keys.run = false;
    this.touch.joystickX = 0;
    this.touch.joystickY = 0;
    this.touch.jump = false;
    this.touch.run = false;
    this.interactCount = 0;
  }
}

export const playerInput = new PlayerInputBus();

export function useKeyboardInput() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          playerInput.keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          playerInput.keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          playerInput.keys.leftward = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          playerInput.keys.rightward = true;
          break;
        case 'Space':
          e.preventDefault();
          playerInput.keys.jump = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          playerInput.keys.run = true;
          break;
        case 'KeyE':
        case 'KeyF':
          if (!e.repeat) {
            playerInput.triggerInteract();
          }
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          playerInput.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          playerInput.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          playerInput.keys.leftward = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          playerInput.keys.rightward = false;
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

    const onBlur = () => {
      playerInput.resetAll();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}
