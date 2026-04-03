/**
 * =====================================================
 * SETTLERS OF CATAN - Main Application Component
 * =====================================================
 *
 * This is the root component of the Catan game. It manages:
 *
 * 1. GAME STATE LIFECYCLE
 *    - Shows SetupScreen before the game starts
 *    - Initializes the game when config is submitted
 *    - Manages the GameState via React useState
 *
 * 2. PLAYER INTERACTION ROUTING
 *    - Tracks which action the human is performing (building, trading, etc.)
 *    - Validates clicks on the board (vertices, edges, hexes)
 *    - Routes actions to the game logic engine
 *
 * 3. AI TURN ORCHESTRATION
 *    - Detects when it's an AI player's turn
 *    - Triggers async AI execution with delays
 *    - Locks human input during AI turns
 *
 * 4. LAYOUT
 *    - Left: Game board (SVG)
 *    - Right: Player panel (resources, actions, log)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GameState,
  GamePhase,
  GameConfig,
  ResourceType,
} from './types';
import {
  initializeGame,
  rollDice,
  placeSetupSettlement,
  placeSetupRoad,
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
  moveRobber,
  stealResource,
  discardResources,
  getValidSetupSettlements,
  getValidSetupRoads,
  getValidSettlementVertices,
  getValidRoadEdges,
  getValidCityVertices,
  getValidRobberHexes,
  getStealTargets,
} from './utils/game';
import { executeAITurn } from './utils/ai';
import SetupScreen from './components/SetupScreen';
import GameBoard from './components/GameBoard';
import PlayerPanel from './components/PlayerPanel';

// Interaction modes for the human player.
// Determines what clicking on the board does.
type InteractionMode =
  | 'none'           // No active interaction
  | 'buildRoad'      // Clicking an edge builds a road
  | 'buildSettlement' // Clicking a vertex builds a settlement
  | 'buildCity'      // Clicking a vertex upgrades to city
  | 'moveRobber'     // Clicking a hex moves the robber
  | 'steal';         // Clicking a player target steals

function App() {
  // Core state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [isAIPlaying, setIsAIPlaying] = useState(false);

  // Ref to track if AI is currently executing (prevents double-triggers)
  const aiRunningRef = useRef(false);

  // Derived state: compute valid positions based on game phase
  const validVertices: string[] = (() => {
    if (!gameState || isAIPlaying) return [];
    const { phase, currentPlayerIndex, players } = gameState;
    if (players[currentPlayerIndex].isAI) return [];

    switch (phase) {
      case GamePhase.SetupSettlement:
        return getValidSetupSettlements(gameState);
      case GamePhase.MainPhase:
        if (interactionMode === 'buildSettlement')
          return getValidSettlementVertices(gameState, currentPlayerIndex);
        if (interactionMode === 'buildCity')
          return getValidCityVertices(gameState, currentPlayerIndex);
        return [];
      default:
        return [];
    }
  })();

  const validEdges: string[] = (() => {
    if (!gameState || isAIPlaying) return [];
    const { phase, currentPlayerIndex, players } = gameState;
    if (players[currentPlayerIndex].isAI) return [];

    switch (phase) {
      case GamePhase.SetupRoad:
        return getValidSetupRoads(gameState);
      case GamePhase.MainPhase:
        if (interactionMode === 'buildRoad')
          return getValidRoadEdges(gameState, currentPlayerIndex);
        return [];
      case GamePhase.RoadBuilding:
        return getValidRoadEdges(gameState, currentPlayerIndex);
      default:
        return [];
    }
  })();

  const validHexes: string[] = (() => {
    if (!gameState || isAIPlaying) return [];
    const { phase, currentPlayerIndex, players } = gameState;
    if (players[currentPlayerIndex].isAI) return [];

    if (phase === GamePhase.MovingRobber) {
      return getValidRobberHexes(gameState);
    }
    return [];
  })();

  const stealTargets: number[] = (() => {
    if (!gameState || isAIPlaying) return [];
    const { phase, currentPlayerIndex, players } = gameState;
    if (players[currentPlayerIndex].isAI) return [];

    if (phase === GamePhase.Stealing) {
      return getStealTargets(gameState);
    }
    return [];
  })();

  // AI turn detection and execution
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === GamePhase.GameOver) return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    // Trigger AI if it's an AI player's turn (or an AI needs to discard)
    const shouldRunAI =
      currentPlayer.isAI ||
      (gameState.phase === GamePhase.Discarding &&
        gameState.playersNeedToDiscard.some(pid => gameState.players[pid].isAI));

    if (shouldRunAI && !aiRunningRef.current) {
      aiRunningRef.current = true;
      setIsAIPlaying(true);

      executeAITurn(gameState, (newState) => {
        setGameState(newState);
      }).then(() => {
        aiRunningRef.current = false;
        setIsAIPlaying(false);
      });
    }
  }, [gameState?.currentPlayerIndex, gameState?.phase, gameState?.playersNeedToDiscard]);

  // Game initialization
  const handleStartGame = useCallback((config: GameConfig) => {
    const state = initializeGame(config);
    setGameState(state);
  }, []);

  // Handle vertex click on the board (settlements, cities)
  const handleVertexClick = useCallback((vertexId: string) => {
    if (!gameState || isAIPlaying) return;
    const { phase } = gameState;

    if (phase === GamePhase.SetupSettlement) {
      setGameState(placeSetupSettlement(gameState, vertexId));
    } else if (phase === GamePhase.MainPhase) {
      if (interactionMode === 'buildSettlement') {
        setGameState(buildSettlement(gameState, vertexId));
        setInteractionMode('none');
      } else if (interactionMode === 'buildCity') {
        setGameState(buildCity(gameState, vertexId));
        setInteractionMode('none');
      }
    }
  }, [gameState, isAIPlaying, interactionMode]);

  // Handle edge click on the board (roads)
  const handleEdgeClick = useCallback((edgeId: string) => {
    if (!gameState || isAIPlaying) return;
    const { phase } = gameState;

    if (phase === GamePhase.SetupRoad) {
      setGameState(placeSetupRoad(gameState, edgeId));
    } else if (phase === GamePhase.MainPhase && interactionMode === 'buildRoad') {
      setGameState(buildRoad(gameState, edgeId));
      setInteractionMode('none');
    } else if (phase === GamePhase.RoadBuilding) {
      setGameState(buildRoad(gameState, edgeId, true));
    }
  }, [gameState, isAIPlaying, interactionMode]);

  // Handle hex click on the board (robber movement)
  const handleHexClick = useCallback((hexId: string) => {
    if (!gameState || isAIPlaying) return;
    if (gameState.phase === GamePhase.MovingRobber) {
      setGameState(moveRobber(gameState, hexId));
    }
  }, [gameState, isAIPlaying]);

  // Handle steal target click
  const handleStealClick = useCallback((playerId: number) => {
    if (!gameState || isAIPlaying) return;
    if (gameState.phase === GamePhase.Stealing) {
      setGameState(stealResource(gameState, playerId));
    }
  }, [gameState, isAIPlaying]);

  // Panel action handlers
  const handleRollDice = useCallback(() => {
    if (!gameState || isAIPlaying) return;
    setGameState(rollDice(gameState));
  }, [gameState, isAIPlaying]);

  const handleBuildRoad = useCallback(() => {
    setInteractionMode('buildRoad');
  }, []);

  const handleBuildSettlement = useCallback(() => {
    setInteractionMode('buildSettlement');
  }, []);

  const handleBuildCity = useCallback(() => {
    setInteractionMode('buildCity');
  }, []);

  const handleBuyDevCard = useCallback(() => {
    if (!gameState || isAIPlaying) return;
    setGameState(buyDevCard(gameState));
  }, [gameState, isAIPlaying]);

  const handlePlayKnight = useCallback(() => {
    if (!gameState || isAIPlaying) return;
    setGameState(playKnight(gameState));
  }, [gameState, isAIPlaying]);

  const handlePlayRoadBuilding = useCallback(() => {
    if (!gameState || isAIPlaying) return;
    setGameState(playRoadBuilding(gameState));
  }, [gameState, isAIPlaying]);

  const handlePlayYearOfPlenty = useCallback((r1: ResourceType, r2: ResourceType) => {
    if (!gameState || isAIPlaying) return;
    setGameState(playYearOfPlenty(gameState, r1, r2));
  }, [gameState, isAIPlaying]);

  const handlePlayMonopoly = useCallback((resource: ResourceType) => {
    if (!gameState || isAIPlaying) return;
    setGameState(playMonopoly(gameState, resource));
  }, [gameState, isAIPlaying]);

  const handleTradeWithBank = useCallback((give: ResourceType, receive: ResourceType) => {
    if (!gameState || isAIPlaying) return;
    setGameState(tradeWithBank(gameState, give, receive));
  }, [gameState, isAIPlaying]);

  const handleEndTurn = useCallback(() => {
    if (!gameState || isAIPlaying) return;
    setGameState(endTurn(gameState));
    setInteractionMode('none');
  }, [gameState, isAIPlaying]);

  const handleDiscard = useCallback((resources: Partial<Record<ResourceType, number>>) => {
    if (!gameState || isAIPlaying) return;
    setGameState(discardResources(gameState, 0, resources));
  }, [gameState, isAIPlaying]);

  // Show setup screen if no game is active
  if (!gameState) {
    return <SetupScreen onStart={handleStartGame} />;
  }

  return (
    <div className="h-screen w-screen flex bg-gray-900 overflow-hidden">
      {/* Left: Game Board */}
      <div className="flex-1 min-w-0 flex items-center justify-center p-2">
        <div className="w-full h-full max-w-3xl max-h-screen aspect-square">
          <GameBoard
            gameState={gameState}
            validVertices={validVertices}
            validEdges={validEdges}
            validHexes={validHexes}
            stealTargets={stealTargets}
            onVertexClick={handleVertexClick}
            onEdgeClick={handleEdgeClick}
            onHexClick={handleHexClick}
            onStealClick={handleStealClick}
          />
        </div>
      </div>

      {/* Right: Player Panel */}
      <div className="w-80 flex-shrink-0 border-l border-white/10">
        <PlayerPanel
          gameState={gameState}
          isAIPlaying={isAIPlaying}
          onRollDice={handleRollDice}
          onBuildRoad={handleBuildRoad}
          onBuildSettlement={handleBuildSettlement}
          onBuildCity={handleBuildCity}
          onBuyDevCard={handleBuyDevCard}
          onPlayKnight={handlePlayKnight}
          onPlayRoadBuilding={handlePlayRoadBuilding}
          onPlayYearOfPlenty={handlePlayYearOfPlenty}
          onPlayMonopoly={handlePlayMonopoly}
          onTradeWithBank={handleTradeWithBank}
          onEndTurn={handleEndTurn}
          onDiscard={handleDiscard}
        />
      </div>
    </div>
  );
}

export default App;
