import { createBoard } from './board.js';
import { bindControls } from './controls.js';
import { newGame, playMove, undoMove } from './game.js';
import { recordScore, renderLeaderboard } from './leaderboard.js';
import { readSession, writeSession } from './storage.js';

const get = id => document.getElementById(id);
const boardElement = get('board');
const board = createBoard(boardElement);
const newButton = get('new-game');
const undoButton = get('undo');
const leaderboardButton = get('open-leaderboard');
const leaderboard = get('leaderboard');
const gameOver = get('game-over');
const saveForm = get('save-score');
const nameInput = get('player-name');
const savedMessage = get('saved-score');
const saveError = get('save-error');
const restartButton = get('restart');
const scoreElement = get('score');
const status = get('game-status');
const notice = get('notice');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let data = readSession();
data.game ??= newGame();
let busy = false;
let pendingDirection = null;

function persist(updated = data) {
  const success = writeSession(updated);
  notice.hidden = success;
  notice.textContent = success ? '' : 'Local storage is unavailable. Changes may be lost after reloading.';
  return success;
}

function syncButtons() {
  undoButton.disabled = busy || data.game.over || !data.game.previous;
  newButton.disabled = busy;
  leaderboardButton.disabled = busy;
}

function updateScore() {
  const next = String(data.game.score);
  if (scoreElement.textContent !== next) {
    scoreElement.textContent = next;
    if (!reducedMotion.matches) {
      scoreElement.animate([
        { transform: 'translateY(4px)', opacity: .55 },
        { transform: 'translateY(0)', opacity: 1 },
      ], { duration: 210, easing: 'ease-out' });
    }
  }
  get('best').textContent = data.best;
}

function showGameOver() {
  get('final-score').textContent = data.game.score;
  saveForm.hidden = data.game.saved;
  savedMessage.hidden = !data.game.saved;
  if (!gameOver.open) gameOver.showModal();
  if (data.game.saved) restartButton.focus();
}

function refresh(announcement = '') {
  const { game } = data;
  const description = board.describe(game.board);
  boardElement.setAttribute('aria-label', `2048 board. ${description}`);
  if (announcement) status.textContent = `${announcement} Score ${game.score}. ${description}`;
  updateScore();
  syncButtons();
  if (game.over) showGameOver();
}

function canPlay() {
  return !data.game.over && !leaderboard.open && !gameOver.open;
}

async function move(direction) {
  if (!canPlay()) return;
  if (busy) {
    pendingDirection = direction;
    return;
  }

  const turn = playMove(data.game, direction);
  if (!turn) return;

  busy = true;
  syncButtons();
  data = { ...data, game: turn.game, best: Math.max(data.best, turn.game.score) };
  persist();

  try {
    await board.animateMove(turn);
  } finally {
    busy = false;
    const next = pendingDirection;
    pendingDirection = null;
    refresh('Board moved.');
    if (next) void move(next);
  }
}

function restart() {
  if (busy) return;
  const fromDialog = gameOver.open;
  if (fromDialog) gameOver.close();

  const stored = readSession();
  data = { ...data, records: stored.game ? stored.records : data.records,
    best: Math.max(data.best, stored.best), game: newGame() };
  saveForm.reset();
  nameInput.setCustomValidity('');
  saveError.hidden = true;
  persist();
  void board.display(data.game.board, { spawned: data.game.board.flatMap(tile => tile ? [tile.id] : []) });
  refresh('New game.');
  if (fromDialog) newButton.focus();
}

newButton.addEventListener('click', restart);
restartButton.addEventListener('click', restart);
undoButton.addEventListener('click', () => {
  if (busy || !canPlay()) return;
  const game = undoMove(data.game);
  if (game === data.game) return;
  data = { ...data, game };
  persist();
  void board.display(game.board);
  refresh('Move undone.');
  newButton.focus();
});

leaderboardButton.addEventListener('click', () => {
  renderLeaderboard(get('records'), get('empty-leaderboard'), data.records);
  leaderboard.showModal();
});
gameOver.addEventListener('cancel', event => event.preventDefault());
nameInput.addEventListener('input', () => {
  nameInput.setCustomValidity('');
  saveError.hidden = true;
});

saveForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.setCustomValidity('Enter a name to save your score.');
    nameInput.reportValidity();
    return;
  }

  const stored = readSession();
  const game = stored.game?.id === data.game.id && stored.game.saved
    ? { ...data.game, saved: true }
    : data.game;
  const latest = { ...data, game, records: stored.game ? stored.records : data.records,
    best: Math.max(data.best, stored.best) };
  const updated = recordScore(latest, name);
  if (!updated.game.saved) return;
  if (!persist(updated)) {
    saveError.textContent = 'The score could not be saved. Try again.';
    saveError.hidden = false;
    return;
  }

  data = updated;
  saveError.hidden = true;
  showGameOver();
});

bindControls(boardElement, canPlay, move);
persist();
void board.display(data.game.board);
refresh();
