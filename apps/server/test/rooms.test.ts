import { describe, expect, it } from 'vitest';
import { AREA_HEADERS } from '../src/area-room';
import { areaRig, hubRig } from './support/rigs';

describe('private rooms keep their size', () => {
  it('the hub refuses a pass once the room holds its size', async () => {
    const inside = ['a', 'b', 'c'];
    const rig = hubRig();
    const room = await rig.hub.createRoom('owner', 'Tiny', 3, null);
    // The room's code is random; the stand-in answers for whatever code was made.
    rig.areas.set(`room:${room?.code}`, { occupants: async () => inside });
    expect(await rig.hub.checkRoom(room?.code ?? '', null, 'd')).toBe('full');
    // Someone already inside may come back (a reload) without taking a second place.
    expect(await rig.hub.checkRoom(room?.code ?? '', null, 'b')).toBe('ok');
  });

  it('lets people in while there is room', async () => {
    const rig = hubRig();
    const room = await rig.hub.createRoom('owner', 'Tiny', 3, null);
    rig.areas.set(`room:${room?.code}`, { occupants: async () => ['a', 'b'] });
    expect(await rig.hub.checkRoom(room?.code ?? '', null, 'c')).toBe('ok');
  });

  it('a full room is still full with the right password, and a wrong one is a wrong one', async () => {
    const rig = hubRig();
    const room = await rig.hub.createRoom('owner', 'Tiny', 3, 'secret');
    rig.areas.set(`room:${room?.code}`, { occupants: async () => ['a', 'b', 'c'] });
    expect(await rig.hub.checkRoom(room?.code ?? '', 'secret', 'd')).toBe('full');
    expect(await rig.hub.checkRoom(room?.code ?? '', 'nope', 'd')).toBe('password');
  });

  it('the room itself refuses a fourth socket, however many passes were handed out', async () => {
    const rig = areaRig('room3');
    for (const id of ['a', 'b', 'c']) await rig.join(id);
    const refused = await rig.room.fetch(
      new Request('https://x/ws', {
        headers: {
          Upgrade: 'websocket',
          [AREA_HEADERS.id]: 'd',
          [AREA_HEADERS.name]: 'd',
          [AREA_HEADERS.area]: 'room3',
        },
      }),
    );
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'full' });
    // A person already inside may open a second socket (a reload replaces the first).
    const again = await rig.room.fetch(
      new Request('https://x/ws', {
        headers: {
          Upgrade: 'websocket',
          [AREA_HEADERS.id]: 'a',
          [AREA_HEADERS.name]: 'a',
          [AREA_HEADERS.area]: 'room3',
        },
      }),
    );
    expect(again.status).toBe(101);
    expect((await rig.room.occupants()).sort()).toEqual(['a', 'b', 'c']);
  });

  it('the public areas have no size', async () => {
    const rig = areaRig('hall');
    for (const id of ['a', 'b', 'c', 'd', 'e']) await rig.join(id);
    expect(await rig.room.occupants()).toHaveLength(5);
  });
});
