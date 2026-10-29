import { useEffect, useRef } from 'react';
import { createGame } from './createGame';

/** Mounts the Phaser game into a full-size container and destroys it on unmount. */
export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const game = createGame(container);
    return () => game.destroy(true);
  }, []);

  return <div ref={containerRef} className="game-canvas" />;
}
