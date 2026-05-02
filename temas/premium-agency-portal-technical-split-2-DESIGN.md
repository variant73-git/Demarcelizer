---
version: "neuform"
name: "Premium Agency Portal - Technical Split"
description: "Premium Agency Feature Section is designed for highlighting product capabilities and value points. Key features include reusable structure, responsive behavior, and production-ready presentation. It is suitable for component libraries and responsive product interfaces."
colors:
  primary: "#92CFF2"
  secondary: "#F47C59"
  accent: "#92CFF2"
  background: "#241208"
  surface: "#18181B"
  text-primary: "#FCF9F6"
  text-secondary: "#F47C59"
  border: "#27272A"
typography:
  display-lg:
    fontFamily: "Newsreader"
    fontSize: "64px"
    fontWeight: 500
    lineHeight: "1.04"
    letterSpacing: "0"
  body-md:
    fontFamily: "Newsreader"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.6"
  label-md:
    fontFamily: "JetBrains Mono"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "1.2"
spacing:
  base: "8px"
  gap: "16px"
  card-padding: "24px"
  section-padding: "80px"
rounded:
  card: "8px"
  pill: "9999px"
---

# Premium Agency Portal - Technical Split

Source: Neuform Trending templates. Views: 406; favorites: 20; remixes: 17.

## Overview
The portal leverages a high-contrast, structural aesthetic that mimics technical instrumentation. The mood is precise, clinical, and premium, utilizing an editorial foundation balanced by mechanical detailing. Composition follows a strict split-pane logic, emphasizing binary data display and geometric symmetry. The design language acts as a bridge between abstract layout grids and tangible hardware-inspired UI, favoring "Technical-Analog" over traditional flat digital styles.

## Colors
- Primary Surface: #FCF9F6 (Off-white/Parchment)
- Primary Brand: #F47C59 (Coral) and #92CFF2 (Muted Blue)
- Structural Ink: #241208 (Deep Coffee/Dark Brown)
- Interaction States: Selection highlights use #F47C59 with white text.
- Metadata: High-transparency variants of the structural ink (e.g., #241208/60, #241208/40) provide secondary hierarchy for text and borders.

## Typography
- Display: 'Newsreader' (Serif), utilized for headlines in Extra-light weight (200-800 opsz range).
- Body/Mono: Sans-serif/System font stack for general reading, prioritized for technical labels and metadata.
- Hierarchy:
  - Display: Large editorial headlines using extreme tracking and line-height control.
  - Labels: Uppercase, tracking-widest, monospace typography for status/coord indicators.
  - Body: Low-opacity, small-scale text for supporting descriptions, ensuring focus remains on the structural components.

## Layout
- Grid Logic: A rigid column-based split layout (50/50) that stacks vertically on mobile (flex-col md:flex-row).
- Spacing Cadence: Structured around a 4px/8px unit system, with generous padding (up to 48px) to isolate the "Technical-Analog" core.
- Section Rhythm: Content panels are constrained within a maximum width of 6xl, featuring active, recurring border-framing elements (corner accents/inner hairline rules) that define the "viewport" of each module.

## Elevation & Depth
- Surface Recipe: Backgrounds use a solid #FCF9F6 base with a "Premium Border Gradient Overlay"—a 1px transparent border generated via a linear gradient mask (white 0.3 opacity to black 0.05 opacity).
- Shadow Character: Multi-layered, soft-drop shadows mimicking physical paper stacking (calculated using multiple box-shadow values ranging from 2.8px to 100px blur radii).
- Blur: High-depth elements utilize subtle background occlusion to imply weight and material separation from the primary container.

## Shapes
- Radius Hierarchy: Sharp, squared edges (rounded-sm) are the baseline, prioritizing geometric integrity over organic curves.
- Silhouette Discipline: Shapes within the central "Geometric Assembly" sections strictly follow perfect forms: perfect circles, squares, and rotated diamonds (45-degree rotations).
- Icon Geometry: Icons should lean toward line-work (linear-weight) to match the thin stroke weight of the technical wireframe diagrams.

## Components
- Cards: Premium canvas containers featuring internal technical wireframes, calibration nodes (5px squares at intersection midpoints), and decorative border accents.
- Nav/Meta: Top-rail metadata bars containing system status strings, separated by thin hairline borders.
- Buttons: High-visibility accent buttons with a flat, bold color treatment (Coral) and high-contrast hover states (Dark Brown).
- Overlays: Minimalist, functional overlays that maintain the grid structure, never obscuring the primary layout lines.

## Do's and Don'ts
- Do use hairline strokes (1px or 0.5px) for decorative technical elements to maintain the "precision" aesthetic.
- Do maintain strict adherence to 45-degree rotations when nesting shapes like squares within circles.
- Don't use heavy, rounded corner radii; keep shapes crisp and industrial.
- Don't deviate from the #241208 (Deep Coffee) ink color for structural UI elements; it is the visual anchor for all frames and dividers.
- Don't add drop shadows to text; depth should only apply to surface panels and geometric shapes.

## Motion
- Reveal Logic: Text follows a mask-reveal pattern where lines are split by breaks; words animate from 110% Y-offset using Power4.out easing.
- Sequence: Animations are timeline-bound via ScrollTrigger, ensuring elements "commence" as the container enters the viewport.
- Easing: Use Power4.out for high-impact typography reveals and Power2.out for secondary UI fades and sub-text entry.
- Interaction: Button hovers should utilize transition-colors duration-300 to maintain a smooth, responsive feel.

## WebGL
- Effect: A subtle, floating particle system rendered on a fixed container (#webgl-canvas) behind the main UI.
- Implementation: Built via Three.js (r128) using a `BufferGeometry` and `PointsMaterial`. The effect is non-interactive to user-content but responsive to mouse coordinates, driving camera parallax via `targetX`/`targetY` lerping.
- Rendering: Utilizes `AdditiveBlending` with a low opacity (0.15) and a coffee-brown particle color (#241208).
- Performance: Includes a standard `requestAnimationFrame` loop with `clock.getElapsedTime()` for smooth, wave-like vertical oscillation, and a resize handler to update camera projection and renderer dimensions.

## ThreeJS
- Renderer: `WebGLRenderer` configured with `{ alpha: true, antialias: true }`.
- Camera: `PerspectiveCamera` (75 FOV) positioned at Z=3, serving as the static frame for the floating particle field.
- Scene: A single `THREE.Points` object serves as the sole scene member. Motion is driven by rotation updates on the mesh (`rotation.y += 0.001`) and vertex-position-independent oscillation.
- Postprocessing: None; efficiency is prioritized via lightweight `BufferGeometry` attributes to keep the background from interfering with the main DOM content.
