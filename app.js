const board = document.querySelector('#board');
const boardWrap = document.querySelector('.board-wrap');
const tileLayer = document.querySelector('#tile-layer');
const pieceTrays = document.querySelectorAll('[data-piece-rotation]');
const dragPiece = document.querySelector('#drag-piece');
const miniBoard = document.querySelector('#mini-board');
const dimensionOutput = document.querySelector('#dimension-output');
const missingCount = document.querySelector('#missing-count');
const placedCount = document.querySelector('#placed-count');
const totalCount = document.querySelector('#total-count');
const undoButton = document.querySelector('#undo');
const winPanel = document.querySelector('#win');

const shapes = [
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [1, 1]],
  [[1, 0], [0, 1], [1, 1]],
  [[0, 0], [0, 1], [1, 1]],
];

let boardWidth = 8;
let boardHeight = 8;
let blocked = new Set();
let rotation = 0;
let nextTileId = 1;
let cells = [];
let placements = [];
let drag = null;

const indexOf = (x, y) => y * boardWidth + x;

function newPuzzle(nextWidth = boardWidth, nextHeight = boardHeight) {
  boardWidth = Math.max(4, Math.floor(nextWidth) || 4);
  boardHeight = Math.max(4, Math.floor(nextHeight) || 4);
  nextTileId = 1;
  placements = [];
  blocked = findRandomSolvableHoles(boardWidth, boardHeight);
  renderBoard();
  updateUI();
  winPanel.hidden = true;
}

function renderBoard() {
  board.innerHTML = '';
  tileLayer.innerHTML = '';
  board.style.gridTemplateColumns = `repeat(${boardWidth}, 1fr)`;
  board.style.aspectRatio = `${boardWidth} / ${boardHeight}`;
  board.setAttribute('aria-rowcount', boardHeight);
  board.setAttribute('aria-colcount', boardWidth);
  cells = Array.from({ length: boardWidth * boardHeight }, (_, index) => {
    const cell = document.createElement('div');
    const x = index % boardWidth;
    const y = Math.floor(index / boardWidth);
    cell.className = blocked.has(index) ? 'cell blocked' : 'cell';
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', blocked.has(index) ? `Missing square, row ${y + 1}, column ${x + 1}` : `Row ${y + 1}, column ${x + 1}`);
    board.appendChild(cell);
    return cell;
  });
  requestAnimationFrame(fitBoard);
}

function fitBoard() {
  boardWrap.style.width = '100%';
  const maxWidth = boardWrap.getBoundingClientRect().width;
  const top = boardWrap.getBoundingClientRect().top;
  const availableHeight = Math.max(160, window.innerHeight - top - 18);
  const widthForHeight = availableHeight * boardWidth / boardHeight;
  boardWrap.style.width = `${Math.min(maxWidth, widthForHeight)}px`;
}

function candidateAt(x, y, orientation = rotation) {
  return shapes[orientation].map(([dx, dy]) => indexOf(x + dx, y + dy));
}

function isValid(candidate, x, y) {
  if (x < 0 || y < 0 || x + 1 >= boardWidth || y + 1 >= boardHeight) return false;
  return candidate.every(index => !blocked.has(index) && !cells[index]?.dataset.tile);
}

function findRandomSolvableHoles(width, height) {
  const holeCount = (width * height) % 3;
  if (holeCount === 0) return new Set();
  const total = width * height;

  for (let attempt = 0; attempt < 160; attempt++) {
    const holes = new Set();
    while (holes.size < holeCount) holes.add(Math.floor(Math.random() * total));
    if (hasTiling(width, height, holes, performance.now() + 35)) return holes;
  }

  for (let first = 0; first < total; first++) {
    if (holeCount === 1) {
      const holes = new Set([first]);
      if (hasTiling(width, height, holes, performance.now() + 100)) return holes;
      continue;
    }
    for (let second = first + 1; second < total; second++) {
      const holes = new Set([first, second]);
      if (hasTiling(width, height, holes, performance.now() + 100)) return holes;
    }
  }
  throw new Error('No tilable puzzle could be generated');
}

function hasTiling(width, height, holes, deadline) {
  const total = width * height;
  const used = new Uint8Array(total);
  holes.forEach(index => { used[index] = 1; });
  const options = Array.from({ length: total }, () => []);

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      shapes.forEach(shape => {
        const placement = shape.map(([dx, dy]) => (y + dy) * width + x + dx);
        placement.forEach(index => options[index].push(placement));
      });
    }
  }

  function search(remaining) {
    if (remaining === 0) return true;
    if (performance.now() > deadline) return false;
    let choices = null;

    for (let index = 0; index < total; index++) {
      if (used[index]) continue;
      const available = options[index].filter(placement => placement.every(cell => !used[cell]));
      if (choices === null || available.length < choices.length) {
        choices = available;
        if (available.length === 0) return false;
      }
    }

    for (const placement of choices) {
      placement.forEach(index => { used[index] = 1; });
      if (search(remaining - 3)) return true;
      placement.forEach(index => { used[index] = 0; });
    }
    return false;
  }

  return search(total - holes.size);
}

function boardGeometry() {
  const boardRect = board.getBoundingClientRect();
  const first = cells[0].getBoundingClientRect();
  const second = cells[1].getBoundingClientRect();
  return {
    boardRect,
    pitch: second.left - first.left,
    originX: first.left,
    originY: first.top,
    tileSize: second.right - first.left,
  };
}

function placeTile(x, y) {
  const candidate = candidateAt(x, y);
  if (!isValid(candidate, x, y)) return false;
  const id = nextTileId++;
  const placement = { id, cells: candidate, x, y, rotation };
  candidate.forEach(index => { cells[index].dataset.tile = id; });
  placements.push(placement);
  renderPlacedTile(placement);
  updateUI();
  if (placements.length === (boardWidth * boardHeight - blocked.size) / 3) winPanel.hidden = false;
  return true;
}

function renderPlacedTile(placement) {
  const first = cells[indexOf(placement.x, placement.y)].getBoundingClientRect();
  const last = cells[indexOf(placement.x + 1, placement.y + 1)].getBoundingClientRect();
  const layerRect = tileLayer.getBoundingClientRect();
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'placed-tile tile-shape';
  tile.dataset.id = placement.id;
  tile.dataset.rotation = placement.rotation;
  tile.setAttribute('aria-label', 'Remove placed tile');
  tile.style.left = `${first.left - layerRect.left}px`;
  tile.style.top = `${first.top - layerRect.top}px`;
  tile.style.width = `${last.right - first.left}px`;
  tile.style.height = `${last.bottom - first.top}px`;
  tile.addEventListener('click', () => removeTile(placement.id));
  tileLayer.appendChild(tile);
}

function redrawTiles() {
  tileLayer.innerHTML = '';
  placements.forEach(renderPlacedTile);
}

function removeTile(id) {
  const placement = placements.find(item => item.id === id);
  if (!placement) return;
  placement.cells.forEach(index => { delete cells[index].dataset.tile; });
  placements = placements.filter(item => item.id !== id);
  tileLayer.querySelector(`[data-id="${id}"]`)?.remove();
  updateUI();
}

function undo() {
  const last = placements.at(-1);
  if (last) removeTile(last.id);
}

function reset() {
  placements.forEach(placement => placement.cells.forEach(index => { delete cells[index].dataset.tile; }));
  placements = [];
  nextTileId = 1;
  tileLayer.innerHTML = '';
  winPanel.hidden = true;
  updateUI();
}

function beginDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  const tray = event.currentTarget;
  rotation = Number(tray.dataset.pieceRotation);
  tray.setPointerCapture?.(event.pointerId);
  drag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, moved: false, startX: event.clientX, startY: event.clientY, candidate: null };
  dragPiece.dataset.rotation = rotation;
  dragPiece.classList.add('dragging');
  moveDrag(event.clientX, event.clientY);
}

function moveDrag(clientX, clientY) {
  if (!drag) return;
  drag.clientX = clientX;
  drag.clientY = clientY;
  if (Math.hypot(clientX - drag.startX, clientY - drag.startY) > 5) drag.moved = true;
  const geometry = boardGeometry();
  const margin = geometry.pitch * 0.7;
  const nearBoard = clientX >= geometry.boardRect.left - margin && clientX <= geometry.boardRect.right + margin && clientY >= geometry.boardRect.top - margin && clientY <= geometry.boardRect.bottom + margin;
  const x = Math.round((clientX - geometry.originX - geometry.tileSize / 2) / geometry.pitch);
  const y = Math.round((clientY - geometry.originY - geometry.tileSize / 2) / geometry.pitch);
  const candidate = candidateAt(x, y);
  const valid = nearBoard && isValid(candidate, x, y);

  if (valid) {
    const anchor = cells[indexOf(x, y)].getBoundingClientRect();
    dragPiece.style.left = `${anchor.left}px`;
    dragPiece.style.top = `${anchor.top}px`;
    dragPiece.style.width = `${geometry.tileSize}px`;
    dragPiece.style.height = `${geometry.tileSize}px`;
    dragPiece.classList.add('snapped');
    drag.candidate = { x, y };
  } else {
    const freeSize = Math.min(92, Math.max(62, geometry.tileSize));
    dragPiece.style.left = `${clientX - freeSize / 2}px`;
    dragPiece.style.top = `${clientY - freeSize / 2}px`;
    dragPiece.style.width = `${freeSize}px`;
    dragPiece.style.height = `${freeSize}px`;
    dragPiece.classList.remove('snapped');
    drag.candidate = null;
  }
}

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dropped = drag.candidate;
  drag = null;
  dragPiece.classList.remove('dragging', 'snapped');
  if (dropped) placeTile(dropped.x, dropped.y);
}

function updateUI() {
  placedCount.textContent = placements.length;
  totalCount.textContent = (boardWidth * boardHeight - blocked.size) / 3;
  undoButton.disabled = placements.length === 0;
  dimensionOutput.value = `${boardWidth} × ${boardHeight}`;
  dimensionOutput.textContent = `${boardWidth} × ${boardHeight}`;
  const miniScale = Math.min(104 / boardWidth, 68 / boardHeight);
  miniBoard.style.width = `${boardWidth * miniScale}px`;
  miniBoard.style.height = `${boardHeight * miniScale}px`;
  miniBoard.style.backgroundSize = `${100 / boardWidth}% ${100 / boardHeight}%`;
  missingCount.textContent = blocked.size === 0 ? 'No squares missing' : `${blocked.size} ${blocked.size === 1 ? 'square' : 'squares'} missing`;
  document.querySelectorAll('[data-step="-1"]').forEach(button => {
    const value = button.dataset.dimension === 'width' ? boardWidth : boardHeight;
    button.disabled = value <= 4;
  });
}

document.querySelectorAll('[data-step]').forEach(button => {
  button.addEventListener('click', () => {
    const amount = Number(button.dataset.step);
    const nextWidth = button.dataset.dimension === 'width' ? boardWidth + amount : boardWidth;
    const nextHeight = button.dataset.dimension === 'height' ? boardHeight + amount : boardHeight;
    newPuzzle(nextWidth, nextHeight);
  });
});
pieceTrays.forEach(tray => {
  tray.addEventListener('pointerdown', beginDrag);
  tray.addEventListener('pointermove', event => { if (drag) moveDrag(event.clientX, event.clientY); });
  tray.addEventListener('pointerup', endDrag);
  tray.addEventListener('pointercancel', endDrag);
});
undoButton.addEventListener('click', undo);
document.querySelector('#reset').addEventListener('click', reset);
document.querySelector('#new-puzzle').addEventListener('click', () => newPuzzle());
document.querySelector('#play-again').addEventListener('click', () => newPuzzle());
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') undo();
});
window.addEventListener('resize', () => {
  fitBoard();
  requestAnimationFrame(redrawTiles);
});

newPuzzle();
