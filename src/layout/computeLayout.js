/**
 * computeLayout.js
 * Pure layout engine for video call stage and tiles.
 *
 * Modes supported:
 * - 'auto':
 *     - Pinned participant, screen share, or active watch stage -> 'spotlight'
 *     - Exactly one remote participant (total 2) -> 1:1 with draggable self-view PiP
 *     - Otherwise -> 'tiled'
 * - 'tiled':
 *     - Maximize 16:9 tile area inside container with gap.
 *     - 16 tiles/page on desktop (width >= 1024), 9 on tablet, 6 on mobile.
 *     - Page 1 ordering: pinned first, presenter, active speakers by recency, join order.
 *     - Local tile is guaranteed on Page 1.
 *     - Active speaker on a later page is swapped into Page 1.
 * - 'spotlight':
 *     - One large focus tile + bottom filmstrip (up to 6 tiles per page).
 * - 'sidebar':
 *     - One large focus tile + right-side filmstrip on desktop (bottom on mobile).
 */

const ASPECT_RATIO = 16 / 9;
const DEFAULT_GAP = 8;

/**
 * Comparator for participant priority on Page 1
 */
function compareParticipants(a, b, { pinnedId, presentingId }) {
  // 1. Pinned participant
  const aPinned = a.id === pinnedId ? 1 : 0;
  const bPinned = b.id === pinnedId ? 1 : 0;
  if (aPinned !== bPinned) return bPinned - aPinned;

  // 2. Presenter
  const aPres = a.id === presentingId ? 1 : 0;
  const bPres = b.id === presentingId ? 1 : 0;
  if (aPres !== bPres) return bPres - aPres;

  // 3. Most recent active speaker
  const aSpeaker = a.lastActiveSpeakerAt || 0;
  const bSpeaker = b.lastActiveSpeakerAt || 0;
  if (aSpeaker !== bSpeaker) return bSpeaker - aSpeaker;

  // 4. Join order
  const aJoined = a.joinedAt || 0;
  const bJoined = b.joinedAt || 0;
  if (aJoined !== bJoined) return aJoined - bJoined;

  return String(a.id).localeCompare(String(b.id));
}

/**
 * Determine page size based on viewport
 */
export function getPageSize(viewport) {
  const isMobile = Boolean(viewport?.isMobile || (viewport?.width && viewport.width < 640));
  if (isMobile) return 6;
  if (viewport?.width && viewport.width >= 1024) return 16;
  return 9; // Tablet
}

/**
 * Maximize 16:9 tile dimensions and find best (cols, rows) grid
 */
export function findBestGrid(n, containerWidth, containerHeight, gap = DEFAULT_GAP) {
  if (n <= 0) return { cols: 1, rows: 1, tileW: 0, tileH: 0 };

  let bestArea = -1;
  let best = { cols: 1, rows: 1, tileW: 0, tileH: 0 };

  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const availW = containerWidth - (cols - 1) * gap;
    const availH = containerHeight - (rows - 1) * gap;

    if (availW <= 0 || availH <= 0) continue;

    const maxCellW = availW / cols;
    const maxCellH = availH / rows;

    let tileW;
    let tileH;

    if (maxCellW / ASPECT_RATIO <= maxCellH) {
      tileW = maxCellW;
      tileH = maxCellW / ASPECT_RATIO;
    } else {
      tileH = maxCellH;
      tileW = maxCellH * ASPECT_RATIO;
    }

    const area = tileW * tileH;
    // Prefer higher area; if practically equal, prefer more balanced aspect (fewer rows)
    if (area > bestArea + 0.01) {
      bestArea = area;
      best = { cols, rows, tileW, tileH };
    }
  }

  return best;
}

/**
 * Main Pure computeLayout function
 */
export function computeLayout({
  participants = [],
  mode = 'auto',
  pinnedId = null,
  activeSpeakerId = null,
  presentingId = null,
  stageActive = false,
  viewport = { width: 1280, height: 720, isMobile: false },
  pageIndex = 0,
  gap = DEFAULT_GAP
} = {}) {
  const width = Math.max(1, viewport?.width || 1280);
  const height = Math.max(1, viewport?.height || 720);
  const isMobile = Boolean(viewport?.isMobile || width < 640);

  // 1. Resolve Mode
  let resolvedMode = mode;
  if (mode === 'auto') {
    if (pinnedId || presentingId || stageActive) {
      resolvedMode = 'spotlight';
    } else if (participants.length === 2) {
      resolvedMode = '1:1';
    } else {
      resolvedMode = 'tiled';
    }
  }

  // 2. Handle 1:1 Layout with Picture-in-Picture
  if (resolvedMode === '1:1' && participants.length === 2) {
    const local = participants.find(p => p.isLocal) || participants[0];
    const remote = participants.find(p => !p.isLocal) || participants[1];

    // Remote takes the main area, maximized at 16:9
    const grid = findBestGrid(1, width, height, gap);
    const mainX = Math.round(Math.max(0, (width - grid.tileW) / 2));
    const mainY = Math.round(Math.max(0, (height - grid.tileH) / 2));

    const mainTile = {
      id: remote.id,
      kind: 'camera',
      x: mainX,
      y: mainY,
      width: Math.round(grid.tileW),
      height: Math.round(grid.tileH)
    };

    // Self-view PiP dimensions
    const pipW = isMobile ? Math.min(120, Math.round(width * 0.28)) : Math.min(220, Math.round(width * 0.22));
    const pipH = Math.round(pipW / ASPECT_RATIO);
    const margin = 16;
    const pip = {
      id: local.id,
      kind: 'camera',
      x: Math.round(width - pipW - margin),
      y: Math.round(height - pipH - margin),
      width: pipW,
      height: pipH
    };

    return {
      mode: 'tiled',
      tiles: [mainTile],
      pageCount: 1,
      pageIndex: 0,
      pip
    };
  }

  // 3. Handle Spotlight and Sidebar modes
  if (resolvedMode === 'spotlight' || resolvedMode === 'sidebar') {
    const isSidebarDesktop = resolvedMode === 'sidebar' && !isMobile && width >= 640;

    // Identify focus (main large tile)
    let focusId = null;
    let focusKind = 'camera';

    if (pinnedId) {
      focusId = pinnedId;
      if (pinnedId === 'stage') {
        focusKind = 'stage';
      } else if (pinnedId === presentingId) {
        focusKind = 'screen';
      } else {
        focusKind = 'camera';
      }
    } else if (presentingId) {
      focusId = presentingId;
      focusKind = 'screen';
    } else if (stageActive) {
      focusId = 'stage';
      focusKind = 'stage';
    } else if (activeSpeakerId && participants.some(p => p.id === activeSpeakerId)) {
      focusId = activeSpeakerId;
      focusKind = 'camera';
    } else if (participants.length > 0) {
      // Prioritize remote first, then local
      const remote = participants.find(p => !p.isLocal);
      focusId = remote ? remote.id : participants[0].id;
      focusKind = 'camera';
    }

    // Remaining participants go to filmstrip
    let filmstripItems = [];

    // If stage is active but NOT the focus, it appears as a docked tile in filmstrip
    if (stageActive && focusId !== 'stage') {
      filmstripItems.push({ id: 'stage', kind: 'stage' });
    }

    // Add participants not in focus
    const remainingParticipants = participants.filter(p => {
      if (focusKind === 'stage') return true;
      if (focusKind === 'screen') {
        // If presenting tile is screen, keep camera in filmstrip if local/remote
        return p.id !== focusId || p.videoEnabled;
      }
      return p.id !== focusId;
    });

    remainingParticipants.forEach(p => {
      filmstripItems.push({ id: p.id, kind: 'camera', participant: p });
    });

    // Filmstrip pagination (up to 6 items per page)
    const FILMSTRIP_PAGE_SIZE = 6;
    const filmstripCount = filmstripItems.length;
    const pageCount = Math.max(1, Math.ceil(filmstripCount / FILMSTRIP_PAGE_SIZE));
    const safePageIndex = Math.max(0, Math.min(pageIndex, pageCount - 1));
    const pagedFilmstrip = filmstripItems.slice(
      safePageIndex * FILMSTRIP_PAGE_SIZE,
      (safePageIndex + 1) * FILMSTRIP_PAGE_SIZE
    );

    const tiles = [];

    if (filmstripCount === 0) {
      // No filmstrip, focus tile takes entire container maximized at 16:9
      const grid = findBestGrid(1, width, height, gap);
      const fx = Math.round(Math.max(0, (width - grid.tileW) / 2));
      const fy = Math.round(Math.max(0, (height - grid.tileH) / 2));
      if (focusId) {
        tiles.push({
          id: focusId,
          kind: focusKind,
          x: fx,
          y: fy,
          width: Math.round(grid.tileW),
          height: Math.round(grid.tileH)
        });
      }
    } else if (isSidebarDesktop) {
      // Sidebar on Desktop: right filmstrip
      const filmstripW = Math.min(260, Math.max(200, Math.round(width * 0.22)));
      const mainAvailW = width - filmstripW - gap;
      const mainAvailH = height;

      // Focus tile
      const grid = findBestGrid(1, mainAvailW, mainAvailH, gap);
      const fx = Math.round(Math.max(0, (mainAvailW - grid.tileW) / 2));
      const fy = Math.round(Math.max(0, (mainAvailH - grid.tileH) / 2));
      if (focusId) {
        tiles.push({
          id: focusId,
          kind: focusKind,
          x: fx,
          y: fy,
          width: Math.round(grid.tileW),
          height: Math.round(grid.tileH)
        });
      }

      // Small tiles in filmstrip (vertical stack)
      const k = pagedFilmstrip.length;
      const smallH = Math.min(150, Math.max(90, Math.floor((height - (k - 1) * gap) / Math.max(k, 1))));
      const smallW = Math.round(Math.min(filmstripW, smallH * ASPECT_RATIO));
      const filmstripX = width - filmstripW + Math.round((filmstripW - smallW) / 2);
      const totalStackH = k * smallH + (k - 1) * gap;
      const startY = Math.round(Math.max(0, (height - totalStackH) / 2));

      pagedFilmstrip.forEach((item, i) => {
        tiles.push({
          id: item.id,
          kind: item.kind,
          x: filmstripX,
          y: Math.round(startY + i * (smallH + gap)),
          width: smallW,
          height: smallH
        });
      });
    } else {
      // Spotlight / Mobile: bottom filmstrip
      const filmstripH = isMobile ? Math.min(96, Math.round(height * 0.18)) : Math.min(136, Math.round(height * 0.22));
      const mainAvailW = width;
      const mainAvailH = height - filmstripH - gap;

      // Focus tile
      const grid = findBestGrid(1, mainAvailW, mainAvailH, gap);
      const fx = Math.round(Math.max(0, (mainAvailW - grid.tileW) / 2));
      const fy = Math.round(Math.max(0, (mainAvailH - grid.tileH) / 2));
      if (focusId) {
        tiles.push({
          id: focusId,
          kind: focusKind,
          x: fx,
          y: fy,
          width: Math.round(grid.tileW),
          height: Math.round(grid.tileH)
        });
      }

      // Small tiles in filmstrip (horizontal row)
      const k = pagedFilmstrip.length;
      const smallW = Math.round(filmstripH * ASPECT_RATIO);
      const totalRowW = k * smallW + (k - 1) * gap;
      const startX = Math.round(Math.max(0, (width - totalRowW) / 2));
      const startY = height - filmstripH;

      pagedFilmstrip.forEach((item, i) => {
        tiles.push({
          id: item.id,
          kind: item.kind,
          x: Math.round(startX + i * (smallW + gap)),
          y: startY,
          width: smallW,
          height: filmstripH
        });
      });
    }

    return {
      mode: resolvedMode,
      tiles,
      pageCount,
      pageIndex: safePageIndex,
      pip: null
    };
  }

  // 4. Handle Tiled Mode (Default)
  const pageSize = getPageSize(viewport);

  // Initial sort
  const sorted = [...participants].sort((a, b) =>
    compareParticipants(a, b, { pinnedId, presentingId })
  );

  // Page 1 Swap Rules if total > pageSize
  if (sorted.length > pageSize) {
    // A. Local tile must always be on Page 1
    const localIdx = sorted.findIndex(p => p.isLocal);
    if (localIdx >= pageSize) {
      // Find candidate on Page 1 from end to swap out
      for (let i = pageSize - 1; i >= 0; i--) {
        const candidate = sorted[i];
        if (
          candidate.id !== pinnedId &&
          candidate.id !== presentingId &&
          candidate.id !== activeSpeakerId
        ) {
          const temp = sorted[i];
          sorted[i] = sorted[localIdx];
          sorted[localIdx] = temp;
          break;
        }
      }
    }

    // B. Speaker who is on a later page is swapped into Page 1
    if (activeSpeakerId) {
      const speakerIdx = sorted.findIndex(p => p.id === activeSpeakerId);
      if (speakerIdx >= pageSize) {
        // Find candidate on Page 1 from end to swap out
        for (let i = pageSize - 1; i >= 0; i--) {
          const candidate = sorted[i];
          if (
            candidate.id !== pinnedId &&
            candidate.id !== presentingId &&
            !candidate.isLocal &&
            candidate.id !== activeSpeakerId
          ) {
            const temp = sorted[i];
            sorted[i] = sorted[speakerIdx];
            sorted[speakerIdx] = temp;
            break;
          }
        }
      }
    }
  }

  const totalParticipants = sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalParticipants / pageSize));
  const safePageIndex = Math.max(0, Math.min(pageIndex, pageCount - 1));

  const pageParticipants = sorted.slice(
    safePageIndex * pageSize,
    (safePageIndex + 1) * pageSize
  );

  // Compute tiled placement for current page
  const n = pageParticipants.length;
  const grid = findBestGrid(n, width, height, gap);
  const { cols, rows, tileW, tileH } = grid;

  const totalGridW = cols * tileW + (cols - 1) * gap;
  const totalGridH = rows * tileH + (rows - 1) * gap;
  const gridStartX = Math.max(0, (width - totalGridW) / 2);
  const gridStartY = Math.max(0, (height - totalGridH) / 2);

  const tiles = pageParticipants.map((p, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;

    // Check if this row is the last row and has fewer tiles than cols (center it)
    const isLastRow = r === rows - 1;
    const tilesInLastRow = n - (rows - 1) * cols;

    let x;
    if (isLastRow && tilesInLastRow < cols) {
      const lastRowW = tilesInLastRow * tileW + (tilesInLastRow - 1) * gap;
      const lastRowStartX = Math.max(0, (width - lastRowW) / 2);
      x = Math.round(lastRowStartX + c * (tileW + gap));
    } else {
      x = Math.round(gridStartX + c * (tileW + gap));
    }

    const y = Math.round(gridStartY + r * (tileH + gap));

    return {
      id: p.id,
      kind: 'camera',
      x,
      y,
      width: Math.round(tileW),
      height: Math.round(tileH)
    };
  });

  return {
    mode: 'tiled',
    tiles,
    pageCount,
    pageIndex: safePageIndex,
    pip: null
  };
}

export default computeLayout;

