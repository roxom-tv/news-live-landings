# Design System: Dark Editorial News Features

## 1. Visual Theme & Atmosphere

The landing must feel like a premium dark magazine/news feature: full-screen image lead, narrative article pacing, strong inline photography, and high-contrast evidence modules. It should resemble a Vice-style long-form news story rather than a generic SaaS landing page, compact dossier, or TV slide.

The experience is article-first. The reader should move through a hero, a substantial story, timeline when useful, quotes, data/impact when useful, reactions, gallery, and source footer.

## 2. Color Palette & Roles

- **Base Black** `#060707` — Primary background.
- **Surface Black** `#191919` — Quote, reaction, and chart cards.
- **Context Green Tint** `#031f11` — Data/impact and high-context bands.
- **Accent Green** `#1ae784` — Links, tags, source labels, chart bars, timeline dots.
- **Critical Red** `#e7000b` — Live/breaking badge and true critical risk only.
- **Primary Text** `#ffffff` — Headlines and important labels.
- **Secondary Text** `rgba(255,255,255,0.60)` — Body metadata and supporting text.
- **Tertiary Text** `rgba(255,255,255,0.40)` — Credits, timestamps, source footnotes.
- **Border** `rgba(255,255,255,0.10)` — Panels and section separators.

No purple, no blue gradients, no beige palette, no neon TV glow. Green is sharp and controlled, not decorative.

## 3. Typography Rules

- **Primary:** DM Sans for headlines, article copy, cards, and labels.
- **Mono:** JetBrains Mono for metadata, source tags, numbers, chart labels, dates, and timestamps.
- Headlines are heavy, compact, and editorial. Use `clamp(32px, 5.5vw, 68px)` for hero scale.
- Article body uses 17px, 1.75 line-height, max width around 900px.
- Source labels and metadata are 9-11px mono uppercase where appropriate.

## 4. Layout System

1. **Sticky Masthead:** 80px, centered neutral text mark, no brand dependency.
2. **Hero:** 92vh full-bleed image with dark vertical and horizontal gradients, live badge, topic tags, date, headline, subheadline, image credit.
3. **Article:** Centered 900px column, long-form narrative sections with real magazine subheads, source tags, and frequent inline images.
4. **Timeline:** Dark green/black band with vertical timeline and source footnotes.
5. **Quotes:** Two-column cards on desktop, one-column on mobile.
6. **Data & Impact:** Green-tinted band, stat cards, and at least one chart-like visual when source data exists.
7. **Reactions:** Source/actor cards showing who said or reported what.
8. **Gallery:** 4-column image grid on desktop, 2-column on mobile.
9. **Footer Sources:** Complete bottom bibliography with linked source titles, outlets, dates, credibility, and publication/update context.

## 5. Topic-Aware Treatment

- **Person:** portrait/face-first hero when available, article should include biography/context, current relevance, timeline, quotes, and image gallery.
- **Event/Crisis:** scene-first hero, timeline is essential, quotes and reactions should be prominent.
- **Market/Crypto/Finance:** data/stat section must be strong, include chart visuals and market reaction cards.
- **Institution/Company:** hero can use building, product, logo-adjacent source image, or relevant operation visual; emphasize actors and data.
- **Competition/Rivalry:** show competitors, status/standings/result, stakes, leaders/losers, momentum shifts, relevant quotes, and next milestone.
- **Election/Vote:** show reported results, vote share/seats/delegates/electoral count where relevant, winners/losers, turnout or reporting status, challenges, party statements, and next procedural step.

## 6. Motion & Interaction

Use restrained fade-up and optional scanline effect. No carousel, no auto-scroll, no marquee/ticker movement, no horizontal panning. Hover states can scale gallery images subtly and change card borders.

## 7. Content Quality Rules

- 9-14 substantial sections when source material supports it.
- Each section should feel like article prose, not a note card.
- Every factual section carries source URLs.
- Use exact quotes only when supported; otherwise use reactions/source cards.
- Sources appear inline and at the bottom.
- Bottom sources are not optional. The article must end with a bibliography-style source section, not just outlet names.
- Do not fabricate images, quotes, numbers, or dates.
- Use fallback images only when they are topically relevant and properly credited.
- Content is king, context is queen, update is prince: article substance first, explanatory context second, live-update mechanics third.
- Every image must directly relate to the news, named person, named institution, named location, or exact context.
- Every graph must map to sourced story data. No decorative charts, no source-density charts, no generic visuals.

## 8. Anti-Patterns

No generic card-only landing. No TV slide language. No Roxom branding. No text-only visual sections. No unsupported claims. No weak one-paragraph summaries. No broken image links. No overdecorated neon/glassmorphism.
