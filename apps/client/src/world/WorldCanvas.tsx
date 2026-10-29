import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';
import { AreaWorld } from './AreaWorld';
import { loadCharacterKit } from './characters';
import { IsoView } from './IsoView';
import { loadFurniture } from './models';

type Status = 'loading' | 'ready' | 'failed';

/** Mounts the 3D world, loads its models once and enters the hall. */
export function WorldCanvas() {
  const container = useRef<HTMLDivElement>(null);
  const fader = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    const host = container.current;
    const fade = fader.current;
    if (!host || !fade) return;

    const view = new IsoView(host);
    let world: AreaWorld | null = null;
    let cancelled = false;

    Promise.all([loadFurniture(), loadCharacterKit()])
      .then(([furniture, characters]) => {
        if (cancelled) return;
        world = new AreaWorld(view, { furniture, characters }, fade);
        world.enter('hall');
        setStatus('ready');
      })
      .catch((error: unknown) => {
        console.error('Could not load the library', error);
        if (!cancelled) setStatus('failed');
      });

    return () => {
      cancelled = true;
      world?.dispose();
      view.dispose();
    };
  }, []);

  return (
    <div ref={container} className="world-canvas">
      <div ref={fader} className="world-fader world-fader--dark" />
      {status !== 'ready' && (
        <p className="world-status">{t(status === 'loading' ? 'world.loading' : 'world.failed')}</p>
      )}
    </div>
  );
}
