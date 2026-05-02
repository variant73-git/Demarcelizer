---
version: "neuform"
name: "CreatorFlow — Master your content strategy"
description: "Connect with elite content creators, brand strategists, and marketing experts to elevate your digital presence."
colors:
  primary: "#E01E65"
  secondary: "#FB2875"
  accent: "#E01E65"
  background: "#112345"
  surface: "#18181B"
  text-primary: "#F8FAFC"
  text-secondary: "#FB2875"
  border: "#27272A"
typography:
  display-lg:
    fontFamily: "Inter"
    fontSize: "64px"
    fontWeight: 500
    lineHeight: "1.04"
    letterSpacing: "0"
  body-md:
    fontFamily: "Manrope"
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

# CreatorFlow — Master your content strategy

Source: Neuform Trending templates. Views: 380; favorites: 14; remixes: 14.

## Overview
CreatorFlow utilizes a sophisticated, high-contrast aesthetic that balances editorial elegance with technical precision. The design logic centers on a "content-first" approach, utilizing a rigid structural grid framed by architectural lines. The mood is professional, authoritative, and clean, defined by a palette of deep midnight blues, crisp whites, and sharp, aggressive accents of pink. Composition relies on heavy whitespace and intentional asymmetry to guide the user through complex, high-value content sections.

## Colors
The brand identity is built on a tripartite strategy:
* Brand Dark: #112345 (Primary text, primary surfaces, footer background)
* Brand Pink: #FB2875 (Action, emphasis, hover states, and glow markers)
* Neutral Palette: #f8fafc (Light backgrounds) and White (Primary container surfaces).
* Accents: Brand-pink/20 for selection states and brand-dark/5-10 for subtle dividers and borders.

## Typography
The hierarchy follows a clean, geometric-humanist pairing:
* Headings: 'Manrope', sans-serif. Used for display and section titles; characterized by medium to semi-bold weights for readability and architectural impact.
* Body: 'Inter', sans-serif. Used for all informational text and UI labels; selected for its neutral, highly legible quality at small scales.
* Roles: Headings employ tight, negative tracking (-0.025em) to appear denser and more editorial, while body text uses standard line heights for optimal scannability.

## Layout
The system is built on a 7xl (1280px) content-width constrained container.
* Grid Logic: A 12-column foundation powers the responsive structure, with sections transitioning from vertical stacking on mobile to asymmetrical, multi-column grids (e.g., 1.1fr vs 0.9fr) on desktop.
* Spacing Cadence: Employs a vertical rhythm defined by large padding blocks (16px to 32px increments) to maintain breathing room between thematic sections.
* Structural Anchors: The fixed-position "Container Lines" serve as a site-wide motif, providing consistent vertical guides that define the edges of the content area.

## Elevation & Depth
Depth is created through a mix of physical and pseudo-physical layering:
* Surface Recipe: White/90 backgrounds with backdrop-blur-xl or backdrop-blur-md are used for overlays (headers/floating UI).
* Shadow Character: Subtle, diffuse shadows (shadow-sm, shadow-lg) utilize a mix of black and primary brand color (shadow-brand-pink/20) to ground floating elements without appearing heavy.
* Border Feel: 1px borders with low-opacity alpha channels (brand-dark/5 to brand-dark/10) provide structure to cards. Premium sections utilize linear-gradient borders (e.g., 135deg, 180deg) to simulate a "glowing" or "active" edge effect.

## Shapes
The system prioritizes a "squircle-lite" aesthetic:
* Corner Radius: A hierarchical approach is used where smaller interactive elements receive 12px or 16px radii (rounded-xl, rounded-2xl), while larger structural containers reach 24px to 40px (rounded-3xl, rounded-[2.5rem]).
* Silhouette Discipline: All decorative elements and containers are full-bleed rectangles with rounded corners, maintaining a clean, consistent silhouette across the entire product surface.

## Components
Reusable patterns focus on high-fidelity information display:
* Cards: Feature a dual-wrapper pattern—a thin "glow" border container holding the inner content. Hover states activate subtle shadow increases.
* Navigation: The header utilizes a glassmorphism effect (backdrop-blur-xl) with a thin border-bottom to remain anchored.
* Action Buttons: Uniformly rounded (full) with distinct primary and ghost styles. Primary buttons use brand-dark with hover transitions to brand-pink.
* Form/Interactive Details: FAQ sections utilize standard details/summary elements to create an accordian pattern that hides content until user-prompted, maintaining a clean visual profile.

## Do's and Don'ts
* Do use the fixed structural line anchors to preserve the brand’s "architectural" site feel.
* Do use the specific GSAP reveal animation for all major H2 headings to maintain motion consistency.
* Do keep all branding icons (solar-icons) at a consistent stroke weight (1.5) to match the UI typography.
* Don't drift from the primary color palette by introducing new, un-vetted shades of blue or pink.
* Don't use heavy box-shadows; keep depth subtle and focused on the interaction between white surfaces and the 5%–10% opacity border lines.

## Motion
Motion is reserved for UI reveals and interaction feedback:
* Reveal Behavior: Headlines use a staggered, GSAP-driven "masked word" reveal effect (transform: translateY(110%)) triggered at 85% of the viewport height.
* Hover Behavior: Interactive cards trigger subtle scaling or shadow-intensity increases to signal "depth" and "interactivity."
* Transition Logic: Use standard "power4.out" easing for all text reveals to match the brand’s crisp, decisive personality.
* Scroll Behavior: The UI is strictly governed by overflow-x-hidden; avoid horizontal-scrolling content unless specifically contained within a scroll-aware component.
