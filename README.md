# ⭐ Stardom

A browser-based career simulation game where you play an **aspiring actor**
climbing from total unknown to Hollywood icon — and, eventually, the person
who writes, directs, and produces the projects everyone else auditions for.

No build step, no dependencies. Just open it in a browser.

## Play

Open `index.html` in any modern browser, or serve the folder locally:

```bash
npm run dev        # serves on http://localhost:8000
# or, without npm:
python3 -m http.server 8000
```

Enter a stage name (or leave blank for a random one), pick a **difficulty**,
and start your career. Progress autosaves to your browser — use **Continue**
to resume.

### Difficulty

| Mode | Start $ | Weekly cost | Pay | Audition odds | Bankruptcy at |
|------|---------|-------------|-----|---------------|---------------|
| 🌱 Easy | $3,000 | $160 | +25% | +8% | −$5,000 |
| 🎯 Normal | $1,500 | $220 | — | — | −$3,000 |
| 🔥 Hard | $700 | $300 | −15% | −8% | −$2,000 |

## The career

Each turn is one **week**. You have **energy** to spend on actions, then
**Advance Week** to make progress, collect pay, and let projects film.

**Acting roles** — audition for jobs on the casting board across every rung of
the industry:

| Category | Pay | Fame | Prestige |
|----------|-----|------|----------|
| 📺 Commercial | low | low | low |
| 🎞️ TV Movie | mid | mid | mid |
| 📡 TV Series | high | high | high |
| 🎥 Indie Film | low | mid | very high |
| 🎬 Studio Film | very high | very high | very high |
| 🍿 Streaming Film | huge | high | high |
| 📱 Streaming Series | high | high | mid |

Your odds depend on your **acting skill**, **fame**, **reputation**, and whether
you have an **agent**. Land a role and you're in production for several weeks,
earning pay and—on wrap—fame, skill, and prestige.

**Billing — from bit parts to leading roles.** Every role has a billing tier:
**Cameo → Supporting → Lead**. As an unknown you'll only be offered cameos and
small supporting parts; leading roles open up as your fame grows, and they pay
and profile far more. Billing also gates awards — only supporting and lead
performances qualify (a cameo never wins an Oscar).

**Starting out (the grind).** Without representation you only see **Open Calls** —
smaller, lower-paid commercials, TV movies, and indie films. Every audition
teaches you something — you gain a little acting craft win *or* lose. A near-miss
earns a **📞 callback**: the role stays on the board with better odds next time
instead of vanishing. When there's no role worth chasing, take **🎬 extra work** —
background gigs that roughly cover rent while building craft on-theme and
occasionally introducing you to people on set. Side jobs remain the pure-cash net.

**Signing an agent** is the early-game graduation. It takes a real body of work —
**18 fame and 3 credits** — and unlocks the full casting board: studio films and
series-regular TV roles that open calls never offer (the agent takes a 12% cut in
return). Reaching it is a genuine climb of roughly a year of scraping by; fame
comes slowly while you're an unknown and compounds once you're recognized.

**Negotiating deals.** Before you audition, you can **🤝 negotiate** an offer's
terms. Your fame, reputation and (especially) your agent drive the odds — succeed
and your pay jumps (with an agent, your billing improves too); push too hard and
you'll sour the room or watch the producers walk away. Risk versus reward.

**Rivals.** A handful of named peers shadow your whole career, competing for the
same roles and awards. They snipe parts out from under you, beat you (or lose to
you) on awards night, and keep getting more famous over the years — and a fresh
challenger emerges once you hit the big time. Rivalries heat up with every clash;
track them on the **People** tab.

**Genre specialization & typecasting.** Every role has a genre (🎭 Drama, 😂 Comedy,
💥 Action, 👻 Horror, 🚀 Sci-Fi, 💖 Romance). The more you work in a genre, the
better your audition odds for similar roles — and the more your top genre becomes
your public brand (e.g. *Action Star*, *Scream Queen*), shown on your Career page.
But lean too hard into one genre and you get **typecast**: casting directors
struggle to see you in anything else, so your odds in *other* genres drop. Working
across genres keeps your range — a real strategic tension.

**Career goals.** A **🎯 Goals** tab tracks ~15 milestones that chart your rise
from first day on set to Academy Award winner and millionaire, each granting a
small reward and giving you direction at every stage.

**Narrative dilemmas.** Now and then a situation lands on your desk — a tabloid
buyout, a method-acting demand, a viral controversy, a passion project versus a
fat paycheck — and you choose how to handle it. Each choice has real consequences
for your money, fame, reputation, craft, and relationships.

**Money & lifestyle.** A **💰 Finances** tab tracks your net worth, annual income,
and tax bill — income is taxed **progressively** every year, so the more you make
the more the taxman takes. Spend your fortune on **lifestyle assets** (a sports
car, a Hollywood mansion, a yacht, a private jet…): each grants a fame/status
bump and a comfort boost to your weekly energy, but carries steep weekly upkeep —
live large, but keep the work coming.

**First-time tutorial.** New players get a short guided walkthrough of the core
loop on their first game; replay it anytime via the **❓** button in the header.

**Co-stars & relationships.** Land a role and you meet co-stars, who become
lasting contacts. A close, famous ally boosts your audition odds; a famous
co-star's star power rubs off as extra fame when a project wraps. Visit the
**People** tab to *catch up* and strengthen bonds — and on-set chemistry can
turn into a headline-making romance.

**TV series renewal arc.** Joining a TV series isn't a one-off — it runs
**season by season**. At each season's end the show earns a **rating** (driven
by your fame, craft, and co-star draw, minus fatigue) and is **renewed** (with a
12% raise) or **cancelled**. A long-running hit pays off with a prestigious
finale; you can also choose to leave the show at any time.

**Build your craft** in the Train tab: acting, plus directing, screenwriting,
and producing (which unlock as your fame grows).

**Create your own work** in the Create tab once you've trained:
- ✍️ **Write scripts** — sell them to studios, or produce them yourself. Each
  script has a genre and sharpens your writing skill (you learn by doing).
- 🎬 **Produce** films at micro / mid / blockbuster budgets. Box office depends
  on script quality, your producing skill, and—if you also **direct**—your
  directing skill. Each production also builds your affinity in its genre.

**Awards season** runs through the calendar with four real ceremonies, each
judging your eligible credits from the trailing year:

| Ceremony | When | Honors |
|----------|------|--------|
| 🌐 Golden Globe Awards | early | Best Actor — Film & TV |
| 🎟️ SAG Awards | late winter | Outstanding Performance — Film & TV |
| 🏆 Academy Awards | spring | Best Actor, Supporting, Original Screenplay, Director, Picture |
| 📺 Emmy Awards | fall | Outstanding Lead & Supporting Actor (TV) |

Only prestigious work qualifies — strong films, acclaimed TV, and projects you
direct or produce; commercials never count. A **nomination** is selective (your
work must clear an absolute industry bar that's higher at the more prestigious
ceremonies), and even when nominated you're one of five — **winning is roughly a
1-in-5 draw**, tilted only modestly by how exceptional the work is. Expect a
handful of wins across a great career, and an Academy Award to mean something.
Wins and nominations both boost fame and reputation and are recorded on your
**Career** page, grouped by ceremony. When you're in the running, an **awards-night
summary** pops up with that ceremony's results — and the **co-stars** from the
honored project celebrate with you, deepening those relationships. **Best Original Screenplay** is
open to films you write — both screenplays you sell to studios and your own
self-produced projects.

## Retirement & the Hall of Fame

Careers don't run forever. From the **Career** tab you can **retire** at any time
to cement your legacy and end the game on your own terms (you can also flame out
via bankruptcy). Retiring computes a **legacy score** from your fame, award wins
and nominations (Oscars count extra), career prestige, body of work, and
reputation, then ranks you in the **Hall of Fame**:

🎭 Forgotten Extra → 🎬 Working Actor → ⭐ Notable Talent → 🌟 Bona Fide Star →
🏆 Hollywood Legend → 👑 Immortal Icon

A sufficiently storied career is honored with a **🎖️ Lifetime Achievement Award**.
The ending screen shows a full legacy scorecard.

**Watch the money.** Weekly living costs never stop. Go broke and your career
ends — work side jobs to stay afloat between gigs.

## Project structure

```
index.html        # markup + start screen
css/styles.css    # all styling
js/data.js        # static content + procedural role/event generators
js/state.js       # game state creation & localStorage persistence
js/engine.js      # core mechanics (audition, training, production, awards, turns)
js/ui.js          # rendering & input handling
js/main.js        # bootstrap
```

The data/state/engine layers are DOM-free, so the game logic can be simulated
and tested headlessly with Node.

## Development

```bash
npm run check   # syntax-check every module
npm test        # run the headless engine smoke test (simulates full careers)
npm run dev     # serve locally on :8000
```

`npm test` runs `scripts/smoke-test.mjs`, which plays simulated careers across
all difficulties and asserts the engine stays consistent and that every system
(TV-series renewals/cancellations, co-star romance, etc.) actually fires. This
test gates every push and pull request via GitHub Actions (`.github/workflows/ci.yml`).

## Deploy

The game is a static site, so hosting is zero-build.

### Vercel (recommended)

1. Push this repo to GitHub.
2. In the [Vercel dashboard](https://vercel.com/new), **Import** the GitHub repo.
3. Framework Preset: **Other** — leave Build Command empty and Output Directory
   as `.` (the included `vercel.json` already declares this).
4. **Deploy.** Vercel serves `main` as production and gives every branch/PR its
   own preview URL automatically on each push.

Or from the CLI:

```bash
npm i -g vercel
vercel          # preview deploy
vercel --prod   # production deploy
```

### GitHub Pages (free alternative)

A workflow (`.github/workflows/deploy-pages.yml`) publishes the site on every
push to `main`. To turn it on once:

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge to `main` (or run the workflow manually via the Actions tab).

The site then lives at `https://<your-user>.github.io/<repo>/`. All asset paths
are relative, so it works correctly under that sub-path.
