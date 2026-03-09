# Coral Reef Puzzle — Implementation Guide

## Overview

A mobile-first 3D puzzle game on a dodecahedron surface. React + react-three-fiber frontend, Zustand state, pure logic engine. No backend. No art polish. Working puzzle loop only.

---

## Project Setup

```bash
npx create-next-app@latest . --typescript --app --no-src-dir --no-tailwind --eslint
npm install three @react-three/fiber @react-three/drei zustand
npm install -D @types/three jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom ts-jest
```

Next.js includes the viewport meta tag by default. To explicitly set it, export a `viewport` object from `app/layout.tsx`:
```ts
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};
```

**Important r3f note:** react-three-fiber uses browser APIs and must run client-side. Mark the top-level game component (and any component using `Canvas`) with `'use client'`.

---

## Directory Structure

```
app/
  layout.tsx              # root layout, viewport config
  page.tsx                # renders <Game /> (server component shell)
engine/
  dodecahedron.ts         # hardcoded topology: faces, vertices, adjacency, cyclic edge order
  types.ts                # FaceId, EdgeId, DiverState, FaceValues, GameState, ActionTypeDef
  engine.ts               # pure functions: applyAction, moveDiver, rotateDiver, getForwardArc, isSolved, scramble
  engine.test.ts          # unit tests for all engine functions
store/
  gameStore.ts            # Zustand store wiring engine + history
components/
  Game.tsx                # 'use client' root — composes Scene + Controls + WinOverlay
  Scene.tsx               # 'use client' r3f Canvas, camera, lights, OrbitControls
  Dodecahedron.tsx        # mesh with per-face coloring, diver marker, arc highlights
  Controls.tsx            # D-pad + action buttons layout
  WinOverlay.tsx          # win state display
data/
  actionTypes.ts          # arc_increment definition
  puzzles.ts              # puzzle_001 spec
```

---

## Key Types (`src/engine/types.ts`)

```ts
type FaceId = number;       // 0–11 for dodecahedron
type EdgeId = number;       // local index 0–4 within a face (cyclic)

// Face state: wrapper supports cross-product extension later
type FaceState = { value: number };   // Z_3 for v1

type FaceValues = Record<FaceId, FaceState>;

type DiverState = {
  faceId: FaceId;
  facing: EdgeId;   // which local edge of current face diver faces
};

type GameState = {
  faceValues: FaceValues;
  diver: DiverState;
};

type ActionTypeDef = {
  id: string;
  name: string;
  icon: string;
  targetKind: 'diverArc';
  delta: { self: number; forward: number; left: number; right: number };
  mod: number;
};

type PuzzleSpec = {
  id: string;
  polyhedronId: string;
  group: { kind: 'Zmod'; mod: number };
  actionIds: string[];
  scrambleDepth: number;
  goalCondition: 'allSame';
};
```

---

## Dodecahedron Topology (`src/engine/dodecahedron.ts`)

The dodecahedron has **12 pentagonal faces**, each adjacent to exactly **5 others**.

### Adjacency + cyclic edge order

Each face has 5 neighbors. The cyclic edge order is the list of neighbor face IDs in clockwise order when the face is viewed from outside. This order defines:
- `EdgeId 0` = first neighbor in that cyclic list
- `EdgeId 1` = second neighbor, etc.

Hardcode the full adjacency map. Use the standard dodecahedron face-adjacency (can be derived from Three.js `DodecahedronGeometry` or the known combinatorial structure).

**Key requirement:** for each face, store `adjacency[faceId]: FaceId[]` as an ordered cyclic array of length 5 so that `adjacency[faceId][edgeId]` gives the neighbor in the direction of `edgeId`.

Also provide `3D face center positions` and `face normal vectors` (unit vectors pointing outward per face) for rendering the diver marker.

---

## Engine Functions (`src/engine/engine.ts`)

All functions are **pure** — they take state and return new state. No mutation.

### `getAdjacentFaces(faceId) -> FaceId[]`
Returns the 5 neighbors of a face in cyclic edge order.

### `getForwardArc(faceId, facing) -> { left: FaceId, forward: FaceId, right: FaceId }`
- `forward` = `adjacency[faceId][facing]`
- `left` = `adjacency[faceId][(facing + 4) % 5]` (one step CCW = left)
- `right` = `adjacency[faceId][(facing + 1) % 5]` (one step CW = right)

### `applyAction(state, actionDef) -> GameState`
Computes the delta map from `actionDef.delta` using `getForwardArc`, then increments each face's value by the delta mod `actionDef.mod`. Returns new `faceValues` with updated values.

### `moveDiver(state) -> GameState`
Moves diver from `state.diver.faceId` to `adjacency[faceId][facing]` (the forward face).

On arrival, compute the new facing in the destination face:
1. Find the entry edge in the destination face: the edge index in the destination's adjacency array that points back to the origin face.
2. New facing = `(entryEdge + floor(5/2)) % 5` = `(entryEdge + 2) % 5`.

### `rotateDiver(state, direction: 'cw' | 'ccw') -> GameState`
- `cw`: `facing = (facing + 1) % 5`
- `ccw`: `facing = (facing + 4) % 5`

### `isSolved(state) -> boolean`
All `faceValues[i].value` are equal.

### `scramble(solvedState, nActions, actionDef) -> GameState`
Apply `nActions` random `applyAction` + optional random `moveDiver`/`rotateDiver` calls from the solved state. This guarantees solvability. Return the scrambled state with diver at some face/facing.

Simple approach: just apply `nActions` random `applyAction` calls (random diver positions) without moving the diver, then place diver at a random face with random facing for the start position.

---

## Zustand Store (`src/store/gameStore.ts`)

```ts
type StoreState = {
  gameState: GameState;
  puzzle: PuzzleSpec;
  history: GameState[];   // for undo
  future: GameState[];    // for redo (optional v1)

  // actions
  act: () => void;                          // apply current action from diver pos/facing
  moveForward: () => void;
  rotateLeft: () => void;
  rotateRight: () => void;
  undo: () => void;
  newGame: () => void;
};
```

History pattern: before each mutating operation, push current `gameState` onto `history`. Undo pops from `history`.

---

## 3D Rendering (`src/components/Dodecahedron.tsx`)

Use `THREE.DodecahedronGeometry`. Three.js generates this geometry with known face grouping.

**Per-face coloring:** Three.js `DodecahedronGeometry` does not natively support per-face material groups easily. Best approach:
- Use a custom `BufferGeometry` built from the hardcoded topology (vertices + face index lists).
- Assign `materialIndex` per face group in the geometry.
- Use `meshFaceMaterial` (array of `MeshBasicMaterial` with the Z_3 colors).

**Z_3 colors:** e.g. `['#4a9eff', '#ff6b4a', '#4aff8c']` — blue, orange, green.

**Diver marker:** A cone mesh placed at the face center, oriented along the face normal, rotated to show facing direction. Compute the facing direction as the vector from face center toward the midpoint of the faced edge.

**Face highlights:**
- Current face: brighter/outlined (use `MeshBasicMaterial` with emissive boost or a slightly scaled duplicate mesh)
- Forward arc (left, forward, right): subtle highlight tint

**Drag to rotate:** Use `@react-three/drei`'s `<OrbitControls>` — it handles mouse drag and touch drag out of the box. Disable zoom if desired.

---

## UI Controls (`src/components/Controls.tsx`)

Mobile-first layout. Fixed at bottom of screen.

```
[ Undo ]

         [ ↑ Forward ]
[ ← Left ]           [ → Right ]

         [ 🌊 Act ]
```

All buttons: min 48×48px touch targets. Use `onPointerDown` not `onClick` for lower latency on mobile.

The action button icon and label come from the `ActionTypeDef` registered for the current puzzle.

---

## Data Definitions

### `src/data/actionTypes.ts`
```ts
export const arcIncrement: ActionTypeDef = {
  id: 'arc_increment',
  name: 'Increment Arc',
  icon: '🌊',
  targetKind: 'diverArc',
  delta: { self: 1, forward: 1, left: 1, right: 1 },
  mod: 3,
};
```

### `src/data/puzzles.ts`
```ts
export const puzzle001: PuzzleSpec = {
  id: 'puzzle_001',
  polyhedronId: 'dodecahedron',
  group: { kind: 'Zmod', mod: 3 },
  actionIds: ['arc_increment'],
  scrambleDepth: 10,
  goalCondition: 'allSame',
};
```

---

## Win Overlay (`src/components/WinOverlay.tsx`)

Shown when `isSolved(gameState)` is true. Full-screen overlay with a "You solved it!" message and a "New Game" button. Triggered reactively from store.

---

## Testing

All engine functions should have unit tests in `src/engine/engine.test.ts` using Vitest.

Cover:
- `getForwardArc` for known face/facing combinations
- `applyAction` increments correct faces mod 3
- `moveDiver` lands on correct face with correct new facing
- `rotateDiver` cycles correctly at boundary (edge 4 → 0)
- `isSolved` true/false cases
- `scramble` output is not solved (probabilistic — run enough scramble depth)
- Round-trip: scramble then solve manually via known sequence

---

## Build & Run

```bash
npm run dev       # Next.js dev server (binds to 0.0.0.0 — accessible on local network)
npm run ip        # print local wifi IP for phone access
npm run test      # Jest
npm run build     # production bundle
npm run start     # serve production build
```

---

## Todo List

### Phase 1 — Project scaffold
- [ ] Init Next.js project with TypeScript and App Router (`create-next-app`)
- [ ] Install dependencies: three, @react-three/fiber, @react-three/drei, zustand
- [ ] Install test dependencies: jest, jest-environment-jsdom, @testing-library/react, ts-jest
- [ ] Configure viewport in `app/layout.tsx`
- [ ] Set up Jest config (`jest.config.ts`) with `ts-jest` and `jsdom` environment
- [ ] Update `package.json` dev script to `next dev -H 0.0.0.0`
- [ ] Add `"ip": "ipconfig getifaddr en0"` script to `package.json`

### Phase 2 — Engine (pure logic, no UI)
- [ ] Write `src/engine/types.ts` — FaceId, EdgeId, FaceState, DiverState, GameState, ActionTypeDef, PuzzleSpec
- [ ] Write `src/engine/dodecahedron.ts` — hardcoded adjacency map (12 faces × 5 neighbors in cyclic order), face center positions, face normals
- [ ] Write `src/engine/engine.ts`:
  - [ ] `getAdjacentFaces`
  - [ ] `getForwardArc`
  - [ ] `applyAction`
  - [ ] `moveDiver` (with correct arrival-facing formula)
  - [ ] `rotateDiver`
  - [ ] `isSolved`
  - [ ] `scramble`
- [ ] Write `src/engine/engine.test.ts` with unit tests for all engine functions
- [ ] All tests pass

### Phase 3 — State store
- [ ] Write `src/store/gameStore.ts` with Zustand
  - [ ] `act`, `moveForward`, `rotateLeft`, `rotateRight`, `undo`, `newGame`
  - [ ] History stack for undo
  - [ ] `newGame` calls `scramble` with puzzle's `scrambleDepth`

### Phase 4 — 3D rendering
- [ ] Write `src/components/Scene.tsx` — Canvas, lighting, OrbitControls
- [ ] Write `src/components/Dodecahedron.tsx`:
  - [ ] Build `BufferGeometry` from hardcoded topology
  - [ ] Per-face material groups with Z_3 flat colors driven by `faceValues`
  - [ ] Diver cone marker at face center oriented to show facing direction
  - [ ] Current face highlight
  - [ ] Forward arc (left/forward/right) subtle highlight
- [ ] Drag-to-rotate works on mouse and touch

### Phase 5 — UI controls
- [ ] Write `src/components/Controls.tsx`:
  - [ ] D-pad: Forward, Left, Right buttons wired to store
  - [ ] Action button(s) from puzzle's `actionIds`
  - [ ] Undo button
  - [ ] All buttons ≥ 48×48px
- [ ] Write `src/components/WinOverlay.tsx` — shown when `isSolved`, includes New Game button
- [ ] Wire data: `src/data/actionTypes.ts`, `src/data/puzzles.ts`
- [ ] `App.tsx` composes Scene + Controls + WinOverlay

### Phase 6 — Integration & polish
- [ ] `newGame` called on app load (scramble puzzle on startup)
- [ ] Win detection triggers overlay reactively
- [ ] Test on portrait phone viewport (or browser devtools mobile emulation)
- [ ] Verify touch drag rotates the dodecahedron
- [ ] Verify D-pad is thumb-reachable at bottom of screen
- [ ] Forward arc highlights update correctly as diver moves/rotates

---

## Notes for Agents

- **Start with Phase 2 (engine).** The engine is self-contained, testable, and has no UI dependencies. Get all tests green before touching the store or rendering.
- **Dodecahedron topology is the hardest data entry task.** The adjacency map must be correct and consistent — each face must appear in exactly 5 other faces' adjacency lists, and the cyclic order must match the 3D geometry (clockwise from outside). Cross-check against Three.js `DodecahedronGeometry` vertex/face data or a known reference.
- **Per-face coloring in Three.js requires manual geometry construction.** `DodecahedronGeometry` buffers triangles, not pentagons. You must add face groups manually (each pentagon is a fan of 3 triangles sharing a center vertex, so group indices `[0,9), [9,18), ...` for 12 faces × 3 tris).
- **The `moveDiver` arrival-facing formula is critical for puzzle feel.** The formula `(entryEdge + 2) % 5` should always put the diver facing "roughly forward" after crossing an edge so movement feels natural. Test this manually in the engine tests.
- **Do not add features outside V1 scope.** No textures, no animations, no saving, no multiple shapes.
