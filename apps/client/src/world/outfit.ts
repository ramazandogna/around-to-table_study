import { OUTFIT_PARTS, PALETTES, type Appearance, type OutfitPart } from '@att/shared';
import { BufferAttribute, Color, type BufferGeometry, type SkinnedMesh } from 'three';

/**
 * Recolouring Kenney's Mini Characters. Each character is two meshes (body and
 * head) on one shared colour atlas: an 8 x 8 grid of 64 px swatches, each a
 * soft top-to-bottom gradient, and a part's colour is just where its UVs point.
 * Parts often share a swatch (trousers and a belt, say), so swatches cannot be
 * repainted. Instead every vertex is sorted into a part once, from the bone it
 * follows, its height and its swatch; a recoloured part then points its UVs at
 * the atlas's white swatch (keeping the shading gradient) and takes the colour
 * from its vertex colours.
 */

/** What a vertex belongs to; 'keep' (eyes, soles, buckles, hair clips) never changes. */
type Label = OutfitPart | 'keep';
const LABELS: readonly Label[] = [...OUTFIT_PARTS, 'keep'];
const KEEP = LABELS.indexOf('keep');

const GRID = 8;
/** The atlas's white swatch: column 4 of the lower pair of rows. */
const WHITE = { column: 4, pair: 3 };
/** The head's skin always has this many vertices, whatever the character. */
const HEAD_SKIN_VERTICES = 220;
/** The eyes are dark marks on the front of the face, in this band (model units). */
const EYES = { bottom: 0.39, top: 0.52, halfWidth: 0.2, depth: 0.02 };
/** Leg parts lower than this are soles. */
const SOLE_TOP = 0.035;
/** Where shoes and trousers share a swatch, the shoes are everything below this. */
const SHOE_TOP = 0.06;
/**
 * Hair can be in more than one swatch (a fringe in another shade). A second
 * hair swatch is a big one that runs a good way up the head: glasses, hair
 * clips, earrings and hat badges are smaller or flat, and black (column 0) is
 * eyes and hat bands.
 */
const MORE_HAIR = { vertices: 40, height: 0.15 };
/** Arms end about here; anything an arm holds further out (a crutch) keeps its colour. */
const ARM_REACH = 0.42;

type Vertex = { swatch: number; bone: string; x: number; y: number; z: number };

/** Each mesh's vertex labels, as indexes into LABELS. */
export type OutfitMap = Map<string, Uint8Array>;

/** Column and pair of rows (each swatch is two rows of the grid tall) under a UV. */
function swatchOf(u: number, v: number): number {
  const column = Math.min(GRID - 1, Math.floor(u * GRID));
  const pair = Math.floor(Math.min(GRID - 1, Math.floor(v * GRID)) / 2);
  return column * 4 + pair;
}

function verticesOf(mesh: SkinnedMesh): Vertex[] {
  const { attributes } = mesh.geometry;
  const uv = attributes.uv as BufferAttribute;
  const position = attributes.position as BufferAttribute;
  const skinIndex = attributes.skinIndex as BufferAttribute;
  const skinWeight = attributes.skinWeight as BufferAttribute;
  const bones = mesh.skeleton.bones;
  return Array.from({ length: uv.count }, (_, i) => {
    let strongest = 0;
    for (let k = 1; k < 4; k++) {
      if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, strongest)) strongest = k;
    }
    return {
      swatch: swatchOf(uv.getX(i), uv.getY(i)),
      bone: bones[skinIndex.getComponent(i, strongest)]?.name ?? '',
      x: position.getX(i),
      y: position.getY(i),
      z: position.getZ(i),
    };
  });
}

function mostCommon(values: Iterable<number>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/** Sorts every vertex of a character into skin, hair, top, bottom, shoes or kept as is. */
export function mapOutfit(head: SkinnedMesh, body: SkinnedMesh): OutfitMap {
  const headVertices = verticesOf(head);
  const bodyVertices = verticesOf(body);
  const label = (name: Label) => LABELS.indexOf(name);

  // Skin: the head swatch with the base head's skin count.
  const headCounts = mostCommon(headVertices.map((v) => v.swatch));
  let skin = -1;
  for (const [swatch, count] of headCounts) {
    const best = headCounts.get(skin) ?? -Infinity;
    if (Math.abs(count - HEAD_SKIN_VERTICES) < Math.abs(best - HEAD_SKIN_VERTICES)) skin = swatch;
  }

  // Head: skin, eyes, then the biggest remaining swatch is the hair; the rest stays.
  const darkFront = headVertices.filter((v) => v.swatch < 4 && v.y < EYES.top);
  const face = darkFront.length ? Math.max(...darkFront.map((v) => v.z)) : 0;
  const isEye = (v: Vertex) =>
    v.swatch < 4 &&
    v.y >= EYES.bottom &&
    v.y <= EYES.top &&
    v.z > face - EYES.depth &&
    Math.abs(v.x) < EYES.halfWidth;
  const rest = new Map<number, number[]>();
  for (const v of headVertices) {
    if (v.swatch !== skin && !isEye(v)) rest.set(v.swatch, [...(rest.get(v.swatch) ?? []), v.y]);
  }
  const largest = [...rest].sort((a, b) => b[1].length - a[1].length)[0]?.[0];
  const hair = new Set(
    [...rest]
      .filter(
        ([swatch, ys]) =>
          swatch === largest ||
          (swatch >= 4 &&
            ys.length >= MORE_HAIR.vertices &&
            Math.max(...ys) - Math.min(...ys) >= MORE_HAIR.height),
      )
      .map(([swatch]) => swatch),
  );
  const headLabels = Uint8Array.from(headVertices, (v) =>
    v.swatch === skin ? label('skin') : isEye(v) ? KEEP : hair.has(v.swatch) ? label('hair') : KEEP,
  );

  // Something an arm holds sticks out past the hand: it keeps its own colour.
  const reach = new Map<number, number>();
  for (const v of bodyVertices) {
    if (v.bone.startsWith('arm'))
      reach.set(v.swatch, Math.max(reach.get(v.swatch) ?? 0, Math.abs(v.x)));
  }
  const held = new Set([...reach].filter(([, x]) => x > ARM_REACH).map(([swatch]) => swatch));

  // Body: trousers are the highest leg swatch, soles the flat bottom ones, shoes the others.
  const legs = new Map<number, number[]>();
  for (const v of bodyVertices) {
    if (v.swatch === skin || !v.bone.startsWith('leg')) continue;
    legs.set(v.swatch, [...(legs.get(v.swatch) ?? []), v.y]);
  }
  const mean = (ys: number[]) => ys.reduce((a, b) => a + b, 0) / ys.length;
  const bottom = [...legs].sort((a, b) => mean(b[1]) - mean(a[1]))[0]?.[0] ?? -1;
  const soles = new Set([...legs].filter(([, ys]) => Math.max(...ys) <= SOLE_TOP).map(([s]) => s));
  const separateShoes = [...legs.keys()].some((s) => s !== bottom && !soles.has(s));
  const bodyLabels = Uint8Array.from(bodyVertices, (v) => {
    if (v.swatch === skin) return label('skin');
    if (v.bone.startsWith('leg')) {
      if (soles.has(v.swatch)) return KEEP;
      if (v.swatch === bottom)
        return !separateShoes && v.y < SHOE_TOP ? label('shoes') : label('bottom');
      return label('shoes');
    }
    if (v.bone === 'torso' && v.swatch === bottom) return label('bottom');
    if (v.bone.startsWith('arm') && held.has(v.swatch)) return KEEP;
    return label('top');
  });

  return new Map([
    [head.name, headLabels],
    [body.name, bodyLabels],
  ]);
}

/**
 * Gives a freshly cloned mesh its own geometry with the look's colours: the
 * recoloured parts point at the white swatch and get their colour per vertex;
 * everything else stays as drawn, under white.
 */
export function dressMesh(
  mesh: SkinnedMesh,
  labels: Uint8Array | undefined,
  look: Appearance,
): void {
  const geometry: BufferGeometry = mesh.geometry.clone();
  mesh.geometry = geometry;
  const uv = geometry.attributes.uv as BufferAttribute;
  const colors = new Float32Array(uv.count * 3).fill(1);
  const tints = LABELS.map((part) => {
    if (part === 'keep') return null;
    const index = look[part];
    const hex = index === undefined ? undefined : PALETTES[part][index];
    return hex ? new Color(hex) : null;
  });
  if (labels) {
    for (let i = 0; i < uv.count; i++) {
      const tint = tints[labels[i] ?? KEEP];
      if (!tint) continue;
      const swatch = swatchOf(uv.getX(i), uv.getY(i));
      const column = Math.floor(swatch / 4);
      const pair = swatch % 4;
      // Same place inside the swatch, so the gradient (the shading) carries over.
      uv.setXY(
        i,
        uv.getX(i) + (WHITE.column - column) / GRID,
        uv.getY(i) + ((WHITE.pair - pair) * 2) / GRID,
      );
      colors.set([tint.r, tint.g, tint.b], i * 3);
    }
    uv.needsUpdate = true;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
}
