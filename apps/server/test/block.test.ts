import { describe, expect, it } from 'vitest';
import { hubRig } from './support/rigs';

describe('blocking is silent', () => {
  it('tells the blocker, and not the blocked person', async () => {
    const rig = hubRig();
    const ann = await rig.connect('ann', 'Ann');
    const bob = await rig.connect('bob', 'Bob');
    await rig.send(ann, { t: 'where', area: 'hall' });
    await rig.send(bob, { t: 'where', area: 'hall' });
    ann.ws.sent.length = 0;
    bob.ws.sent.length = 0;
    await rig.send(ann, { t: 'block', to: 'bob' });
    expect(bob.ws.of('blockedBy')).toEqual([]);
    expect(bob.ws.of('error')).toEqual([]);
    expect(bob.ws.of('me')).toEqual([]);
    // The blocker's own list shows the block.
    const me = ann.ws.of('me').at(-1) as { blocked: { id: string }[] };
    expect(me.blocked.map((b) => b.id)).toEqual(['bob']);
    expect(rig.sql.all('blocks')).toHaveLength(1);
  });

  it('still keeps the two apart', async () => {
    const rig = hubRig();
    const ann = await rig.connect('ann', 'Ann');
    const bob = await rig.connect('bob', 'Bob');
    await rig.send(ann, { t: 'block', to: 'bob' });
    expect(await rig.hub.isBlocked('bob', 'ann')).toBe(true);
    bob.ws.sent.length = 0;
    await rig.send(bob, { t: 'befriend', to: 'ann' });
    expect(bob.ws.of('error')).toEqual([{ t: 'error', code: 'blocked' }]);
  });
});
