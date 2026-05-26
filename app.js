(function () {
  "use strict";

  const STORAGE_RECORDS = "maze-corridor.records";
  const STORAGE_SEEDS = "maze-corridor.seeds";

  const DR = [-1, 0, 1, 0]; // up, right, down, left
  const DC = [0, 1, 0, -1];

  const difficultyMazeSize = {
    easy: { width: 11, height: 11 },
    medium: { width: 17, height: 17 },
    hard: { width: 25, height: 25 },
    expert: { width: 35, height: 35 },
  };

  const difficultyNames = {
    easy: "简单",
    medium: "普通",
    hard: "困难",
    expert: "专家",
  };

  const els = {
    mazeContainer: document.getElementById("mazeContainer"),
    mazeStatus: document.getElementById("mazeStatus"),
    timer: document.getElementById("timer"),
    mistakes: document.getElementById("mistakes"),
    seedInput: document.getElementById("seedInput"),
    loadSeedBtn: document.getElementById("loadSeedBtn"),
    difficulty: document.getElementById("difficulty"),
    newGameBtn: document.getElementById("newGameBtn"),
    resetBtn: document.getElementById("resetBtn"),
    trailBtn: document.getElementById("trailBtn"),
    autoBtn: document.getElementById("autoBtn"),
    againBtn: document.getElementById("againBtn"),
    clearRecordsBtn: document.getElementById("clearRecordsBtn"),
    recordsList: document.getElementById("recordsList"),
    mascotLine: document.getElementById("mascotLine"),
    toast: document.getElementById("toast"),
    resultModal: document.getElementById("resultModal"),
    modalIcon: document.getElementById("modalIcon"),
    modalTitle: document.getElementById("modalTitle"),
    modalBody: document.getElementById("modalBody"),
    modalBtn: document.getElementById("modalBtn"),
    modalClose: document.getElementById("modalClose"),
  };

  const state = {
    maze: [],
    mazeWidth: 7,
    mazeHeight: 7,
    renderRows: 15,
    renderCols: 15,
    entranceRow: 0,
    entranceCol: 0,
    exitRow: 6,
    exitCol: 6,
    playerRow: 0,
    playerCol: 0,
    mistakes: 0,
    seed: "",
    difficulty: "medium",
    startedAt: Date.now(),
    ended: false,
    timerId: null,
    animating: false,
    animTimer: null,
    pauseOffset: 0,
    trail: [],
    showTrail: true,
    records: loadJson(STORAGE_RECORDS, []),
    seedStore: loadJson(STORAGE_SEEDS, {}),
  };

  const mascotLines = {
    ready: "选一个方向，我陪你走到底。",
    good: "走对了，继续前进。",
    bad: "死路，换一条路试试。",
    fail: "迷路太多次了，换个种子再来。",
    win: "成功走出迷宫！干得漂亮。",
  };

  init();

  /* ===== Initialisation ===== */

  function init() {
    buildMazeContainer();
    bindActions();
    renderRecords();
    startGame();
    // Pause timer when page is hidden
    document.addEventListener("visibilitychange", function () {
      if (state.ended) return;
      if (document.hidden) {
        state.pauseOffset = Date.now() - state.startedAt;
        window.clearInterval(state.timerId);
        state.timerId = null;
      } else {
        state.startedAt = Date.now() - state.pauseOffset;
        state.timerId = window.setInterval(function () {
          els.timer.textContent = formatTime(elapsedSeconds());
        }, 500);
      }
    });
  }

  function buildMazeContainer() {
    els.mazeContainer.innerHTML = "";
    // Grid is rebuilt each startGame, so we only attach the click listener once
    els.mazeContainer.addEventListener("click", onMazeClick);
  }

  function bindActions() {
    els.newGameBtn.addEventListener("click", () => startGame());
    els.againBtn.addEventListener("click", () => startGame());
    els.resetBtn.addEventListener("click", resetGame);
    els.trailBtn.addEventListener("click", toggleTrail);
    els.autoBtn.addEventListener("click", autoSolve);
    els.modalBtn.addEventListener("click", function () {
      els.resultModal.classList.add("hidden");
      startGame();
    });
    els.modalClose.addEventListener("click", function () {
      els.resultModal.classList.add("hidden");
    });
    els.loadSeedBtn.addEventListener("click", () => {
      const seed = els.seedInput.value.trim();
      if (!seed) {
        showToast("请输入种子码");
        return;
      }
      startGame(seed);
    });
    els.clearRecordsBtn.addEventListener("click", () => {
      state.records = [];
      saveJson(STORAGE_RECORDS, state.records);
      renderRecords();
    });
  }

  /* ===== Game Lifecycle ===== */

  async function startGame(requestedSeed) {
    clearAnimTimer();
    state.difficulty = els.difficulty.value;
    state.seed = requestedSeed || createSeed(state.difficulty);
    els.resultModal.classList.add("hidden");
    state.mistakes = 0;
    els.mistakes.textContent = `错误 0/3`;
    state.trail = [];
    state.showTrail = true;
    els.trailBtn.textContent = "隐藏轨迹";
    state.ended = false;
    state.animating = false;
    state.startedAt = Date.now();
    els.againBtn.classList.add("hidden");
    els.seedInput.value = state.seed;
    setMascot("ready");
    els.mazeStatus.textContent = "正在生成迷宫";

    const size = difficultyMazeSize[state.difficulty] || difficultyMazeSize.medium;
    state.mazeWidth = size.width;
    state.mazeHeight = size.height;
    state.renderRows = 2 * size.height + 1;
    state.renderCols = 2 * size.width + 1;

    // Pick random boundary positions for entrance and exit (before maze gen)
    const rng = mulberry32(hashString(state.seed));
    const positions = pickBoundaryPositions(state.mazeWidth, state.mazeHeight, rng);
    state.entranceRow = positions.entrance.row;
    state.entranceCol = positions.entrance.col;
    state.exitRow = positions.exit.row;
    state.exitCol = positions.exit.col;
    state.playerRow = state.entranceRow;
    state.playerCol = state.entranceCol;

    // Generate maze starting from entrance cell
    state.maze = generateMaze(state.mazeWidth, state.mazeHeight, state.entranceRow, state.entranceCol, rng);

    // Open boundary walls at entrance and exit
    openBoundaryWall(state.maze, positions.entrance);
    openBoundaryWall(state.maze, positions.exit);

    renderMaze();
    restartTimer();
    showToast("迷宫已生成");

    // Entrance is always a fork (2+ paths), show choices immediately
    showClickableNeighbors();
    els.mazeStatus.textContent = "选择方向";
  }

  function resetGame() {
    if (state.ended) return;
    clearAnimTimer();
    clearClickableHighlights();
    clearTraversedCells();
    clearPlayerPosition();
    clearTrailMarkers();
    state.trail = [];

    state.playerRow = state.entranceRow;
    state.playerCol = state.entranceCol;
    state.mistakes = 0;
    els.mistakes.textContent = `错误 0/3`;
    state.animating = false;
    restartTimer();
    els.mazeStatus.textContent = "重置中";

    const startEl = getRenderCell(state.entranceRow, state.entranceCol);
    if (startEl) startEl.classList.add("maze-player");

    showClickableNeighbors();
    els.mazeStatus.textContent = "选择方向";
    showToast("已重置");
  }

  function finishGame(result) {
    if (state.ended) return;
    state.ended = true;
    clearAnimTimer();
    clearClickableHighlights();
    window.clearInterval(state.timerId);

    const seconds = elapsedSeconds();
    state.records.unshift({
      result,
      seconds,
      seed: state.seed,
      difficulty: state.difficulty,
      at: new Date().toISOString(),
    });
    state.records = state.records.slice(0, 20);
    saveJson(STORAGE_RECORDS, state.records);
    renderRecords();

    if (result === "失败") {
      els.againBtn.classList.remove("hidden");
      setMascot("fail");
      els.mazeStatus.textContent = "迷路失败";
      showResultModal("😢", "迷路失败", "下次换个方向试试");
    } else {
      setMascot("win");
      els.mazeStatus.textContent = "通关成功！";
      showResultModal("🎉", "通关成功", "迷宫已走完，干得漂亮");
    }
  }

  function showResultModal(icon, title, msg) {
    var diffName = difficultyNames[state.difficulty] || state.difficulty;
    var timeStr = formatTime(elapsedSeconds());
    els.modalIcon.textContent = icon;
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML =
      "<p>" + msg + "</p>" +
      "<p>用时 " + timeStr + " · " + diffName + "</p>" +
      "<p style=\"font-size:12px;color:#9a8a7a\">" + state.seed + "</p>";
    els.modalBtn.textContent = title === "迷路失败" ? "再来一局" : "新迷宫";
    els.resultModal.classList.remove("hidden");
  }

  /* ===== Auto Solve ===== */

  function findPathToExit(startRow, startCol) {
    var h = state.mazeHeight, w = state.mazeWidth;
    var visited = [];
    for (var r = 0; r < h; r++) {
      visited[r] = [];
      for (var c = 0; c < w; c++) visited[r][c] = false;
    }
    var parent = {};

    function dfs(row, col) {
      if (row === state.exitRow && col === state.exitCol) return true;
      visited[row][col] = true;
      var neighbors = getOpenNeighbors(row, col);
      for (var ni = 0; ni < neighbors.length; ni++) {
        var n = neighbors[ni];
        if (!visited[n.row][n.col]) {
          parent[n.row + "," + n.col] = { row: row, col: col };
          if (dfs(n.row, n.col)) return true;
        }
      }
      return false;
    }

    dfs(startRow, startCol);

    // Reconstruct path from exit back to start
    var path = [];
    var r = state.exitRow, c = state.exitCol;
    while (r !== startRow || c !== startCol) {
      path.unshift({ row: r, col: c });
      var p = parent[r + "," + c];
      r = p.row;
      c = p.col;
    }
    path.unshift({ row: startRow, col: startCol });
    return path;
  }

  function autoSolve() {
    if (state.ended || state.animating) return;

    // Enable trail so the path is visible
    if (!state.showTrail) {
      toggleTrail();
    }

    var path = findPathToExit(state.playerRow, state.playerCol);
    if (path.length <= 1) return;

    state.animating = true;
    clearClickableHighlights();
    els.mazeStatus.textContent = "自动行走...";
    els.autoBtn.disabled = true;

    var step = 1;
    function doStep() {
      if (step >= path.length) {
        // Reached exit
        state.animating = false;
        els.autoBtn.disabled = false;
        finishGame("成功");
        return;
      }

      var cell = path[step];
      var prev = path[step - 1];

      // Move player visuals
      clearPlayerPosition();
      var el = getRenderCell(cell.row, cell.col);
      if (el) el.classList.add("maze-player");
      state.playerRow = cell.row;
      state.playerCol = cell.col;

      // Add to trail
      var dir = getDirection(cell.row - prev.row, cell.col - prev.col);
      state.trail.push({ row: cell.row, col: cell.col, dir: dir });
      if (el) {
        el.classList.add("maze-trail");
        el.classList.add("maze-trail-dir" + dir);
      }
      // passage
      var pel = getPassageCell(prev.row, prev.col, cell.row, cell.col);
      if (pel) pel.classList.add("maze-trail");

      step++;
      state.animTimer = setTimeout(doStep, 60);
    }

    doStep();
  }

  /* ===== Boundary Entrance / Exit ===== */

  function pickBoundaryPositions(width, height, rng) {
    var candidates = [];
    // Top edge (row 0, col 1..w-2)
    for (var c = 1; c < width - 1; c++) candidates.push({ row: 0, col: c });
    // Bottom edge (row h-1, col 1..w-2)
    for (var c = 1; c < width - 1; c++) candidates.push({ row: height - 1, col: c });
    // Left edge (col 0, row 1..h-2)
    for (var r = 1; r < height - 1; r++) candidates.push({ row: r, col: 0 });
    // Right edge (col w-1, row 1..h-2)
    for (var r = 1; r < height - 1; r++) candidates.push({ row: r, col: width - 1 });

    var shuffled = shuffle(candidates, rng);
    var entrance = shuffled[0];
    var exit = shuffled[1];
    // Ensure entrance and exit are at least one side length apart (Manhattan)
    var minDist = Math.max(width, height);
    var tries = 0;
    while (Math.abs(entrance.row - exit.row) + Math.abs(entrance.col - exit.col) < minDist && tries < 20) {
      exit = shuffled[2 + (tries % (shuffled.length - 2))];
      tries++;
    }
    return { entrance: entrance, exit: exit };
  }

  function openBoundaryWall(maze, pos) {
    if (pos.row === 0) {
      maze[pos.row][pos.col].walls[0] = false;
    } else if (pos.row === maze.length - 1) {
      maze[pos.row][pos.col].walls[2] = false;
    } else if (pos.col === 0) {
      maze[pos.row][pos.col].walls[3] = false;
    } else if (pos.col === maze[0].length - 1) {
      maze[pos.row][pos.col].walls[1] = false;
    }
  }

  function applyBoundaryOpenings() {
    var mazeWidth = state.mazeWidth;
    var mazeHeight = state.mazeHeight;
    var entranceRow = state.entranceRow;
    var entranceCol = state.entranceCol;
    var exitRow = state.exitRow;
    var exitCol = state.exitCol;
    var renderCols = state.renderCols;
    var container = els.mazeContainer;

    function openAt(row, col) {
      var idx;
      if (row === 0) {
        idx = 0 * renderCols + (2 * col + 1);
      } else if (row === mazeHeight - 1) {
        idx = (2 * mazeHeight) * renderCols + (2 * col + 1);
      } else if (col === 0) {
        idx = (2 * row + 1) * renderCols + 0;
      } else if (col === mazeWidth - 1) {
        idx = (2 * row + 1) * renderCols + (2 * mazeWidth);
      }
      if (idx !== undefined && container.children[idx]) {
        container.children[idx].className = "maze-path";
      }
    }

    openAt(entranceRow, entranceCol);
    openAt(exitRow, exitCol);
  }

  /* ===== Maze Generation (DFS recursive backtracking) ===== */

  function generateMaze(width, height, entRow, entCol, rng) {
    const grid = [];
    for (let r = 0; r < height; r++) {
      grid[r] = [];
      for (let c = 0; c < width; c++) {
        grid[r][c] = { walls: [true, true, true, true], visited: false };
      }
    }

    const dirs = [
      { dr: -1, dc: 0, wall: 0, opp: 2 },
      { dr: 0, dc: 1, wall: 1, opp: 3 },
      { dr: 1, dc: 0, wall: 2, opp: 0 },
      { dr: 0, dc: -1, wall: 3, opp: 1 },
    ];

    // Force-open at least 2 interior walls from entrance to create a fork
    var intDirs = dirs.filter(function (d) {
      var nr = entRow + d.dr, nc = entCol + d.dc;
      return nr >= 0 && nr < height && nc >= 0 && nc < width;
    });
    var entDirs = shuffle(intDirs, rng);
    for (var ei = 0; ei < 2 && ei < entDirs.length; ei++) {
      var d = entDirs[ei];
      var nr = entRow + d.dr, nc = entCol + d.dc;
      grid[entRow][entCol].walls[d.wall] = false;
      grid[nr][nc].walls[d.opp] = false;
    }

    // Iterative DFS using explicit stack (avoids recursion depth limits)
    grid[entRow][entCol].visited = true;
    var stack = [{ row: entRow, col: entCol }];
    var DI = [0, 1, 2, 3];

    while (stack.length > 0) {
      var cur = stack[stack.length - 1];
      var row = cur.row;
      var col = cur.col;

      // Collect unvisited neighbors
      var candidates = [];
      for (var di = 0; di < 4; di++) {
        var d = dirs[DI[di]];
        var nr = row + d.dr;
        var nc = col + d.dc;
        if (nr >= 0 && nr < height && nc >= 0 && nc < width && !grid[nr][nc].visited) {
          candidates.push({ nr: nr, nc: nc, wall: d.wall, opp: d.opp });
        }
      }

      if (candidates.length === 0) {
        // Dead end — backtrack
        stack.pop();
      } else {
        // Pick a random unvisited neighbor
        var chosen = candidates[Math.floor(rng() * candidates.length)];
        grid[row][col].walls[chosen.wall] = false;
        grid[chosen.nr][chosen.nc].walls[chosen.opp] = false;
        grid[chosen.nr][chosen.nc].visited = true;
        stack.push({ row: chosen.nr, col: chosen.nc });
      }
    }

    return grid;
  }

  /* ===== Maze Rendering ===== */

  function renderMaze() {
    const { mazeWidth, mazeHeight, maze, renderRows, renderCols } = state;
    const container = els.mazeContainer;
    container.innerHTML = "";
    container.style.gridTemplateColumns = `repeat(${renderCols}, 1fr)`;

    for (let r = 0; r < renderRows; r++) {
      for (let c = 0; c < renderCols; c++) {
        const div = document.createElement("div");

        if (r % 2 === 1 && c % 2 === 1) {
          // — Path cell —
          const cellRow = Math.floor(r / 2);
          const cellCol = Math.floor(c / 2);
          div.className = "maze-path";
          div.dataset.row = String(cellRow);
          div.dataset.col = String(cellCol);

          if (cellRow === state.playerRow && cellCol === state.playerCol) {
            div.classList.add("maze-player");
          }
          if (cellRow === state.entranceRow && cellCol === state.entranceCol) {
            div.classList.add("maze-entrance");
          }
          if (cellRow === state.exitRow && cellCol === state.exitCol) {
            div.classList.add("maze-exit");
          }
        } else if (r % 2 === 0 && c % 2 === 0) {
          // — Corner —
          div.className = "maze-wall";
        } else if (r % 2 === 0 && c % 2 === 1) {
          // — Horizontal wall (between cells vertically) —
          const cellBelow = Math.floor(r / 2);
          const cellCol = Math.floor(c / 2);
          if (cellBelow < mazeHeight && !maze[cellBelow][cellCol].walls[0]) {
            div.className = "maze-path";
          } else {
            div.className = "maze-wall";
          }
        } else {
          // r % 2 === 1 && c % 2 === 0
          // — Vertical wall (between cells horizontally) —
          const cellRow = Math.floor(r / 2);
          const cellRight = Math.floor(c / 2);
          if (cellRight < mazeWidth && !maze[cellRow][cellRight].walls[3]) {
            div.className = "maze-path";
          } else {
            div.className = "maze-wall";
          }
        }

        container.appendChild(div);
      }
    }

    applyBoundaryOpenings();
  }

  /* ===== Click Handling ===== */

  function onMazeClick(event) {
    const cell = event.target.closest(".maze-clickable");
    if (!cell) return;

    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    if (isNaN(row) || isNaN(col)) return;

    const dr = row - state.playerRow;
    const dc = col - state.playerCol;
    const dir = getDirection(dr, dc);
    if (dir === -1) return;

    chooseDirection(dir);
  }

  /* ===== Path Tracing & Movement ===== */

  function chooseDirection(chosenDir) {
    if (state.ended || state.animating) return;

    const { playerRow, playerCol } = state;
    const result = tracePath(playerRow, playerCol, chosenDir);
    if (result.path.length <= 1) return;

    state.animating = true;
    clearClickableHighlights();
    els.mazeStatus.textContent = "前进中...";
    animatePath(result.path, result.endType);
  }

  function tracePath(startRow, startCol, chosenDir) {
    const path = [{ row: startRow, col: startCol }];
    let r = startRow + DR[chosenDir];
    let c = startCol + DC[chosenDir];

    if (r < 0 || r >= state.mazeHeight || c < 0 || c >= state.mazeWidth) {
      return { path, endType: "error" };
    }
    path.push({ row: r, col: c });

    if (r === state.exitRow && c === state.exitCol) {
      return { path, endType: "exit" };
    }

    // Walk along the corridor
    while (true) {
      const cameFrom = path[path.length - 2];
      const forward = getOpenNeighbors(r, c).filter(
        (n) => !(n.row === cameFrom.row && n.col === cameFrom.col)
      );

      if (forward.length === 0) {
        return { path, endType: "deadend" };
      }
      if (forward.length === 1) {
        const next = forward[0];
        r = next.row;
        c = next.col;
        path.push({ row: r, col: c });

        if (r === state.exitRow && c === state.exitCol) {
          return { path, endType: "exit" };
        }
        continue;
      }
      // 2+ forward paths → junction
      return { path, endType: "junction" };
    }
  }

  function animatePath(pathCells, endType) {
    var step = 1; // skip current position (index 0)

    function doStep() {
      if (step >= pathCells.length) {
        onPathComplete(pathCells, endType);
        return;
      }

      var cell = pathCells[step];
      var prev = pathCells[step - 1];
      var el = getRenderCell(cell.row, cell.col);
      if (el) {
        el.classList.remove("maze-player", "maze-clickable");
        el.classList.add("maze-trail");
        var dir = getDirection(cell.row - prev.row, cell.col - prev.col);
        if (dir !== -1) el.classList.add("maze-trail-dir" + dir);
      }
      // Mark passage between cells
      var pel = getPassageCell(prev.row, prev.col, cell.row, cell.col);
      if (pel) pel.classList.add("maze-trail");

      step++;
      state.animTimer = setTimeout(doStep, 60);
    }

    doStep();
  }

  function onPathComplete(pathCells, endType) {
    const last = pathCells[pathCells.length - 1];

    // Clear traversed markers (from index 1 onward)
    function clearTraced() {
      for (let i = 1; i < pathCells.length; i++) {
        const el = getRenderCell(pathCells[i].row, pathCells[i].col);
        if (el) el.classList.remove("maze-traversed");
      }
    }

    if (endType === "exit") {
      clearPlayerPosition();
      const el = getRenderCell(last.row, last.col);
      if (el) el.classList.add("maze-player");
      state.playerRow = last.row;
      state.playerCol = last.col;
      state.animating = false;
      clearTraced();
      finishGame("成功");
      return;
    }

    if (endType === "deadend") {
      const el = getRenderCell(last.row, last.col);
      if (el) el.classList.add("maze-deadend");
      state.mistakes++;
      els.mistakes.textContent = `错误 ${state.mistakes}/3`;
      setMascot("bad");
      showToast(`死路一条（${state.mistakes}/3）`);

      setTimeout(() => {
        if (el) el.classList.remove("maze-deadend");
        clearTraced();
        state.animating = false;

        if (state.mistakes >= 3) {
          finishGame("失败");
        } else {
          showClickableNeighbors();
          els.mazeStatus.textContent = "选择方向";
          setMascot("ready");
        }
      }, 800);
      return;
    }

    if (endType === "junction") {
      clearPlayerPosition();
      const el = getRenderCell(last.row, last.col);
      if (el) el.classList.add("maze-player");
      state.playerRow = last.row;
      state.playerCol = last.col;
      state.animating = false;
      addToTrail(pathCells);
      clearTraced();
      showClickableNeighbors();
      els.mazeStatus.textContent = "选择方向";
      setMascot("good");
      return;
    }
  }

  /* ===== Junction helpers ===== */

  function showClickableNeighbors() {
    clearClickableHighlights();
    const neighbors = getOpenNeighbors(state.playerRow, state.playerCol);
    for (const n of neighbors) {
      const el = getRenderCell(n.row, n.col);
      if (el) el.classList.add("maze-clickable");
    }
  }

  function clearClickableHighlights() {
    const clicked = els.mazeContainer.querySelectorAll(".maze-clickable");
    for (let i = 0; i < clicked.length; i++) {
      clicked[i].classList.remove("maze-clickable");
    }
  }

  function clearTraversedCells() {
    const traversed = els.mazeContainer.querySelectorAll(".maze-traversed");
    for (let i = 0; i < traversed.length; i++) {
      traversed[i].classList.remove("maze-traversed");
    }
  }

  function clearPlayerPosition() {
    const player = els.mazeContainer.querySelector(".maze-player");
    if (player) player.classList.remove("maze-player");
  }

  function clearAnimTimer() {
    if (state.animTimer) {
      clearTimeout(state.animTimer);
      state.animTimer = null;
    }
  }

  /* ===== Trail ===== */

  function toggleTrail() {
    state.showTrail = !state.showTrail;
    els.trailBtn.textContent = state.showTrail ? "隐藏轨迹" : "显示轨迹";
    if (state.showTrail) {
      showTrail();
    } else {
      clearTrailMarkers();
    }
  }

  function showTrail() {
    for (var i = 0; i < state.trail.length; i++) {
      var cell = state.trail[i];
      var el = getRenderCell(cell.row, cell.col);
      if (el) {
        el.classList.add("maze-trail");
        if (cell.dir !== undefined) {
          el.classList.add("maze-trail-dir" + cell.dir);
        }
      }
      // Passage from previous cell
      if (i > 0) {
        var prev = state.trail[i - 1];
        var pel = getPassageCell(prev.row, prev.col, cell.row, cell.col);
        if (pel) pel.classList.add("maze-trail");
      }
    }
  }

  function clearTrailMarkers() {
    var marked = els.mazeContainer.querySelectorAll(".maze-trail");
    for (var i = 0; i < marked.length; i++) {
      marked[i].classList.remove("maze-trail");
    }
  }

  function addToTrail(pathCells) {
    // pathCells is an array of {row, col}, index 0 = starting cell (skip)
    for (var i = 1; i < pathCells.length; i++) {
      var cell = pathCells[i];
      // Determine direction from previous cell
      var prev = pathCells[i - 1];
      var dir = getDirection(cell.row - prev.row, cell.col - prev.col);
      // Avoid duplicates (if a cell was already visited via backtrack, prune it)
      var existingIdx = -1;
      for (var j = 0; j < state.trail.length; j++) {
        if (state.trail[j].row === cell.row && state.trail[j].col === cell.col) {
          existingIdx = j;
          break;
        }
      }
      if (existingIdx !== -1) {
        // Remove everything after the revisit point (prune backtracked branch)
        var removed = state.trail.splice(existingIdx + 1);
        if (state.showTrail) {
          for (var k = 0; k < removed.length; k++) {
            var rc = removed[k];
            var rel = getRenderCell(rc.row, rc.col);
            if (rel) rel.classList.remove("maze-trail");
            // Also remove passage markers
            if (k > 0) {
              var rpel = getPassageCell(removed[k-1].row, removed[k-1].col, rc.row, rc.col);
              if (rpel) rpel.classList.remove("maze-trail");
            }
          }
        }
      } else {
        state.trail.push({ row: cell.row, col: cell.col, dir: dir });
        if (state.showTrail) {
          var el = getRenderCell(cell.row, cell.col);
          if (el) {
            el.classList.add("maze-trail");
            el.classList.add("maze-trail-dir" + dir);
          }
          // Also mark passage from previous cell
          var pel = getPassageCell(prev.row, prev.col, cell.row, cell.col);
          if (pel) pel.classList.add("maze-trail");
        }
      }
    }
  }

  function getRenderCell(row, col) {
    const idx = (2 * row + 1) * state.renderCols + (2 * col + 1);
    return els.mazeContainer.children[idx] || null;
  }

  function getPassageCell(row1, col1, row2, col2) {
    // Returns the render cell at the passage between two adjacent maze cells
    var pr, pc;
    if (row1 === row2) {
      pr = 2 * row1 + 1;
      pc = 2 * Math.min(col1, col2) + 2;
    } else {
      pr = 2 * Math.min(row1, row2) + 2;
      pc = 2 * col1 + 1;
    }
    var idx = pr * state.renderCols + pc;
    return els.mazeContainer.children[idx] || null;
  }

  function getOpenNeighbors(row, col) {
    const grid = state.maze;
    const h = state.mazeHeight;
    const w = state.mazeWidth;
    const result = [];
    for (let dir = 0; dir < 4; dir++) {
      if (!grid[row][col].walls[dir]) {
        const nr = row + DR[dir];
        const nc = col + DC[dir];
        if (nr >= 0 && nr < h && nc >= 0 && nc < w) {
          result.push({ row: nr, col: nc, dir });
        }
      }
    }
    return result;
  }

  function getDirection(dr, dc) {
    if (dr === -1 && dc === 0) return 0;
    if (dr === 0 && dc === 1) return 1;
    if (dr === 1 && dc === 0) return 2;
    if (dr === 0 && dc === -1) return 3;
    return -1;
  }

  /* ===== Timer ===== */

  function restartTimer() {
    window.clearInterval(state.timerId);
    state.pauseOffset = 0;
    state.startedAt = Date.now();
    state.timerId = window.setInterval(() => {
      els.timer.textContent = formatTime(elapsedSeconds());
    }, 500);
    els.timer.textContent = "00:00";
  }

  function elapsedSeconds() {
    return Math.floor((Date.now() - state.startedAt) / 1000);
  }

  function formatTime(totalSeconds) {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  /* ===== Records ===== */

  function renderRecords() {
    els.recordsList.innerHTML = "";
    if (state.records.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "暂无记录";
      els.recordsList.appendChild(empty);
      return;
    }
    state.records.forEach((record) => {
      const item = document.createElement("li");
      item.textContent = `${record.result}｜${difficultyNames[record.difficulty] || record.difficulty}｜${formatTime(record.seconds)}｜${record.seed}`;
      item.title = "点击复制种子码";
      item.addEventListener("click", async () => {
        els.seedInput.value = record.seed;
        try {
          await navigator.clipboard.writeText(record.seed);
          showToast("种子码已复制");
        } catch {
          showToast("种子码已填入输入框");
        }
      });
      els.recordsList.appendChild(item);
    });
  }

  /* ===== Mascot & Toast ===== */

  function setMascot(kind) {
    els.mascotLine.textContent = mascotLines[kind] || mascotLines.ready;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      els.toast.classList.remove("show");
    }, 1800);
  }

  /* ===== Seed ===== */

  function createSeed(difficulty) {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    return `${difficulty.toUpperCase()}-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  /* ===== Utility ===== */

  function shuffle(items, rng) {
    const output = items.slice();
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
    }
    return output;
  }

  function hashString(input) {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    return function next() {
      let value = (seed += 0x6d2b79f5);
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
})();
