/**
 * =====================================================
 * SETTLERS OF CATAN - Type Definitions
 * =====================================================
 *
 * This file contains ALL TypeScript type definitions used
 * throughout the Catan game application. It defines the
 * data structures for the board (hexes, vertices, edges),
 * players, resources, buildings, development cards, trading,
 * and the overall game state.
 *
 * The game follows the standard Catan rules with:
 * - 19 hexagonal terrain tiles
 * - 54 vertex intersections (for settlements/cities)
 * - 72 edges (for roads)
 * - 9 harbors/ports for maritime trading
 * - Full development card deck
 * - Robber mechanics
 * - Longest Road and Largest Army bonuses
 */

// ─────────────────────────────────────────────────────
// ENUMS - Core game enumerations
// ─────────────────────────────────────────────────────

/**
 * The five resource types in Catan.
 * Each terrain type (except desert) produces one of these resources.
 */
export enum ResourceType {
  Wood = 'wood',     // Produced by Forest tiles
  Brick = 'brick',   // Produced by Hills tiles
  Wheat = 'wheat',   // Produced by Fields tiles
  Ore = 'ore',       // Produced by Mountains tiles
  Sheep = 'sheep',   // Produced by Pasture tiles
}

/** Array of all resource types - useful for iteration */
export const ALL_RESOURCES: ResourceType[] = [
  ResourceType.Wood,
  ResourceType.Brick,
  ResourceType.Wheat,
  ResourceType.Ore,
  ResourceType.Sheep,
];

/**
 * Terrain types for hex tiles.
 * Each terrain produces a specific resource (except Desert).
 */
export enum TerrainType {
  Forest = 'forest',       // Produces Wood
  Hills = 'hills',         // Produces Brick
  Fields = 'fields',       // Produces Wheat
  Mountains = 'mountains', // Produces Ore
  Pasture = 'pasture',     // Produces Sheep
  Desert = 'desert',       // Produces nothing; robber starts here
}

/**
 * Maps each terrain type to the resource it produces.
 * Desert produces null (no resource).
 */
export const TERRAIN_TO_RESOURCE: Record<TerrainType, ResourceType | null> = {
  [TerrainType.Forest]: ResourceType.Wood,
  [TerrainType.Hills]: ResourceType.Brick,
  [TerrainType.Fields]: ResourceType.Wheat,
  [TerrainType.Mountains]: ResourceType.Ore,
  [TerrainType.Pasture]: ResourceType.Sheep,
  [TerrainType.Desert]: null,
};

/**
 * Development card types.
 * The deck contains: 14 Knights, 5 Victory Points,
 * 2 Road Building, 2 Year of Plenty, 2 Monopoly.
 */
export enum DevCardType {
  Knight = 'knight',               // Move robber + steal; counts toward Largest Army
  VictoryPoint = 'victoryPoint',   // Worth 1 VP; revealed only when winning
  RoadBuilding = 'roadBuilding',   // Place 2 roads for free
  YearOfPlenty = 'yearOfPlenty',   // Take any 2 resources from the bank
  Monopoly = 'monopoly',           // Take all of one resource type from all players
}

/**
 * Building types that can be placed on vertices.
 * Settlements are worth 1 VP; Cities are worth 2 VP and
 * produce double resources.
 */
export enum BuildingType {
  Settlement = 'settlement',
  City = 'city',
}

/**
 * Game phases controlling the flow of the game.
 * The game progresses through setup, then repeating turn phases.
 */
export enum GamePhase {
  // ── Setup phases ──
  /** Initial placement phase (rounds 1 and 2) */
  SetupSettlement = 'setupSettlement',
  /** Place a road adjacent to the just-placed settlement */
  SetupRoad = 'setupRoad',

  // ── Main turn phases ──
  /** Start of turn: can play a Knight before rolling */
  PreDice = 'preDice',
  /** Players with >7 cards must discard half (after rolling a 7) */
  Discarding = 'discarding',
  /** Player must move the robber to a new hex */
  MovingRobber = 'movingRobber',
  /** Player chooses which adjacent player to steal from */
  Stealing = 'stealing',
  /** Main phase: build, trade, play dev cards, or end turn */
  MainPhase = 'mainPhase',

  // ── Special action sub-phases ──
  /** Road Building dev card: placing free roads */
  RoadBuilding = 'roadBuilding',
  /** Year of Plenty dev card: choosing 2 resources */
  YearOfPlenty = 'yearOfPlenty',
  /** Monopoly dev card: choosing a resource to monopolize */
  Monopoly = 'monopoly',

  // ── End ──
  /** A player has reached 10+ victory points */
  GameOver = 'gameOver',
}

// ─────────────────────────────────────────────────────
// INTERFACES - Data structures
// ─────────────────────────────────────────────────────

/** A 2D point used for rendering positions */
export interface Point {
  x: number;
  y: number;
}

/**
 * A harbor/port for maritime trading.
 * Ports give better trade ratios (3:1 or 2:1) compared
 * to the default 4:1 bank trade.
 */
export interface Port {
  /** The specific resource this port trades (2:1), or 'any' for 3:1 generic */
  resource: ResourceType | 'any';
  /** The trade ratio: 2 for specific resource ports, 3 for generic */
  ratio: number;
  /** The two vertex IDs that have access to this port */
  vertexIds: [string, string];
  /** Position for rendering the port marker on the board */
  position: Point;
  /** Angle in degrees for rendering the port direction indicator */
  angle: number;
}

/**
 * A hexagonal terrain tile on the board.
 * The standard board has 19 hex tiles arranged in a
 * 3-4-5-4-3 pattern.
 */
export interface HexTile {
  /** Unique identifier formatted as "hex_q_r" */
  id: string;
  /** Axial coordinate q (column) */
  q: number;
  /** Axial coordinate r (row) */
  r: number;
  /** The terrain type determining resource production */
  terrain: TerrainType;
  /** The number token (2-12); null for desert */
  numberToken: number | null;
  /** Whether the robber is currently blocking this hex */
  hasRobber: boolean;
  /** Pixel position of the hex center for rendering */
  center: Point;
  /** The 6 corner pixel positions (vertices of the hexagon) */
  corners: Point[];
  /** IDs of the 6 vertices (intersections) around this hex */
  vertexIds: string[];
  /** IDs of the 6 edges (road positions) around this hex */
  edgeIds: string[];
}

/**
 * A vertex (intersection point) where settlements and cities
 * can be built. Each vertex is shared by up to 3 hex tiles.
 */
export interface Vertex {
  /** Unique identifier based on rounded pixel coordinates */
  id: string;
  /** Pixel position for rendering */
  position: Point;
  /** Building placed at this vertex, if any */
  building: { type: BuildingType; playerId: number } | null;
  /** IDs of adjacent hex tiles (1-3 hexes touch this vertex) */
  adjacentHexIds: string[];
  /** IDs of neighboring vertices (for enforcing the distance rule) */
  adjacentVertexIds: string[];
  /** IDs of edges connected to this vertex (2-3 edges) */
  adjacentEdgeIds: string[];
  /** Port access at this vertex, if any */
  port: Port | null;
  /** Whether this vertex is on the coast (fewer than 3 adjacent hexes) */
  isCoastal: boolean;
}

/**
 * An edge (connection between two vertices) where roads
 * can be built. Each edge is shared by up to 2 hex tiles.
 */
export interface Edge {
  /** Unique identifier based on sorted vertex IDs */
  id: string;
  /** The two vertex IDs this edge connects */
  vertexIds: [string, string];
  /** Road built on this edge, if any */
  road: { playerId: number } | null;
  /** The two endpoint pixel positions for rendering */
  endpoints: [Point, Point];
}

/**
 * A mapping of resource types to quantities.
 * Used for player hands, trade offers, and building costs.
 */
export type ResourceHand = Record<ResourceType, number>;

/** Creates an empty resource hand (all zeros) */
export function emptyHand(): ResourceHand {
  return {
    [ResourceType.Wood]: 0,
    [ResourceType.Brick]: 0,
    [ResourceType.Wheat]: 0,
    [ResourceType.Ore]: 0,
    [ResourceType.Sheep]: 0,
  };
}

/**
 * A player in the game. Can be human or AI-controlled.
 * Each player has resources, development cards, and tracks
 * for buildings, special achievements, etc.
 */
export interface Player {
  /** Player index (0-3); also serves as unique ID */
  id: number;
  /** Display name shown in the UI */
  name: string;
  /** CSS color string for rendering this player's pieces */
  color: string;
  /** Whether this player is controlled by the AI */
  isAI: boolean;
  /** Current resource cards in hand */
  resources: ResourceHand;
  /** Development cards in hand (can be played on future turns) */
  devCards: DevCardType[];
  /** Dev cards bought THIS turn (cannot be played until next turn) */
  newDevCards: DevCardType[];
  /** Total number of knight cards played (for Largest Army) */
  knightsPlayed: number;
  /** Whether this player currently holds the Longest Road bonus */
  hasLongestRoad: boolean;
  /** Whether this player currently holds the Largest Army bonus */
  hasLargestArmy: boolean;
  /** Remaining settlement pieces (start with 5) */
  settlementsLeft: number;
  /** Remaining city pieces (start with 4) */
  citiesLeft: number;
  /** Remaining road pieces (start with 15) */
  roadsLeft: number;
  /** Whether a development card has been played this turn */
  devCardPlayedThisTurn: boolean;
}

/**
 * The complete game state - everything needed to represent
 * and render the current state of a Catan game.
 *
 * This is designed as an immutable data structure: all game
 * actions produce a NEW GameState rather than mutating this one.
 */
export interface GameState {
  // ── Board data ──
  /** All 19 hex tiles on the board */
  hexes: HexTile[];
  /** All vertices (intersections), keyed by vertex ID */
  vertices: Record<string, Vertex>;
  /** All edges (road positions), keyed by edge ID */
  edges: Record<string, Edge>;
  /** All 9 ports on the board */
  ports: Port[];

  // ── Player data ──
  /** Array of all players (index 0 is always the human) */
  players: Player[];
  /** Index into players[] for the current turn */
  currentPlayerIndex: number;

  // ── Turn/phase tracking ──
  /** Current phase of the game */
  phase: GamePhase;
  /** Last dice roll result as [die1, die2], or null if not yet rolled */
  diceRoll: [number, number] | null;
  /** Turn counter (increments each time play returns to first player) */
  turnNumber: number;

  // ── Setup tracking ──
  /** Which setup round we're in (1 = forward order, 2 = reverse order) */
  setupRound: number;
  /** The vertex ID of the most recently placed setup settlement */
  lastSetupSettlement: string | null;

  // ── Robber ──
  /** ID of the hex where the robber currently sits */
  robberHexId: string;

  // ── Achievements ──
  /** Player ID with Longest Road (null if nobody has 5+ roads) */
  longestRoadPlayerId: number | null;
  /** Length of the current longest road */
  longestRoadLength: number;
  /** Player ID with Largest Army (null if nobody has 3+ knights) */
  largestArmyPlayerId: number | null;
  /** Size of the current largest army */
  largestArmySize: number;

  // ── Development cards ──
  /** Remaining shuffled deck of development cards */
  devCardDeck: DevCardType[];

  // ── Special phase tracking ──
  /** Players who still need to discard (after rolling a 7) */
  playersNeedToDiscard: number[];
  /** Roads remaining to place for Road Building card (0, 1, or 2) */
  roadBuildingRoadsLeft: number;

  // ── Game log ──
  /** Chronological list of game event messages */
  gameLog: string[];
  /** Player ID of the winner, or null if game is still going */
  winner: number | null;
}

/**
 * Configuration for starting a new game.
 * Set by the player on the setup screen.
 */
export interface GameConfig {
  /** The human player's display name */
  playerName: string;
  /** Number of AI opponents (1, 2, or 3) */
  numAIPlayers: number;
}

// ─────────────────────────────────────────────────────
// CONSTANTS - Building costs and game rules
// ─────────────────────────────────────────────────────

/** Cost to build a road: 1 Wood + 1 Brick */
export const ROAD_COST: Partial<ResourceHand> = {
  [ResourceType.Wood]: 1,
  [ResourceType.Brick]: 1,
};

/** Cost to build a settlement: 1 Wood + 1 Brick + 1 Wheat + 1 Sheep */
export const SETTLEMENT_COST: Partial<ResourceHand> = {
  [ResourceType.Wood]: 1,
  [ResourceType.Brick]: 1,
  [ResourceType.Wheat]: 1,
  [ResourceType.Sheep]: 1,
};

/** Cost to upgrade a settlement to a city: 2 Wheat + 3 Ore */
export const CITY_COST: Partial<ResourceHand> = {
  [ResourceType.Wheat]: 2,
  [ResourceType.Ore]: 3,
};

/** Cost to buy a development card: 1 Wheat + 1 Ore + 1 Sheep */
export const DEV_CARD_COST: Partial<ResourceHand> = {
  [ResourceType.Wheat]: 1,
  [ResourceType.Ore]: 1,
  [ResourceType.Sheep]: 1,
};

/** Victory points needed to win the game */
export const VICTORY_POINTS_TO_WIN = 10;

/** Player colors - visually distinct for the board */
export const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#f97316', '#8b5cf6'];

/** Default player names for AI opponents */
export const AI_NAMES = ['Bot Alice', 'Bot Bob', 'Bot Carol'];
