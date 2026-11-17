import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { areaRig, fakeHub, hubRig } from './support/rigs';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('the social socket trusts the server about where people are', () => {
  it('a library player who claims the hall still cannot shout', async () => {
    const rig = hubRig();
    const a = await rig.connect('a');
    await rig.hub.placed('a', 'library');
    await rig.send(a, { t: 'where', area: 'hall' });
    await rig.send(a, { t: 'shout', text: 'hello building' });
    expect(a.ws.of('error')).toEqual([{ t: 'error', code: 'phone_silent' }]);
    expect(a.ws.of('shouted')).toEqual([]);
  });

  it('a hall player who claims the library can still shout (the claim is not believed either way)', async () => {
    const rig = hubRig();
    const a = await rig.connect('a');
    await rig.hub.placed('a', 'hall');
    await rig.send(a, { t: 'where', area: 'library' });
    await rig.send(a, { t: 'shout', text: 'hello building' });
    expect(a.ws.of('shouted')).toHaveLength(1);
  });

  it('closing and reopening the phone socket keeps the server-known area', async () => {
    const rig = hubRig();
    const a = await rig.connect('a');
    await rig.hub.placed('a', 'library');
    await rig.hub.webSocketClose(a.ws as unknown as WebSocket);
    const again = await rig.connect('a');
    await rig.send(again, { t: 'where', area: 'hall' });
    await rig.send(again, { t: 'shout', text: 'sneaky' });
    expect(again.ws.of('error')).toEqual([{ t: 'error', code: 'phone_silent' }]);
  });

  it('leaving the library lifts the rule, but only for that area', async () => {
    const rig = hubRig();
    const a = await rig.connect('a');
    await rig.hub.placed('a', 'library');
    await rig.hub.placed('a', 'hall');
    // The library socket closes after the hall one opened: it must not undo the hall.
    await rig.hub.unplaced('a', 'library');
    await rig.send(a, { t: 'where', area: 'library' });
    await rig.send(a, { t: 'shout', text: 'hi all' });
    expect(a.ws.of('shouted')).toHaveLength(1);
    await rig.hub.placed('a', 'library');
    await rig.hub.unplaced('a', 'library');
    await rig.send(a, { t: 'where', area: 'hall' });
    await rig.send(a, { t: 'shout', text: 'hi again' });
    expect(a.ws.of('shouted')).toHaveLength(2);
  });

  it('the area room tells the hub who joined and left', async () => {
    const calls: string[] = [];
    const hub = fakeHub({
      placed: async (id: string, area: string) => void calls.push(`+${id}@${area}`),
      unplaced: async (id: string, area: string) => void calls.push(`-${id}@${area}`),
    });
    const rig = areaRig('library', hub);
    const a = await rig.join('a');
    await rig.room.webSocketClose(a.ws as unknown as WebSocket);
    expect(calls).toEqual(['+a@library', '-a@library']);
  });
});

describe('the phone note goes through the status-line filter', () => {
  async function noteOf(note: string): Promise<string | undefined> {
    const rig = hubRig();
    const a = await rig.connect('a');
    await rig.send(a, { t: 'where', area: 'hall', note });
    return (a.ws.deserializeAttachment() as { lines: { note: string } }).lines.note;
  }

  it('drops links, swearing and fullwidth-dot links', async () => {
    expect(await noteOf('visit evil.com you fucking idiot')).toBe('');
    expect(await noteOf('visit evil．com')).toBe('');
    expect(await noteOf('see https://evil.example/x')).toBe('');
  });

  it('cuts to 40 characters and keeps a plain note', async () => {
    expect(await noteOf('reading chapter 4')).toBe('reading chapter 4');
    expect(await noteOf('b'.repeat(80))).toBe('b'.repeat(40));
  });
});

describe('area chat is not delivered to people who blocked the sender', () => {
  async function room(blockedWith: string[]) {
    const hub = fakeHub({ blockedWith: async (id: string) => (id === 'a' ? blockedWith : []) });
    const rig = areaRig('smoking', hub);
    const a = await rig.join('a');
    const b = await rig.join('b');
    const c = await rig.join('c');
    for (const client of [a, b, c]) client.ws.sent.length = 0;
    return { rig, a, b, c };
  }

  it('say', async () => {
    const { rig, a, b, c } = await room(['b']);
    await rig.send(a, { t: 'say', text: 'hello there' });
    expect(b.ws.of('said')).toEqual([]);
    expect(c.ws.of('said')).toHaveLength(1);
    // The speaker still sees their own line.
    expect(a.ws.of('said')).toHaveLength(1);
  });

  it('emote', async () => {
    const { rig, a, b, c } = await room(['b']);
    await rig.send(a, { t: 'emote', emote: 'wave' });
    expect(b.ws.of('emoted')).toEqual([]);
    expect(c.ws.of('emoted')).toHaveLength(1);
  });

  it('dance', async () => {
    const { rig, a, b, c } = await room(['b']);
    await rig.send(a, { t: 'dance', on: true, move: 1 });
    expect(b.ws.of('danced')).toEqual([]);
    expect(c.ws.of('danced')).toHaveLength(1);
  });

  it('everything still reaches everyone when nobody blocked anyone', async () => {
    const { rig, a, b, c } = await room([]);
    await rig.send(a, { t: 'say', text: 'hello there' });
    expect(b.ws.of('said')).toHaveLength(1);
    expect(c.ws.of('said')).toHaveLength(1);
  });
});
