import { useState } from 'react';
import { isAmbienceOn, setAmbienceOn } from '../audio/soundscape';
import { t } from '../i18n/t';

/** The rooms' quiet background sound on or off (on by default); remembered on this device. */
export function AmbienceToggle() {
  const [on, setOn] = useState(isAmbienceOn);
  return (
    <button
      type="button"
      className="hud-link"
      aria-pressed={on}
      title={t(on ? 'hud.ambience.off' : 'hud.ambience.on')}
      onClick={() => {
        setAmbienceOn(!on);
        setOn(!on);
      }}
    >
      <span className="hud-icon" aria-hidden>
        {on ? '🌧️' : '🌂'}
      </span>
      <span className="hud-label">{t('hud.ambience')}</span>
    </button>
  );
}
