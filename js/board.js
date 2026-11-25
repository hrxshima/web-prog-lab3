import { SIZE } from './game.js';

export function createBoard(element) {
  const cells = element.querySelector('.board-cells');
  const layer = element.querySelector('.board-tiles');
  const tiles = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const cell = document.createElement('div');
    cell.className = 'board-cell';
    cells.append(cell);
  }

  function tileTransform(position) {
    const column = position % SIZE;
    const row = Math.floor(position / SIZE);
    return `translate(calc(${column * 100}% + ${column} * var(--gutter)), calc(${row * 100}% + ${row} * var(--gutter)))`;
  }

  function positionTile(tile, position) {
    if (tile.position === position) return;
    tile.position = position;
    tile.node.style.transform = tileTransform(position);
  }

  function setFaceValue(face, value) {
    face.textContent = value;
    face.dataset.value = value > 4096 ? 'higher' : value;
    face.style.setProperty('--digits', face.textContent.length);
  }

  function createFace(value) {
    const face = document.createElement('div');
    face.className = 'tile-face';
    setFaceValue(face, value);
    return face;
  }

  function animateFace(face, frames, duration) {
    if (reducedMotion.matches) return Promise.resolve();
    return face.animate(frames, { duration, easing: 'ease-out' }).finished;
  }

  function display(board, effects = {}) {
    const active = new Set();
    const animations = [];

    board.forEach((tile, position) => {
      if (!tile) return;
      active.add(tile.id);
      let rendered = tiles.get(tile.id);
      if (!rendered) {
        const node = document.createElement('div');
        node.className = 'tile';
        node.dataset.id = tile.id;
        node.append(createFace(tile.value));
        rendered = { node };
        tiles.set(tile.id, rendered);
        layer.append(node);
      }

      const face = rendered.node.firstElementChild;
      if (face.textContent !== String(tile.value)) setFaceValue(face, tile.value);
      positionTile(rendered, position);

      if (effects.spawned?.includes(tile.id)) {
        animations.push(animateFace(face, [
          { transform: 'scale(.55)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 },
        ], 155));
      }
    });

    for (const [id, { node }] of tiles) {
      if (active.has(id)) continue;
      node.remove();
      tiles.delete(id);
    }

    return Promise.all(animations);
  }

  async function crossfadeMerges(board, mergedIds) {
    const layers = board.filter(tile => tile && mergedIds.includes(tile.id)).map(({ id, value }) => {
      const { node } = tiles.get(id);
      const incoming = createFace(value);
      // The old face stays opaque under the incoming face until the handoff.
      node.classList.add('tile--merging');
      incoming.classList.add('tile-face--incoming');
      node.append(incoming);
      const animation = incoming.animate([
        { opacity: 0, transform: 'scale(1)' },
        { opacity: .6, transform: 'scale(1.025)', offset: .6 },
        { opacity: 1, transform: 'scale(1)' },
      ], { duration: 135, easing: 'ease-in-out', fill: 'both' });
      return { node, incoming, animation };
    });

    await Promise.all(layers.map(({ animation }) => animation.finished));
    for (const { node, incoming, animation } of layers) {
      node.firstElementChild.remove();
      incoming.classList.remove('tile-face--incoming');
      node.classList.remove('tile--merging');
      animation.cancel();
    }
  }

  async function animateMove({ frames, game, spawned }) {
    if (reducedMotion.matches) return display(game.board);

    for (const frame of frames) {
      const slides = Array.from(frame.motions, ([id, destination]) => {
        const tile = tiles.get(id);
        const from = tileTransform(tile.position);
        positionTile(tile, destination);
        if (reducedMotion.matches) return;
        return tile.node.animate([{ transform: from }, { transform: tile.node.style.transform }], {
          duration: 115, easing: 'cubic-bezier(.2,.65,.35,1)', fill: 'backwards',
        }).finished;
      });
      await Promise.all(slides);
      if (frame.merged.length && !reducedMotion.matches) {
        await crossfadeMerges(frame.board, frame.merged);
      }
      await display(frame.board);
    }
    await display(game.board, { spawned });
  }

  function describe(board) {
    const rows = Array.from({ length: SIZE }, (_, row) =>
      board.slice(row * SIZE, (row + 1) * SIZE).map(tile => tile?.value ?? 'empty').join(', '));
    return rows.map((row, index) => `Row ${index + 1}: ${row}.`).join(' ');
  }

  return { display, animateMove, describe };
}
