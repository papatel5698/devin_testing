/**
 * =====================================================
 * SETTLERS OF CATAN - Player Panel Component
 * =====================================================
 *
 * This component renders the right-side panel showing:
 *
 * 1. PLAYER INFO - Name, color, victory points for all players
 * 2. CURRENT PLAYER RESOURCES - Card counts for each resource
 * 3. ACTION BUTTONS - Build, trade, dev cards, end turn
 * 4. DEVELOPMENT CARDS - Cards in hand with play buttons
 * 5. GAME LOG - Scrollable event history
 *
 * The panel adapts based on the current game phase:
 * - Setup: shows placement instructions
 * - PreDice: shows roll button and knight option
 * - MainPhase: shows all building/trading options
 * - Special phases: shows relevant controls
 */

import { useState } from 'react';
import {
  GameState,
  GamePhase,
  Player,
  ResourceType,
  DevCardType,
  ALL_RESOURCES,
} from '../types';
import {
  getResourceEmoji,
} from '../utils/board';
import {
  calculateVictoryPoints,
  canBuildRoad,
  canBuildSettlement,
  canBuildCity,
  canBuyDevCard,
  canPlayDevCard,
  totalCards,
  getAvailableTrades,
  getTradeRatio,
} from '../utils/game';

// ─────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────

interface PlayerPanelProps {
  /** Current game state */
  gameState: GameState;
  /** Whether the AI is currently taking actions (disables human input) */
  isAIPlaying: boolean;
  /** Callback to roll dice */
  onRollDice: () => void;
  /** Callback to start building a road (enters placement mode) */
  onBuildRoad: () => void;
  /** Callback to start building a settlement */
  onBuildSettlement: () => void;
  /** Callback to start building a city */
  onBuildCity: () => void;
  /** Callback to buy a development card */
  onBuyDevCard: () => void;
  /** Callback to play a knight card */
  onPlayKnight: () => void;
  /** Callback to play Road Building card */
  onPlayRoadBuilding: () => void;
  /** Callback to play Year of Plenty (resource1, resource2) */
  onPlayYearOfPlenty: (r1: ResourceType, r2: ResourceType) => void;
  /** Callback to play Monopoly (resource) */
  onPlayMonopoly: (resource: ResourceType) => void;
  /** Callback to execute a bank trade */
  onTradeWithBank: (give: ResourceType, receive: ResourceType) => void;
  /** Callback to end the current turn */
  onEndTurn: () => void;
  /** Callback to discard resources (when rolled 7) */
  onDiscard: (resources: Partial<Record<ResourceType, number>>) => void;
}

// ─────────────────────────────────────────────────────
// HELPER COMPONENTS
// ─────────────────────────────────────────────────────

/**
 * Compact player info row showing name, color, and VP count.
 */
function PlayerInfoRow({
  player,
  vp,
  isCurrent,
  cardCount,
}: {
  player: Player;
  vp: number;
  isCurrent: boolean;
  cardCount: number;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
        isCurrent ? 'bg-white/15 ring-1 ring-amber-400/50' : 'bg-white/5'
      }`}
    >
      {/* Player color indicator */}
      <div
        className="w-4 h-4 rounded-full flex-shrink-0 border border-white/30"
        style={{ backgroundColor: player.color }}
      />

      {/* Player name */}
      <span className={`flex-1 text-sm truncate ${isCurrent ? 'text-white font-semibold' : 'text-white/70'}`}>
        {player.name}
        {player.isAI ? ' 🤖' : ''}
      </span>

      {/* Badges for Longest Road / Largest Army */}
      {player.hasLongestRoad && (
        <span className="text-xs bg-amber-600/40 text-amber-200 px-1.5 py-0.5 rounded" title="Longest Road">
          🛤️
        </span>
      )}
      {player.hasLargestArmy && (
        <span className="text-xs bg-purple-600/40 text-purple-200 px-1.5 py-0.5 rounded" title="Largest Army">
          ⚔️
        </span>
      )}

      {/* Card count (hidden info for opponents) */}
      <span className="text-xs text-white/40" title="Cards in hand">
        🃏{cardCount}
      </span>

      {/* Victory points */}
      <span className={`text-sm font-bold ${isCurrent ? 'text-amber-400' : 'text-white/50'}`}>
        {vp} VP
      </span>
    </div>
  );
}

/**
 * Resource display showing emoji + count for one resource type.
 */
function ResourceBadge({
  resource,
  count,
}: {
  resource: ResourceType;
  count: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1 bg-white/10 rounded-lg px-3 py-2 min-w-0">
      <span className="text-lg">{getResourceEmoji(resource)}</span>
      <span className="text-white font-bold text-sm">{count}</span>
      <span className="text-white/40 text-xs capitalize truncate w-full text-center">
        {resource}
      </span>
    </div>
  );
}

/**
 * Dev card display showing card type and play button.
 */
function DevCardView({
  cardType,
  canPlay,
  onPlay,
}: {
  cardType: DevCardType;
  canPlay: boolean;
  onPlay: () => void;
}) {
  // Card display info
  const cardInfo: Record<DevCardType, { label: string; emoji: string }> = {
    [DevCardType.Knight]: { label: 'Knight', emoji: '⚔️' },
    [DevCardType.VictoryPoint]: { label: 'Victory Point', emoji: '⭐' },
    [DevCardType.RoadBuilding]: { label: 'Road Building', emoji: '🛤️' },
    [DevCardType.YearOfPlenty]: { label: 'Year of Plenty', emoji: '🌽' },
    [DevCardType.Monopoly]: { label: 'Monopoly', emoji: '💰' },
  };

  const info = cardInfo[cardType];

  return (
    <div className="flex items-center gap-2 bg-white/10 rounded px-2 py-1.5">
      <span>{info.emoji}</span>
      <span className="text-xs text-white/80 flex-1">{info.label}</span>
      {canPlay && (
        <button
          onClick={onPlay}
          className="text-xs bg-amber-500/80 hover:bg-amber-500 text-white px-2 py-0.5 rounded transition-colors"
        >
          Play
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// TRADE PANEL SUB-COMPONENT
// ─────────────────────────────────────────────────────

/**
 * Trade panel showing available bank trades.
 * Allows the player to select a resource to give and receive.
 */
function TradePanel({
  gameState,
  onTrade,
  onClose,
}: {
  gameState: GameState;
  onTrade: (give: ResourceType, receive: ResourceType) => void;
  onClose: () => void;
}) {
  const [giveResource, setGiveResource] = useState<ResourceType | null>(null);
  const playerId = gameState.currentPlayerIndex;
  const player = gameState.players[playerId];

  return (
    <div className="bg-white/10 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Bank Trade</span>
        <button
          onClick={onClose}
          className="text-white/50 hover:text-white text-sm"
        >
          ✕
        </button>
      </div>

      {/* Step 1: Choose resource to give */}
      <div>
        <span className="text-xs text-white/60">Give:</span>
        <div className="flex gap-1 mt-1">
          {ALL_RESOURCES.map((res) => {
            const ratio = getTradeRatio(gameState, playerId, res);
            const canTrade = player.resources[res] >= ratio;
            return (
              <button
                key={res}
                onClick={() => setGiveResource(res)}
                disabled={!canTrade}
                className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded text-xs transition-colors ${
                  giveResource === res
                    ? 'bg-amber-500/50 ring-1 ring-amber-400'
                    : canTrade
                    ? 'bg-white/10 hover:bg-white/20'
                    : 'bg-white/5 opacity-40 cursor-not-allowed'
                }`}
              >
                <span>{getResourceEmoji(res)}</span>
                <span className="text-white/60">{ratio}:1</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Choose resource to receive */}
      {giveResource && (
        <div>
          <span className="text-xs text-white/60">Receive:</span>
          <div className="flex gap-1 mt-1">
            {ALL_RESOURCES.filter((r) => r !== giveResource).map((res) => (
              <button
                key={res}
                onClick={() => {
                  onTrade(giveResource, res);
                  setGiveResource(null);
                }}
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded bg-white/10 hover:bg-green-500/30 text-xs transition-colors"
              >
                <span>{getResourceEmoji(res)}</span>
                <span className="text-white/60 capitalize">{res}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// DISCARD PANEL SUB-COMPONENT
// ─────────────────────────────────────────────────────

/**
 * Discard panel shown when a 7 is rolled and the player
 * has more than 7 cards. Shows resource selection controls.
 */
function DiscardPanel({
  gameState,
  onDiscard,
}: {
  gameState: GameState;
  onDiscard: (resources: Partial<Record<ResourceType, number>>) => void;
}) {
  // Always use player 0 (human) — discard panel is only shown for the human player.
  // When an AI rolls a 7, currentPlayerIndex may point to the AI, not the human.
  const playerId = 0;
  const player = gameState.players[playerId];
  const mustDiscard = Math.floor(totalCards(player.resources) / 2);

  const [toDiscard, setToDiscard] = useState<Record<ResourceType, number>>({
    [ResourceType.Wood]: 0,
    [ResourceType.Brick]: 0,
    [ResourceType.Wheat]: 0,
    [ResourceType.Ore]: 0,
    [ResourceType.Sheep]: 0,
  });

  const currentTotal = ALL_RESOURCES.reduce((sum, r) => sum + toDiscard[r], 0);

  return (
    <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-3 space-y-3">
      <div className="text-sm font-semibold text-red-300">
        Discard {mustDiscard} cards ({currentTotal}/{mustDiscard} selected)
      </div>

      <div className="space-y-1">
        {ALL_RESOURCES.map((res) => (
          <div key={res} className="flex items-center gap-2">
            <span className="text-sm w-16">{getResourceEmoji(res)} {res}</span>
            <span className="text-xs text-white/40">({player.resources[res]})</span>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() =>
                  setToDiscard((prev) => ({
                    ...prev,
                    [res]: Math.max(0, prev[res] - 1),
                  }))
                }
                disabled={toDiscard[res] === 0}
                className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white text-xs disabled:opacity-30"
              >
                -
              </button>
              <span className="text-sm w-4 text-center text-white">{toDiscard[res]}</span>
              <button
                onClick={() =>
                  setToDiscard((prev) => ({
                    ...prev,
                    [res]: Math.min(player.resources[res], prev[res] + 1),
                  }))
                }
                disabled={toDiscard[res] >= player.resources[res] || currentTotal >= mustDiscard}
                className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white text-xs disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => onDiscard(toDiscard)}
        disabled={currentTotal !== mustDiscard}
        className="w-full py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Confirm Discard
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// YEAR OF PLENTY / MONOPOLY DIALOGS
// ─────────────────────────────────────────────────────

/**
 * Resource picker for Year of Plenty card (choose 2 resources).
 */
function YearOfPlentyPicker({
  onChoose,
}: {
  onChoose: (r1: ResourceType, r2: ResourceType) => void;
}) {
  const [first, setFirst] = useState<ResourceType | null>(null);

  return (
    <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-3 space-y-2">
      <span className="text-sm font-semibold text-green-300">
        Year of Plenty — Choose {first ? '2nd' : '1st'} resource:
      </span>
      <div className="flex gap-1">
        {ALL_RESOURCES.map((res) => (
          <button
            key={res}
            onClick={() => {
              if (first) {
                onChoose(first, res);
              } else {
                setFirst(res);
              }
            }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded transition-colors ${
              first === res
                ? 'bg-green-500/40 ring-1 ring-green-400'
                : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            <span>{getResourceEmoji(res)}</span>
            <span className="text-xs text-white/60 capitalize">{res}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Resource picker for Monopoly card (choose 1 resource).
 */
function MonopolyPicker({
  onChoose,
}: {
  onChoose: (resource: ResourceType) => void;
}) {
  return (
    <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-3 space-y-2">
      <span className="text-sm font-semibold text-purple-300">
        Monopoly — Choose a resource to take from all players:
      </span>
      <div className="flex gap-1">
        {ALL_RESOURCES.map((res) => (
          <button
            key={res}
            onClick={() => onChoose(res)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded bg-white/10 hover:bg-purple-500/30 transition-colors"
          >
            <span>{getResourceEmoji(res)}</span>
            <span className="text-xs text-white/60 capitalize">{res}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────

export default function PlayerPanel({
  gameState,
  isAIPlaying,
  onRollDice,
  onBuildRoad,
  onBuildSettlement,
  onBuildCity,
  onBuyDevCard,
  onPlayKnight,
  onPlayRoadBuilding,
  onPlayYearOfPlenty,
  onPlayMonopoly,
  onTradeWithBank,
  onEndTurn,
  onDiscard,
}: PlayerPanelProps) {
  const [showTrade, setShowTrade] = useState(false);
  const [showYoP, setShowYoP] = useState(false);
  const [showMonopoly, setShowMonopoly] = useState(false);

  const { players, currentPlayerIndex, phase } = gameState;
  const currentPlayer = players[currentPlayerIndex];
  const isHumanTurn = !currentPlayer.isAI && !isAIPlaying;

  // Determine phase-specific status message
  const statusMessage = (() => {
    switch (phase) {
      case GamePhase.SetupSettlement:
        return `${currentPlayer.name}: Place a settlement`;
      case GamePhase.SetupRoad:
        return `${currentPlayer.name}: Place a road`;
      case GamePhase.PreDice:
        return `${currentPlayer.name}: Roll the dice`;
      case GamePhase.Discarding:
        return 'Discard half your cards (rolled a 7)';
      case GamePhase.MovingRobber:
        return `${currentPlayer.name}: Move the robber`;
      case GamePhase.Stealing:
        return `${currentPlayer.name}: Choose who to steal from`;
      case GamePhase.MainPhase:
        return `${currentPlayer.name}: Build, trade, or end turn`;
      case GamePhase.RoadBuilding:
        return `Place ${gameState.roadBuildingRoadsLeft} free road(s)`;
      case GamePhase.YearOfPlenty:
        return 'Choose 2 resources from the bank';
      case GamePhase.Monopoly:
        return 'Choose a resource to monopolize';
      case GamePhase.GameOver:
        return `🎉 ${players[gameState.winner!]?.name} wins!`;
      default:
        return '';
    }
  })();

  return (
    <div className="flex flex-col h-full bg-gray-900/80 text-white overflow-hidden">
      {/* ── Status bar ── */}
      <div className="px-4 py-2 bg-amber-900/40 border-b border-amber-700/30">
        <div className="text-sm font-semibold text-amber-200">
          Turn {gameState.turnNumber} • {statusMessage}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ── Player list ── */}
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Players</h3>
          {players.map((player) => (
            <PlayerInfoRow
              key={player.id}
              player={player}
              vp={calculateVictoryPoints(gameState, player.id)}
              isCurrent={player.id === currentPlayerIndex}
              cardCount={totalCards(player.resources) + player.devCards.length + player.newDevCards.length}
            />
          ))}
        </div>

        {/* ── Human player's resources ── */}
        {!players[0].isAI && (
          <div>
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Your Resources ({totalCards(players[0].resources)} cards)
            </h3>
            <div className="grid grid-cols-5 gap-1">
              {ALL_RESOURCES.map((res) => (
                <ResourceBadge
                  key={res}
                  resource={res}
                  count={players[0].resources[res]}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Discard panel (when needed) ── */}
        {phase === GamePhase.Discarding &&
          gameState.playersNeedToDiscard.includes(0) &&
          !players[0].isAI && (
            <DiscardPanel gameState={gameState} onDiscard={onDiscard} />
          )}

        {/* ── Year of Plenty picker ── */}
        {showYoP && (
          <YearOfPlentyPicker
            onChoose={(r1, r2) => {
              onPlayYearOfPlenty(r1, r2);
              setShowYoP(false);
            }}
          />
        )}

        {/* ── Monopoly picker ── */}
        {showMonopoly && (
          <MonopolyPicker
            onChoose={(res) => {
              onPlayMonopoly(res);
              setShowMonopoly(false);
            }}
          />
        )}

        {/* ── Action buttons ── */}
        {isHumanTurn && phase !== GamePhase.GameOver && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Actions</h3>

            {/* Roll dice button */}
            {phase === GamePhase.PreDice && (
              <button
                onClick={onRollDice}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all active:scale-95 shadow-lg"
              >
                🎲 Roll Dice
              </button>
            )}

            {/* Main phase actions */}
            {phase === GamePhase.MainPhase && (
              <div className="grid grid-cols-2 gap-2">
                {/* Build Road */}
                <button
                  onClick={onBuildRoad}
                  disabled={!canBuildRoad(gameState, currentPlayerIndex)}
                  className="py-2 px-3 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
                >
                  <div className="font-semibold">🛤️ Road</div>
                  <div className="text-xs text-white/50">🪵+🧱</div>
                </button>

                {/* Build Settlement */}
                <button
                  onClick={onBuildSettlement}
                  disabled={!canBuildSettlement(gameState, currentPlayerIndex)}
                  className="py-2 px-3 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
                >
                  <div className="font-semibold">🏠 Settlement</div>
                  <div className="text-xs text-white/50">🪵🧱🌾🐑</div>
                </button>

                {/* Build City */}
                <button
                  onClick={onBuildCity}
                  disabled={!canBuildCity(gameState, currentPlayerIndex)}
                  className="py-2 px-3 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
                >
                  <div className="font-semibold">🏙️ City</div>
                  <div className="text-xs text-white/50">🌾🌾⛰️⛰️⛰️</div>
                </button>

                {/* Buy Dev Card */}
                <button
                  onClick={onBuyDevCard}
                  disabled={!canBuyDevCard(gameState, currentPlayerIndex)}
                  className="py-2 px-3 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
                >
                  <div className="font-semibold">🃏 Dev Card</div>
                  <div className="text-xs text-white/50">🌾⛰️🐑</div>
                </button>

                {/* Trade */}
                <button
                  onClick={() => setShowTrade(!showTrade)}
                  disabled={getAvailableTrades(gameState, currentPlayerIndex).length === 0}
                  className="py-2 px-3 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
                >
                  <div className="font-semibold">🔄 Trade</div>
                  <div className="text-xs text-white/50">Bank trade</div>
                </button>

                {/* End Turn */}
                <button
                  onClick={onEndTurn}
                  className="py-2 px-3 bg-red-900/40 hover:bg-red-900/60 rounded-lg text-sm transition-colors text-left"
                >
                  <div className="font-semibold">⏭️ End Turn</div>
                  <div className="text-xs text-white/50">Pass</div>
                </button>
              </div>
            )}

            {/* Road Building phase */}
            {phase === GamePhase.RoadBuilding && (
              <div className="text-sm text-amber-300 bg-amber-900/30 rounded-lg p-3">
                Click a valid edge on the board to place a free road.
                ({gameState.roadBuildingRoadsLeft} remaining)
              </div>
            )}
          </div>
        )}

        {/* ── Trade panel ── */}
        {showTrade && phase === GamePhase.MainPhase && isHumanTurn && (
          <TradePanel
            gameState={gameState}
            onTrade={(give, receive) => {
              onTradeWithBank(give, receive);
            }}
            onClose={() => setShowTrade(false)}
          />
        )}

        {/* ── Development cards in hand ── */}
        {!players[0].isAI && players[0].devCards.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Dev Cards ({players[0].devCards.length})
            </h3>
            <div className="space-y-1">
              {players[0].devCards.map((card, i) => (
                <DevCardView
                  key={`${card}-${i}`}
                  cardType={card}
                  canPlay={
                    isHumanTurn &&
                    (phase === GamePhase.PreDice || phase === GamePhase.MainPhase) &&
                    canPlayDevCard(gameState, 0, card)
                  }
                  onPlay={() => {
                    switch (card) {
                      case DevCardType.Knight:
                        onPlayKnight();
                        break;
                      case DevCardType.RoadBuilding:
                        onPlayRoadBuilding();
                        break;
                      case DevCardType.YearOfPlenty:
                        setShowYoP(true);
                        break;
                      case DevCardType.Monopoly:
                        setShowMonopoly(true);
                        break;
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Show new (unplayable) dev cards */}
        {!players[0].isAI && players[0].newDevCards.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              New Cards (playable next turn)
            </h3>
            <div className="space-y-1">
              {players[0].newDevCards.map((card, i) => (
                <DevCardView
                  key={`new-${card}-${i}`}
                  cardType={card}
                  canPlay={false}
                  onPlay={() => {}}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Game Log ── */}
        <div>
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
            Game Log
          </h3>
          <div className="bg-black/30 rounded-lg p-2 max-h-48 overflow-y-auto text-xs space-y-0.5">
            {gameState.gameLog.slice(-30).map((msg, i) => (
              <div key={i} className="text-white/60 leading-relaxed">
                {msg}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
