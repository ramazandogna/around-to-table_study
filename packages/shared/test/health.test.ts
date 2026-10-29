import { describe, expect, it } from 'vitest';
import { APP_NAME, PROTOCOL_VERSION, createHealthResponse } from '../src';

describe('createHealthResponse', () => {
  it('reports app name and protocol version', () => {
    expect(createHealthResponse()).toEqual({
      app: APP_NAME,
      ok: true,
      protocol: PROTOCOL_VERSION,
    });
  });
});
