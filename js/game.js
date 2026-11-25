export const SIZE = 4;
export const DIRECTIONS = ['left', 'right', 'up', 'down'];

const randomCount = (max, random) => 1 + Math.floor(random() * max);
const emptyBoard = () => Array(SIZE * SIZE).fill(null);

function linePositions(direction, line) {
  return Array.from({ length: SIZE }, (_, offset) => {
    const step = direction === 'right' || direction === 'down' ? SIZE - 1 - offset : offset;
    return direction === 'left' || direction === 'right'
      ? line * SIZE + step
      : step * SIZE + line;
  });
}

export function spawnTiles(board, count, nextId, random = Math.random) {
  const updated = board.slice();
  const free = updated.flatMap((tile, position) => tile ? [] : [position]);
  const spawned = [];

  for (let index = 0; index < count && free.length; index += 1) {
    const [position] = free.splice(Math.floor(random() * free.length), 1);
    updated[position] = { id: nextId++, value: random() < 0.9 ? 2 : 4 };
    spawned.push(updated[position].id);
  }

  return { board: updated, nextId, spawned };
}

export function slide(board, direction) {
  const lines = Array.from({ length: SIZE }, (_, line) => linePositions(direction, line));
  const frames = [];
  let current = board;
  let points = 0;

  // Each pass contracts the lines and merges disjoint pairs in movement order.
  // The surviving tiles take part in the next pass, including previous merges.
  while (true) {
    const next = emptyBoard();
    const motions = new Map();
    const merged = [];

    for (const positions of lines) {
      const occupied = positions.filter(position => current[position]);
      let targetIndex = 0;

      for (let index = 0; index < occupied.length; index += 1) {
        const from = occupied[index];
        const tile = current[from];
        const destination = positions[targetIndex++];
        const partner = current[occupied[index + 1]];
        if (from !== destination) motions.set(tile.id, destination);

        if (partner?.value === tile.value) {
          const value = tile.value * 2;
          motions.set(partner.id, destination);
          next[destination] = { id: tile.id, value };
          merged.push(tile.id);
          points += value;
          index += 1;
        } else {
          next[destination] = tile;
        }
      }
    }

    if (!motions.size && !merged.length) break;
    frames.push({ motions, merged, board: next });
    current = next;
    if (!merged.length) break;
  }

  return { board: current, frames, points };
}

export function hasMoves(board) {
  return board.some((tile, position) => (
    !tile ||
    (position % SIZE < SIZE - 1 && board[position + 1]?.value === tile.value) ||
    board[position + SIZE]?.value === tile.value
  ));
}

export function newGame(random = Math.random, id = crypto.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('-')) {
  const { board, nextId } = spawnTiles(emptyBoard(), randomCount(3, random), 1, random);
  return { id, board, nextId, score: 0, previous: null, over: false, saved: false };
}

export function playMove(game, direction, random = Math.random) {
  if (game.over || !DIRECTIONS.includes(direction)) return null;

  const { board, frames, points } = slide(game.board, direction);
  if (!frames.length) return null;

  const spawned = spawnTiles(board, randomCount(2, random), game.nextId, random);
  const over = !hasMoves(spawned.board);
  return {
    frames,
    spawned: spawned.spawned,
    game: {
      ...game,
      board: spawned.board,
      nextId: spawned.nextId,
      score: game.score + points,
      previous: over ? null : { board: game.board, score: game.score },
      over,
    },
  };
}

export function undoMove(game) {
  if (!game.previous || game.over) return game;
  return { ...game, ...game.previous, previous: null };
}
