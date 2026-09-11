// Shared game-command catalog.
//
// Every action the game supports is a NAMED command with (a) a desktop binding
// (key/mouse) and (b) a touch trigger. Touch UI and desktop input both dispatch
// the same command id through one bus, which is what guarantees touch parity
// without a divergent code path (task 11.9/11.10). A full R3F/Canvas mount is
// impractical in jsdom, so the parity contract is asserted at this dispatch
// boundary rather than by driving the live scene.

export type GameCommandId =
  | 'account.login'
  | 'account.switch'
  | 'mode.select'
  | 'game.start'
  | 'menu.open'
  | 'menu.back'
  | 'move'
  | 'look'
  | 'jump'
  | 'sprint'
  | 'primary.mine'
  | 'primary.melee'
  | 'primary.ranged'
  | 'primary.hold'
  | 'place'
  | 'use'
  | 'block.choose'
  | 'weapon.choose'
  | 'weapon.buy'
  | 'weapon.equip'
  | 'car.enter'
  | 'car.drive'
  | 'car.handbrake'
  | 'car.exit'
  | 'car.repair'
  | 'animal.mount'
  | 'animal.dismount'
  | 'camera.toggle'
  | 'daynight.toggle'
  | 'pause.toggle'
  | 'help.open'
  | 'shop.open'
  | 'shop.close'
  | 'shop.buy'
  | 'death.show'
  | 'respawn'
  | 'chat.open'
  | 'chat.compose'
  | 'chat.send'
  | 'chat.cancel'
  | 'players.toggle'
  | 'emote.wave'
  | 'emote.dance'
  | 'emote.laugh'
  | 'emote.cry'
  | 'emote.taunt'
  | 'mp.ping';

export interface TouchTrigger {
  // A stable data-testid the touch control renders, so device automation and
  // the matrix test can find it without hardware keys.
  testId: string;
  // Whether this is a primary target subject to the 48px minimum.
  primaryTarget?: boolean;
  minSizePx?: number;
}

export interface GameCommand {
  id: GameCommandId;
  // Human label (used for aria-label / titles).
  label: string;
  touch: TouchTrigger;
}

// Desktop binding map — the existing keyboard/mouse gestures, unchanged. This
// is descriptive: Game.tsx keeps its own listeners byte-identical; this map
// only records which desktop gesture corresponds to each command so the matrix
// test can prove no command is touch-unreachable or desktop-unreachable.
const DESKTOP_BINDINGS: Record<GameCommandId, string> = {
  'account.login': 'enter',
  'account.switch': 'click:switch-user',
  'mode.select': 'click:mode-card',
  'game.start': 'click:canvas',
  'menu.open': 'click:menu',
  'menu.back': 'escape',
  move: 'wasd',
  look: 'mousemove',
  jump: 'space',
  sprint: 'shift',
  'primary.mine': 'mouseleft',
  'primary.melee': 'mouseleft',
  'primary.ranged': 'mouseleft',
  'primary.hold': 'mouseleft-hold',
  place: 'mouseright',
  use: 'e',
  'block.choose': 'digit1-9',
  'weapon.choose': 'q',
  'weapon.buy': 'click:shop-buy',
  'weapon.equip': 'click:weapon-slot',
  'car.enter': 'e',
  'car.drive': 'wasd',
  'car.handbrake': 'space',
  'car.exit': 'e',
  'car.repair': 'r',
  'animal.mount': 'e',
  'animal.dismount': 'e',
  'camera.toggle': 'click:camera',
  'daynight.toggle': 'click:daynight',
  'pause.toggle': 'escape',
  'help.open': 'click:help',
  'shop.open': 'b',
  'shop.close': 'escape',
  'shop.buy': 'click:shop-buy',
  'death.show': 'auto',
  respawn: 'click:respawn',
  'chat.open': 'enter',
  'chat.compose': 'keyboard',
  'chat.send': 'enter',
  'chat.cancel': 'escape',
  'players.toggle': 'p',
  'emote.wave': 'digit',
  'emote.dance': 'digit',
  'emote.laugh': 'digit',
  'emote.cry': 'digit',
  'emote.taunt': 'digit',
  'mp.ping': 'click:ping',
};

export function desktopBindingFor(id: GameCommandId): string | undefined {
  return DESKTOP_BINDINGS[id];
}

function t(testId: string, primary = false): TouchTrigger {
  return primary ? { testId, primaryTarget: true, minSizePx: 48 } : { testId };
}

export const GAME_COMMANDS: GameCommand[] = [
  { id: 'account.login', label: 'Play', touch: t('touch-login', true) },
  { id: 'account.switch', label: 'Switch user', touch: t('touch-switch-user', true) },
  { id: 'mode.select', label: 'Select mode', touch: t('touch-mode', true) },
  { id: 'game.start', label: 'Start', touch: t('touch-start', true) },
  { id: 'menu.open', label: 'Menu', touch: t('touch-menu', true) },
  { id: 'menu.back', label: 'Back to menu', touch: t('touch-menu-back', true) },
  { id: 'move', label: 'Move', touch: t('touch-joystick', true) },
  { id: 'look', label: 'Look', touch: t('touch-lookpad') },
  { id: 'jump', label: 'Jump', touch: t('touch-jump', true) },
  { id: 'sprint', label: 'Sprint', touch: t('touch-sprint', true) },
  { id: 'primary.mine', label: 'Mine', touch: t('touch-primary', true) },
  { id: 'primary.melee', label: 'Attack', touch: t('touch-primary', true) },
  { id: 'primary.ranged', label: 'Fire', touch: t('touch-primary', true) },
  { id: 'primary.hold', label: 'Hold fire', touch: t('touch-primary', true) },
  { id: 'place', label: 'Place', touch: t('touch-place', true) },
  { id: 'use', label: 'Use', touch: t('touch-use', true) },
  { id: 'block.choose', label: 'Choose block', touch: t('touch-block-choose', true) },
  { id: 'weapon.choose', label: 'Choose weapon', touch: t('touch-weapon-choose', true) },
  { id: 'weapon.buy', label: 'Buy weapon', touch: t('touch-weapon-buy', true) },
  { id: 'weapon.equip', label: 'Equip weapon', touch: t('touch-weapon-equip', true) },
  { id: 'car.enter', label: 'Drive', touch: t('touch-car-enter', true) },
  { id: 'car.drive', label: 'Drive', touch: t('touch-joystick', true) },
  { id: 'car.handbrake', label: 'Handbrake', touch: t('touch-handbrake', true) },
  { id: 'car.exit', label: 'Exit vehicle', touch: t('touch-car-exit', true) },
  { id: 'car.repair', label: 'Repair', touch: t('touch-car-repair', true) },
  { id: 'animal.mount', label: 'Ride', touch: t('touch-animal-mount', true) },
  { id: 'animal.dismount', label: 'Dismount', touch: t('touch-animal-dismount', true) },
  { id: 'camera.toggle', label: 'Camera', touch: t('touch-camera', true) },
  { id: 'daynight.toggle', label: 'Day/Night', touch: t('touch-daynight', true) },
  { id: 'pause.toggle', label: 'Pause', touch: t('touch-pause', true) },
  { id: 'help.open', label: 'Help', touch: t('touch-help', true) },
  { id: 'shop.open', label: 'Shop', touch: t('touch-shop', true) },
  { id: 'shop.close', label: 'Close shop', touch: t('touch-shop-close', true) },
  { id: 'shop.buy', label: 'Buy', touch: t('touch-shop-buy', true) },
  { id: 'death.show', label: 'You died', touch: t('touch-death') },
  { id: 'respawn', label: 'Respawn', touch: t('touch-respawn', true) },
  { id: 'chat.open', label: 'Open chat', touch: t('touch-chat-open', true) },
  { id: 'chat.compose', label: 'Compose message', touch: t('touch-chat-input') },
  { id: 'chat.send', label: 'Send', touch: t('touch-chat-send', true) },
  { id: 'chat.cancel', label: 'Cancel', touch: t('touch-chat-cancel', true) },
  { id: 'players.toggle', label: 'Players', touch: t('touch-players', true) },
  { id: 'emote.wave', label: 'Wave', touch: t('touch-emote-wave', true) },
  { id: 'emote.dance', label: 'Dance', touch: t('touch-emote-dance', true) },
  { id: 'emote.laugh', label: 'Laugh', touch: t('touch-emote-laugh', true) },
  { id: 'emote.cry', label: 'Cry', touch: t('touch-emote-cry', true) },
  { id: 'emote.taunt', label: 'Taunt', touch: t('touch-emote-taunt', true) },
  { id: 'mp.ping', label: 'Ping', touch: t('touch-ping', true) },
];

export function commandById(id: GameCommandId): GameCommand | undefined {
  return GAME_COMMANDS.find((c) => c.id === id);
}

// ── Command bus ─────────────────────────────────────────────────────────────

export interface CommandPayload {
  value?: number;
  text?: string;
  [k: string]: unknown;
}

export interface CommandBusHooks {
  onChatCancel?: () => void;
  onChatSend?: (text: string) => void;
}

export interface CommandBus {
  dispatchTouch(id: GameCommandId, payload: CommandPayload): void;
  dispatchDesktop(id: GameCommandId, payload: CommandPayload): void;
}

// Both entry points funnel to the same handler so a command means the same
// thing regardless of input source. Chat cancel/send additionally restore the
// gameplay input gate (keyboard focus is released back to the game).
export function createCommandBus(
  handler: (id: GameCommandId, payload: CommandPayload, source: 'touch' | 'desktop') => void,
  hooks: CommandBusHooks = {},
): CommandBus {
  function run(id: GameCommandId, payload: CommandPayload, source: 'touch' | 'desktop') {
    handler(id, payload, source);
    if (id === 'chat.cancel') hooks.onChatCancel?.();
    if (id === 'chat.send') hooks.onChatSend?.(payload.text ?? '');
  }
  return {
    dispatchTouch(id, payload) {
      run(id, payload, 'touch');
    },
    dispatchDesktop(id, payload) {
      run(id, payload, 'desktop');
    },
  };
}
