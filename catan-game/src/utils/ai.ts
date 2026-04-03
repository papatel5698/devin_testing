/**
 * =====================================================
 * SETTLERS OF CATAN - AI Opponent Logic
 * =====================================================
 *
 * This module implements the artificial intelligence for
 * computer-controlled opponents. The AI uses a priority-based
 * strategy system that evaluates board positions and makes
 * decisions based on resource availability and game state.
 *
 * AI Strategy Overview:
 * ─────────────────────
 * 1. SETUP PHASE: Choose the highest-value vertices based on
 *    resource diversity and number probability (pip count).
 *
 * 2. BUILDING PRIORITY (during main game):
 *    - Cities first (best VP per resource)
 *    - Settlements second (expand territory + VP)
 *    - Development cards (knights for Largest Army, VPs)
 *    - Roads (only if needed to reach a good settlement spot)
 *
 * 3. TRADING: Trade with the bank when it helps build something.
 *
 * 4. ROBBER: Place on the hex that hurts the leading opponent
 *    the most (highest probability, most buildings).
 *
 * 5. DEV CARDS: Play knights when helpful, save other cards
 *    for optimal moments.
 *
 * The AI operates asynchronously with delays between actions
 * so the human player can observe what's happening.
 */

import {
  GameState,
  GamePhase,
  ResourceType,
  DevCardType,
  ALL_RESOURCES,
  TERRAIN_TO_RESOURCE,
  ROAD_COST,
  SETTLEMENT_COST,
  CITY_COST,
  DEV_CARD_COST,
  emptyHand,
} from '../types';

import {
  getValidSetupSettlements,
  getValidSetupRoads,
  getValidSettlementVertices,
  getValidRoadEdges,
  getValidCityVertices,
  getValidRobberHexes,
  getStealTargets,
  canBuildRoad,
  canBuildSettlement,
  canBuildCity,
  canBuyDevCard,
  canPlayDevCard,
  totalCards,
  getAvailableTrades,
  calculateVictoryPoints,
  placeSetupSettlement,
  placeSetupRoad,
  rollDice,
  discardResources,
  moveRobber,
  stealResource,
  buildRoad,
  buildSettlement,
  buildCity,
  buyDevCard,
  playKnight,
  playRoadBuilding,
  playYearOfPlenty,
  playMonopoly,
  tradeWithBank,
  endTurn,
} from './game';

// ─────────────────────────────────────────────────────
// DELAY UTILITY
// ─────────────────────────────────────────────────────

/**
 * Wait for a specified number of milliseconds.
 * Used to add delays between AI actions so the human player
 * can follow what the AI is doing.
 *
 * @param ms - Milliseconds to wait
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Default delay between AI actions (milliseconds) */
const AI_DELAY = 600;

// ─────────────────────────────────────────────────────
// VERTEX EVALUATION
// ─────────────────────────────────────────────────────

/**
 * Calculate the "pip count" (probability dots) for a number token.
 *
 * In Catan, the probability of rolling a number is represented by dots:
 *   2→1, 3→2, 4→3, 5→4, 6→5, 8→5, 9→4, 10→3, 11→2, 12→1
 *
 * Higher pip count = higher probability of producing resources.
 *
 * @param num - The number token value (2-12)
 * @returns Number of probability dots (1-5)
 */
function pipCount(num: number): number {
  return 6 - Math.abs(7 - num);
}

/**
 * Evaluate a vertex's quality for settlement placement.
 *
 * Scoring factors:
 * 1. Total pip count of adjacent hexes (higher = more production)
 * 2. Resource diversity bonus (more unique resources = better)
 * 3. Rare resource bonus (ore and wheat are scarce and needed for cities)
 * 4. Port access bonus (if the vertex is on a harbor)
 *
 * @param state - Current game state
 * @param vertexId - Vertex to evaluate
 * @returns Numeric score (higher is better)
 */
function evaluateVertex(state: GameState, vertexId: string): number {
  const vertex = state.vertices[vertexId];
  let score = 0;
  const resources = new Set<ResourceType>();

  // Sum up pip counts from all adjacent hexes
  for (const hexId of vertex.adjacentHexIds) {
    const hex = state.hexes.find(h => h.id === hexId)!;
    const resource = TERRAIN_TO_RESOURCE[hex.terrain];

    if (resource && hex.numberToken) {
      const pips = pipCount(hex.numberToken);
      score += pips;
      resources.add(resource);

      // Bonus for ore and wheat (needed for cities and dev cards)
      if (resource === ResourceType.Ore || resource === ResourceType.Wheat) {
        score += pips * 0.3;
      }
    }
  }

  // Diversity bonus: more unique resources = more flexibility
  score += resources.size * 1.5;

  // Port access bonus
  if (vertex.port) {
    score += vertex.port.resource === 'any' ? 1.0 : 1.5;
  }

  return score;
}

// ─────────────────────────────────────────────────────
// SETUP PHASE AI
// ─────────────────────────────────────────────────────

/**
 * Choose the best vertex for settlement placement during setup.
 *
 * Evaluates all valid vertices and picks the highest-scoring one.
 * Uses a small random factor to add variety between games.
 *
 * @param state - Current game state
 * @returns Vertex ID to place the settlement
 */
function chooseSetupSettlement(state: GameState): string {
  const validVertices = getValidSetupSettlements(state);

  // Score each vertex and pick the best
  let bestVertex = validVertices[0];
  let bestScore = -Infinity;

  for (const vId of validVertices) {
    // Add small random factor for variety (±10%)
    const score = evaluateVertex(state, vId) * (0.9 + Math.random() * 0.2);
    if (score > bestScore) {
      bestScore = score;
      bestVertex = vId;
    }
  }

  return bestVertex;
}

/**
 * Choose the best edge for road placement during setup.
 *
 * Strategy: build toward the highest-value unoccupied vertex
 * that could be a future settlement location.
 *
 * @param state - Current game state
 * @returns Edge ID to place the road
 */
function chooseSetupRoad(state: GameState): string {
  const validEdges = getValidSetupRoads(state);

  // Score each edge based on the quality of the vertex it leads to
  let bestEdge = validEdges[0];
  let bestScore = -Infinity;

  for (const edgeId of validEdges) {
    const edge = state.edges[edgeId];

    // Score based on the "other" vertex (not the settlement)
    let score = 0;
    for (const vId of edge.vertexIds) {
      if (vId !== state.lastSetupSettlement) {
        score = evaluateVertex(state, vId);
      }
    }

    // Add randomness for variety
    score *= 0.9 + Math.random() * 0.2;

    if (score > bestScore) {
      bestScore = score;
      bestEdge = edgeId;
    }
  }

  return bestEdge;
}

// ─────────────────────────────────────────────────────
// ROBBER AI
// ─────────────────────────────────────────────────────

/**
 * Choose where to place the robber.
 *
 * Strategy: Place the robber on the hex that:
 * 1. Has the highest probability number (most damaging)
 * 2. Has buildings from the leading opponent
 * 3. Does NOT have our own buildings
 *
 * @param state - Current game state
 * @returns Hex ID to move the robber to
 */
function chooseRobberHex(state: GameState): string {
  const validHexes = getValidRobberHexes(state);
  const playerId = state.currentPlayerIndex;

  let bestHex = validHexes[0];
  let bestScore = -Infinity;

  for (const hexId of validHexes) {
    const hex = state.hexes.find(h => h.id === hexId)!;
    let score = 0;

    // Prefer hexes with high-probability numbers
    if (hex.numberToken) {
      score += pipCount(hex.numberToken);
    }

    // Check buildings around this hex
    let hasOwnBuilding = false;
    let opponentBuildingCount = 0;
    let maxOpponentVP = 0;

    for (const vId of hex.vertexIds) {
      const vertex = state.vertices[vId];
      if (vertex.building) {
        if (vertex.building.playerId === playerId) {
          hasOwnBuilding = true;
        } else {
          opponentBuildingCount++;
          const opVP = calculateVictoryPoints(state, vertex.building.playerId);
          maxOpponentVP = Math.max(maxOpponentVP, opVP);
        }
      }
    }

    // Strong penalty for blocking our own production
    if (hasOwnBuilding) score -= 20;

    // Bonus for blocking opponents, especially leading ones
    score += opponentBuildingCount * 3;
    score += maxOpponentVP * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestHex = hexId;
    }
  }

  return bestHex;
}

/**
 * Choose which player to steal from after moving the robber.
 *
 * Strategy: Steal from the player with the most victory points
 * (the biggest threat). Ties broken by resource count.
 *
 * @param state - Current game state
 * @returns Player ID to steal from
 */
function chooseStealTarget(state: GameState): number {
  const targets = getStealTargets(state);
  if (targets.length === 0) return -1;

  let bestTarget = targets[0];
  let bestScore = -Infinity;

  for (const targetId of targets) {
    const vp = calculateVictoryPoints(state, targetId);
    const cards = totalCards(state.players[targetId].resources);
    const score = vp * 10 + cards; // Prioritize VP leaders

    if (score > bestScore) {
      bestScore = score;
      bestTarget = targetId;
    }
  }

  return bestTarget;
}

// ─────────────────────────────────────────────────────
// DISCARD AI
// ─────────────────────────────────────────────────────

/**
 * Choose which resources to discard when rolling a 7.
 *
 * Strategy: Keep the most valuable resources (ore and wheat for
 * cities/dev cards) and discard the least useful excess.
 *
 * @param state - Current game state
 * @returns Resources to discard
 */
function chooseDiscard(state: GameState): Partial<typeof emptyHand> {
  const playerId = state.currentPlayerIndex;
  const hand = { ...state.players[playerId].resources };
  const currentTotal = totalCards(hand);
  const mustDiscard = Math.floor(currentTotal / 2);

  // Priority order for keeping resources (higher = keep)
  // Ore and wheat are most valuable for cities
  const keepPriority: Record<ResourceType, number> = {
    [ResourceType.Ore]: 5,
    [ResourceType.Wheat]: 4,
    [ResourceType.Sheep]: 3,
    [ResourceType.Wood]: 2,
    [ResourceType.Brick]: 2,
  };

  // Build a list of all resource cards, sorted by keep priority (lowest first)
  const cards: ResourceType[] = [];
  for (const res of ALL_RESOURCES) {
    for (let i = 0; i < hand[res]; i++) {
      cards.push(res);
    }
  }

  // Sort: lowest priority first (these get discarded first)
  cards.sort((a, b) => keepPriority[a] - keepPriority[b]);

  // Discard the first `mustDiscard` cards
  const toDiscard: Partial<Record<ResourceType, number>> = {};
  for (let i = 0; i < mustDiscard; i++) {
    const res = cards[i];
    toDiscard[res] = (toDiscard[res] ?? 0) + 1;
  }

  return toDiscard;
}

// ─────────────────────────────────────────────────────
// MAIN PHASE AI
// ─────────────────────────────────────────────────────

/**
 * Determine what the AI should do during the main phase.
 *
 * Priority order:
 * 1. Build a city (best VP efficiency)
 * 2. Build a settlement (1 VP + territory expansion)
 * 3. Buy a development card (knights, VPs)
 * 4. Build a road (only if it leads to a good settlement spot)
 * 5. Trade with the bank if it enables any of the above
 * 6. End turn if nothing useful can be done
 *
 * @param state - Current game state
 * @returns Action to take: { type, data }
 */
function chooseMainAction(state: GameState): { type: string; data?: unknown } {
  const playerId = state.currentPlayerIndex;
  const player = state.players[playerId];

  // 1. Try to build a city
  if (canBuildCity(state, playerId)) {
    const vertices = getValidCityVertices(state, playerId);
    // Prefer upgrading settlements on high-value hexes
    let bestVertex = vertices[0];
    let bestScore = -Infinity;
    for (const vId of vertices) {
      const score = evaluateVertex(state, vId);
      if (score > bestScore) {
        bestScore = score;
        bestVertex = vId;
      }
    }
    return { type: 'buildCity', data: bestVertex };
  }

  // 2. Try to build a settlement
  if (canBuildSettlement(state, playerId)) {
    const vertices = getValidSettlementVertices(state, playerId);
    let bestVertex = vertices[0];
    let bestScore = -Infinity;
    for (const vId of vertices) {
      const score = evaluateVertex(state, vId);
      if (score > bestScore) {
        bestScore = score;
        bestVertex = vId;
      }
    }
    return { type: 'buildSettlement', data: bestVertex };
  }

  // 3. Try to buy a development card
  if (canBuyDevCard(state, playerId)) {
    return { type: 'buyDevCard' };
  }

  // 4. Try to build a road (if we have resources and good spots to expand)
  if (canBuildRoad(state, playerId)) {
    const edges = getValidRoadEdges(state, playerId);
    // Build toward the best potential settlement vertex
    let bestEdge = edges[0];
    let bestScore = -Infinity;
    for (const edgeId of edges) {
      const edge = state.edges[edgeId];
      let score = 0;
      for (const vId of edge.vertexIds) {
        const v = state.vertices[vId];
        if (!v.building) {
          // Check if this could be a settlement (distance rule)
          const blocked = v.adjacentVertexIds.some(
            adjId => state.vertices[adjId].building !== null
          );
          if (!blocked) {
            score = Math.max(score, evaluateVertex(state, vId));
          }
        }
      }
      score *= 0.9 + Math.random() * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestEdge = edgeId;
      }
    }
    // Only build road if there's a reasonable target
    if (bestScore > 3) {
      return { type: 'buildRoad', data: bestEdge };
    }
  }

  // 5. Try trading with bank to enable building
  const trades = getAvailableTrades(state, playerId);
  if (trades.length > 0) {
    // Check what we need most
    const needs = getResourceNeeds(player);
    for (const need of needs) {
      const trade = trades.find(t => t.receive === need && t.give !== need);
      if (trade) {
        return { type: 'trade', data: { give: trade.give, receive: trade.receive } };
      }
    }
  }

  // 6. Nothing useful to do — end turn
  return { type: 'endTurn' };
}

/**
 * Determine which resources the AI needs most urgently.
 *
 * Checks building costs and returns resources the AI is missing,
 * ordered by priority (city resources first, then settlement, etc.)
 *
 * @param player - The AI player
 * @returns Array of needed resource types, ordered by priority
 */
function getResourceNeeds(player: { resources: Record<ResourceType, number> }): ResourceType[] {
  const needs: ResourceType[] = [];
  const hand = player.resources;

  // Check city cost first (highest priority)
  if ((CITY_COST[ResourceType.Ore] ?? 0) > hand[ResourceType.Ore]) {
    needs.push(ResourceType.Ore);
  }
  if ((CITY_COST[ResourceType.Wheat] ?? 0) > hand[ResourceType.Wheat]) {
    needs.push(ResourceType.Wheat);
  }

  // Then settlement cost
  for (const res of ALL_RESOURCES) {
    if ((SETTLEMENT_COST[res] ?? 0) > hand[res] && !needs.includes(res)) {
      needs.push(res);
    }
  }

  // Then dev card cost
  for (const res of ALL_RESOURCES) {
    if ((DEV_CARD_COST[res] ?? 0) > hand[res] && !needs.includes(res)) {
      needs.push(res);
    }
  }

  // Then road cost
  for (const res of ALL_RESOURCES) {
    if ((ROAD_COST[res] ?? 0) > hand[res] && !needs.includes(res)) {
      needs.push(res);
    }
  }

  return needs;
}

// ─────────────────────────────────────────────────────
// AI TURN EXECUTION
// ─────────────────────────────────────────────────────

/**
 * Execute a complete AI turn.
 *
 * This is the main entry point called by the game when it's an
 * AI player's turn. It handles all phases of the turn with delays
 * between actions so the human player can observe.
 *
 * The function uses a loop that continues until it's no longer
 * the AI's turn (either because the AI ended their turn, or
 * because the phase changed to require a different player's input).
 *
 * @param state - Current game state
 * @param setState - React state setter to update the UI after each action
 */
export async function executeAITurn(
  state: GameState,
  setState: (s: GameState) => void,
): Promise<void> {
  let current = state;

  // Safety counter to prevent infinite loops
  let iterations = 0;
  const MAX_ITERATIONS = 50;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const currentPlayer = current.players[current.currentPlayerIndex];

    // Only act if it's still an AI player's turn
    if (!currentPlayer.isAI) break;

    // Stop if game is over
    if (current.phase === GamePhase.GameOver) break;

    await delay(AI_DELAY);

    switch (current.phase) {
      // ── Setup: Place settlement ──
      case GamePhase.SetupSettlement: {
        const vertexId = chooseSetupSettlement(current);
        current = placeSetupSettlement(current, vertexId);
        setState(current);
        break;
      }

      // ── Setup: Place road ──
      case GamePhase.SetupRoad: {
        const edgeId = chooseSetupRoad(current);
        current = placeSetupRoad(current, edgeId);
        setState(current);
        break;
      }

      // ── Pre-dice: Consider playing a knight before rolling ──
      case GamePhase.PreDice: {
        // Play a knight if we have one and the robber is on our hex
        if (canPlayDevCard(current, currentPlayer.id, DevCardType.Knight)) {
          // Check if robber is on one of our hexes
          const robberOnOurs = current.hexes
            .find(h => h.id === current.robberHexId)
            ?.vertexIds.some(vId =>
              current.vertices[vId].building?.playerId === currentPlayer.id
            );

          if (robberOnOurs) {
            current = playKnight(current);
            setState(current);
            break;
          }
        }

        // Otherwise just roll the dice
        current = rollDice(current);
        setState(current);
        break;
      }

      // ── Discarding: Must discard half of cards ──
      case GamePhase.Discarding: {
        // Check if this AI needs to discard
        if (current.playersNeedToDiscard.includes(currentPlayer.id)) {
          const toDiscard = chooseDiscard(current);
          current = discardResources(current, currentPlayer.id, toDiscard);
          setState(current);
        } else {
          // Not our turn to discard - wait
          // Check if any AI in the discard list needs to go
          let handled = false;
          for (const pid of current.playersNeedToDiscard) {
            if (current.players[pid].isAI) {
              // Temporarily switch to handle this AI's discard
              const tempState = { ...current, currentPlayerIndex: pid };
              const toDiscard = chooseDiscard(tempState);
              current = discardResources(current, pid, toDiscard);
              setState(current);
              handled = true;
              break;
            }
          }
          if (!handled) {
            // Human needs to discard — stop AI loop
            return;
          }
        }
        break;
      }

      // ── Moving robber ──
      case GamePhase.MovingRobber: {
        const hexId = chooseRobberHex(current);
        current = moveRobber(current, hexId);
        setState(current);
        break;
      }

      // ── Stealing ──
      case GamePhase.Stealing: {
        const targetId = chooseStealTarget(current);
        if (targetId >= 0) {
          current = stealResource(current, targetId);
        } else {
          current = { ...current, phase: GamePhase.MainPhase };
        }
        setState(current);
        break;
      }

      // ── Main phase: Build, trade, or end turn ──
      case GamePhase.MainPhase: {
        // Try playing dev cards first
        if (!currentPlayer.devCardPlayedThisTurn) {
          // Play knight if we have one (for Largest Army)
          if (canPlayDevCard(current, currentPlayer.id, DevCardType.Knight) &&
              currentPlayer.knightsPlayed >= 2) {
            current = playKnight(current);
            setState(current);
            break;
          }

          // Play Road Building if we have it and need roads
          if (canPlayDevCard(current, currentPlayer.id, DevCardType.RoadBuilding) &&
              getValidRoadEdges(current, currentPlayer.id).length >= 2) {
            current = playRoadBuilding(current);
            setState(current);
            break;
          }

          // Play Year of Plenty for resources we need
          if (canPlayDevCard(current, currentPlayer.id, DevCardType.YearOfPlenty)) {
            const needs = getResourceNeeds(currentPlayer);
            if (needs.length >= 2) {
              current = playYearOfPlenty(current, needs[0], needs[1]);
              setState(current);
              break;
            } else if (needs.length === 1) {
              current = playYearOfPlenty(current, needs[0], needs[0]);
              setState(current);
              break;
            }
          }

          // Play Monopoly if we suspect others have a resource we need
          if (canPlayDevCard(current, currentPlayer.id, DevCardType.Monopoly)) {
            // Monopolize the resource that opponents have the most of
            let bestRes = ResourceType.Ore;
            let bestCount = 0;
            for (const res of ALL_RESOURCES) {
              let count = 0;
              for (const p of current.players) {
                if (p.id !== currentPlayer.id) {
                  count += p.resources[res];
                }
              }
              if (count > bestCount) {
                bestCount = count;
                bestRes = res;
              }
            }
            if (bestCount >= 3) {
              current = playMonopoly(current, bestRes);
              setState(current);
              break;
            }
          }
        }

        // Choose main action (build, trade, or end turn)
        const action = chooseMainAction(current);

        switch (action.type) {
          case 'buildCity':
            current = buildCity(current, action.data as string);
            setState(current);
            break;
          case 'buildSettlement':
            current = buildSettlement(current, action.data as string);
            setState(current);
            break;
          case 'buyDevCard':
            current = buyDevCard(current);
            setState(current);
            break;
          case 'buildRoad':
            current = buildRoad(current, action.data as string);
            setState(current);
            break;
          case 'trade': {
            const { give, receive } = action.data as { give: ResourceType; receive: ResourceType };
            current = tradeWithBank(current, give, receive);
            setState(current);
            break;
          }
          case 'endTurn':
            current = endTurn(current);
            setState(current);
            break;
        }
        break;
      }

      // ── Road Building card: place free roads ──
      case GamePhase.RoadBuilding: {
        const edges = getValidRoadEdges(current, currentPlayer.id);
        if (edges.length > 0) {
          // Pick the best road (same logic as setup)
          let bestEdge = edges[0];
          let bestScore = -Infinity;
          for (const edgeId of edges) {
            const edge = current.edges[edgeId];
            let score = 0;
            for (const vId of edge.vertexIds) {
              if (!current.vertices[vId].building) {
                score = Math.max(score, evaluateVertex(current, vId));
              }
            }
            if (score > bestScore) {
              bestScore = score;
              bestEdge = edgeId;
            }
          }
          current = buildRoad(current, bestEdge, true);
          setState(current);
        } else {
          // No valid edges — skip remaining roads
          current = { ...current, phase: GamePhase.MainPhase, roadBuildingRoadsLeft: 0 };
          setState(current);
        }
        break;
      }

      // ── Year of Plenty / Monopoly ──
      // These are handled inline in MainPhase above, but just in case:
      case GamePhase.YearOfPlenty: {
        const needs = getResourceNeeds(currentPlayer);
        const r1 = needs[0] ?? ResourceType.Ore;
        const r2 = needs[1] ?? r1;
        current = playYearOfPlenty(current, r1, r2);
        setState(current);
        break;
      }

      case GamePhase.Monopoly: {
        current = playMonopoly(current, ResourceType.Ore);
        setState(current);
        break;
      }

      default:
        // Unknown phase — bail out
        return;
    }
  }
}
