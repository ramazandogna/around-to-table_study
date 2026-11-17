import { useEffect } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';

const NOTICE_MS = 3000;
/** A few take longer to read. */
const LONGER_MS: Partial<Record<string, number>> = {
  welcome_back: 6000,
  block_resume: 7000,
  seat_gone: 6000,
};

/** A short message above the chat bar, e.g. when sending too fast. */
export function Notice() {
  const notice = useGameStore((s) => s.notice);
  const value = useGameStore((s) => s.noticeValue) ?? '';
  const setNotice = useGameStore((s) => s.setNotice);

  useEffect(() => {
    if (!notice || notice === 'replaced') return;
    const timer = setTimeout(() => setNotice(null), LONGER_MS[notice] ?? NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);

  return notice ? (
    <p className="notice">{t(`notice.${notice}`, { name: value, count: value })}</p>
  ) : null;
}
