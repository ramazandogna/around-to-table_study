import Phaser from 'phaser';

/** Text is rendered this many times larger and scaled down, so it stays crisp at any zoom. */
const TEXT_RESOLUTION = 4;

/** A short-lived single-line bubble that floats above a character. */
export class SpeechBubble extends Phaser.GameObjects.Text {
  private hideTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, '', {
      fontFamily: 'monospace',
      fontSize: `${6 * TEXT_RESOLUTION}px`,
      color: '#2b2118',
      backgroundColor: '#f5ecd7',
      padding: { x: 3 * TEXT_RESOLUTION, y: 2 * TEXT_RESOLUTION },
      wordWrap: { width: 110 * TEXT_RESOLUTION },
      align: 'center',
    });
    this.setOrigin(0.5, 1)
      .setScale(1 / TEXT_RESOLUTION)
      .setVisible(false);
    scene.add.existing(this);
  }

  show(message: string): void {
    this.setText(message).setAlpha(1).setVisible(true);
    this.scene.tweens.killTweensOf(this);
    this.hideTimer?.remove();
    const visibleMs = Phaser.Math.Clamp(message.length * 80, 2500, 8000);
    this.hideTimer = this.scene.time.delayedCall(visibleMs, () =>
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: 300,
        onComplete: () => this.setVisible(false),
      }),
    );
  }

  follow(x: number, top: number, depth: number): void {
    this.setPosition(Math.round(x), Math.round(top - 2)).setDepth(depth);
  }
}
