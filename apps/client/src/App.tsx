import { APP_NAME } from '@att/shared';

import { t } from './i18n/t';
import { useGameStore } from './state/store';
import { ChatBar } from './ui/ChatBar';
import { NameGate } from './ui/NameGate';
import { Notice } from './ui/Notice';
import { SeatBar } from './ui/SeatBar';
import { SitDialog } from './ui/SitDialog';
import { StartOver } from './ui/StartOver';
import { TimerHud } from './ui/TimerHud';
import { WorldCanvas } from './world/WorldCanvas';

export function App() {
  const session = useGameStore((s) => s.session);
  const area = useGameStore((s) => s.area);
  const connected = useGameStore((s) => s.connected);
  const playersHere = useGameStore((s) => s.playersHere);

  if (!session) return <NameGate />;

  return (
    <main className="app">
      <WorldCanvas />
      <header className="hud-title">
        <span>{APP_NAME}</span>
        <span className="hud-area">
          {t(`area.${area}`)} · {connected ? `${playersHere} ${t('hud.here')}` : t('hud.offline')}
        </span>
        <StartOver />
      </header>
      <TimerHud />
      <footer className="hud-bottom">
        <Notice />
        <SeatBar />
        <ChatBar />
        <p className="hud-hint">{t('hint.controls')}</p>
      </footer>
      <SitDialog />
    </main>
  );
}
