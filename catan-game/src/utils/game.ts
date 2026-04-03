/**
 * =====================================================
 * SETTLERS OF CATAN - Game Logic Engine
 * =====================================================
 *
 * This module contains ALL game rules and state transition logic.
 * Every function takes the current GameState (immutably) and returns
 * a new GameState reflecting the action taken.
 *
 * Key responsibilities:
 * - Game initialization (creating players, shuffling dev cards)
 * - Setup phase (initial settlement + road placement)
 * - Dice rolling and resource distribution
 * - Building validation and placement (roads, settlements, cities)
 * - Development card purchasing and playing
 * - Robber mechanics (moving, stealing)
 * - Maritime trading (bank trades at 4:1, 3:1, or 2:1)
 * - Longest Road calculation (DFS-based)
 * - Largest Army tracking
 * - Victory point calculation and win detection
 * - Discard phase (when a 7 is rolled)
 *
 * All functions are PURE — they don't mutate input state.
 * Instead, they return new objects via spread operators.
 */

import {
  GameState,
  GamePhase,
  GameConfig,
  Player,
  ResourceType,
  ResourceHand,
  DevCardType,
  BuildingType,
  TERRAIN_TO_RESOURCE,
  ALL_RESOURCES,
  ROAD_COST,
  SETTLEMENT_COST,
  CITY_COST,
  DEV_CARD_COST,
  VICTORY_POINTS_TO_WIN,
  PLAYER_COLORS,
  AI_NAMES,
  emptyHand,
} from '../types';
import { generateBoard } from './board';

// ─────────────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────────────

/**
 * Fisher-Yates shuffle (creates a new shuffled array).
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
 * Deep-clone a player object to avoid mutation.
 * Creates new copies of resources, devCards, and newDevCards arrays.
 */
function clonePlayer(p: Player): Player {
  return {
    ...p,
    resources: { ...p.resources },
    devCards: [...p.devCards],
    newDevCards: [...p.newDevCards],
  };
}

/**
 * Deep-clone all players in the game state.
 */
function clonePlayers(players: Player[]): Player[] {
  return players.map(clonePlayer);
}

/**
 * Check if a player can afford a given cost.
 *
 * @param hand - Player's current resources
 * @param cost - Required resources (partial — missing keys = 0)
 * @returns True if the player has enough of each resource
 */
export function canAfford(hand: ResourceHand, cost: Partial<ResourceHand>): boolean {
  for (const res of ALL_RESOURCES) {
    if ((cost[res] ?? 0) > hand[res]) return false;
  }
  return true;
}

/**
 * Subtract a cost from a resource hand.
 * Returns a new hand (does not mutate the input).
 *
 * @param hand - Current resources
 * @param cost - Resources to subtract
 * @returns New resource hand after subtraction
 */
function subtractResources(hand: ResourceHand, cost: Partial<ResourceHand>): ResourceHand {
  const result = { ...hand };
  for (const res of ALL_RESOURCES) {
    result[res] -= cost[res] ?? 0;
  }
  return result;
}

/**
 * Add resources to a hand.
 * Returns a new hand (does not mutate the input).
 */
function addResources(hand: ResourceHand, toAdd: Partial<ResourceHand>): ResourceHand {
  const result = { ...hand };
  for (const res of ALL_RESOURCES) {
    result[res] += toAdd[res] ?? 0;
  }
  return result;
}

/**
 * Count total number of resource cards in a hand.
 */
export function totalCards(hand: ResourceHand): number {
  return ALL_RESOURCES.reduce((sum, r) => sum + hand[r], 0);
}

/**
 * Add a message to the game log.
 * Returns a new state with the message appended.
 */
function log(state: GameState, message: string): GameState {
  return { ...state, gameLog: [...state.gameLog, message] };
}

// ─────────────────────────────────────────────────────
// GAME INITIALIZATION
// ─────────────────────────────────────────────────────

/**
 * Create the standard development card deck (25 cards total).
 *
 * Contents:
 * - 14 Knight cards
 * - 5 Victory Point cards
 * - 2 Road Building cards
 * - 2 Year of Plenty cards
 * - 2 Monopoly cards
 *
 * @returns Shuffled array of development cards
 */
function createDevCardDeck(): DevCardType[] {
  const deck: DevCardType[] = [
    ...Array(14).fill(DevCardType.Knight),
    ...Array(5).fill(DevCardType.VictoryPoint),
    ...Array(2).fill(DevCardType.RoadBuilding),
    ...Array(2).fill(DevCardType.YearOfPlenty),
    ...Array(2).fill(DevCardType.Monopoly),
  ];
  return shuffle(deck);
}

/**
 * Create a new player with starting values.
 *
 * @param id - Player index (0 = human)
 * @param name - Display name
 * @param color - CSS color for pieces
 * @param isAI - Whether AI-controlled
 * @returns Initialized Player object
 */
function createPlayer(id: number, name: string, color: string, isAI: boolean): Player {
  return {
    id,
    name,
    color,
    isAI,
    resources: emptyHand(),
    devCards: [],
    newDevCards: [],
    knightsPlayed: 0,
    hasLongestRoad: false,
    hasLargestArmy: false,
    settlementsLeft: 5,  // Standard: 5 settlements per player
    citiesLeft: 4,       // Standard: 4 cities per player
    roadsLeft: 15,       // Standard: 15 roads per player
    devCardPlayedThisTurn: false,
  };
}

/**
 * Initialize a complete new game.
 *
 * This creates the board, players, dev card deck, and sets
 * the game to the setup phase where players place their
 * initial settlements and roads.
 *
 * @param config - Game configuration (player name, number of AIs)
 * @returns Fully initialized GameState
 */
export function initializeGame(config: GameConfig): GameState {
  // Generate the randomized board
  const board = generateBoard();

  // Create players: human player + AI opponents
  const players: Player[] = [
    createPlayer(0, config.playerName, PLAYER_COLORS[0], false),
  ];
  for (let i = 0; i < config.numAIPlayers; i++) {
    players.push(
      createPlayer(i + 1, AI_NAMES[i], PLAYER_COLORS[i + 1], true)
    );
  }

  return {
    // Board
    hexes: board.hexes,
    vertices: board.vertices,
    edges: board.edges,
    ports: board.ports,

    // Players
    players,
    currentPlayerIndex: 0,

    // Phase
    phase: GamePhase.SetupSettlement,
    diceRoll: null,
    turnNumber: 1,

    // Setup tracking
    setupRound: 1,
    lastSetupSettlement: null,

    // Robber
    robberHexId: board.robberHexId,

    // Achievements
    longestRoadPlayerId: null,
    longestRoadLength: 0,
    largestArmyPlayerId: null,
    largestArmySize: 0,

    // Dev cards
    devCardDeck: createDevCardDeck(),

    // Special phases
    playersNeedToDiscard: [],
    roadBuildingRoadsLeft: 0,

    // Log
    gameLog: ['Game started! Place your first settlement.'],
    winner: null,
  };
}

// ─────────────────────────────────────────────────────
// SETUP PHASE
// ─────────────────────────────────────────────────────

/**
 * Get valid vertex IDs where a player can place a settlement during setup.
 *
 * During setup, the only rule is the DISTANCE RULE:
 * no settlement can be placed adjacent to an existing settlement/city.
 * (There's no road connectivity requirement during setup.)
 *
 * @param state - Current game state
 * @returns Array of vertex IDs where placement is legal
 */
export function getValidSetupSettlements(state: GameState): string[] {
  return Object.values(state.vertices)
    .filter(v => {
      // Must be empty
      if (v.building) return false;

      // Distance rule: no adjacent vertex can have a building
      for (const adjId of v.adjacentVertexIds) {
        if (state.vertices[adjId].building) return false;
      }

      return true;
    })
    .map(v => v.id);
}

/**
 * Get valid edge IDs where a player can place a road during setup.
 *
 * During setup road placement, the road must be adjacent to the
 * settlement that was just placed (stored in lastSetupSettlement).
 *
 * @param state - Current game state
 * @returns Array of edge IDs where placement is legal
 */
export function getValidSetupRoads(state: GameState): string[] {
  if (!state.lastSetupSettlement) return [];

  const vertex = state.vertices[state.lastSetupSettlement];

  return vertex.adjacentEdgeIds.filter(edgeId => {
    const edge = state.edges[edgeId];
    // Must be empty (no road already placed)
    return edge.road === null;
  });
}

/**
 * Place a settlement during the setup phase.
 *
 * This handles:
 * 1. Placing the building on the vertex
 * 2. During setup round 2, granting starting resources from adjacent hexes
 * 3. Transitioning to road placement sub-phase
 *
 * @param state - Current game state
 * @param vertexId - Where to place the settlement
 * @returns New game state after placement
 */
export function placeSetupSettlement(state: GameState, vertexId: string): GameState {
  const playerId = state.currentPlayerIndex;
  const players = clonePlayers(state.players);

  // Place the building
  const vertices = { ...state.vertices };
  vertices[vertexId] = {
    ...vertices[vertexId],
    building: { type: BuildingType.Settlement, playerId },
  };

  // Decrement available settlements
  players[playerId].settlementsLeft--;

  // During round 2, give starting resources from adjacent hexes
  if (state.setupRound === 2) {
    const vertex = vertices[vertexId];
    for (const hexId of vertex.adjacentHexIds) {
      const hex = state.hexes.find(h => h.id === hexId)!;
      const resource = TERRAIN_TO_RESOURCE[hex.terrain];
      if (resource) {
        players[playerId].resources[resource]++;
      }
    }
  }

  let newState: GameState = {
    ...state,
    vertices,
    players,
    lastSetupSettlement: vertexId,
    phase: GamePhase.SetupRoad,
  };

  newState = log(newState, `${players[playerId].name} placed a settlement.`);

  return newState;
}

/**
 * Place a road during the setup phase.
 *
 * After road placement, advances to the next player in setup order:
 * - Round 1: forward order (0, 1, 2, 3)
 * - Round 2: reverse order (3, 2, 1, 0)
 *
 * When both rounds are complete, transitions to the main game.
 *
 * @param state - Current game state
 * @param edgeId - Where to place the road
 * @returns New game state after placement
 */
export function placeSetupRoad(state: GameState, edgeId: string): GameState {
  const playerId = state.currentPlayerIndex;
  const players = clonePlayers(state.players);

  // Place the road
  const edges = { ...state.edges };
  edges[edgeId] = {
    ...edges[edgeId],
    road: { playerId },
  };

  players[playerId].roadsLeft--;

  let newState: GameState = {
    ...state,
    edges,
    players,
    lastSetupSettlement: null,
  };

  newState = log(newState, `${players[playerId].name} placed a road.`);

  // Determine next player in setup order
  const numPlayers = players.length;

  if (state.setupRound === 1) {
    // Round 1: forward order
    const nextPlayer = state.currentPlayerIndex + 1;
    if (nextPlayer < numPlayers) {
      // More players need to place in round 1
      newState = {
        ...newState,
        currentPlayerIndex: nextPlayer,
        phase: GamePhase.SetupSettlement,
      };
    } else {
      // Round 1 complete — start round 2 (reverse order, starting with last player)
      newState = {
        ...newState,
        setupRound: 2,
        currentPlayerIndex: numPlayers - 1,
        phase: GamePhase.SetupSettlement,
      };
      newState = log(newState, 'Second round of placement — reverse order.');
    }
  } else {
    // Round 2: reverse order
    const nextPlayer = state.currentPlayerIndex - 1;
    if (nextPlayer >= 0) {
      // More players need to place in round 2
      newState = {
        ...newState,
        currentPlayerIndex: nextPlayer,
        phase: GamePhase.SetupSettlement,
      };
    } else {
      // Setup complete! Start the main game with player 0
      newState = {
        ...newState,
        setupRound: 0, // Done with setup
        currentPlayerIndex: 0,
        phase: GamePhase.PreDice,
      };
      newState = log(newState, 'Setup complete! The game begins. Roll the dice!');
    }
  }

  return newState;
}

// ─────────────────────────────────────────────────────
// DICE & RESOURCE DISTRIBUTION
// ─────────────────────────────────────────────────────

/**
 * Roll the dice and distribute resources (or trigger robber on 7).
 *
 * When a non-7 is rolled:
 * - Find all hexes with the matching number token
 * - Skip hexes with the robber
 * - Give 1 resource per settlement and 2 per city on those hexes
 *
 * When a 7 is rolled:
 * - Players with >7 cards must discard half (rounded down)
 * - Then the current player must move the robber
 *
 * @param state - Current game state (must be in PreDice phase)
 * @returns New game state after dice roll
 */
export function rollDice(state: GameState): GameState {
  // Roll two six-sided dice
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const total = die1 + die2;

  const players = clonePlayers(state.players);
  let newState: GameState = {
    ...state,
    players,
    diceRoll: [die1, die2],
  };

  newState = log(newState, `${players[state.currentPlayerIndex].name} rolled ${die1} + ${die2} = ${total}.`);

  if (total === 7) {
    // ── Rolled a 7: Discard phase + move robber ──

    // Find players who must discard (more than 7 cards)
    const mustDiscard: number[] = [];
    for (const player of players) {
      if (totalCards(player.resources) > 7) {
        mustDiscard.push(player.id);
      }
    }

    if (mustDiscard.length > 0) {
      newState = {
        ...newState,
        phase: GamePhase.Discarding,
        playersNeedToDiscard: mustDiscard,
      };
      newState = log(newState, `Players with more than 7 cards must discard half.`);
    } else {
      // No one needs to discard — go straight to robber movement
      newState = {
        ...newState,
        phase: GamePhase.MovingRobber,
      };
      newState = log(newState, `Move the robber to a new hex!`);
    }
  } else {
    // ── Normal roll: Distribute resources ──

    // Find hexes with the rolled number (excluding robber hex)
    const matchingHexes = state.hexes.filter(
      h => h.numberToken === total && !h.hasRobber
    );

    // For each matching hex, give resources to players with buildings
    const resourceGains: Record<number, Partial<ResourceHand>> = {};

    for (const hex of matchingHexes) {
      const resource = TERRAIN_TO_RESOURCE[hex.terrain];
      if (!resource) continue; // Desert (shouldn't happen since desert has no number)

      for (const vId of hex.vertexIds) {
        const vertex = state.vertices[vId];
        if (vertex.building) {
          const pid = vertex.building.playerId;
          // Settlements give 1, Cities give 2
          const amount = vertex.building.type === BuildingType.City ? 2 : 1;

          if (!resourceGains[pid]) resourceGains[pid] = {};
          resourceGains[pid][resource] = (resourceGains[pid][resource] ?? 0) + amount;
        }
      }
    }

    // Apply resource gains
    for (const [pidStr, gains] of Object.entries(resourceGains)) {
      const pid = parseInt(pidStr);
      players[pid].resources = addResources(players[pid].resources, gains);

      // Log what each player received
      const gainStrs = ALL_RESOURCES
        .filter(r => (gains[r] ?? 0) > 0)
        .map(r => `${gains[r]} ${r}`);
      if (gainStrs.length > 0) {
        newState = log(newState, `${players[pid].name} received ${gainStrs.join(', ')}.`);
      }
    }

    newState = {
      ...newState,
      players,
      phase: GamePhase.MainPhase,
    };
  }

  return newState;
}

// ─────────────────────────────────────────────────────
// DISCARD (ROLLED 7)
// ─────────────────────────────────────────────────────

/**
 * Discard resources for a player who has more than 7 cards.
 *
 * When a 7 is rolled, each player with >7 cards must discard
 * exactly half (rounded down). This function handles one player's
 * discard. Once all players have discarded, moves to robber phase.
 *
 * @param state - Current game state
 * @param playerId - Player who is discarding
 * @param toDiscard - Resources to discard (must total exactly half)
 * @returns New game state after discard
 */
export function discardResources(
  state: GameState,
  playerId: number,
  toDiscard: Partial<ResourceHand>,
): GameState {
  const players = clonePlayers(state.players);

  // Calculate required discard amount
  const currentTotal = totalCards(players[playerId].resources);
  const mustDiscard = Math.floor(currentTotal / 2);

  // Validate discard amount
  const discardTotal = ALL_RESOURCES.reduce((sum, r) => sum + (toDiscard[r] ?? 0), 0);
  if (discardTotal !== mustDiscard) {
    return log(state, `Must discard exactly ${mustDiscard} cards.`);
  }

  // Subtract discarded resources
  players[playerId].resources = subtractResources(players[playerId].resources, toDiscard);

  // Remove this player from the discard list
  const remaining = state.playersNeedToDiscard.filter(id => id !== playerId);

  let newState: GameState = {
    ...state,
    players,
    playersNeedToDiscard: remaining,
  };

  newState = log(newState, `${players[playerId].name} discarded ${discardTotal} cards.`);

  // If all players have discarded, move to robber phase
  if (remaining.length === 0) {
    newState = {
      ...newState,
      phase: GamePhase.MovingRobber,
    };
    newState = log(newState, 'Move the robber to a new hex!');
  }

  return newState;
}

// ─────────────────────────────────────────────────────
// ROBBER
// ─────────────────────────────────────────────────────

/**
 * Get valid hex IDs where the robber can be moved.
 * The robber must move to a DIFFERENT hex than its current position.
 *
 * @param state - Current game state
 * @returns Array of valid hex IDs
 */
export function getValidRobberHexes(state: GameState): string[] {
  return state.hexes
    .filter(h => h.id !== state.robberHexId)
    .map(h => h.id);
}

/**
 * Move the robber to a new hex.
 *
 * After moving, if any other players have buildings adjacent to
 * the new hex, the current player must choose one to steal from.
 * If no players are adjacent, skip to main phase.
 *
 * @param state - Current game state
 * @param hexId - Destination hex for the robber
 * @returns New game state after robber movement
 */
export function moveRobber(state: GameState, hexId: string): GameState {
  // Update hex robber status
  const hexes = state.hexes.map(h => ({
    ...h,
    hasRobber: h.id === hexId,
  }));

  let newState: GameState = {
    ...state,
    hexes,
    robberHexId: hexId,
  };

  newState = log(newState, `${state.players[state.currentPlayerIndex].name} moved the robber.`);

  // Find players with buildings adjacent to the new hex (excluding current player)
  const hex = hexes.find(h => h.id === hexId)!;
  const stealTargets = new Set<number>();

  for (const vId of hex.vertexIds) {
    const vertex = state.vertices[vId];
    if (vertex.building && vertex.building.playerId !== state.currentPlayerIndex) {
      // Only include players who actually have resources to steal
      if (totalCards(state.players[vertex.building.playerId].resources) > 0) {
        stealTargets.add(vertex.building.playerId);
      }
    }
  }

  if (stealTargets.size > 0) {
    // Must choose a player to steal from
    newState = {
      ...newState,
      phase: GamePhase.Stealing,
    };
  } else {
    // No one to steal from — continue to main phase
    newState = {
      ...newState,
      phase: GamePhase.MainPhase,
    };
    newState = log(newState, 'No one to steal from.');
  }

  return newState;
}

/**
 * Get player IDs that the current player can steal from.
 * Only players with buildings adjacent to the robber hex AND
 * who have at least 1 resource card.
 *
 * @param state - Current game state
 * @returns Array of player IDs
 */
export function getStealTargets(state: GameState): number[] {
  const hex = state.hexes.find(h => h.id === state.robberHexId)!;
  const targets = new Set<number>();

  for (const vId of hex.vertexIds) {
    const vertex = state.vertices[vId];
    if (vertex.building && vertex.building.playerId !== state.currentPlayerIndex) {
      if (totalCards(state.players[vertex.building.playerId].resources) > 0) {
        targets.add(vertex.building.playerId);
      }
    }
  }

  return Array.from(targets);
}

/**
 * Steal a random resource from a target player.
 *
 * @param state - Current game state
 * @param targetPlayerId - Player to steal from
 * @returns New game state after theft
 */
export function stealResource(state: GameState, targetPlayerId: number): GameState {
  const players = clonePlayers(state.players);
  const thief = players[state.currentPlayerIndex];
  const victim = players[targetPlayerId];

  // Build array of all resource cards the victim has
  const victimCards: ResourceType[] = [];
  for (const res of ALL_RESOURCES) {
    for (let i = 0; i < victim.resources[res]; i++) {
      victimCards.push(res);
    }
  }

  let newState: GameState = { ...state, players };

  if (victimCards.length > 0) {
    // Pick a random card
    const stolen = victimCards[Math.floor(Math.random() * victimCards.length)];
    victim.resources[stolen]--;
    thief.resources[stolen]++;

    // Only reveal what was stolen to the thief (show generic message for others)
    newState = log(newState, `${thief.name} stole a resource from ${victim.name}.`);
  } else {
    newState = log(newState, `${victim.name} has no resources to steal.`);
  }

  newState = { ...newState, phase: GamePhase.MainPhase };

  return newState;
}

// ─────────────────────────────────────────────────────
// BUILDING - VALIDATION
// ─────────────────────────────────────────────────────

/**
 * Get valid vertex IDs where a player can build a settlement.
 *
 * Rules:
 * 1. Vertex must be empty (no building)
 * 2. Distance rule: no adjacent vertex can have any building
 * 3. Connectivity: vertex must be connected to the player's road network
 *    (at least one adjacent edge must have the player's road)
 *
 * @param state - Current game state
 * @param playerId - Player who wants to build
 * @returns Array of valid vertex IDs
 */
export function getValidSettlementVertices(state: GameState, playerId: number): string[] {
  return Object.values(state.vertices)
    .filter(v => {
      // Must be empty
      if (v.building) return false;

      // Distance rule: no adjacent buildings
      for (const adjId of v.adjacentVertexIds) {
        if (state.vertices[adjId].building) return false;
      }

      // Must be connected to player's road network
      const hasConnectedRoad = v.adjacentEdgeIds.some(edgeId => {
        const edge = state.edges[edgeId];
        return edge.road?.playerId === playerId;
      });
      if (!hasConnectedRoad) return false;

      return true;
    })
    .map(v => v.id);
}

/**
 * Get valid edge IDs where a player can build a road.
 *
 * Rules:
 * 1. Edge must be empty (no road)
 * 2. Edge must connect to the player's existing network:
 *    - Adjacent to a vertex with the player's building, OR
 *    - Adjacent to another edge with the player's road
 *      (but only if the connecting vertex doesn't have an opponent's building)
 *
 * @param state - Current game state
 * @param playerId - Player who wants to build
 * @returns Array of valid edge IDs
 */
export function getValidRoadEdges(state: GameState, playerId: number): string[] {
  return Object.values(state.edges)
    .filter(edge => {
      // Must be empty
      if (edge.road) return false;

      // Check each endpoint of this edge
      for (const vId of edge.vertexIds) {
        const vertex = state.vertices[vId];

        // Option 1: Vertex has the player's building
        if (vertex.building?.playerId === playerId) return true;

        // Option 2: Connected via road (but not through opponent's building)
        if (!vertex.building || vertex.building.playerId === playerId) {
          // Check if any other edge at this vertex has the player's road
          const hasConnectedRoad = vertex.adjacentEdgeIds.some(adjEdgeId => {
            if (adjEdgeId === edge.id) return false; // Skip self
            return state.edges[adjEdgeId].road?.playerId === playerId;
          });
          if (hasConnectedRoad) return true;
        }
      }

      return false;
    })
    .map(e => e.id);
}

/**
 * Get valid vertex IDs where a player can upgrade a settlement to a city.
 *
 * Simple rule: the vertex must have the player's settlement (not already a city).
 *
 * @param state - Current game state
 * @param playerId - Player who wants to upgrade
 * @returns Array of valid vertex IDs
 */
export function getValidCityVertices(state: GameState, playerId: number): string[] {
  return Object.values(state.vertices)
    .filter(v =>
      v.building?.playerId === playerId &&
      v.building?.type === BuildingType.Settlement
    )
    .map(v => v.id);
}

// ─────────────────────────────────────────────────────
// BUILDING - ACTIONS
// ─────────────────────────────────────────────────────

/**
 * Build a road on the specified edge.
 *
 * Deducts resources (1 Wood + 1 Brick) and places the road.
 * Then checks if this changes the Longest Road holder.
 *
 * @param state - Current game state
 * @param edgeId - Where to build the road
 * @param free - If true, don't deduct resources (Road Building card)
 * @returns New game state after building
 */
export function buildRoad(state: GameState, edgeId: string, free: boolean = false): GameState {
  const playerId = state.currentPlayerIndex;
  const players = clonePlayers(state.players);

  // Deduct resources (unless free from Road Building card)
  if (!free) {
    players[playerId].resources = subtractResources(players[playerId].resources, ROAD_COST);
  }
  players[playerId].roadsLeft--;

  // Place the road
  const edges = { ...state.edges };
  edges[edgeId] = { ...edges[edgeId], road: { playerId } };

  let newState: GameState = {
    ...state,
    edges,
    players,
  };

  newState = log(newState, `${players[playerId].name} built a road.`);

  // Check longest road
  newState = updateLongestRoad(newState);

  // Handle Road Building card state
  if (state.phase === GamePhase.RoadBuilding) {
    const roadsLeft = state.roadBuildingRoadsLeft - 1;
    if (roadsLeft > 0) {
      newState = { ...newState, roadBuildingRoadsLeft: roadsLeft };
    } else {
      newState = { ...newState, phase: GamePhase.MainPhase, roadBuildingRoadsLeft: 0 };
    }
  }

  // Check for winner
  newState = checkWinner(newState);

  return newState;
}

/**
 * Build a settlement on the specified vertex.
 *
 * Deducts resources (1 Wood + 1 Brick + 1 Wheat + 1 Sheep)
 * and places the settlement. Worth 1 Victory Point.
 *
 * @param state - Current game state
 * @param vertexId - Where to build the settlement
 * @returns New game state after building
 */
export function buildSettlement(state: GameState, vertexId: string): GameState {
  const playerId = state.currentPlayerIndex;
  const players = clonePlayers(state.players);

  // Deduct resources
  players[playerId].resources = subtractResources(players[playerId].resources, SETTLEMENT_COST);
  players[playerId].settlementsLeft--;

  // Place the building
  const vertices = { ...state.vertices };
  vertices[vertexId] = {
    ...vertices[vertexId],
    building: { type: BuildingType.Settlement, playerId },
  };

  let newState: GameState = { ...state, vertices, players };

  newState = log(newState, `${players[playerId].name} built a settlement.`);

  // Building a settlement might break an opponent's longest road
  newState = updateLongestRoad(newState);
  newState = checkWinner(newState);

  return newState;
}

/**
 * Upgrade a settlement to a city on the specified vertex.
 *
 * Deducts resources (2 Wheat + 3 Ore), replaces the settlement
 * with a city. Cities produce double resources and are worth 2 VP.
 * The settlement piece is returned to the player's supply.
 *
 * @param state - Current game state
 * @param vertexId - Settlement to upgrade
 * @returns New game state after upgrade
 */
export function buildCity(state: GameState, vertexId: string): GameState {
  const playerId = state.currentPlayerIndex;
  const players = clonePlayers(state.players);

  // Deduct resources
  players[playerId].resources = subtractResources(players[playerId].resources, CITY_COST);
  players[playerId].citiesLeft--;
  players[playerId].settlementsLeft++; // Settlement piece returned to supply

  // Upgrade the building
  const vertices = { ...state.vertices };
  vertices[vertexId] = {
    ...vertices[vertexId],
    building: { type: BuildingType.City, playerId },
  };

  let newState: GameState = { ...state, vertices, players };

  newState = log(newState, `${players[playerId].name} built a city!`);
  newState = checkWinner(newState);

  return newState;
}

// ─────────────────────────────────────────────────────
// DEVELOPMENT CARDS
// ─────────────────────────────────────────────────────

/**
 * Buy a development card from the deck.
 *
 * Deducts resources (1 Wheat + 1 Ore + 1 Sheep) and draws
 * the top card from the shuffled deck. The card goes into
 * newDevCards (can't be played until next turn).
 *
 * Exception: Victory Point cards are never "played" — they
 * just count toward VP total.
 *
 * @param state - Current game state
 * @returns New game state after purchase
 */
export function buyDevCard(state: GameState): GameState {
  if (state.devCardDeck.length === 0) {
    return log(state, 'No more development cards!');
  }

  const playerId = state.currentPlayerIndex;
  const players = clonePlayers(state.players);

  // Deduct cost
  players[playerId].resources = subtractResources(players[playerId].resources, DEV_CARD_COST);

  // Draw the top card
  const deck = [...state.devCardDeck];
  const card = deck.shift()!;

  // VP cards are revealed immediately (in practice, kept secret until winning)
  // Other cards go to newDevCards (can't play until next turn)
  if (card === DevCardType.VictoryPoint) {
    players[playerId].devCards.push(card);
  } else {
    players[playerId].newDevCards.push(card);
  }

  let newState: GameState = {
    ...state,
    players,
    devCardDeck: deck,
  };

  newState = log(newState, `${players[playerId].name} bought a development card.`);
  newState = checkWinner(newState);

  return newState;
}

/**
 * Play a Knight development card.
 *
 * Increments the player's knight count and transitions to
 * the robber movement phase. Also checks for Largest Army.
 *
 * Can only be played:
 * - Before rolling dice (PreDice) or during main phase
 * - If no other dev card was played this turn
 *
 * @param state - Current game state
 * @returns New game state
 */
export function playKnight(state: GameState): GameState {
  const playerId = state.currentPlayerIndex;
  const players = clonePlayers(state.players);

  // Remove knight from hand
  const cardIndex = players[playerId].devCards.indexOf(DevCardType.Knight);
  if (cardIndex === -1) return state;
  players[playerId].devCards.splice(cardIndex, 1);

  // Increment knight count and mark card played this turn
  players[playerId].knightsPlayed++;
  players[playerId].devCardPlayedThisTurn = true;

  let newState: GameState = {
    ...state,
    players,
    phase: GamePhase.MovingRobber,
  };

  newState = log(newState, `${players[playerId].name} played a Knight!`);

  // Check for Largest Army (need 3+ knights and more than current holder)
  newState = updateLargestArmy(newState);

  return newState;
}

/**
 * Play the Road Building development card.
 *
 * Allows the player to place 2 roads for free.
 * Transitions to the RoadBuilding phase.
 *
 * @param state - Current game state
 * @returns New game state
 */
export function playRoadBuilding(state: GameState): GameState {
  const playerId = state.currentPlayerIndex;
  const players = clonePlayers(state.players);

  // Remove card from hand
  const cardIndex = players[playerId].devCards.indexOf(DevCardType.RoadBuilding);
  if (cardIndex === -1) return state;
  players[playerId].devCards.splice(cardIndex, 1);
  players[playerId].devCardPlayedThisTurn = true;

  let newState: GameState = {
    ...state,
    players,
    phase: GamePhase.RoadBuilding,
    roadBuildingRoadsLeft: 2,
  };

  newState = log(newState, `${players[playerId].name} played Road Building! Place 2 free roads.`);

  return newState;
}

/**
 * Play the Year of Plenty development card.
 *
 * Take any 2 resources from the bank (can be the same or different).
 *
 * @param state - Current game state
 * @param resource1 - First resource to take
 * @param resource2 - Second resource to take
 * @returns New game state
 */
export function playYearOfPlenty(
  state: GameState,
  resource1: ResourceType,
  resource2: ResourceType,
): GameState {
  const playerId = state.currentPlayerIndex;
  const players = clonePlayers(state.players);

  // Remove card from hand
  const cardIndex = players[playerId].devCards.indexOf(DevCardType.YearOfPlenty);
  if (cardIndex === -1) return state;
  players[playerId].devCards.splice(cardIndex, 1);
  players[playerId].devCardPlayedThisTurn = true;

  // Give 2 resources
  players[playerId].resources[resource1]++;
  players[playerId].resources[resource2]++;

  let newState: GameState = {
    ...state,
    players,
    phase: GamePhase.MainPhase,
  };

  newState = log(newState, `${players[playerId].name} played Year of Plenty — took ${resource1} and ${resource2}.`);

  return newState;
}

/**
 * Play the Monopoly development card.
 *
 * Take ALL of one resource type from ALL other players.
 *
 * @param state - Current game state
 * @param resource - The resource type to monopolize
 * @returns New game state
 */
export function playMonopoly(state: GameState, resource: ResourceType): GameState {
  const playerId = state.currentPlayerIndex;
  const players = clonePlayers(state.players);

  // Remove card from hand
  const cardIndex = players[playerId].devCards.indexOf(DevCardType.Monopoly);
  if (cardIndex === -1) return state;
  players[playerId].devCards.splice(cardIndex, 1);
  players[playerId].devCardPlayedThisTurn = true;

  // Take all of the chosen resource from other players
  let totalStolen = 0;
  for (const player of players) {
    if (player.id !== playerId) {
      const amount = player.resources[resource];
      totalStolen += amount;
      player.resources[resource] = 0;
    }
  }
  players[playerId].resources[resource] += totalStolen;

  let newState: GameState = {
    ...state,
    players,
    phase: GamePhase.MainPhase,
  };

  newState = log(newState, `${players[playerId].name} played Monopoly on ${resource} — stole ${totalStolen} cards!`);

  return newState;
}

// ─────────────────────────────────────────────────────
// TRADING
// ─────────────────────────────────────────────────────

/**
 * Get the best trade ratio available to a player for a specific resource.
 *
 * Default is 4:1 (trade 4 of any resource for 1 of another).
 * If the player has a settlement/city on a 3:1 port, they get 3:1.
 * If they're on a 2:1 port for that specific resource, they get 2:1.
 *
 * @param state - Current game state
 * @param playerId - Player doing the trading
 * @param resource - Resource being traded away
 * @returns Best available trade ratio (2, 3, or 4)
 */
export function getTradeRatio(state: GameState, playerId: number, resource: ResourceType): number {
  let bestRatio = 4; // Default 4:1 bank trade

  // Check all vertices where the player has a building
  for (const vertex of Object.values(state.vertices)) {
    if (vertex.building?.playerId === playerId && vertex.port) {
      if (vertex.port.resource === resource) {
        // Specific 2:1 port for this resource
        bestRatio = Math.min(bestRatio, 2);
      } else if (vertex.port.resource === 'any') {
        // Generic 3:1 port
        bestRatio = Math.min(bestRatio, 3);
      }
    }
  }

  return bestRatio;
}

/**
 * Execute a bank trade (maritime trade).
 *
 * The player trades `ratio` of one resource for 1 of another.
 * The ratio depends on port access (4:1 default, 3:1, or 2:1).
 *
 * @param state - Current game state
 * @param give - Resource to give
 * @param receive - Resource to receive
 * @returns New game state after trade
 */
export function tradeWithBank(
  state: GameState,
  give: ResourceType,
  receive: ResourceType,
): GameState {
  const playerId = state.currentPlayerIndex;
  const players = clonePlayers(state.players);
  const ratio = getTradeRatio(state, playerId, give);

  // Validate the player has enough
  if (players[playerId].resources[give] < ratio) {
    return log(state, `Not enough ${give} to trade!`);
  }

  // Execute the trade
  players[playerId].resources[give] -= ratio;
  players[playerId].resources[receive] += 1;

  let newState: GameState = { ...state, players };
  newState = log(newState, `${players[playerId].name} traded ${ratio} ${give} for 1 ${receive}.`);

  return newState;
}

// ─────────────────────────────────────────────────────
// END TURN
// ─────────────────────────────────────────────────────

/**
 * End the current player's turn and advance to the next player.
 *
 * This:
 * 1. Moves new dev cards to the playable hand (they couldn't be played the turn they were bought)
 * 2. Resets the dev-card-played flag
 * 3. Advances to the next player
 * 4. Sets phase to PreDice for the new player
 *
 * @param state - Current game state
 * @returns New game state for the next player's turn
 */
export function endTurn(state: GameState): GameState {
  const players = clonePlayers(state.players);
  const currentPlayer = players[state.currentPlayerIndex];

  // Move newly bought dev cards into the playable hand
  currentPlayer.devCards.push(...currentPlayer.newDevCards);
  currentPlayer.newDevCards = [];

  // Reset per-turn flags
  currentPlayer.devCardPlayedThisTurn = false;

  // Advance to next player
  const nextPlayerIndex = (state.currentPlayerIndex + 1) % players.length;

  // Increment turn number when it wraps back to player 0
  const turnNumber = nextPlayerIndex === 0 ? state.turnNumber + 1 : state.turnNumber;

  let newState: GameState = {
    ...state,
    players,
    currentPlayerIndex: nextPlayerIndex,
    phase: GamePhase.PreDice,
    diceRoll: null,
    turnNumber,
  };

  newState = log(newState, `${players[nextPlayerIndex].name}'s turn.`);

  return newState;
}

// ─────────────────────────────────────────────────────
// LONGEST ROAD (DFS)
// ─────────────────────────────────────────────────────

/**
 * Calculate the longest road length for a specific player.
 *
 * Uses depth-first search (DFS) with backtracking to find the
 * longest continuous path of roads. Key rules:
 * - Only follows edges with the player's roads
 * - Cannot pass through vertices with opponent's buildings
 *   (opponent settlements/cities break the road)
 * - Handles cycles correctly via edge-visited tracking
 *
 * The algorithm tries starting from every vertex connected to the
 * player's roads and returns the global maximum path length.
 *
 * @param state - Current game state
 * @param playerId - Player whose road to measure
 * @returns Length of the longest continuous road
 */
function calculateLongestRoad(state: GameState, playerId: number): number {
  // Collect all edges with this player's roads
  const playerEdgeIds = new Set<string>();
  for (const edge of Object.values(state.edges)) {
    if (edge.road?.playerId === playerId) {
      playerEdgeIds.add(edge.id);
    }
  }

  if (playerEdgeIds.size === 0) return 0;

  // Find all vertices that are endpoints of the player's roads
  const startVertices = new Set<string>();
  for (const edgeId of playerEdgeIds) {
    const edge = state.edges[edgeId];
    startVertices.add(edge.vertexIds[0]);
    startVertices.add(edge.vertexIds[1]);
  }

  /**
   * DFS helper: from a given vertex, find the longest path
   * using only the player's roads, without revisiting edges.
   */
  function dfs(vertexId: string, visitedEdges: Set<string>): number {
    let maxLength = 0;

    // Try each connected edge with our road
    const vertex = state.vertices[vertexId];
    for (const edgeId of vertex.adjacentEdgeIds) {
      // Must be our road and not yet visited in this path
      if (!playerEdgeIds.has(edgeId) || visitedEdges.has(edgeId)) continue;

      const edge = state.edges[edgeId];
      const nextVertexId = edge.vertexIds[0] === vertexId
        ? edge.vertexIds[1]
        : edge.vertexIds[0];

      // Mark edge as visited
      visitedEdges.add(edgeId);

      let pathLength = 1; // Count this edge

      // Can we continue past the next vertex?
      // Blocked if an opponent has a building there
      const nextBuilding = state.vertices[nextVertexId].building;
      if (!nextBuilding || nextBuilding.playerId === playerId) {
        // Continue exploring from the next vertex
        pathLength += dfs(nextVertexId, visitedEdges);
      }

      maxLength = Math.max(maxLength, pathLength);

      // Backtrack: unmark edge for other path explorations
      visitedEdges.delete(edgeId);
    }

    return maxLength;
  }

  // Try starting from every possible vertex and find the global max
  let globalMax = 0;
  for (const vertexId of startVertices) {
    const length = dfs(vertexId, new Set());
    globalMax = Math.max(globalMax, length);
  }

  return globalMax;
}

/**
 * Recalculate Longest Road for all players and update the holder.
 *
 * The Longest Road bonus (2 VP) goes to the first player to
 * build a continuous road of 5+ segments. If another player
 * later builds a longer road, they take the bonus.
 * If the holder's road is broken below 5, the bonus is removed
 * (and may go to another player with 5+).
 *
 * @param state - Current game state
 * @returns Updated game state with correct Longest Road assignment
 */
function updateLongestRoad(state: GameState): GameState {
  const players = clonePlayers(state.players);

  // Calculate road lengths for all players
  const roadLengths: Record<number, number> = {};
  for (const player of players) {
    roadLengths[player.id] = calculateLongestRoad(state, player.id);
  }

  // Find the longest road that's at least 5
  let longestPlayerId: number | null = null;
  let longestLength = 4; // Minimum is 5 to claim the bonus

  for (const player of players) {
    if (roadLengths[player.id] > longestLength) {
      longestLength = roadLengths[player.id];
      longestPlayerId = player.id;
    } else if (roadLengths[player.id] === longestLength && longestPlayerId !== null) {
      // Tie: the current holder keeps it
      if (state.longestRoadPlayerId === player.id) {
        longestPlayerId = player.id;
      }
    }
  }

  // Update player flags
  for (const player of players) {
    player.hasLongestRoad = player.id === longestPlayerId;
  }

  return {
    ...state,
    players,
    longestRoadPlayerId: longestPlayerId,
    longestRoadLength: longestPlayerId !== null ? longestLength : state.longestRoadLength,
  };
}

/**
 * Recalculate Largest Army and update the holder.
 *
 * The Largest Army bonus (2 VP) goes to the first player to
 * play 3+ Knight cards. If another player plays more knights,
 * they take the bonus.
 *
 * @param state - Current game state
 * @returns Updated game state with correct Largest Army assignment
 */
function updateLargestArmy(state: GameState): GameState {
  const players = clonePlayers(state.players);

  let largestPlayerId: number | null = null;
  let largestSize = 2; // Minimum is 3 to claim the bonus

  for (const player of players) {
    if (player.knightsPlayed > largestSize) {
      largestSize = player.knightsPlayed;
      largestPlayerId = player.id;
    } else if (player.knightsPlayed === largestSize && largestPlayerId !== null) {
      // Tie: current holder keeps it
      if (state.largestArmyPlayerId === player.id) {
        largestPlayerId = player.id;
      }
    }
  }

  // Update player flags
  for (const player of players) {
    player.hasLargestArmy = player.id === largestPlayerId;
  }

  return {
    ...state,
    players,
    largestArmyPlayerId: largestPlayerId,
    largestArmySize: largestPlayerId !== null ? largestSize : state.largestArmySize,
  };
}

// ─────────────────────────────────────────────────────
// VICTORY POINTS
// ─────────────────────────────────────────────────────

/**
 * Calculate total victory points for a player.
 *
 * VP sources:
 * - Settlements: 1 VP each
 * - Cities: 2 VP each
 * - Longest Road bonus: 2 VP
 * - Largest Army bonus: 2 VP
 * - Victory Point dev cards: 1 VP each
 *
 * @param state - Current game state
 * @param playerId - Player to calculate for
 * @returns Total victory points
 */
export function calculateVictoryPoints(state: GameState, playerId: number): number {
  let vp = 0;

  // Count buildings on the board
  for (const vertex of Object.values(state.vertices)) {
    if (vertex.building?.playerId === playerId) {
      vp += vertex.building.type === BuildingType.City ? 2 : 1;
    }
  }

  // Longest Road bonus
  if (state.players[playerId].hasLongestRoad) vp += 2;

  // Largest Army bonus
  if (state.players[playerId].hasLargestArmy) vp += 2;

  // Victory Point development cards
  vp += state.players[playerId].devCards.filter(
    c => c === DevCardType.VictoryPoint
  ).length;

  return vp;
}

/**
 * Check if any player has won the game (10+ VP).
 *
 * A player can only win on their own turn. If the current player
 * reaches 10+ VP, the game ends.
 *
 * @param state - Current game state
 * @returns State with winner set if someone won, unchanged otherwise
 */
function checkWinner(state: GameState): GameState {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const vp = calculateVictoryPoints(state, currentPlayer.id);

  if (vp >= VICTORY_POINTS_TO_WIN) {
    let newState: GameState = {
      ...state,
      phase: GamePhase.GameOver,
      winner: currentPlayer.id,
    };
    newState = log(newState, `🎉 ${currentPlayer.name} wins with ${vp} victory points!`);
    return newState;
  }

  return state;
}

// ─────────────────────────────────────────────────────
// QUERY HELPERS (for UI and AI)
// ─────────────────────────────────────────────────────

/**
 * Check if a player can build a road right now.
 * Requires resources, available pieces, and valid placement spots.
 */
export function canBuildRoad(state: GameState, playerId: number): boolean {
  const player = state.players[playerId];
  return (
    canAfford(player.resources, ROAD_COST) &&
    player.roadsLeft > 0 &&
    getValidRoadEdges(state, playerId).length > 0
  );
}

/**
 * Check if a player can build a settlement right now.
 */
export function canBuildSettlement(state: GameState, playerId: number): boolean {
  const player = state.players[playerId];
  return (
    canAfford(player.resources, SETTLEMENT_COST) &&
    player.settlementsLeft > 0 &&
    getValidSettlementVertices(state, playerId).length > 0
  );
}

/**
 * Check if a player can build a city right now.
 */
export function canBuildCity(state: GameState, playerId: number): boolean {
  const player = state.players[playerId];
  return (
    canAfford(player.resources, CITY_COST) &&
    player.citiesLeft > 0 &&
    getValidCityVertices(state, playerId).length > 0
  );
}

/**
 * Check if a player can buy a development card right now.
 */
export function canBuyDevCard(state: GameState, playerId: number): boolean {
  const player = state.players[playerId];
  return canAfford(player.resources, DEV_CARD_COST) && state.devCardDeck.length > 0;
}

/**
 * Check if a player can play a specific development card type.
 * Rules: can't play cards bought this turn, max 1 dev card per turn.
 */
export function canPlayDevCard(state: GameState, playerId: number, cardType: DevCardType): boolean {
  const player = state.players[playerId];

  // Can't play VP cards (they're passive)
  if (cardType === DevCardType.VictoryPoint) return false;

  // Can only play 1 dev card per turn
  if (player.devCardPlayedThisTurn) return false;

  // Must have the card in hand (not newDevCards)
  if (!player.devCards.includes(cardType)) return false;

  // Knights can be played before dice roll or during main phase
  if (cardType === DevCardType.Knight) {
    return state.phase === GamePhase.PreDice || state.phase === GamePhase.MainPhase;
  }

  // Other cards can only be played during main phase
  return state.phase === GamePhase.MainPhase;
}

/**
 * Get all possible bank trades for a player.
 * Returns array of {give, receive, ratio} options.
 */
export function getAvailableTrades(
  state: GameState,
  playerId: number,
): { give: ResourceType; receive: ResourceType; ratio: number }[] {
  const player = state.players[playerId];
  const trades: { give: ResourceType; receive: ResourceType; ratio: number }[] = [];

  for (const give of ALL_RESOURCES) {
    const ratio = getTradeRatio(state, playerId, give);
    if (player.resources[give] >= ratio) {
      for (const receive of ALL_RESOURCES) {
        if (give !== receive) {
          trades.push({ give, receive, ratio });
        }
      }
    }
  }

  return trades;
}
