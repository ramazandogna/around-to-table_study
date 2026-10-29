import { APP_NAME } from '@att/shared';
import { GameCanvas } from './game/GameCanvas';
import { t } from './i18n/t';
import { useGameStore } from './state/store';

export function App() {
  const area = useGameStore((s) => s.area);

  return (
    <main className="app">
      <GameCanvas />
      <header className="hud-title">
        <span>{APP_NAME}</span>
        <span className="hud-area">{t(`area.${area}`)}</span>
      </header>
      <p className="hud-hint">{t('hint.controls')}</p>
    </main>
  );
}
