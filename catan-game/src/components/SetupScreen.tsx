/**
 * =====================================================
 * SETTLERS OF CATAN - Setup Screen Component
 * =====================================================
 *
 * This component renders the game configuration screen shown
 * before the game starts. It allows the player to:
 *
 * 1. Enter their display name
 * 2. Choose the number of AI opponents (1-3)
 * 3. Start the game
 *
 * The component uses a simple form layout with Tailwind styling
 * and passes the configuration to the parent via the onStart callback.
 */

import { useState } from 'react';
import { GameConfig } from '../types';

/** Props for the SetupScreen component */
interface SetupScreenProps {
  /** Callback fired when the player clicks "Start Game" */
  onStart: (config: GameConfig) => void;
}

/**
 * Game setup screen component.
 *
 * Displays a centered card with:
 * - Game title and subtitle
 * - Player name input field
 * - AI opponent count selector (radio buttons)
 * - Start game button
 *
 * @param props - Component props
 */
export default function SetupScreen({ onStart }: SetupScreenProps) {
  // ── Local state for form inputs ──
  const [playerName, setPlayerName] = useState('Player');
  const [numAI, setNumAI] = useState(3);

  /**
   * Handle form submission.
   * Validates inputs and calls the onStart callback.
   */
  function handleStart() {
    onStart({
      playerName: playerName.trim() || 'Player',
      numAIPlayers: numAI,
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-cyan-900 flex items-center justify-center p-4">
      {/* Main card container */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 max-w-md w-full border border-white/20">
        {/* Title section */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-amber-400 mb-2 tracking-tight">
            CATAN
          </h1>
          <p className="text-blue-200 text-lg">
            Settlers of the Island
          </p>
        </div>

        {/* Player name input */}
        <div className="mb-6">
          <label
            htmlFor="playerName"
            className="block text-sm font-medium text-blue-200 mb-2"
          >
            Your Name
          </label>
          <input
            id="playerName"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            placeholder="Enter your name"
            maxLength={20}
          />
        </div>

        {/* Number of AI opponents selector */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-blue-200 mb-3">
            Number of Opponents
          </label>
          <div className="flex gap-3">
            {/* Radio button options for 1, 2, or 3 AI players */}
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setNumAI(n)}
                className={`flex-1 py-3 rounded-lg font-semibold text-lg transition-all duration-200 ${
                  numAI === n
                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {n} Bot{n > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Start game button */}
        <button
          onClick={handleStart}
          className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xl rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all duration-200 shadow-lg hover:shadow-xl hover:shadow-amber-500/30 active:scale-95"
        >
          Start Game
        </button>

        {/* Quick rules reminder */}
        <p className="text-blue-300/60 text-xs text-center mt-6">
          First to 10 victory points wins! Build settlements, roads,
          and cities to expand your empire.
        </p>
      </div>
    </div>
  );
}
