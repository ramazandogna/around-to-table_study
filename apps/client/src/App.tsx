import { APP_NAME } from '@att/shared';
import { GameCanvas } from './game/GameCanvas';

export function App() {
  return (
    <main className="app">
      <GameCanvas />
      <header className="hud-title">{APP_NAME}</header>
    </main>
  );
}
