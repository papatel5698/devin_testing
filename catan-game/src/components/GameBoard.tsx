/**
 * =====================================================
 * SETTLERS OF CATAN - Game Board Component
 * =====================================================
 *
 * This component renders the hexagonal Catan board as an SVG.
 * It displays:
 *
 * 1. OCEAN BACKGROUND - Blue gradient behind the island
 * 2. HEX TILES - Colored hexagons with terrain textures
 * 3. NUMBER TOKENS - Circular tokens showing dice numbers
 * 4. PORTS - Harbor markers around the coast
 * 5. ROADS - Colored lines on edges (player pieces)
 * 6. SETTLEMENTS - Small house shapes on vertices
 * 7. CITIES - Larger structures on vertices
 * 8. ROBBER - Dark figure on the blocked hex
 * 9. INTERACTIVE HIGHLIGHTS - Clickable spots for valid moves
 *
 * The board is rendered as a single SVG element with layers
 * drawn in order (back to front) for correct visual stacking.
 */

import { useCallback } from 'react';
import {
  GameState,
  GamePhase,
  HexTile,
  Edge,
  BuildingType,
  ResourceType,
} from '../types';
import {
  cornersToSvgPoints,
  getTerrainColor,
  getResourceEmoji,
  getNumberDots,
  isRedNumber,
  SVG_SIZE,
} from '../utils/board';

// ─────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────

interface GameBoardProps {
  /** Current game state containing all board data */
  gameState: GameState;
  /** Vertex IDs that are valid for current action (highlighted) */
  validVertices: string[];
  /** Edge IDs that are valid for current action (highlighted) */
  validEdges: string[];
  /** Hex IDs that are valid for robber placement (highlighted) */
  validHexes: string[];
  /** Player IDs that can be stolen from (for steal phase) */
  stealTargets: number[];
  /** Callback when a vertex is clicked */
  onVertexClick: (vertexId: string) => void;
  /** Callback when an edge is clicked */
  onEdgeClick: (edgeId: string) => void;
  /** Callback when a hex is clicked (for robber) */
  onHexClick: (hexId: string) => void;
  /** Callback when a steal target player is selected */
  onStealClick: (playerId: number) => void;
}

// ─────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────

/**
 * Render a single hex tile with terrain color, number token,
 * and optional robber indicator.
 */
function HexTileView({
  hex,
  isValidForRobber,
  onClick,
}: {
  hex: HexTile;
  isValidForRobber: boolean;
  onClick: () => void;
}) {
  const color = getTerrainColor(hex.terrain);
  const points = cornersToSvgPoints(hex.corners);

  return (
    <g
      onClick={isValidForRobber ? onClick : undefined}
      style={{ cursor: isValidForRobber ? 'pointer' : 'default' }}
    >
      {/* Hex background */}
      <polygon
        points={points}
        fill={color}
        stroke="#4a3728"
        strokeWidth={2}
        opacity={isValidForRobber ? 1 : undefined}
      />

      {/* Hover highlight for robber placement */}
      {isValidForRobber && (
        <polygon
          points={points}
          fill="rgba(255,255,0,0.15)"
          stroke="#fbbf24"
          strokeWidth={2.5}
          strokeDasharray="6,3"
          className="animate-pulse"
        />
      )}

      {/* Number token (circular badge with the dice number) */}
      {hex.numberToken && (
        <g>
          {/* Token background circle */}
          <circle
            cx={hex.center.x}
            cy={hex.center.y}
            r={16}
            fill="#fef3c7"
            stroke="#92400e"
            strokeWidth={1.5}
          />
          {/* Number text */}
          <text
            x={hex.center.x}
            y={hex.center.y - 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={14}
            fontWeight="bold"
            fill={isRedNumber(hex.numberToken) ? '#dc2626' : '#1c1917'}
          >
            {hex.numberToken}
          </text>
          {/* Probability dots below the number */}
          <text
            x={hex.center.x}
            y={hex.center.y + 11}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={6}
            fill={isRedNumber(hex.numberToken) ? '#dc2626' : '#78716c'}
          >
            {'•'.repeat(getNumberDots(hex.numberToken))}
          </text>
        </g>
      )}

      {/* Robber indicator (dark circle with knight icon) */}
      {hex.hasRobber && (
        <g>
          <circle
            cx={hex.center.x}
            cy={hex.center.y}
            r={18}
            fill="rgba(0,0,0,0.7)"
            stroke="#fff"
            strokeWidth={1.5}
          />
          <text
            x={hex.center.x}
            y={hex.center.y + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={16}
          >
            🥷
          </text>
        </g>
      )}
    </g>
  );
}

/**
 * Render a road on an edge.
 * Roads are thick colored lines between two vertices.
 */
function RoadView({ edge, color }: { edge: Edge; color: string }) {
  return (
    <line
      x1={edge.endpoints[0].x}
      y1={edge.endpoints[0].y}
      x2={edge.endpoints[1].x}
      y2={edge.endpoints[1].y}
      stroke={color}
      strokeWidth={6}
      strokeLinecap="round"
    />
  );
}

/**
 * Render a settlement (small house shape) at a vertex.
 */
function SettlementView({ x, y, color }: { x: number; y: number; color: string }) {
  // Draw a small house shape: square base + triangular roof
  const size = 8;
  return (
    <g transform={`translate(${x},${y})`}>
      {/* House body */}
      <rect
        x={-size}
        y={-size / 2}
        width={size * 2}
        height={size * 1.5}
        fill={color}
        stroke="#1c1917"
        strokeWidth={1.5}
        rx={1}
      />
      {/* Roof */}
      <polygon
        points={`${-size - 2},${-size / 2} 0,${-size * 1.5} ${size + 2},${-size / 2}`}
        fill={color}
        stroke="#1c1917"
        strokeWidth={1.5}
      />
    </g>
  );
}

/**
 * Render a city (larger structure) at a vertex.
 */
function CityView({ x, y, color }: { x: number; y: number; color: string }) {
  const size = 10;
  return (
    <g transform={`translate(${x},${y})`}>
      {/* City base (wider than settlement) */}
      <rect
        x={-size}
        y={-size / 3}
        width={size * 2}
        height={size * 1.4}
        fill={color}
        stroke="#1c1917"
        strokeWidth={1.5}
        rx={1}
      />
      {/* Tower on top */}
      <rect
        x={-size / 2}
        y={-size * 1.2}
        width={size}
        height={size}
        fill={color}
        stroke="#1c1917"
        strokeWidth={1.5}
        rx={1}
      />
      {/* Tower roof */}
      <polygon
        points={`${-size / 2 - 2},${-size * 1.2} 0,${-size * 1.8} ${size / 2 + 2},${-size * 1.2}`}
        fill={color}
        stroke="#1c1917"
        strokeWidth={1.5}
      />
    </g>
  );
}

// ─────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────

/**
 * Main game board component.
 *
 * Renders the entire Catan board as an SVG with all game elements.
 * Handles click interactions for placing buildings and moving the robber.
 */
export default function GameBoard({
  gameState,
  validVertices,
  validEdges,
  validHexes,
  stealTargets,
  onVertexClick,
  onEdgeClick,
  onHexClick,
  onStealClick,
}: GameBoardProps) {
  const { hexes, vertices, edges, ports, players } = gameState;

  // ── Memoized helper to get player color ──
  const getPlayerColor = useCallback(
    (playerId: number) => players[playerId]?.color ?? '#888',
    [players]
  );

  return (
    <svg
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      className="w-full h-full max-h-screen"
      style={{ background: 'linear-gradient(135deg, #0c4a6e 0%, #164e63 50%, #0e7490 100%)' }}
    >
      {/* ── Layer 1: Ocean background ── */}
      <defs>
        <radialGradient id="ocean" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#0e7490" />
          <stop offset="100%" stopColor="#0c4a6e" />
        </radialGradient>
      </defs>
      <rect width={SVG_SIZE} height={SVG_SIZE} fill="url(#ocean)" />

      {/* ── Layer 2: Port indicators ── */}
      {ports.map((port, i) => (
        <g key={`port-${i}`}>
          {/* Port marker */}
          <circle
            cx={port.position.x}
            cy={port.position.y}
            r={14}
            fill="#fef3c7"
            stroke="#92400e"
            strokeWidth={1.5}
            opacity={0.9}
          />
          {/* Port label: ratio or resource emoji */}
          <text
            x={port.position.x}
            y={port.position.y + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={port.resource === 'any' ? 9 : 11}
            fontWeight="bold"
            fill="#78350f"
          >
            {port.resource === 'any'
              ? '3:1'
              : getResourceEmoji(port.resource as ResourceType)}
          </text>
          {/* Lines connecting port to its two vertices */}
          {port.vertexIds.map((vId, vi) => {
            const v = vertices[vId];
            return (
              <line
                key={vi}
                x1={port.position.x}
                y1={port.position.y}
                x2={v.position.x}
                y2={v.position.y}
                stroke="#92400e"
                strokeWidth={1.5}
                strokeDasharray="4,3"
                opacity={0.5}
              />
            );
          })}
        </g>
      ))}

      {/* ── Layer 3: Hex tiles ── */}
      {hexes.map((hex) => (
        <HexTileView
          key={hex.id}
          hex={hex}
          isValidForRobber={validHexes.includes(hex.id)}
          onClick={() => onHexClick(hex.id)}
        />
      ))}

      {/* ── Layer 4: Roads (built) ── */}
      {Object.values(edges)
        .filter((e) => e.road)
        .map((edge) => (
          <RoadView
            key={edge.id}
            edge={edge}
            color={getPlayerColor(edge.road!.playerId)}
          />
        ))}

      {/* ── Layer 5: Valid edge highlights (for road placement) ── */}
      {validEdges.map((edgeId) => {
        const edge = edges[edgeId];
        return (
          <line
            key={`valid-${edgeId}`}
            x1={edge.endpoints[0].x}
            y1={edge.endpoints[0].y}
            x2={edge.endpoints[1].x}
            y2={edge.endpoints[1].y}
            stroke="#fbbf24"
            strokeWidth={5}
            strokeLinecap="round"
            opacity={0.6}
            className="cursor-pointer animate-pulse"
            onClick={() => onEdgeClick(edgeId)}
          />
        );
      })}

      {/* ── Layer 6: Buildings (settlements and cities) ── */}
      {Object.values(vertices)
        .filter((v) => v.building)
        .map((vertex) => {
          const color = getPlayerColor(vertex.building!.playerId);
          if (vertex.building!.type === BuildingType.City) {
            return (
              <CityView
                key={vertex.id}
                x={vertex.position.x}
                y={vertex.position.y}
                color={color}
              />
            );
          }
          return (
            <SettlementView
              key={vertex.id}
              x={vertex.position.x}
              y={vertex.position.y}
              color={color}
            />
          );
        })}

      {/* ── Layer 7: Valid vertex highlights (for building placement) ── */}
      {validVertices.map((vId) => {
        const vertex = vertices[vId];
        return (
          <circle
            key={`valid-${vId}`}
            cx={vertex.position.x}
            cy={vertex.position.y}
            r={9}
            fill="rgba(251, 191, 36, 0.5)"
            stroke="#fbbf24"
            strokeWidth={2}
            className="cursor-pointer animate-pulse"
            onClick={() => onVertexClick(vId)}
          />
        );
      })}

      {/* ── Layer 8: Steal target indicators ── */}
      {gameState.phase === GamePhase.Stealing && stealTargets.length > 0 && (
        <g>
          {/* Show clickable targets near the robber hex */}
          {stealTargets.map((pid, i) => {
            const robberHex = hexes.find(h => h.id === gameState.robberHexId)!;
            const angle = (i / stealTargets.length) * Math.PI * 2 - Math.PI / 2;
            const x = robberHex.center.x + Math.cos(angle) * 40;
            const y = robberHex.center.y + Math.sin(angle) * 40;

            return (
              <g
                key={`steal-${pid}`}
                onClick={() => onStealClick(pid)}
                className="cursor-pointer"
              >
                <circle
                  cx={x}
                  cy={y}
                  r={16}
                  fill={getPlayerColor(pid)}
                  stroke="#fff"
                  strokeWidth={2}
                  className="animate-pulse"
                />
                <text
                  x={x}
                  y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10}
                  fill="#fff"
                  fontWeight="bold"
                >
                  Steal
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* ── Layer 9: Dice display ── */}
      {gameState.diceRoll && (
        <g>
          {/* Die 1 */}
          <rect
            x={SVG_SIZE / 2 - 38}
            y={10}
            width={32}
            height={32}
            rx={4}
            fill="white"
            stroke="#333"
            strokeWidth={1.5}
          />
          <text
            x={SVG_SIZE / 2 - 22}
            y={27}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={18}
            fontWeight="bold"
            fill="#1c1917"
          >
            {gameState.diceRoll[0]}
          </text>
          {/* Die 2 */}
          <rect
            x={SVG_SIZE / 2 + 6}
            y={10}
            width={32}
            height={32}
            rx={4}
            fill="white"
            stroke="#333"
            strokeWidth={1.5}
          />
          <text
            x={SVG_SIZE / 2 + 22}
            y={27}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={18}
            fontWeight="bold"
            fill="#1c1917"
          >
            {gameState.diceRoll[1]}
          </text>
        </g>
      )}
    </svg>
  );
}
