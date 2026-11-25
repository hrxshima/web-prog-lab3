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

  function positionTile(tile, position) {
    tile.style.setProperty('--column', position % SIZE);
    tile.style.setProperty('--row', Math.floor(position / SIZE));
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
      let node = tiles.get(tile.id);
      if (!node) {
        node = document.createElement('div');
        node.className = 'tile';
        node.dataset.id = tile.id;
        const face = document.createElement('div');
        face.className = 'tile-face';
        node.append(face);
        tiles.set(tile.id, node);
        layer.append(node);
      }

      const face = node.firstElementChild;
      if (face.textContent !== String(tile.value)) {
        face.textContent = tile.value;
        face.dataset.value = tile.value > 4096 ? 'higher' : tile.value;
        face.style.setProperty('--digits', face.textContent.length);
      }
      positionTile(node, position);

      if (effects.merged?.includes(tile.id)) {
        animations.push(animateFace(face, [
          { transform: 'scale(.93)' }, { transform: 'scale(1.09)' }, { transform: 'scale(1)' },
        ], 135));
      }
      if (effects.spawned?.includes(tile.id)) {
        animations.push(animateFace(face, [
          { transform: 'scale(.55)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 },
        ], 155));
      }
    });

    for (const [id, node] of tiles) {
      if (active.has(id)) continue;
      node.remove();
      tiles.delete(id);
    }

    return Promise.all(animations);
  }

  async function animateMove({ frames, game, spawned }) {
    for (const frame of frames) {
      const animations = [];
      for (const [id, destination] of frame.motions) {
        const tile = tiles.get(id);
        const from = getComputedStyle(tile).transform;
        positionTile(tile, destination);
        const to = getComputedStyle(tile).transform;
        if (from !== to && !reducedMotion.matches) {
          animations.push(tile.animate([{ transform: from }, { transform: to }], {
            duration: 115, easing: 'cubic-bezier(.2,.65,.35,1)',
          }).finished);
        }
      }
      await Promise.all(animations);
      await display(frame.board, { merged: frame.merged });
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
