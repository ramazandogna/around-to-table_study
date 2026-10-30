import type { Appearance } from '@att/shared';
import { useEffect, useRef } from 'react';
import { PreviewStage } from '../world/PreviewStage';

/** The 3D character inside the creator's frame. */
export function CharacterPreview({ look, yaw }: { look: Appearance; yaw: number }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<PreviewStage | null>(null);
  const first = useRef(look);

  useEffect(() => {
    if (!host.current) return;
    const created = new PreviewStage(host.current, first.current);
    stage.current = created;
    return () => {
      created.dispose();
      stage.current = null;
    };
  }, []);

  useEffect(() => stage.current?.setLook(look), [look]);
  useEffect(() => stage.current?.setYaw(yaw), [yaw]);

  return <div ref={host} className="preview-stage" />;
}
