---
version: "neuform-pro"
name: "Premium Studio Card Component"
description: "Premium Studio Card Component is designed for grouping related content in a compact container. Key features include clear structure, reusable styling patterns, and production-ready layout behavior. Built with Tailwind CSS, it is suitable for component libraries and responsive web projects. It includes animated visual t"
colors:
  primary: "#4A1711"
  secondary: "#E6E1D6"
  accent: "#4A1711"
  background: "#0F0A09"
  surface: "#E6E1D6"
  text-primary: "#FFFFFF"
  text-secondary: "#A1A1AA"
  border: "#5A4A46"
typography:
  display-lg:
    fontFamily: "ui-sans-serif"
    fontSize: "64px"
    fontWeight: 500
    lineHeight: "1.04"
    letterSpacing: "0"
  body-md:
    fontFamily: "ui-monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.6"
  label-md:
    fontFamily: "ui-monospace"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "1.2"
spacing:
  base: "8px"
  gap: "16px"
  card-padding: "24px"
  section-padding: "80px"
rounded:
  card: "32px"
  control: "32px"
  pill: "9999px"
components:
  card:
    background: "Use the surface token with subtle borders and HTML-matched shadow depth"
    radius: "Match the declared card radius token"
  button:
    background: "Use primary or accent colors for the main action"
    radius: "Use the control or pill radius based on the source HTML"
---
# Premium Studio Card Component
Source: Neuform Pro templates. Author: Meng To (@mengto). Views: 20; favorites: 8; remixes: 4.
Tags: card, animated, bento, dither, action, charts, effect, webgl.
## Overview
Premium Studio Card Component is designed for grouping related content in a compact container. Key features include clear structure, reusable styling patterns, and production-ready layout behavior. Built with Tailwind CSS, it is suitable for component libraries and responsive web projects. It includes animated visual t

Digital experiences. Driven by data. Crafted with care.
## Composition
Use the attached HTML reference as the source of truth. Preserve the visible hierarchy, first-screen composition, section rhythm, density, and interaction tone before adapting copy or content.
Key visible headings include: 25k +.
## Colors
Anchor the palette in primary #4A1711, secondary #E6E1D6, accent #4A1711, background #0F0A09, surface #E6E1D6, text-primary #FFFFFF. Keep background, surface, text, and border roles distinct so generated layouts retain the same contrast pattern as the source.
## Typography
Use ui-sans-serif for display moments and ui-monospace for body copy unless the HTML clearly demands a compatible fallback. Labels and technical metadata should use ui-monospace or an equivalent mono face.
## Layout
Keep spacing deliberate and stable. Favor the same grid direction, max-width behavior, card density, and responsive stacking seen in the HTML. Do not replace distinctive source structures with generic SaaS sections.
## Components
Dashboard, chart, and data panels should preserve their compact operational hierarchy, nested surfaces, and metric emphasis.
## Motion
Preserve existing motion cues such as masked reveals, staggered entrance, hover lift, scroll-triggered transitions, and ambient movement. Keep easing smooth and restrained.
## WebGL & Effects

If the source includes canvas, WebGL, Three.js, gradients, particles, or atmospheric effects, rebuild them as supporting layers behind the content. Keep effects performant, responsive, and secondary to the interface.

## Guardrails
- Do not flatten the source into a generic card grid.
- Do not swap the color mode unless the source clearly supports it.
- Preserve the first viewport signal, focal object, and visual density.
- Keep buttons, cards, and badges aligned to the same radius and border language.