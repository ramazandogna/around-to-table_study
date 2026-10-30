import { useEffect } from 'react';
import { t, type MessageKey } from '../i18n/t';
import { useGameStore, type ConfirmChoice } from '../state/store';
import { Choice, Dialog, Panel } from './Panel';

const OPTIONS: Record<'stand' | 'leave', { choice: ConfirmChoice; icon: string; key: string }[]> = {
  stand: [
    { choice: 'break', icon: '☕', key: 'confirm.break' },
    { choice: 'end', icon: '🏁', key: 'confirm.end' },
    { choice: 'stay', icon: '📚', key: 'confirm.stay' },
  ],
  leave: [
    { choice: 'end', icon: '🚪', key: 'confirm.leave' },
    { choice: 'stay', icon: '📚', key: 'confirm.back' },
  ],
};

/** Asks before a running timer is left behind: standing up from the table or leaving the library. */
export function ConfirmDialog() {
  const confirm = useGameStore((s) => s.confirm);

  useEffect(() => {
    if (!confirm) return;
    const options = OPTIONS[confirm.kind];
    const onKey = (event: KeyboardEvent) => {
      const picked = options[Number(event.key) - 1];
      if (picked) confirm.answer(picked.choice);
      else if (event.key === 'Escape') confirm.answer('stay');
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm]);

  if (!confirm) return null;
  return (
    <Dialog>
      <Panel title={t(`confirm.${confirm.kind}.title`)} className="panel--dialog">
        <p className="panel-text">{t(`confirm.${confirm.kind}.text`)}</p>
        <div className="choice-list">
          {OPTIONS[confirm.kind].map(({ choice, icon, key }, i) => (
            <Choice
              key={choice}
              icon={icon}
              label={t(key as MessageKey)}
              hint={t(`${key}.hint` as MessageKey)}
              shortcut={i + 1}
              onSelect={() => confirm.answer(choice)}
            />
          ))}
        </div>
      </Panel>
    </Dialog>
  );
}
