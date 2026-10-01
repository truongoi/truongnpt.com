# truongnpt.com — Astro rebuild

Personal blog of Truong Nguyen, migrated from Jekyll ("Duet" theme) to
[Astro](https://astro.build) with a neo-brutalist design (mint background,
thick black borders, hard offset shadows, Gumroad-style chunky UI).

## Tech

- Astro 5 (static output), `@astrojs/rss`, `@astrojs/sitemap`
- Content collections: `posts`, `projects`, `pages` (see `src/content.config.ts`)
- Fonts: Archivo + Space Mono via Google Fonts
- Light-first design — no dark/light toggle (faithful to the reference)

## Project structure

```
├── astro.config.mjs          # site URL, sitemap integration, static output
├── public/
│   ├── images/               # migrated 1:1 from Jekyll images/ (paths preserved)
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── BaseHead.astro    # SEO / OG / Twitter meta, fonts, RSS link
│   │   ├── Header.astro      # sticky nav, active-link highlighting
│   │   ├── Footer.astro
│   │   └── PostCard.astro    # blog card (thumb, date/tag pills, excerpt)
│   ├── content/
│   │   ├── posts/            # 27 migrated posts (3 are drafts, unpublished)
│   │   ├── projects/         # 1 project
│   │   └── pages/            # privacy-policy.md
│   ├── layouts/
│   │   └── Base.astro        # <html> shell: head + header + footer
│   ├── pages/
│   │   ├── index.astro       # homepage: hero, latest posts, projects, CTA
│   │   ├── blog/index.astro  # all posts
│   │   ├── p/[slug].astro    # post detail + prev/next nav
│   │   ├── projects/index.astro
│   │   ├── prj/[slug].astro  # project detail
│   │   ├── about.astro
│   │   ├── contact.astro     # Formspree form (AJAX, no redirect)
│   │   ├── links.astro       # profile links (/links/)
│   │   ├── calendar.astro    # Google Calendar embed
│   │   ├── [slug].astro      # generic markdown pages (privacy-policy)
│   │   ├── 404.astro
│   │   └── rss.xml.js        # RSS feed (published posts only)
│   └── styles/
│       └── global.css        # full neo-brutalist design system
└── dist/                     # build output (git-ignored)
```

## URLs (preserved from Jekyll)

| Page        | URL              |
| ----------- | ---------------- |
| Posts       | `/p/[slug]/`     |
| Projects    | `/prj/[slug]/`   |
| About       | `/about/`        |
| Contact     | `/contact/`      |
| Privacy     | `/privacy-policy/` |
| Links       | `/links/`        |
| Calendar    | `/calendar/`     |
| RSS         | `/rss.xml`       |

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
npm run preview  # preview the production build
```

## Deploy to Cloudflare Pages

1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the repo, then set:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** 20+ (set `NODE_VERSION=20` env var if needed)
4. **Save and Deploy.** Every push to the production branch redeploys automatically.

To use a custom domain (e.g. `truongnpt.com`): Pages project →
**Custom domains** → **Set up a custom domain** → follow the DNS prompts
(Cloudflare handles SSL automatically).

## Content notes

- Source: Jekyll repo migrated via script (kept out of this repo).
- Skipped: 3 theme demo posts, 1 demo project, the `2023-7-6` test page, and
  the unpublished `home.md` (custom homepage instead).
- Drafts (`draft: true`, from old `published: false`): excluded from listings,
  routes, and RSS —
  `happy-new-year` (2019), `working-on-the-weekend` (2019), `happy-new-year-2020`.
- The two "happy new year" posts had colliding slugs; the 2020 one lives at
  `/p/happy-new-year-2020/`.
- One post had a corrupt `date` field; it fell back to the filename date.
- CodePen includes were converted to standard CodePen embeds (user `truongoi`).
- Future comments idea (not implemented): [Giscus](https://giscus.app) fits the
  static setup well.
