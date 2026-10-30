import { useState } from 'react';
import { t } from '../i18n/t';
import { forgetCharacter } from '../net/session';
import { useGameStore } from '../state/store';
import { Dialog, Panel } from './Panel';

/** Beta helper: forget this device's character and come in as someone new. */
export function StartOver() {
  const [asking, setAsking] = useState(false);

  function confirm() {
    forgetCharacter();
    useGameStore.getState().startOver();
  }

  return (
    <>
      <button type="button" className="hud-link" onClick={() => setAsking(true)}>
        {t('startOver.button')}
      </button>
      {asking && (
        <Dialog>
          <Panel title={t('startOver.title')} className="panel--dialog">
            <p className="panel-text">{t('startOver.text')}</p>
            <div className="panel-actions">
              <button type="button" className="panel-button" onClick={() => setAsking(false)}>
                {t('startOver.cancel')}
              </button>
              <button type="button" className="panel-ok" onClick={confirm}>
                {t('startOver.confirm')}
              </button>
            </div>
          </Panel>
        </Dialog>
      )}
    </>
  );
}
