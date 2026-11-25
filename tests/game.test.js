import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasMoves, newGame, playMove, slide, spawnTiles, undoMove } from '../js/game.js';
import { swipeDirection } from '../js/controls.js';
import { recordScore } from '../js/leaderboard.js';
import { decodeSession, readSession, STORAGE_KEY, writeSession } from '../js/storage.js';

const boardOf = (...values) => Array.from({ length: 16 }, (_, position) =>
  values[position] ? { id: position + 1, value: values[position] } : null);
const valuesOf = board => board.map(tile => tile?.value ?? 0);
const gameOf = (...values) => ({ ...newGame(() => 0, 'game'), board: boardOf(...values), nextId: 17 });
const full = [
  2, 4, 2, 4,
  4, 2, 4, 2,
  2, 4, 2, 4,
  4, 2, 4, 2,
];

for (const [row, expected, points] of [
  [[4, 4, 4, 4], [16, 0, 0, 0], 32],
  [[16, 16, 2, 2], [32, 4, 0, 0], 36],
  [[4, 4, 0, 0], [8, 0, 0, 0], 8],
  [[2, 2, 2, 2], [8, 0, 0, 0], 16],
  [[2, 4, 2, 2], [2, 8, 0, 0], 12],
  [[4, 4, 8, 16], [32, 0, 0, 0], 56],
]) {
  test(`cascade ${row} → ${expected}, +${points}`, () => {
    const original = boardOf(...row);
    const turn = slide(original, 'left');
    assert.deepEqual(valuesOf(turn.board).slice(0, 4), expected);
    assert.deepEqual(valuesOf(original).slice(0, 4), row);
    assert.equal(turn.points, points);
  });
}

test('movement respects direction and preserves survivor IDs through animation frames', () => {
  const horizontal = boardOf(4, 4, 4, 4);
  const vertical = boardOf(4, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 4);
  for (const [board, direction, destination, survivor] of [
    [horizontal, 'left', 0, 1], [horizontal, 'right', 3, 4],
    [vertical, 'up', 0, 1], [vertical, 'down', 12, 13],
  ]) {
    const turn = slide(board, direction);
    assert.deepEqual(turn.board[destination], { id: survivor, value: 16 });
    assert.equal(turn.points, 32);
    assert.deepEqual(turn.frames.map(frame => frame.merged.length), [2, 1]);
    assert.equal(turn.frames[1].motions.size, 1);
  }
});

test('new games start with 1–3 numbered tiles and clean state', () => {
  for (const [random, count, value] of [[0, 1, 2], [.5, 2, 2], [.99, 3, 4]]) {
    const game = newGame(() => random, 'test');
    const tiles = game.board.filter(Boolean);
    assert.equal(game.board.length, 16);
    assert.equal(tiles.length, count);
    assert.equal(new Set(tiles.map(tile => tile.id)).size, count);
    assert.ok(tiles.every(tile => tile.value === value));
    assert.equal(game.score, 0);
    assert.equal(game.previous, null);
    assert.equal(game.over, false);
    assert.equal(game.saved, false);
  }
});

test('effective moves add one or two tiles, capped by free cells', () => {
  const original = gameOf(0, 2);
  for (const [random, count] of [[0, 1], [.99, 2]]) {
    const turn = playMove(original, 'left', () => random);
    assert.equal(turn.spawned.length, count);
    assert.equal(turn.game.board.filter(Boolean).length, 1 + count);
    assert.deepEqual(turn.game.board[0], original.board[1]);
    assert.equal(turn.game.nextId, 17 + count);
  }
  const almostFull = boardOf(...full.slice(0, 15));
  const { board, spawned } = spawnTiles(almostFull, 2, 17, () => .99);
  assert.deepEqual(spawned, [17]);
  assert.deepEqual(board[15], { id: 17, value: 4 });
});

test('no-op moves preserve score and undo without sampling randomness', () => {
  const turn = playMove(gameOf(0, 2), 'left', () => 0);
  const game = { ...turn.game, board: boardOf(2, 4) };
  assert.equal(playMove(game, 'left', () => assert.fail('unexpected spawn')), null);
  assert.equal(game.score, turn.game.score);
  assert.strictEqual(game.previous, turn.game.previous);
});

test('full board can still merge, and reaching 2048 keeps the game active', () => {
  assert.equal(hasMoves(boardOf(...full)), false);
  assert.equal(hasMoves(boardOf(...full.slice(0, 15), 4)), true);
  const { game } = playMove(gameOf(1024, 1024), 'left', () => 0);
  assert.equal(game.over, false);
  assert.equal(game.score, 2048);
  assert.equal(game.board[0].value, 2048);
});

test('undo restores the previous IDs, values and score and is consumed once', () => {
  const original = { ...gameOf(2, 2, 2, 2), score: 20 };
  const { game } = playMove(original, 'left', () => 0);
  assert.equal(game.score, 36);
  const restored = undoMove(game);
  assert.deepEqual(restored.board, original.board);
  assert.equal(restored.score, 20);
  assert.equal(restored.previous, null);
  assert.strictEqual(undoMove(restored), restored);
  assert.ok(playMove(restored, 'right', () => 0).game.previous);
});

test('last spawn can end the game and disables moves and undo', () => {
  const beforeEnd = [
    4, 2, 4, 8, 2, 4, 2, 4, 4, 2, 4, 8, 0, 2, 4, 8,
  ];
  const terminal = playMove(gameOf(...beforeEnd), 'left', () => 0).game;
  assert.ok(terminal.board.every(Boolean));
  assert.equal(terminal.over, true);
  assert.equal(terminal.previous, null);
  assert.strictEqual(undoMove(terminal), terminal);
  assert.equal(playMove(terminal, 'left'), null);
});

test('session round-trips game, undo, best score and saved end state', t => {
  const memory = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });

  const active = { game: playMove(gameOf(4, 4, 4, 4), 'left', () => 0).game, best: 64, records: [] };
  assert.equal(writeSession(active), true);
  assert.deepEqual(readSession(), active);
  assert.ok(memory.has(STORAGE_KEY));

  const finished = recordScore({ ...active, game: { ...active.game, board: boardOf(...full),
    previous: null, over: true } }, ' Ada ', '2026-01-01T00:00:00.000Z');
  assert.equal(writeSession(finished), true);
  assert.deepEqual(readSession(), finished);
  assert.strictEqual(recordScore(readSession(), 'Ada').records.length, 1);
});

test('bad and obsolete sessions recover safely and retain valid records', () => {
  const empty = { game: null, best: 0, records: [] };
  assert.deepEqual(decodeSession(null), empty);
  assert.deepEqual(decodeSession('{bad json'), empty);
  assert.deepEqual(decodeSession(JSON.stringify({ version: 0, game: gameOf(2) })), empty);
  const game = gameOf(2, 4);
  game.board[1] = game.board[0];
  assert.deepEqual(decodeSession(JSON.stringify({ version: 1, game })), empty);
  const records = [{ id: 'a', name: 'Ada', score: 99, date: '2026-01-01T00:00:00.000Z' }, null];
  assert.deepEqual(decodeSession(JSON.stringify({ version: 0, best: -3, records })),
    { game: null, best: 99, records: records.slice(0, 1) });
});

test('leaderboard saves the top ten in order and marks even scores outside it as saved', () => {
  const records = Array.from({ length: 11 }, (_, index) =>
    ({ id: `other-${index}`, name: 'Player', score: 10 + index, date: '2026-01-01T00:00:00.000Z' }));
  const over = { ...gameOf(...full), over: true, score: 15 };
  const initial = { game: over, best: 20, records };
  assert.strictEqual(recordScore(initial, '   '), initial);
  assert.strictEqual(recordScore(initial, 'x'.repeat(25)), initial);
  const updated = recordScore(initial, ' Ada ', '2026-01-02T00:00:00.000Z');
  assert.deepEqual(updated.records.map(record => record.score), [20, 19, 18, 17, 16, 15, 15, 14, 13, 12]);
  assert.equal(updated.records.find(record => record.id === over.id).name, 'Ada');
  assert.strictEqual(recordScore(updated, 'Again'), updated);
  const low = recordScore({ ...initial, game: { ...over, score: 1 } }, 'Low');
  assert.equal(low.game.saved, true);
  assert.ok(!low.records.some(record => record.id === over.id));
});

test('swipes use the primary axis and ignore tap-length movement', () => {
  assert.equal(swipeDirection(5, -10), null);
  assert.equal(swipeDirection(28, 4), 'right');
  assert.equal(swipeDirection(-39, 3), 'left');
  assert.equal(swipeDirection(18, -40), 'up');
  assert.equal(swipeDirection(4, 40), 'down');
});
