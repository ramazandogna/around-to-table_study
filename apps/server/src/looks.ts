import {
  allowedLook,
  freeLook,
  isValidAppearance,
  wearsEarned,
  type Appearance,
  type ClientMessage,
  type WearProfile,
} from '@att/shared';

/**
 * Earned things to wear are checked by the server, never taken from the
 * client: a new character gets only the free ones, a saved look only what its
 * profile has earned, and a look shown in a room goes through the hub first,
 * so a changed client cannot show something to everyone else.
 */

/** A new character's look, or null if it is not a look at all. */
export function lookForNewCharacter(look: unknown): Appearance | null {
  return isValidAppearance(look) ? freeLook(look) : null;
}

/** A look to save for a character with this profile, or null if it is not a look at all. */
export function lookToSave(look: unknown, profile: WearProfile | null): Appearance | null {
  return isValidAppearance(look) ? allowedLook(look, profile) : null;
}

/**
 * The message with its look cleared by `allowed` (the hub's check), when it
 * carries a look with earned items. Looks with only free items need no call.
 */
export async function withAllowedLook(
  message: ClientMessage,
  allowed: (look: Appearance) => Promise<Appearance>,
): Promise<ClientMessage> {
  if (message.t !== 'hello' && message.t !== 'look') return message;
  if (!isValidAppearance(message.look) || !wearsEarned(message.look)) return message;
  return { ...message, look: await allowed(message.look) };
}
