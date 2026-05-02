---
version: "neuform-pro"
name: "Ares Base | Seamless Logistics Sync"
description: "Ares Base Hero Section is designed for introducing a product with clear above-the-fold messaging. Key features include headline hierarchy, supporting copy, and a primary call-to-action. It is suitable for homepage hero areas and campaign landing pages."
colors:
  primary: "#BC7F61"
  secondary: "#000000"
  accent: "#BC7F61"
  background: "#BC7F61"
  surface: "#191C21"
  text-primary: "#FFFFFF"
  text-secondary: "#A1A1AA"
  border: "#57534E"
typography:
  display-lg:
    fontFamily: "Geist"
    fontSize: "64px"
    fontWeight: 500
    lineHeight: "1.04"
    letterSpacing: "0"
  body-md:
    fontFamily: "Geist"
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
  control: "8px"
  pill: "9999px"
components:
  card:
    background: "Use the surface token with subtle borders and HTML-matched shadow depth"
    radius: "Match the declared card radius token"
  button:
    background: "Use primary or accent colors for the main action"
    radius: "Use the control or pill radius based on the source HTML"
---
# Ares Base | Seamless Logistics Sync
Source: Neuform Pro templates. Author: Meng To (@mengto). Views: 358; favorites: 25; remixes: 6.
Tags: hero, section, animated, threejs, cta, effect.
## Overview
Ares Base Hero Section is designed for introducing a product with clear above-the-fold messaging. Key features include headline hierarchy, supporting copy, and a primary call-to-action. It is suitable for homepage hero areas and campaign landing pages.

Ares Mission Sync Synchronize Martian outposts, zero latency. Trusted by leading mission commanders Connect your rovers, habitats, and orbital relays with a single protocol. No complex atmospheric interference setups—ju…
## Composition
Use the attached HTML reference as the source of truth. Preserve the visible hierarchy, first-screen composition, section rhythm, density, and interaction tone before adapting copy or content.
Key visible headings include: Synchronize Martian outposts, zero latency..
## Colors
Anchor the palette in primary #BC7F61, secondary #000000, accent #BC7F61, background #BC7F61, surface #191C21, text-primary #FFFFFF. Keep background, surface, text, and border roles distinct so generated layouts retain the same contrast pattern as the source.
## Typography
Use Geist for display moments and Geist for body copy unless the HTML clearly demands a compatible fallback. Labels and technical metadata should use JetBrains Mono or an equivalent mono face.
## Layout
Keep spacing deliberate and stable. Favor the same grid direction, max-width behavior, card density, and responsive stacking seen in the HTML. Do not replace distinctive source structures with generic SaaS sections.
## Components
Authentication and CTA controls should preserve the source button hierarchy, input density, and focused conversion path.
## Motion
Preserve existing motion cues such as masked reveals, staggered entrance, hover lift, scroll-triggered transitions, and ambient movement. Keep easing smooth and restrained.
## WebGL & Effects

If the source includes canvas, WebGL, Three.js, gradients, particles, or atmospheric effects, rebuild them as supporting layers behind the content. Keep effects performant, responsive, and secondary to the interface.

## Guardrails
- Do not flatten the source into a generic card grid.
- Do not swap the color mode unless the source clearly supports it.
- Preserve the first viewport signal, focal object, and visual density.
- Keep buttons, cards, and badges aligned to the same radius and border language.