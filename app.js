const board = document.querySelector('#board');
const boardWrap = document.querySelector('.board-wrap');
const tileLayer = document.querySelector('#tile-layer');
const dragPiece = document.querySelector('#drag-piece');
const miniBoard = document.querySelector('#mini-board');
const dimensionOutput = document.querySelector('#dimension-output');
const freeSizeControl = document.querySelector('#free-size-control');
const calendarInfo = document.querySelector('#calendar-info');
const calendarWeekdays = document.querySelector('#calendar-weekdays');
const monthName = document.querySelector('#month-name');
const calendarSize = document.querySelector('#calendar-size');
const puzzleKicker = document.querySelector('#puzzle-kicker');
const missingCount = document.querySelector('#missing-count');
const placedCount = document.querySelector('#placed-count');
const totalCount = document.querySelector('#total-count');
const undoButton = document.querySelector('#undo');
const winPanel = document.querySelector('#win');
const specialPiece = document.querySelector('#special-piece');
const specialTray = document.querySelector('#special-piece-tray');
const specialPreview = document.querySelector('#special-preview');

const triominoes = [
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [1, 1]],
  [[1, 0], [0, 1], [1, 1]],
  [[0, 0], [0, 1], [1, 1]],
];

let mode = 'calendar';
let boardWidth = 7;
let boardHeight = 6;
let blocked = new Set();
let cellLabels = new Map();
let specialKind = 'domino';
let nextTileId = 1;
let cells = [];
let placements = [];
let drag = null;

const indexOf = (x, y) => y * boardWidth + x;

function shapeFor(kind, rotation = 0) {
  if (kind === 'mono') return { cells: [[0, 0]], width: 1, height: 1, className: 'single-shape' };
  if (kind === 'domino') return { cells: [[0, 0], [1, 0]], width: 2, height: 1, className: 'domino-shape' };
  return { cells: triominoes[rotation], width: 2, height: 2, className: 'tile-shape' };
}

function newPuzzle() {
  if (mode === 'calendar') newCalendarPuzzle();
  else newFreePuzzle(boardWidth, boardHeight);
}

function newCalendarPuzzle() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  boardWidth = 7;
  boardHeight = Math.max(5, Math.ceil((firstWeekday + days) / 7));
  blocked = new Set([firstWeekday + today.getDate() - 1]);
  cellLabels = new Map([[firstWeekday + today.getDate() - 1, today.getDate()]]);
  specialKind = boardHeight === 5 ? 'mono' : 'domino';
  monthName.textContent = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  calendarSize.textContent = `Sunday–Saturday · ${boardHeight} weeks`;
  startPuzzle();
}

function newFreePuzzle(nextWidth = boardWidth, nextHeight = boardHeight) {
  boardWidth = Math.max(4, Math.floor(nextWidth) || 4);
  boardHeight = Math.max(4, Math.floor(nextHeight) || 4);
  blocked = findRandomSolvableHoles(boardWidth, boardHeight);
  cellLabels = new Map();
  specialKind = null;
  startPuzzle();
}

function startPuzzle() {
  nextTileId = 1;
  placements = [];
  renderBoard();
  updateUI();
  winPanel.hidden = true;
}

function renderBoard() {
  board.innerHTML = '';
  tileLayer.innerHTML = '';
  board.style.gridTemplateColumns = `repeat(${boardWidth},1fr)`;
  board.style.aspectRatio = `${boardWidth}/${boardHeight}`;
  board.setAttribute('aria-rowcount', boardHeight);
  board.setAttribute('aria-colcount', boardWidth);
  cells = Array.from({ length: boardWidth * boardHeight }, (_, index) => {
    const cell = document.createElement('div');
    const x = index % boardWidth;
    const y = Math.floor(index / boardWidth);
    cell.className = 'cell';
    if (mode === 'calendar' && (x === 0 || x === 6)) cell.classList.add('weekend');
    if (blocked.has(index)) cell.classList.add('blocked');
    if (cellLabels.has(index)) cell.textContent = cellLabels.get(index);
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', blocked.has(index) ? `Today, ${cellLabels.get(index)}` : `Row ${y + 1}, column ${x + 1}`);
    board.appendChild(cell);
    return cell;
  });
  requestAnimationFrame(fitBoard);
}

function fitBoard() {
  boardWrap.style.width = '100%';
  const maxWidth = boardWrap.getBoundingClientRect().width;
  const top = boardWrap.getBoundingClientRect().top;
  const labelHeight = mode === 'calendar' ? 24 : 0;
  const availableHeight = Math.max(160, window.innerHeight - top - labelHeight - 18);
  boardWrap.style.width = `${Math.min(maxWidth, availableHeight * boardWidth / boardHeight)}px`;
}

function candidateAt(x, y, shape) {
  return shape.cells.map(([dx, dy]) => indexOf(x + dx, y + dy));
}

function isValid(candidate, x, y, shape, kind) {
  if (x < 0 || y < 0 || x + shape.width > boardWidth || y + shape.height > boardHeight) return false;
  if (kind !== 'tri' && placements.some(item => item.kind !== 'tri')) return false;
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
      triominoes.forEach(shape => {
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
  return { boardRect, pitch: second.left - first.left, originX: first.left, originY: first.top };
}

function placeTile(x, y, kind, rotation, shape, existingId = null) {
  const candidate = candidateAt(x, y, shape);
  if (!isValid(candidate, x, y, shape, kind)) return false;
  const id = existingId ?? nextTileId++;
  const placement = { id, cells: candidate, x, y, kind, rotation, shape };
  candidate.forEach(index => { cells[index].dataset.tile = id; });
  placements.push(placement);
  renderPlacedTile(placement);
  updateUI();
  const covered = placements.reduce((sum, item) => sum + item.cells.length, 0);
  if (covered === boardWidth * boardHeight - blocked.size) winPanel.hidden = false;
  return true;
}

function renderPlacedTile(placement) {
  const first = cells[indexOf(placement.x, placement.y)].getBoundingClientRect();
  const last = cells[indexOf(placement.x + placement.shape.width - 1, placement.y + placement.shape.height - 1)].getBoundingClientRect();
  const layerRect = tileLayer.getBoundingClientRect();
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = `placed-tile ${placement.shape.className}`;
  tile.dataset.id = placement.id;
  if (placement.kind === 'tri') tile.dataset.rotation = placement.rotation;
  tile.setAttribute('aria-label', 'Move placed tile');
  tile.style.left = `${first.left - layerRect.left}px`;
  tile.style.top = `${first.top - layerRect.top}px`;
  tile.style.width = `${last.right - first.left}px`;
  tile.style.height = `${last.bottom - first.top}px`;
  tile.addEventListener('pointerdown', event => beginPlacedDrag(event, placement, tile));
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
  const tray = event.currentTarget;
  if (tray.disabled) return;
  event.preventDefault();
  const kind = tray.dataset.pieceKind;
  const rotation = Number(tray.dataset.pieceRotation || 0);
  const shape = shapeFor(kind, rotation);
  startDrag(event, { kind, rotation, shape, source: null });
}

function beginPlacedDrag(event, placement, tile) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  placement.cells.forEach(index => { delete cells[index].dataset.tile; });
  placements = placements.filter(item => item.id !== placement.id);
  tile.remove();
  updateUI();
  startDrag(event, { kind: placement.kind, rotation: placement.rotation, shape: placement.shape, source: placement });
}

function startDrag(event, { kind, rotation, shape, source }) {
  drag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, candidate: null, kind, rotation, shape, source };
  dragPiece.className = `drag-piece ${shape.className} dragging`;
  if (kind === 'tri') dragPiece.dataset.rotation = rotation;
  else delete dragPiece.dataset.rotation;
  moveDrag(event.clientX, event.clientY);
}

function moveDrag(clientX, clientY) {
  if (!drag) return;
  drag.clientX = clientX;
  drag.clientY = clientY;
  const geometry = boardGeometry();
  const margin = geometry.pitch * 0.7;
  const nearBoard = clientX >= geometry.boardRect.left - margin && clientX <= geometry.boardRect.right + margin && clientY >= geometry.boardRect.top - margin && clientY <= geometry.boardRect.bottom + margin;
  const x = Math.round((clientX - geometry.originX - geometry.pitch * drag.shape.width / 2) / geometry.pitch);
  const y = Math.round((clientY - geometry.originY - geometry.pitch * drag.shape.height / 2) / geometry.pitch);
  const candidate = candidateAt(x, y, drag.shape);
  const valid = nearBoard && isValid(candidate, x, y, drag.shape, drag.kind);
  if (valid) {
    const first = cells[indexOf(x, y)].getBoundingClientRect();
    const last = cells[indexOf(x + drag.shape.width - 1, y + drag.shape.height - 1)].getBoundingClientRect();
    dragPiece.style.left = `${first.left}px`;
    dragPiece.style.top = `${first.top}px`;
    dragPiece.style.width = `${last.right - first.left}px`;
    dragPiece.style.height = `${last.bottom - first.top}px`;
    dragPiece.classList.add('snapped');
    drag.candidate = { x, y };
  } else {
    const unit = Math.min(46, Math.max(30, geometry.pitch));
    const width = unit * drag.shape.width;
    const height = unit * drag.shape.height;
    dragPiece.style.left = `${clientX - width / 2}px`;
    dragPiece.style.top = `${clientY - height / 2}px`;
    dragPiece.style.width = `${width}px`;
    dragPiece.style.height = `${height}px`;
    dragPiece.classList.remove('snapped');
    drag.candidate = null;
  }
}

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const current = drag;
  drag = null;
  dragPiece.className = 'drag-piece';
  if (current.candidate) {
    placeTile(current.candidate.x, current.candidate.y, current.kind, current.rotation, current.shape, current.source?.id ?? null);
  } else if (current.source) {
    placeTile(current.source.x, current.source.y, current.source.kind, current.source.rotation, current.source.shape, current.source.id);
  }
}

function updateUI() {
  const playable = boardWidth * boardHeight - blocked.size;
  const specialSize = specialKind === 'mono' ? 1 : specialKind === 'domino' ? 2 : 0;
  const expectedTiles = (playable - specialSize) / 3 + (specialSize ? 1 : 0);
  placedCount.textContent = placements.length;
  totalCount.textContent = expectedTiles;
  undoButton.disabled = placements.length === 0;
  freeSizeControl.hidden = mode !== 'free';
  calendarInfo.hidden = mode !== 'calendar';
  calendarWeekdays.hidden = mode !== 'calendar';
  specialPiece.hidden = !specialKind;
  specialTray.disabled = placements.some(item => item.kind !== 'tri');
  if (specialKind) {
    specialTray.dataset.pieceKind = specialKind;
    specialTray.setAttribute('aria-label', `Drag the one-use ${specialKind === 'mono' ? 'single square' : 'domino'}`);
    specialPreview.className = `piece-preview ${specialKind === 'mono' ? 'single-shape' : 'domino-shape'}`;
  }
  if (mode === 'free') {
    dimensionOutput.textContent = `${boardWidth} × ${boardHeight}`;
    const miniScale = Math.min(104 / boardWidth, 68 / boardHeight);
    miniBoard.style.width = `${boardWidth * miniScale}px`;
    miniBoard.style.height = `${boardHeight * miniScale}px`;
    miniBoard.style.backgroundSize = `${100 / boardWidth}% ${100 / boardHeight}%`;
    missingCount.textContent = blocked.size === 0 ? 'No squares missing' : `${blocked.size} ${blocked.size === 1 ? 'square' : 'squares'} missing`;
  } else {
    missingCount.textContent = `${cellLabels.values().next().value} stays visible · ${specialKind === 'mono' ? 'one single square' : 'one domino'} included`;
  }
  document.querySelectorAll('[data-step="-1"]').forEach(button => {
    const value = button.dataset.dimension === 'width' ? boardWidth : boardHeight;
    button.disabled = value <= 4;
  });
}

document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('active', item === button));
    puzzleKicker.textContent = mode === 'calendar' ? 'TODAY’S CALENDAR' : 'L–TRIOMINO · FREE BOARD';
    if (mode === 'calendar') newCalendarPuzzle();
    else newFreePuzzle(8, 8);
  });
});

document.querySelectorAll('[data-step]').forEach(button => {
  button.addEventListener('click', () => {
    const amount = Number(button.dataset.step);
    newFreePuzzle(button.dataset.dimension === 'width' ? boardWidth + amount : boardWidth, button.dataset.dimension === 'height' ? boardHeight + amount : boardHeight);
  });
});

document.querySelectorAll('[data-piece-kind]').forEach(tray => {
  tray.addEventListener('pointerdown', beginDrag);
});

window.addEventListener('pointermove', event => {
  if (drag && event.pointerId === drag.pointerId) moveDrag(event.clientX, event.clientY);
});
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

undoButton.addEventListener('click', undo);
document.querySelector('#reset').addEventListener('click', reset);
document.querySelector('#new-puzzle').addEventListener('click', newPuzzle);
document.querySelector('#play-again').addEventListener('click', newPuzzle);
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') undo();
});
window.addEventListener('resize', () => {
  fitBoard();
  requestAnimationFrame(redrawTiles);
});

newCalendarPuzzle();
