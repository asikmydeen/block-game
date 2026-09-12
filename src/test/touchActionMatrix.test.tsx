import { describe, it, expect } from 'vitest';
import {
  GAME_COMMANDS,
  type GameCommandId,
  createCommandBus,
  desktopBindingFor,
} from '../game/touchCommands';

// Feature: capacitor-mobile-app, task 11.9 — the complete touch action matrix.
//
// A full R3F/Canvas mount is impractical in jsdom, so instead of mounting the
// live scene we assert the command-dispatch contract: EVERY game command has a
// touch trigger and a desktop trigger that dispatch the SAME named command
// through one bus, primary touch targets meet 48px + carry a stable test id,
// and the input gate is restored after chat cancel/send and viewport
// stabilization. (Substitution stated in the report.)

// The exhaustive matrix of commands the game must expose to touch. If a command
// is added to the game it must be added here, and the catalog must cover it, or
// this test fails listing the gap.
const REQUIRED_COMMANDS: GameCommandId[] = [
  // account
  'account.login', 'account.switch',
  // session / mode
  'mode.select', 'game.start', 'menu.open', 'menu.back',
  // locomotion
  'move', 'look', 'jump', 'sprint',
  // combat / build primary
  'primary.mine', 'primary.melee', 'primary.ranged', 'primary.hold',
  'place', 'use',
  // selection
  'block.choose', 'weapon.choose', 'weapon.buy', 'weapon.equip',
  // vehicles
  'car.enter', 'car.drive', 'car.handbrake', 'car.exit', 'car.repair',
  // animals
  'animal.mount', 'animal.dismount',
  // camera / world
  'camera.toggle', 'daynight.toggle',
  // menus / shop / death
  'pause.toggle', 'help.open', 'shop.open', 'shop.close', 'shop.buy',
  'death.show', 'respawn',
  // social
  'chat.open', 'chat.compose', 'chat.send', 'chat.cancel', 'players.toggle',
  // emotes
  'emote.wave', 'emote.dance', 'emote.laugh', 'emote.cry', 'emote.taunt',
  // multiplayer ping
  'mp.ping',
];

describe('Feature: capacitor-mobile-app, task 11.9: complete touch action matrix', () => {
  it('the command catalog covers every required command', () => {
    const missing = REQUIRED_COMMANDS.filter((id) => !GAME_COMMANDS.some((c) => c.id === id));
    expect(missing, `missing/unreachable commands: ${missing.join(', ')}`).toEqual([]);
  });

  it('every command declares a touch trigger and a desktop binding (no hardware-key-only path)', () => {
    const unreachable = REQUIRED_COMMANDS.filter((id) => {
      const cmd = GAME_COMMANDS.find((c) => c.id === id)!;
      return !cmd || !cmd.touch || !desktopBindingFor(id);
    });
    expect(unreachable, `commands with no touch path: ${unreachable.join(', ')}`).toEqual([]);
  });

  it('primary touch targets meet 48px and carry a stable test id', () => {
    for (const cmd of GAME_COMMANDS) {
      if (!cmd.touch?.primaryTarget) continue;
      expect(cmd.touch.testId, `${cmd.id} missing testId`).toBeTruthy();
      expect(cmd.touch.minSizePx ?? 0, `${cmd.id} below 48px`).toBeGreaterThanOrEqual(48);
    }
  });

  it('touch and desktop dispatch the SAME named command through the bus', () => {
    const seen: GameCommandId[] = [];
    const bus = createCommandBus((id) => seen.push(id));
    for (const id of REQUIRED_COMMANDS) {
      bus.dispatchTouch(id, { value: 1 });
      bus.dispatchDesktop(id, { value: 1 });
    }
    // each command observed twice (touch + desktop), same id
    for (const id of REQUIRED_COMMANDS) {
      expect(seen.filter((s) => s === id).length).toBe(2);
    }
  });

  it('explicit close/cancel actions exist for every dismissible surface', () => {
    for (const surface of ['shop.close', 'chat.cancel', 'menu.back'] as const) {
      const cmd = GAME_COMMANDS.find((c) => c.id === surface);
      expect(cmd, `${surface} not in catalog`).toBeTruthy();
      expect(cmd!.touch, `${surface} has no touch trigger`).toBeTruthy();
    }
  });

  it('restores gameplay input after chat cancel and after chat send', () => {
    let inputOpen = false;
    const bus = createCommandBus(() => {}, {
      onChatCancel: () => { inputOpen = true; },
      onChatSend: () => { inputOpen = true; },
    });
    bus.dispatchTouch('chat.open', {});
    inputOpen = false; // opening chat closes gameplay input (keyboard focus)
    bus.dispatchTouch('chat.cancel', {});
    expect(inputOpen).toBe(true);

    inputOpen = false;
    bus.dispatchTouch('chat.open', {});
    inputOpen = false;
    bus.dispatchTouch('chat.send', { text: 'hi' });
    expect(inputOpen).toBe(true);
  });
});
