import Phaser from 'phaser';

/** Placeholder entrance hall until the Tiled map lands in Phase 1. */
export class HallScene extends Phaser.Scene {
  private label?: Phaser.GameObjects.Text;

  constructor() {
    super('hall');
  }

  create(): void {
    this.label = this.add
      .text(0, 0, 'the library is opening soon.', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#e8d9b5',
      })
      .setOrigin(0.5);

    this.centerLabel();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.centerLabel, this);
  }

  private centerLabel(): void {
    this.label?.setPosition(this.scale.width / 2, this.scale.height / 2);
  }
}
