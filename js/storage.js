import { hasMoves, SIZE } from './game.js';
import { MAX_NAME_LENGTH, rankRecords } from './leaderboard.js';

export const STORAGE_KEY = 'web-prog-lab3:2048';
const VERSION = 1;
const validScore = score => Number.isSafeInteger(score) && score >= 0;
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 128;

function validBoard(board, nextId) {
  if (!Array.isArray(board) || board.length !== SIZE * SIZE) return false;

  const ids = new Set();
  for (const tile of board) {
    if (tile === null) continue;
    if (!tile || !Number.isSafeInteger(tile.id) || tile.id < 1 || tile.id >= nextId || ids.has(tile.id)) {
      return false;
    }
    if (!Number.isSafeInteger(tile.value) || tile.value < 2 || !Number.isInteger(Math.log2(tile.value))) {
      return false;
    }
    ids.add(tile.id);
  }
  return ids.size > 0;
}

function restoreGame(game, records) {
  if (!validId(game?.id) || !validScore(game.score) || !Number.isSafeInteger(game.nextId) ||
      !validBoard(game.board, game.nextId)) return null;

  const over = !hasMoves(game.board);
  const previous = game.previous;
  const canRestoreUndo = !over && validScore(previous?.score) && previous.score <= game.score &&
    validBoard(previous.board, game.nextId) && hasMoves(previous.board);

  return {
    ...game,
    previous: canRestoreUndo ? previous : null,
    over,
    saved: over && (game.saved === true || records.some(record => record.id === game.id)),
  };
}

function restoreRecords(value) {
  if (!Array.isArray(value)) return [];
  const records = value.filter(record =>
    validId(record?.id) && validScore(record.score) &&
    typeof record.name === 'string' && record.name.trim() && record.name.length <= MAX_NAME_LENGTH &&
    typeof record.date === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(record.date) &&
    Number.isFinite(Date.parse(record.date))
  );
  return rankRecords([...new Map(records.map(record => [record.id, record])).values()]);
}

export function decodeSession(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }

  const records = restoreRecords(data?.records);
  const game = data?.version === VERSION ? restoreGame(data.game, records) : null;
  const best = Math.max(validScore(data?.best) ? data.best : 0, game?.score ?? 0,
    ...records.map(record => record.score));
  return { game, best, records };
}

export function readSession() {
  try {
    return decodeSession(localStorage.getItem(STORAGE_KEY));
  } catch {
    return decodeSession(null);
  }
}

export function writeSession(data) {
  try {
    // Save the leaderboard and the game's submission flag in the same write.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: VERSION }));
    return true;
  } catch {
    return false;
  }
}
