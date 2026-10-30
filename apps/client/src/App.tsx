import { APP_NAME } from '@att/shared';

import { t } from './i18n/t';
import { useGameStore } from './state/store';
import { ChatBar } from './ui/ChatBar';
import { ChatPanel } from './ui/ChatPanel';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { NoticeBoard } from './ui/NoticeBoard';
import { PlayerCard } from './ui/PlayerCard';
import { CharacterCreator } from './ui/CharacterCreator';
import { Notice } from './ui/Notice';
import { SeatBar } from './ui/SeatBar';
import { SitDialog } from './ui/SitDialog';
import { StartOver } from './ui/StartOver';
import { TimerHud } from './ui/TimerHud';
import { Wardrobe } from './ui/Wardrobe';
import { WorldCanvas } from './world/WorldCanvas';

export function App() {
  const session = useGameStore((s) => s.session);
  const area = useGameStore((s) => s.area);
  const connected = useGameStore((s) => s.connected);
  const playersHere = useGameStore((s) => s.playersHere);
  const look = useGameStore((s) => s.look);

  // Everyone makes a character first; players from before the creator only pick a look.
  if (!session || !look) {
    return (
      <main className="gate">
        <CharacterCreator mode={session ? 'returning' : 'new'} />
      </main>
    );
  }

  return (
    <main className="app">
      <WorldCanvas />
      <header className="hud-title">
        <span>{APP_NAME}</span>
        <span className="hud-area">
          {t(`area.${area}`)} · {connected ? `${playersHere} ${t('hud.here')}` : t('hud.offline')}
        </span>
        <div className="hud-links">
          <Wardrobe />
          <StartOver />
        </div>
      </header>
      <TimerHud />
      <aside className="hud-side">
        <NoticeBoard />
        <PlayerCard />
      </aside>
      <ChatPanel />
      <footer className="hud-bottom">
        <Notice />
        <SeatBar />
        <ChatBar />
        <p className="hud-hint">{t('hint.controls')}</p>
      </footer>
      <SitDialog />
      <ConfirmDialog />
    </main>
  );
}
