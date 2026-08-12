const board = document.querySelector('#board');
const tileLayer = document.querySelector('#tile-layer');
const pieceTray = document.querySelector('#piece-tray');
const piecePreview = document.querySelector('#piece-preview');
const dragPiece = document.querySelector('#drag-piece');
const sizeInput = document.querySelector('#size-input');
const sizeOutput = document.querySelector('#size-output');
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

let size = 8;
let blocked = new Set();
let rotation = 0;
let nextTileId = 1;
let cells = [];
let placements = [];
let drag = null;

const indexOf = (x, y) => y * size + x;

function newPuzzle(nextSize = size) {
  size = Math.max(4, Math.floor(nextSize) || 4);
  rotation = 0;
  nextTileId = 1;
  placements = [];
  blocked = makeSolvableHoles(size);
  renderBoard();
  updateUI();
  winPanel.hidden = true;
}

function renderBoard() {
  board.innerHTML = '';
  tileLayer.innerHTML = '';
  board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  board.setAttribute('aria-rowcount', size);
  board.setAttribute('aria-colcount', size);
  cells = Array.from({ length: size * size }, (_, index) => {
    const cell = document.createElement('div');
    const x = index % size;
    const y = Math.floor(index / size);
    cell.className = blocked.has(index) ? 'cell blocked' : 'cell';
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', blocked.has(index) ? `Missing square, row ${y + 1}, column ${x + 1}` : `Row ${y + 1}, column ${x + 1}`);
    board.appendChild(cell);
    return cell;
  });
}

function candidateAt(x, y) {
  return shapes[rotation].map(([dx, dy]) => indexOf(x + dx, y + dy));
}

function isValid(candidate, x, y) {
  if (x < 0 || y < 0 || x + 1 >= size || y + 1 >= size) return false;
  return candidate.every(index => !blocked.has(index) && !cells[index]?.dataset.tile);
}

function makeSolvableHoles(n) {
  const corners = [
    [0, 1, n],
    [n - 1, n - 2, 2 * n - 1],
    [n * (n - 1), n * (n - 2), n * (n - 1) + 1],
    [n * n - 1, n * n - 2, n * (n - 1) - 1],
  ];
  const corner = corners[Math.floor(Math.random() * corners.length)];
  return new Set(n % 3 === 0 ? corner : [corner[0]]);
}

function boardGeometry() {
  const boardRect = board.getBoundingClientRect();
  const first = cells[0].getBoundingClientRect();
  const second = cells[1].getBoundingClientRect();
  return {
    boardRect,
    cell: first.width,
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
  if (placements.length === (size * size - blocked.size) / 3) winPanel.hidden = false;
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

function rotate() {
  rotation = (rotation + 1) % 4;
  piecePreview.dataset.rotation = rotation;
  dragPiece.dataset.rotation = rotation;
  if (drag) moveDrag(drag.clientX, drag.clientY);
}

function beginDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  pieceTray.setPointerCapture?.(event.pointerId);
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
  let x = Math.round((clientX - geometry.originX - geometry.tileSize / 2) / geometry.pitch);
  let y = Math.round((clientY - geometry.originY - geometry.tileSize / 2) / geometry.pitch);
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
  const wasMoved = drag.moved;
  drag = null;
  dragPiece.classList.remove('dragging', 'snapped');
  if (dropped) placeTile(dropped.x, dropped.y);
  else if (!wasMoved) rotate();
}

function updateUI() {
  placedCount.textContent = placements.length;
  totalCount.textContent = (size * size - blocked.size) / 3;
  undoButton.disabled = placements.length === 0;
  piecePreview.dataset.rotation = rotation;
  sizeInput.value = size;
  sizeOutput.value = size;
  sizeOutput.textContent = size;
  missingCount.textContent = `${blocked.size} ${blocked.size === 1 ? 'square' : 'squares'} missing`;
}

document.querySelector('#size-form').addEventListener('submit', event => {
  event.preventDefault();
  newPuzzle(Number(sizeInput.value));
});
sizeInput.addEventListener('input', () => {
  const value = Math.max(4, Math.floor(Number(sizeInput.value)) || 4);
  sizeOutput.value = value;
  sizeOutput.textContent = value;
});
pieceTray.addEventListener('pointerdown', beginDrag);
pieceTray.addEventListener('pointermove', event => { if (drag) moveDrag(event.clientX, event.clientY); });
pieceTray.addEventListener('pointerup', endDrag);
pieceTray.addEventListener('pointercancel', endDrag);
document.querySelector('#rotate').addEventListener('click', rotate);
undoButton.addEventListener('click', undo);
document.querySelector('#reset').addEventListener('click', reset);
document.querySelector('#new-puzzle-top').addEventListener('click', () => newPuzzle());
document.querySelector('#play-again').addEventListener('click', () => newPuzzle());
document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey) rotate();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') undo();
});
window.addEventListener('resize', redrawTiles);

newPuzzle();
