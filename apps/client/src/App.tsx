import { EMPTY_LINES, normalizeRoomCode } from '@att/shared';
import { useEffect } from 'react';

import { unlockAudio } from './audio/sound';
import { t } from './i18n/t';
import { layerIndex, useGameStore } from './state/store';
import { ChatBar } from './ui/ChatBar';
import { ChatPanel } from './ui/ChatPanel';
import { Coach } from './ui/Coach';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Discovery } from './ui/Discovery';
import { Games } from './ui/Games';
import { JukeboxPanel } from './ui/Jukebox';
import { RoomMusic } from './ui/RoomMusic';
import { StageScreen } from './ui/StageScreen';
import { Joystick } from './ui/Joystick';
import { Loader } from './ui/Loader';
import { TableGames } from './ui/TableGames';
import { AdminPanel, InboxPanel, PeoplePanel } from './ui/Inbox';
import { InviteToast, RoomAdmin, RoomChip, RoomsPanel } from './ui/Rooms';
import { NoticeBoard } from './ui/NoticeBoard';
import { PlayerCard } from './ui/PlayerCard';
import { CharacterCreator } from './ui/CharacterCreator';
import { CharacterSelect, goalName } from './ui/CharacterSelect';
import { GoalsDialog } from './ui/Goals';
import { addTimePlayed, loadGoals, onFocus, onGoalTime } from './state/stats';
import { HudPlate, MapCorner } from './ui/Hud';
import { Intro } from './ui/Intro';
import { Notice } from './ui/Notice';
import { RadialMenu } from './ui/RadialMenu';
import { SeatBar } from './ui/SeatBar';
import { SitDialog } from './ui/SitDialog';
import { checkAccess, forgetSession } from './net/session';
import { startSocial } from './net/social';
import { EmoteMenu } from './ui/EmoteMenu';
import { FriendsPanel } from './ui/Friends';
import { PhonePanel } from './ui/Phone';
import { TimerHud } from './ui/TimerHud';
import { WorldCanvas } from './world/WorldCanvas';

export function App() {
  const session = useGameStore((s) => s.session);
  const look = useGameStore((s) => s.look);
  const layers = useGameStore((s) => s.layers);
  const lobby = useGameStore((s) => s.lobby);

  // The early beta's door: is the password needed, and does the session kept here still open it?
  // A new password (each deploy) ends old sessions; the character's look stays.
  useEffect(() => {
    void checkAccess(useGameStore.getState().session?.token ?? null).then(({ required, valid }) => {
      const store = useGameStore.getState();
      store.setAccessRequired(required);
      if (store.session && !valid) {
        forgetSession();
        store.setSession(null);
      }
    });
  }, []);

  // Friends and presence follow the player across rooms, so they live outside the world.
  // Out on the character select screen the player is out of the building, phone included.
  useEffect(
    () => (session && look && !lobby ? startSocial(session) : undefined),
    [session, look, lobby],
  );

  // Time in the world, kept per character for the character select screen.
  useEffect(() => {
    if (!session || !look || lobby) return;
    let last = Date.now();
    const count = () => {
      const now = Date.now();
      addTimePlayed(now - last);
      last = now;
    };
    const timer = window.setInterval(count, 60_000);
    return () => {
      window.clearInterval(timer);
      count();
    };
  }, [session, look, lobby]);

  // Today's small tasks tick themselves off as the player goes about the building.
  useEffect(() => {
    const store = useGameStore;
    const offFocus = onFocus(() => store.getState().markDaily('study'));
    const off = store.subscribe((now, before) => {
      const mark = now.markDaily;
      if (now.area !== before.area && (now.area === 'smoking' || now.area === 'conference')) {
        mark(now.area);
      }
      const found = now.discovery;
      if (found && found !== before.discovery) {
        if (found.kind === 'painting' || found.kind === 'shelf' || found.kind === 'lost') {
          mark(found.kind);
        }
        if (found.kind === 'painting') now.addFound(`painting:${found.index}`);
        if (found.kind === 'shelf') now.addFound(`shelf:${found.index}:${found.pick}`);
      }
      if (now.dancing && !before.dancing) mark('dance');
      const me = now.session?.id;
      if (now.tables !== before.tables && me) {
        const playing = Object.values(now.tables).some(
          (table) => table?.phase === 'playing' && table.players.some((p) => p.id === me),
        );
        if (playing) mark('game');
      }
      const said = now.chatLog[now.chatLog.length - 1];
      if (said !== before.chatLog[before.chatLog.length - 1] && said?.self && said.kind === 'say') {
        mark('chat');
      }
    });
    return () => {
      off();
      offFocus();
    };
  }, []);

  // A goal filled by focus time gets a cheer.
  useEffect(
    () =>
      onGoalTime((finished) => {
        const store = useGameStore.getState();
        store.setGoals(loadGoals());
        const goal = finished[0];
        if (goal) store.setNotice('quest_done', goalName(goal));
      }),
    [],
  );

  // A link to a private room (…/?room=ABC123) opens the reception with its code filled in.
  useEffect(() => {
    if (!session || !look) return;
    const code = normalizeRoomCode(new URLSearchParams(location.search).get('room') ?? '');
    if (!code) return;
    history.replaceState(null, '', location.pathname);
    useGameStore.getState().openRooms(code);
  }, [session, look]);

  // A friend link (…/?friend=<id>) sends that person a request once the phone is connected.
  const social = useGameStore((s) => s.social);
  useEffect(() => {
    if (!social || !session) return;
    const id = new URLSearchParams(location.search).get('friend');
    if (!id) return;
    history.replaceState(null, '', location.pathname);
    if (id === session.id) return;
    // The socket opens a moment after it is made; the request waits for it.
    const timer = window.setTimeout(() => {
      social.befriend(id);
      useGameStore.getState().setNotice('friend_link');
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [social, session]);

  // Status lines set for a while clear themselves when the time is up.
  const linesUntil = useGameStore((s) => s.linesUntil);
  useEffect(() => {
    if (!linesUntil) return;
    const clear = () => {
      const store = useGameStore.getState();
      store.setLines(EMPTY_LINES);
      store.setNotice('lines_expired');
    };
    const left = linesUntil - Date.now();
    if (left <= 0) {
      clear();
      return;
    }
    // Timers far off are checked again later rather than set once for days.
    const timer = window.setTimeout(clear, Math.min(left, 2 ** 31 - 1));
    return () => window.clearTimeout(timer);
  }, [linesUntil]);

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

  if (lobby) return <CharacterSelect />;

  return (
    <main className="app">
      <WorldCanvas />
      <HudPlate />
      <TimerHud />
      <aside className="hud-side">
        <FriendsPanel />
        <PhonePanel />
        <InboxPanel />
        <PlayerCard />
      </aside>
      {/* The map comes up over the timer when opened after it, and under it otherwise. */}
      <div className="hud-right" style={{ zIndex: layerIndex(layers, 'map') }}>
        <MapCorner />
        <ChatPanel />
      </div>
      <NoticeBoard />
      <Discovery />
      <Games />
      <TableGames />
      <JukeboxPanel />
      <RoomMusic />
      <StageScreen />
      <RoomsPanel />
      <RoomAdmin />
      <PeoplePanel />
      <AdminPanel />
      <InviteToast />
      <RadialMenu />
      <Joystick />
      <footer className="hud-bottom">
        <RoomChip />
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
      <GoalsDialog />
      <Intro />
      <Loader />
    </main>
  );
}
