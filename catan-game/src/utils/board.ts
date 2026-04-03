/**
 * =====================================================
 * SETTLERS OF CATAN - Board Generation
 * =====================================================
 *
 * This module handles all aspects of creating the Catan game board:
 *
 * 1. HEX COORDINATE MATH
 *    - Converts axial coordinates (q, r) to pixel positions
 *    - Computes hexagon corner positions for rendering
 *
 * 2. BOARD TOPOLOGY
 *    - Generates the 19-hex board in the standard 3-4-5-4-3 pattern
 *    - Computes vertices (intersections) and edges (road positions)
 *    - Deduplicates shared vertices/edges between adjacent hexes
 *    - Builds adjacency maps (hex↔vertex, vertex↔edge, vertex↔vertex)
 *
 * 3. RANDOM SETUP
 *    - Shuffles terrain types across hexes
 *    - Distributes number tokens (avoiding 6/8 adjacency when possible)
 *    - Places 9 harbors/ports around the coast
 *
 * The board uses POINTY-TOP hexagons with axial coordinates.
 * See https://www.redblobgames.com/grids/hexagons/ for reference.
 */

import {
  HexTile,
  Vertex,
  Edge,
  Port,
  Point,
  TerrainType,
  ResourceType,
} from '../types';

// ─────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────

/** Size of each hexagon (radius from center to corner in pixels) */
export const HEX_SIZE = 50;

/** X offset to center the board in the SVG viewport */
export const BOARD_CENTER_X = 300;

/** Y offset to center the board in the SVG viewport */
export const BOARD_CENTER_Y = 300;

/** Width and height of the SVG viewport for the board */
export const SVG_SIZE = 600;

/**
 * The 19 hex positions in axial coordinates (q, r).
 * Arranged in the standard Catan 3-4-5-4-3 diamond pattern:
 *
 *       [0,-2] [1,-2] [2,-2]          ← 3 hexes (top row)
 *     [-1,-1] [0,-1] [1,-1] [2,-1]    ← 4 hexes
 *   [-2,0] [-1,0] [0,0] [1,0] [2,0]   ← 5 hexes (middle)
 *     [-2,1] [-1,1] [0,1] [1,1]       ← 4 hexes
 *       [-2,2] [-1,2] [0,2]           ← 3 hexes (bottom row)
 */
const HEX_POSITIONS: [number, number][] = [
  // Top row
  [0, -2], [1, -2], [2, -2],
  // Second row
  [-1, -1], [0, -1], [1, -1], [2, -1],
  // Middle row
  [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
  // Fourth row
  [-2, 1], [-1, 1], [0, 1], [1, 1],
  // Bottom row
  [-2, 2], [-1, 2], [0, 2],
];

/**
 * Standard Catan terrain distribution (19 tiles total):
 * - 4 Forest (Wood), 3 Hills (Brick), 4 Fields (Wheat)
 * - 3 Mountains (Ore), 4 Pasture (Sheep), 1 Desert
 */
const TERRAIN_DISTRIBUTION: TerrainType[] = [
  TerrainType.Forest, TerrainType.Forest, TerrainType.Forest, TerrainType.Forest,
  TerrainType.Hills, TerrainType.Hills, TerrainType.Hills,
  TerrainType.Fields, TerrainType.Fields, TerrainType.Fields, TerrainType.Fields,
  TerrainType.Mountains, TerrainType.Mountains, TerrainType.Mountains,
  TerrainType.Pasture, TerrainType.Pasture, TerrainType.Pasture, TerrainType.Pasture,
  TerrainType.Desert,
];

/**
 * Standard number token distribution (18 tokens for 18 non-desert hexes).
 * Numbers correspond to dice roll sums (2-12, excluding 7).
 * The dots below each number indicate probability:
 *   2(1dot), 3(2), 4(3), 5(4), 6(5), 8(5), 9(4), 10(3), 11(2), 12(1)
 */
const NUMBER_TOKENS: number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

/**
 * Port type distribution (9 ports total):
 * - 4 generic ports (3:1 any resource)
 * - 5 specific resource ports (2:1 for one resource each)
 */
const PORT_TYPES: (ResourceType | 'any')[] = [
  'any', 'any', 'any', 'any',
  ResourceType.Wood, ResourceType.Brick,
  ResourceType.Wheat, ResourceType.Ore, ResourceType.Sheep,
];

// ─────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────

/**
 * Fisher-Yates shuffle algorithm.
 * Returns a new shuffled copy of the array (does not mutate input).
 *
 * @param arr - Array to shuffle
 * @returns New array with elements in random order
 */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Round a coordinate to 1 decimal place.
 * Used for deduplicating vertices that should be the same point
 * but differ due to floating-point arithmetic.
 *
 * @param n - Coordinate value to round
 * @returns Rounded value
 */
function roundCoord(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Create a unique string key for a vertex based on its position.
 * Two vertices at the "same" position (within rounding tolerance)
 * will produce the same key, enabling deduplication.
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns String key like "123.5,456.7"
 */
function vertexKey(x: number, y: number): string {
  return `${roundCoord(x)},${roundCoord(y)}`;
}

/**
 * Create a unique string key for an edge from two vertex IDs.
 * The IDs are sorted so that the same edge always gets the same key
 * regardless of which direction it's traversed.
 *
 * @param v1 - First vertex ID
 * @param v2 - Second vertex ID
 * @returns Sorted edge key like "v1Id|v2Id"
 */
function edgeKey(v1: string, v2: string): string {
  return v1 < v2 ? `${v1}|${v2}` : `${v2}|${v1}`;
}

// ─────────────────────────────────────────────────────
// HEX COORDINATE MATH
// ─────────────────────────────────────────────────────

/**
 * Convert axial hex coordinates to pixel position.
 *
 * For pointy-top hexagons, the conversion is:
 *   x = size × (√3 × q + √3/2 × r)
 *   y = size × (3/2 × r)
 *
 * The result is offset by BOARD_CENTER to center the board.
 *
 * @param q - Axial column coordinate
 * @param r - Axial row coordinate
 * @returns Pixel position {x, y}
 */
export function axialToPixel(q: number, r: number): Point {
  const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = HEX_SIZE * ((3 / 2) * r);
  return {
    x: x + BOARD_CENTER_X,
    y: y + BOARD_CENTER_Y,
  };
}

/**
 * Compute the 6 corner positions of a pointy-top hexagon.
 *
 * For a pointy-top hex centered at (cx, cy) with radius `size`:
 *   Corner i is at angle (60° × i − 30°) from the center.
 *
 * Corner indices (clockwise from top-right):
 *   0: top-right    (330° → 30°-ish)
 *   1: right         (30°)
 *   2: bottom-right  (90°)
 *   3: bottom-left   (150°)
 *   4: left          (210°)
 *   5: top-left      (270° → 330°-ish)
 *
 * Wait — let me be precise. For angle = 60*i - 30:
 *   i=0: -30° (top-right)
 *   i=1:  30° (bottom-right)
 *   i=2:  90° (bottom)
 *   i=3: 150° (bottom-left)
 *   i=4: 210° (top-left)
 *   i=5: 270° (top)
 *
 * @param cx - Center X position
 * @param cy - Center Y position
 * @returns Array of 6 corner points
 */
export function getHexCorners(cx: number, cy: number): Point[] {
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30;
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push({
      x: cx + HEX_SIZE * Math.cos(angleRad),
      y: cy + HEX_SIZE * Math.sin(angleRad),
    });
  }
  return corners;
}

/**
 * Convert hex corners array to an SVG polygon points string.
 *
 * @param corners - Array of corner points
 * @returns SVG-compatible points string like "x1,y1 x2,y2 ..."
 */
export function cornersToSvgPoints(corners: Point[]): string {
  return corners.map(c => `${c.x},${c.y}`).join(' ');
}

// ─────────────────────────────────────────────────────
// BOARD GENERATION
// ─────────────────────────────────────────────────────

/**
 * Result of the board generation process.
 * Contains all the data structures needed to play the game.
 */
export interface BoardData {
  hexes: HexTile[];
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  ports: Port[];
  robberHexId: string;
}

/**
 * Generate a complete, randomized Catan board.
 *
 * This is the main entry point for board creation. It:
 * 1. Creates hex tiles with random terrain and number assignments
 * 2. Computes all vertices (intersections) with deduplication
 * 3. Computes all edges (road positions) with deduplication
 * 4. Builds full adjacency relationships
 * 5. Identifies coastal features and places ports
 * 6. Positions the robber on the desert tile
 *
 * @returns Complete BoardData ready for game initialization
 */
export function generateBoard(): BoardData {
  // ── Step 1: Shuffle terrains and assign to hex positions ──
  const shuffledTerrains = shuffle(TERRAIN_DISTRIBUTION);
  const shuffledNumbers = shuffle(NUMBER_TOKENS);

  // Track which number token to assign next (skip desert hexes)
  let numberIndex = 0;

  // ── Step 2: Create hex tiles ──
  const hexes: HexTile[] = HEX_POSITIONS.map(([q, r], idx) => {
    const terrain = shuffledTerrains[idx];
    const center = axialToPixel(q, r);
    const corners = getHexCorners(center.x, center.y);

    // Desert gets no number token; other terrains get the next shuffled number
    const numberToken = terrain === TerrainType.Desert
      ? null
      : shuffledNumbers[numberIndex++];

    return {
      id: `hex_${q}_${r}`,
      q,
      r,
      terrain,
      numberToken,
      hasRobber: terrain === TerrainType.Desert, // Robber starts on desert
      center,
      corners,
      vertexIds: [],  // Will be populated below
      edgeIds: [],    // Will be populated below
    };
  });

  // Find the desert hex for robber placement
  const desertHex = hexes.find(h => h.terrain === TerrainType.Desert)!;

  // ── Step 3: Compute vertices (deduplicated intersections) ──
  // Each hex has 6 corners, but adjacent hexes share corners.
  // We deduplicate by rounding coordinates and using them as keys.
  const vertexMap: Record<string, Vertex> = {};

  for (const hex of hexes) {
    const vIds: string[] = [];

    for (const corner of hex.corners) {
      const key = vertexKey(corner.x, corner.y);

      if (!vertexMap[key]) {
        // First time seeing this vertex position — create it
        vertexMap[key] = {
          id: key,
          position: { x: roundCoord(corner.x), y: roundCoord(corner.y) },
          building: null,
          adjacentHexIds: [],
          adjacentVertexIds: [],
          adjacentEdgeIds: [],
          port: null,
          isCoastal: false,
        };
      }

      // Link this vertex to the current hex (if not already linked)
      if (!vertexMap[key].adjacentHexIds.includes(hex.id)) {
        vertexMap[key].adjacentHexIds.push(hex.id);
      }

      vIds.push(key);
    }

    // Store the 6 vertex IDs for this hex
    hex.vertexIds = vIds;
  }

  // ── Step 4: Compute edges (deduplicated road positions) ──
  // Each hex has 6 edges connecting consecutive corners.
  // Adjacent hexes share edges, so we deduplicate using sorted vertex ID pairs.
  const edgeMap: Record<string, Edge> = {};

  for (const hex of hexes) {
    const eIds: string[] = [];

    for (let i = 0; i < 6; i++) {
      const v1Id = hex.vertexIds[i];
      const v2Id = hex.vertexIds[(i + 1) % 6];
      const key = edgeKey(v1Id, v2Id);

      if (!edgeMap[key]) {
        // First time seeing this edge — create it
        edgeMap[key] = {
          id: key,
          vertexIds: [v1Id, v2Id],
          road: null,
          endpoints: [
            vertexMap[v1Id].position,
            vertexMap[v2Id].position,
          ],
        };
      }

      eIds.push(key);
    }

    // Store the 6 edge IDs for this hex
    hex.edgeIds = eIds;
  }

  // ── Step 5: Build vertex-to-vertex and vertex-to-edge adjacency ──
  // Two vertices are adjacent if they share an edge.
  for (const edge of Object.values(edgeMap)) {
    const [v1, v2] = edge.vertexIds;

    // Add each vertex as adjacent to the other
    if (!vertexMap[v1].adjacentVertexIds.includes(v2)) {
      vertexMap[v1].adjacentVertexIds.push(v2);
    }
    if (!vertexMap[v2].adjacentVertexIds.includes(v1)) {
      vertexMap[v2].adjacentVertexIds.push(v1);
    }

    // Add this edge as adjacent to both vertices
    if (!vertexMap[v1].adjacentEdgeIds.includes(edge.id)) {
      vertexMap[v1].adjacentEdgeIds.push(edge.id);
    }
    if (!vertexMap[v2].adjacentEdgeIds.includes(edge.id)) {
      vertexMap[v2].adjacentEdgeIds.push(edge.id);
    }
  }

  // ── Step 6: Mark coastal vertices ──
  // A coastal vertex touches fewer than 3 hexes (it's on the board edge).
  // These are important for port placement.
  for (const vertex of Object.values(vertexMap)) {
    vertex.isCoastal = vertex.adjacentHexIds.length < 3;
  }

  // ── Step 7: Place ports around the coast ──
  const ports = placePorts(hexes, vertexMap, edgeMap);

  return {
    hexes,
    vertices: vertexMap,
    edges: edgeMap,
    ports,
    robberHexId: desertHex.id,
  };
}

/**
 * Place 9 ports around the coast of the board.
 *
 * Ports are placed on coastal edges (edges where both vertices
 * are coastal). We select 9 evenly-spaced coastal edges and
 * assign shuffled port types to them.
 *
 * Each port gives access to two vertices, allowing players who
 * build settlements on those vertices to trade at better ratios.
 *
 * @param hexes - All hex tiles
 * @param vertices - All vertices
 * @param edges - All edges
 * @returns Array of 9 Port objects
 */
function placePorts(
  hexes: HexTile[],
  vertices: Record<string, Vertex>,
  edges: Record<string, Edge>,
): Port[] {
  // Find all coastal edges: edges where both endpoints are coastal
  // and exactly one adjacent hex exists for the shared edge
  const coastalEdges: Edge[] = [];

  for (const edge of Object.values(edges)) {
    const v1 = vertices[edge.vertexIds[0]];
    const v2 = vertices[edge.vertexIds[1]];

    if (v1.isCoastal && v2.isCoastal) {
      // Check that this edge is actually on the coast (belongs to only 1 hex)
      const hexCount = hexes.filter(h => h.edgeIds.includes(edge.id)).length;
      if (hexCount === 1) {
        coastalEdges.push(edge);
      }
    }
  }

  // Sort coastal edges by angle from board center for even distribution.
  // This ensures ports are spread around the perimeter.
  const centerX = BOARD_CENTER_X;
  const centerY = BOARD_CENTER_Y;

  coastalEdges.sort((a, b) => {
    const midA = {
      x: (a.endpoints[0].x + a.endpoints[1].x) / 2,
      y: (a.endpoints[0].y + a.endpoints[1].y) / 2,
    };
    const midB = {
      x: (b.endpoints[0].x + b.endpoints[1].x) / 2,
      y: (b.endpoints[0].y + b.endpoints[1].y) / 2,
    };
    const angleA = Math.atan2(midA.y - centerY, midA.x - centerX);
    const angleB = Math.atan2(midB.y - centerY, midB.x - centerX);
    return angleA - angleB;
  });

  // Select 9 evenly-spaced edges from the coastal edges
  const totalCoastal = coastalEdges.length;
  const spacing = totalCoastal / 9;
  const selectedEdges: Edge[] = [];

  for (let i = 0; i < 9; i++) {
    const index = Math.floor(i * spacing) % totalCoastal;
    selectedEdges.push(coastalEdges[index]);
  }

  // Shuffle port types and assign them
  const shuffledPortTypes = shuffle(PORT_TYPES);
  const ports: Port[] = [];

  for (let i = 0; i < 9; i++) {
    const edge = selectedEdges[i];
    const portType = shuffledPortTypes[i];
    const mid = {
      x: (edge.endpoints[0].x + edge.endpoints[1].x) / 2,
      y: (edge.endpoints[0].y + edge.endpoints[1].y) / 2,
    };

    // Position the port marker outside the board (away from center)
    const angle = Math.atan2(mid.y - centerY, mid.x - centerX);
    const portDistance = 35; // How far outside the edge to render the marker
    const portPosition: Point = {
      x: mid.x + Math.cos(angle) * portDistance,
      y: mid.y + Math.sin(angle) * portDistance,
    };

    const port: Port = {
      resource: portType,
      ratio: portType === 'any' ? 3 : 2,
      vertexIds: [edge.vertexIds[0], edge.vertexIds[1]],
      position: portPosition,
      angle: (angle * 180) / Math.PI,
    };

    // Assign port reference to both vertices
    vertices[edge.vertexIds[0]].port = port;
    vertices[edge.vertexIds[1]].port = port;

    ports.push(port);
  }

  return ports;
}

// ─────────────────────────────────────────────────────
// RENDERING HELPERS
// ─────────────────────────────────────────────────────

/**
 * Get the background color for a terrain type.
 * Used for rendering hex tiles on the SVG board.
 *
 * @param terrain - The terrain type
 * @returns CSS color string
 */
export function getTerrainColor(terrain: TerrainType): string {
  switch (terrain) {
    case TerrainType.Forest:    return '#2d6a2e';  // Dark green (trees)
    case TerrainType.Hills:     return '#c4622c';  // Brick red/brown
    case TerrainType.Fields:    return '#e8b83d';  // Golden wheat
    case TerrainType.Mountains: return '#8a8a8a';  // Stone gray
    case TerrainType.Pasture:   return '#7ec850';  // Light green (grass)
    case TerrainType.Desert:    return '#e8d5a3';  // Sandy beige
  }
}

/**
 * Get a human-readable label for a terrain type.
 *
 * @param terrain - The terrain type
 * @returns Display string
 */
export function getTerrainLabel(terrain: TerrainType): string {
  switch (terrain) {
    case TerrainType.Forest:    return 'Forest';
    case TerrainType.Hills:     return 'Hills';
    case TerrainType.Fields:    return 'Fields';
    case TerrainType.Mountains: return 'Mountains';
    case TerrainType.Pasture:   return 'Pasture';
    case TerrainType.Desert:    return 'Desert';
  }
}

/**
 * Get the emoji icon for a resource type.
 * Used in the UI to visually represent resources.
 *
 * @param resource - The resource type
 * @returns Emoji string
 */
export function getResourceEmoji(resource: ResourceType): string {
  switch (resource) {
    case ResourceType.Wood:  return '🪵';
    case ResourceType.Brick: return '🧱';
    case ResourceType.Wheat: return '🌾';
    case ResourceType.Ore:   return '⛰️';
    case ResourceType.Sheep: return '🐑';
  }
}

/**
 * Get the color associated with a resource type.
 * Used for rendering resource indicators.
 *
 * @param resource - The resource type
 * @returns CSS color string
 */
export function getResourceColor(resource: ResourceType): string {
  switch (resource) {
    case ResourceType.Wood:  return '#2d6a2e';
    case ResourceType.Brick: return '#c4622c';
    case ResourceType.Wheat: return '#e8b83d';
    case ResourceType.Ore:   return '#8a8a8a';
    case ResourceType.Sheep: return '#7ec850';
  }
}

/**
 * Get the probability dots for a number token.
 * In Catan, each number has dots indicating its probability:
 * the closer to 7, the more dots (higher probability).
 *
 * @param num - The number token value (2-12)
 * @returns Number of dots (1-5)
 */
export function getNumberDots(num: number): number {
  return 6 - Math.abs(7 - num);
}

/**
 * Check if a number is a "red" number (6 or 8).
 * These are the highest-probability non-7 numbers and
 * are traditionally displayed in red on the board.
 *
 * @param num - The number token value
 * @returns True if the number is 6 or 8
 */
export function isRedNumber(num: number): boolean {
  return num === 6 || num === 8;
}
