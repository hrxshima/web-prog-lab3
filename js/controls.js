const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const SWIPE_DISTANCE = 28;

export function swipeDirection(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_DISTANCE) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export function bindControls(board, canPlay, move) {
  document.addEventListener('keydown', event => {
    if (!Object.hasOwn(keys, event.key) || !canPlay() || event.defaultPrevented ||
        event.altKey || event.ctrlKey || event.metaKey ||
        event.target.closest('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    move(keys[event.key]);
  });

  let gesture = null;
  board.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || !event.isPrimary || !canPlay()) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    board.setPointerCapture(event.pointerId);
  });

  board.addEventListener('pointerup', event => {
    if (event.pointerId !== gesture?.id) return;
    const direction = swipeDirection(event.clientX - gesture.x, event.clientY - gesture.y);
    gesture = null;
    if (direction && canPlay()) move(direction);
  });

  const clearGesture = event => {
    if (event.pointerId === gesture?.id) gesture = null;
  };
  board.addEventListener('pointercancel', clearGesture);
  board.addEventListener('lostpointercapture', clearGesture);
}
