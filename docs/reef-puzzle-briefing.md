# Coral Reef Puzzle Game — Claude Code Briefing

## What we're building

A 3D puzzle game played on the surface of a polyhedron. The polyhedron represents a coral reef structure. The player controls a diver who traverses the faces of the polyhedron and performs actions that change the state of multiple faces simultaneously. The goal is to reach a target configuration.

This is a mechanics-first build. No art, no shaders, no polish — just a working, playable puzzle loop.

---

## Core concepts

### Face state
Each face has a compound state represented as a cross product of small finite groups. For v1, keep it simple: each face has a single integer value in **Z_3** (i.e. 0, 1, or 2). Represent this as a color (e.g. three distinct flat colors). The cross-product structure should be designed in from the start even if v1 only uses one channel.

### Actions
The diver performs an action from its current position and facing. An action computes a **sparse delta map** — a set of `{ faceId -> increment }` pairs — and applies each increment modulo the group size. In v1, one action type: increment the current face plus the three adjacent faces in the faced direction, left of facing, and right of facing (i.e. a forward arc of three neighbors). The two remaining adjacent faces behind the diver are unaffected.

### Diver movement and facing
The diver has two components of state: a **position** (which face it occupies) and a **facing** (which of the face's edges it is oriented toward, pointing at one specific adjacent face). These are controlled independently:

- **Moving forward** shifts position to the adjacent face in the faced direction. On arrival, the new facing is set to the edge that is `floor(n/2)` steps clockwise from the entry edge in the destination face's cyclic edge order, where n is the number of edges on that face. For a pentagon this is 2 steps — consistently "roughly opposite" the way the diver came in. The player can always adjust with left/right after moving.
- **Rotating left/right** cycles the diver's facing among the edges of the current face without changing position.

The diver cannot teleport — movement is local. The combination of position and facing is central to puzzle design, as both must be considered before acting.

### Win condition
For v1: the puzzle is solved when all faces have the same value. Display a clear win state.

---

## Tech stack

- **React** — app shell and UI chrome
- **react-three-fiber** — 3D rendering
- **Three.js** — underlying 3D engine (via r3f)
- **Zustand** — centralized game state store
- **No backend** — everything runs client-side

---

## Architecture

### Engine (no UI, pure logic)
The engine should be framework-agnostic. It handles:

- Polyhedron topology: faces, vertices, edges, adjacency, and the cyclic edge order around each face
- `applyAction(state, actionType, faceId, facing) -> newState` — affects current face + forward arc of 3
- `moveDiver(state, targetFaceId) -> newState` (validates adjacency)
- `rotateDiver(state, direction: 'cw' | 'ccw') -> newState` (cycles facing among current face's edges)
- `getAdjacentFaces(faceId) -> FaceId[]`
- `getForwardArc(faceId, facing) -> [left: FaceId, forward: FaceId, right: FaceId]`
- `isSolved(state) -> boolean`
- `scramble(solvedState, nActions) -> scrambledState` — generate puzzles by applying n random actions from solved (guarantees solvability)
- Undo/redo history

### State store (Zustand)
Holds:
- Current polyhedron
- `faceValues: Record<FaceId, number>`
- `diverFaceId: FaceId`
- `diverFacing: EdgeId` — which edge of the current face the diver is oriented toward
- `selectedActionType` (just one in v1)
- `history` for undo/redo

### 3D view (react-three-fiber)
- Render dodecahedron mesh with per-face coloring driven by `faceValues`
- **Drag to rotate** — touch drag (or mouse drag) orbits the shape; this is the primary way the player examines the puzzle
- **No face-tapping for interaction** — all interaction goes through the button controls
- The diver's current face is highlighted visually (distinct outline or brightness)
- Adjacent faces in the forward arc are subtly highlighted at all times so the player can see what an action will affect
- A cone marker on the diver's current face, oriented to show facing direction

### Mobile-first UI layout
Design for portrait mobile as the primary target. The 3D view fills most of the screen. Controls sit at the bottom in two zones:

**Movement controls — a D-pad style arrow cluster:**
- **Forward arrow** — moves the diver to the adjacent face in the direction it is currently facing
- **Left arrow** — rotates the diver's facing one edge counterclockwise (no position change)
- **Right arrow** — rotates the diver's facing one edge clockwise (no position change)
- No backward arrow in v1 (the player can rotate 180° with two left/right taps)

**Action buttons — a set of icon buttons defined per puzzle:**
- Each puzzle declares one or more named actions with an icon
- Tapping an action button performs that action from the diver's current position and facing
- In v1 there is one action: increment the current face and forward arc by +1 mod 3
- The button set changes as new puzzle types are introduced, with no UI code changes needed

Keep all controls thumb-friendly. The forward arc faces should always be subtly highlighted so the player has constant feedback on what an action will affect.

---

## V1 scope

**In:**
- Single shape: dodecahedron (12 pentagonal faces, each adjacent to 5 others)
- Single action type: increment current face + the three faces in the forward arc (faced, left, right) by +1 mod 3
- Z_3 coloring (3 flat colors per face)
- D-pad arrow controls: forward (move), left/right (rotate facing)
- Puzzle-defined action buttons with icons; one action in v1
- Undo button

**Out (explicitly defer):**
- 2D net view
- Multiple polyhedra
- Multiple action types
- Compound/cross-product state (design for it, don't implement it yet)
- Art, textures, shaders, animations
- Scoring, timers, hints
- Saving/loading puzzles
- Multiplayer

---

## Data schemas

### Action type registry
Action types are defined once and referenced by id. Each declares how to compute its delta given the current topology, diver position, and facing.

```json
{
  "id": "arc_increment",
  "name": "Increment Arc",
  "icon": "wave",
  "targetKind": "diverArc",
  "delta": { "self": 1, "forward": 1, "left": 1, "right": 1 },
  "mod": 3
}
```

### Puzzle spec
A puzzle references action type ids from the registry rather than defining them inline.

```json
{
  "id": "puzzle_001",
  "polyhedronId": "dodecahedron",
  "group": { "kind": "Zmod", "mod": 3 },
  "actionIds": ["arc_increment"],
  "scrambleDepth": 10,
  "goalCondition": "allSame"
}
```

This means adding a new puzzle with the same mechanic is just a new JSON object pointing at the same action id. New action types only need to be written once.

---

## Extensibility notes (design for these, don't build yet)

- Polyhedra should be data-driven JSON packs (topology + 3D embedding) so new shapes can be added without changing engine code
- Action types should be registered functions with a common interface: `computeDelta(poly, state, faceId) -> Record<FaceId, number>`
- Face state should be structured to support cross products later: even if v1 is just `number`, use a wrapper type

---

## Starting point suggestion

1. Hardcode dodecahedron topology (20 vertices, 12 pentagonal faces, adjacency map, cyclic edge order per face — each face has exactly 5 neighbors)
2. Build engine logic with tests (`applyAction`, `moveDiver`, `rotateDiver`, `getForwardArc`, `isSolved`, `scramble`)
3. Wire Zustand store including `diverFacing`
4. Render dodecahedron in r3f with flat face colors, drag-to-rotate
5. Add diver marker with visible facing indicator (arrow or asymmetric shape) + Move mode with neighbor highlighting + tap to move
6. Add D-pad controls (forward, left, right); add puzzle-defined action button(s); add Undo
7. Highlight forward arc faces when idle to give player constant feedback on what Act will affect
8. Add scramble on load + win detection
9. Set viewport meta tag for mobile (`width=device-width, initial-scale=1`), test on portrait phone

---

## What this should feel like when it works

The player loads the game on their phone, sees a colored dodecahedron they can rotate by dragging. A diver with a visible facing arrow sits on one face, the three forward-arc faces subtly highlighted. They use the left/right arrows to orient the diver and the forward arrow to move it across the surface, then tap an action button to shift the current face and its forward arc. They work toward making all faces the same color. It feels like steering a character across a physical object.
