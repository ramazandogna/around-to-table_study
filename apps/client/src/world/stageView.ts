/**
 * Where the conference hall's big screen is on the page, in CSS pixels: its
 * four corners (top left, top right, bottom right, bottom left). The camera
 * has no perspective, so they form a parallelogram, and a page laid over the
 * screen only needs a 2D transform to sit on it like a picture on the wall.
 */
export type ScreenQuad = {
  corners: readonly { x: number; y: number }[];
  /** The size of the box around it. */
  width: number;
  height: number;
};

/**
 * The world tells the page where the big screen is, so the picture or video
 * can be laid over it; null when there is no screen in this room.
 */
export const stageView: { quad: () => ScreenQuad | null } = { quad: () => null };

/**
 * The CSS transform (from the top left corner) that lays a box `width` by
 * `height` onto the screen's corners.
 */
export function quadTransform(quad: ScreenQuad, width: number, height: number): string {
  const [p0, p1, , p3] = quad.corners;
  if (!p0 || !p1 || !p3) return 'none';
  const a = (p1.x - p0.x) / width;
  const b = (p1.y - p0.y) / width;
  const c = (p3.x - p0.x) / height;
  const d = (p3.y - p0.y) / height;
  return `matrix(${a}, ${b}, ${c}, ${d}, ${p0.x}, ${p0.y})`;
}
