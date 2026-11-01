import { useEffect } from 'react';

import { unlockAudio } from './audio/sound';
import { t } from './i18n/t';
import { useGameStore } from './state/store';
import { ChatBar } from './ui/ChatBar';
import { ChatPanel } from './ui/ChatPanel';
import { Coach } from './ui/Coach';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Discovery } from './ui/Discovery';
import { NoticeBoard } from './ui/NoticeBoard';
import { PlayerCard } from './ui/PlayerCard';
import { CharacterCreator } from './ui/CharacterCreator';
import { HudPlate, MapCorner } from './ui/Hud';
import { Intro } from './ui/Intro';
import { Notice } from './ui/Notice';
import { RadialMenu } from './ui/RadialMenu';
import { SeatBar } from './ui/SeatBar';
import { SitDialog } from './ui/SitDialog';
import { startSocial } from './net/social';
import { EmoteMenu } from './ui/EmoteMenu';
import { FriendsPanel } from './ui/Friends';
import { PhonePanel } from './ui/Phone';
import { TimerHud } from './ui/TimerHud';
import { WorldCanvas } from './world/WorldCanvas';

export function App() {
  const session = useGameStore((s) => s.session);
  const look = useGameStore((s) => s.look);

  // Friends and presence follow the player across rooms, so they live outside the world.
  useEffect(() => (session && look ? startSocial(session) : undefined), [session, look]);

  // Browsers keep sound off until the first touch or key press.
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

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
      <HudPlate />
      <TimerHud />
      <aside className="hud-side">
        <FriendsPanel />
        <PhonePanel />
        <PlayerCard />
      </aside>
      <div className="hud-right">
        <MapCorner />
        <ChatPanel />
      </div>
      <NoticeBoard />
      <Discovery />
      <RadialMenu />
      <footer className="hud-bottom">
        <Coach />
        <Notice />
        <SeatBar />
        <div className="chat-row">
          <EmoteMenu />
          <ChatBar />
        </div>
        <p className="hud-hint hud-hint--keys">{t('hint.controls')}</p>
        <p className="hud-hint hud-hint--touch">{t('hint.touch')}</p>
      </footer>
      <SitDialog />
      <ConfirmDialog />
      <Intro />
    </main>
  );
}
