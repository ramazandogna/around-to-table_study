import { useEffect } from 'react';
import { t } from '../i18n/t';
import { useGameStore } from '../state/store';

const NOTICE_MS = 3000;

/** A short message above the chat bar, e.g. when sending too fast. */
export function Notice() {
  const notice = useGameStore((s) => s.notice);
  const name = useGameStore((s) => s.noticeName);
  const setNotice = useGameStore((s) => s.setNotice);

  useEffect(() => {
    if (!notice || notice === 'replaced') return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);

  return notice ? <p className="notice">{t(`notice.${notice}`, { name: name ?? '' })}</p> : null;
}
