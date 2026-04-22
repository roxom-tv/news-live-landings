---
name: live news Miami
colors:
  surface: '#121414'
  surface-dim: '#121414'
  surface-bright: '#383939'
  surface-container-lowest: '#0d0e0e'
  surface-container-low: '#1b1c1c'
  surface-container: '#1f2020'
  surface-container-high: '#292a2a'
  surface-container-highest: '#343535'
  on-surface: '#e3e2e2'
  on-surface-variant: '#e6bcbd'
  inverse-surface: '#e3e2e2'
  inverse-on-surface: '#303130'
  outline: '#ad8888'
  outline-variant: '#5d3f40'
  surface-tint: '#ffb3b5'
  primary: '#ffb3b5'
  on-primary: '#680019'
  primary-container: '#ff5167'
  on-primary-container: '#5b0015'
  inverse-primary: '#be0036'
  secondary: '#e9b3ff'
  on-secondary: '#510074'
  secondary-container: '#7d01b1'
  on-secondary-container: '#e5a9ff'
  tertiary: '#74d1ff'
  on-tertiary: '#003548'
  tertiary-container: '#149ccb'
  on-tertiary-container: '#002e3f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdada'
  primary-fixed-dim: '#ffb3b5'
  on-primary-fixed: '#40000c'
  on-primary-fixed-variant: '#920027'
  secondary-fixed: '#f6d9ff'
  secondary-fixed-dim: '#e9b3ff'
  on-secondary-fixed: '#310048'
  on-secondary-fixed-variant: '#7200a3'
  tertiary-fixed: '#c1e8ff'
  tertiary-fixed-dim: '#74d1ff'
  on-tertiary-fixed: '#001e2b'
  on-tertiary-fixed-variant: '#004d67'
  background: '#121414'
  on-background: '#e3e2e2'
  surface-variant: '#343535'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 72px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Work Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Work Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-bold:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '700'
    lineHeight: '1'
  label-sm:
    fontFamily: Work Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  safe-area: 32px
  gutter: 20px
---

## Brand & Style

This design system captures the high-energy, high-stakes atmosphere of an 80s Miami broadcast news suite, reimagined for a modern digital interface. It targets a bold, tech-savvy audience that values speed and visual impact. The personality is unapologetically loud, authoritative, and electric.

The style is a hybrid of **Retro-Futurism** and **Glassmorphism**. It utilizes the high-contrast aesthetic of 80s vaporwave--heavy on neon light-leaks and glowing edges--but grounds it with the sophisticated depth of translucent, tinted glass surfaces. The UI should evoke the feeling of looking at a futuristic command center through a humid, neon-soaked window. Every interaction should feel like a "pulse" of data, emphasizing movement and vibrancy.

## Colors

The color palette is built on a foundation of absolute darkness to allow neon accents to achieve maximum luminosity. The core background is a deep, obsidian navy that serves as a vacuum for light.

- **Primary (Hot Pink):** Used for urgent news, critical CTAs, and active states.
- **Secondary (Neon Purple):** Used for structural accents, secondary buttons, and depth-giving shadows.
- **Tertiary (Bright Cyan):** Used for informational data points, links, and "safe" interactions.
- **live news Green:** Reserved exclusively for success states, market gains, and brand-specific "on-air" indicators.

"Clashy" balance is achieved by pairing Cyan and Pink in gradients or adjacent borders, creating a visual vibration typical of 80s broadcast graphics.

## Typography

Typography in this design system is designed for high-speed scanning and maximum authority.

**Space Grotesk** is used for all headlines and labels. Its geometric quirks and wide stance provide a technical, futuristic feel. Headlines should use tight letter spacing and, in some display cases, a subtle horizontal shear (italicization) to imply speed.

**Work Sans** handles the heavy lifting of news body copy. Its neutral, grounded architecture ensures legibility against vibrant, glass-textured backgrounds. All labels and metadata should be rendered in uppercase Space Grotesk to mimic televised ticker tapes.

## Layout & Spacing

The layout philosophy follows a **fixed-fluid hybrid grid** inspired by broadcast safety zones. While the content scales, it is always contained within a generous "safe area" margin to mimic the look of an old-school CRT monitor.

The system utilizes a 12-column grid. Spacing is strictly based on an 8px rhythm to maintain technical alignment. However, "diversity in elements" is encouraged by breaking the grid for floating "Breaking News" widgets or offset decorative borders that sit slightly behind the primary content. Padding within glass containers should be generous (24px+) to prevent the neon borders from feeling cramped.

## Elevation & Depth

Depth is not communicated through traditional shadows, but through **Neon Diffusion** and **Chromic Glassmorphism**.

1. **Level 0 (Floor):** Deep Navy (#060707) with occasional horizontal scanline textures at 2% opacity.
2. **Level 1 (Surface):** Glass containers with a 10-20% opacity fill of either Cyan or Purple, using a backdrop blur of 20px.
3. **Level 2 (Floating):** Elements like menus or tooltips use a multi-colored "stacked" border--a 1px solid Cyan border offset by a 1px Hot Pink border.
4. **Neon Glows:** High-priority elements use an outer glow (`drop-shadow`) that matches the element's primary color, with a spread of 15-30px and low opacity (40%) to simulate a humming light source.

## Shapes

The design system uses a "Soft Tech" approach to geometry. While the 80s aesthetic often trends toward sharp corners, we use a consistent **0.25rem (4px)** radius for most containers to maintain a premium, modern feel.

Buttons and "Breaking" badges should utilize a **Pill-shape** to contrast against the rigid grid of news cards. Decorative elements, such as data visualization bars or decorative line dividers, should remain perfectly sharp (0px) to evoke a sense of precision.

## Components

### Buttons

Buttons are high-contrast focal points. Primary buttons use a 45-degree gradient from Hot Pink to Neon Purple with a white, bold Space Grotesk label. They feature a 5px glow effect on hover.

### Glass Cards

Cards are the primary container for news stories. They feature a semi-transparent Cyan tint, a 1px border that shifts from Purple to Cyan, and a heavy backdrop blur. Images within cards should have a subtle "Cool" filter applied to harmonize with the navy background.

### News Tickers

A signature component of this design system. A full-width bar at the bottom or top of the screen with a Hot Pink background and live news Green text scrolling horizontally.

### Multi-Colored Borders

Input fields and featured cards use a "dual-stroke" technique--a primary color border on the top and left, and a secondary color border on the bottom and right, creating a faux-3D neon effect.

### Chips & Badges

Small, high-saturation pills. "Live" indicators must use a pulsing animation with live news Green and a heavy glow. Category chips use "clashy" pastel combinations like a pale yellow text on a bright purple glass background.
