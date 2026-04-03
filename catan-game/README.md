# Settlers of Catan - Web Game

A fully-featured, browser-based implementation of **Settlers of Catan** built with React, TypeScript, and Tailwind CSS. Play against 1–3 AI opponents with complete Catan rules.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- npm (comes with Node.js)

### Installation

```bash
cd catan-game
npm install
```

### Running the Game

```bash
npm run dev
```

Open your browser to **http://localhost:5173** and start playing!

### Building for Production

```bash
npm run build
npm run preview
```

---

## How to Play

### Setup

1. **Enter your name** and choose the number of AI opponents (1–3).
2. Click **Start Game** to begin.

### Setup Phase (Placing Initial Settlements & Roads)

Each player places **2 settlements** and **2 roads** in alternating order:

- **Round 1**: Each player (starting with you) places one settlement, then one road.
- **Round 2**: In reverse order, each player places a second settlement and road.

During setup:
- **Green highlighted circles** show valid settlement locations. Click one to place your settlement.
- **Green highlighted lines** show valid road locations. Click one to place your road.
- AI opponents place their settlements and roads automatically.

After the second settlement, each player receives starting resources from the hexes adjacent to their second settlement.

### Main Game

Once setup is complete, the main game begins. On your turn:

1. **Roll Dice** — Click the "Roll Dice" button. All players with settlements or cities on hexes matching the roll receive resources.
2. **Build & Trade** — Use your resources to build roads, settlements, cities, or buy development cards. You can also trade with the bank.
3. **End Turn** — Click "End Turn" when you're done.

### Rolling a 7 (The Robber)

- Any player with **more than 7 resource cards** must discard half (rounded down).
- The current player **moves the robber** to a new hex (click a highlighted hex).
- Then **steals one random resource** from an opponent who has a settlement/city on that hex.

### Building

| Structure   | Cost                                  | Points |
|-------------|---------------------------------------|--------|
| Road        | 1 Brick + 1 Lumber                   | 0      |
| Settlement  | 1 Brick + 1 Lumber + 1 Wool + 1 Grain| 1 VP   |
| City        | 2 Grain + 3 Ore (upgrades settlement) | 2 VP   |
| Dev Card    | 1 Wool + 1 Grain + 1 Ore             | varies |

Click the corresponding **Build** button in the panel, then click a valid location (highlighted in green) on the board.

### Trading with the Bank

- **Default**: Trade 4 of one resource for 1 of any other.
- **3:1 Port**: If you have a settlement/city on a generic port, trade 3:1.
- **2:1 Port**: If you have a settlement/city on a resource-specific port, trade that resource 2:1.

Use the **Trade** section in the panel to select what you want to give and receive.

### Development Cards

Buy development cards during your turn. You **cannot play a card on the same turn you buy it** (except Victory Point cards, which are always revealed).

| Card            | Count | Effect                                              |
|-----------------|-------|------------------------------------------------------|
| Knight          | 14    | Move the robber and steal a resource                 |
| Victory Point   | 5     | +1 VP (revealed immediately)                         |
| Road Building   | 2     | Place 2 roads for free                               |
| Year of Plenty  | 2     | Take any 2 resources from the bank                   |
| Monopoly        | 2     | Name a resource; all opponents give you theirs        |

### Special Bonuses

- **Longest Road** (2 VP): Awarded to the first player with a continuous road of **5+ segments**. Another player can steal it by building a longer road.
- **Largest Army** (2 VP): Awarded to the first player who plays **3+ Knight cards**. Another player can steal it by playing more Knights.

### Winning

The first player to reach **10 Victory Points** wins! Points come from:
- Settlements (1 VP each)
- Cities (2 VP each)
- Longest Road bonus (2 VP)
- Largest Army bonus (2 VP)
- Victory Point development cards (1 VP each)

---

## Controls Reference

| Action               | How                                                           |
|----------------------|---------------------------------------------------------------|
| Place settlement     | Click a green-highlighted vertex on the board                 |
| Place road           | Click a green-highlighted edge on the board                   |
| Upgrade to city      | Click "Build City", then click one of your settlements        |
| Move robber          | Click a highlighted hex (after rolling 7 or playing Knight)   |
| Steal from player    | Click a player badge near the robber hex                      |
| Roll dice            | Click "Roll Dice" button                                      |
| Buy development card | Click "Buy Dev Card" button                                   |
| Play development card| Click the "Play" button next to a card in your hand           |
| Trade with bank      | Select resources in the Trade panel, click "Trade"            |
| End your turn        | Click "End Turn" button                                       |

---

## AI Opponents

The game includes 1–3 AI opponents with a priority-based strategy:

1. **Cities** — AI prioritizes upgrading settlements to cities for maximum VP.
2. **Settlements** — Builds new settlements at high-value locations.
3. **Development Cards** — Buys cards when it can afford them.
4. **Roads** — Builds toward good settlement spots.
5. **Trading** — AI trades with the bank when beneficial.

AI evaluates board positions using:
- **Pip count**: Probability of each number being rolled
- **Resource diversity**: Prefers access to all 5 resource types
- **Rare resource bonus**: Values ore and wheat highly
- **Port access**: Considers trade advantages

---

## Project Structure

```
catan-game/
├── src/
│   ├── types.ts              # All TypeScript interfaces and enums
│   ├── App.tsx               # Main app component, state management
│   ├── main.tsx              # React entry point
│   ├── index.css             # Tailwind CSS imports
│   ├── utils/
│   │   ├── board.ts          # Hex grid generation, vertex/edge math
│   │   ├── game.ts           # Game rules engine, state transitions
│   │   └── ai.ts             # AI decision-making logic
│   ├── components/
│   │   ├── SetupScreen.tsx   # Pre-game configuration screen
│   │   ├── GameBoard.tsx     # SVG board rendering
│   │   └── PlayerPanel.tsx   # Player info, actions, dev cards, log
│   └── lib/
│       └── utils.ts          # Tailwind cn() utility
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

---

## Game Rules Summary

This implementation follows the standard Settlers of Catan rules:

- **19 hex tiles**: 4 Lumber, 4 Wool, 4 Grain, 3 Brick, 3 Ore, 1 Desert
- **Number tokens**: Standard distribution (2–12, no 7), placed using the spiral pattern
- **9 ports**: 4 generic (3:1) + 5 resource-specific (2:1, one per resource type)
- **25 development cards**: 14 Knights, 5 VP, 2 Road Building, 2 Year of Plenty, 2 Monopoly
- **Building limits**: 5 settlements, 4 cities, 15 roads per player
- **Distance rule**: Settlements must be at least 2 edges apart
- **Road connectivity**: Roads must connect to your existing network (except during setup)
- **Robber**: Activated on a roll of 7, blocks resource production on its hex
- **Victory**: First to 10 VP wins

---

## Tech Stack

- **React 18** — UI framework
- **TypeScript** — Type-safe code
- **Vite** — Fast build tool and dev server
- **Tailwind CSS** — Utility-first styling
- **SVG** — Board rendering with layered graphics

No external game libraries — all game logic is implemented from scratch!
