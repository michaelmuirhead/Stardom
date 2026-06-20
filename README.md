# ⭐ Stardom

A browser-based career simulation game where you play an **aspiring actor**
climbing from total unknown to Hollywood icon — and, eventually, the person
who writes, directs, and produces the projects everyone else auditions for.

No build step, no dependencies. Just open it in a browser.

## Play

Open `index.html` in any modern browser, or serve the folder locally:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
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

Your odds depend on your **acting skill**, **fame**, **reputation**, and whether
you have an **agent**. Land a role and you're in production for several weeks,
earning pay and—on wrap—fame, skill, and prestige.

**Genre specialization.** Every role has a genre (🎭 Drama, 😂 Comedy, 💥 Action,
👻 Horror, 🚀 Sci-Fi, 💖 Romance). The more you work in a genre, the better your
audition odds for similar roles — and the more your top genre becomes your public
brand (e.g. *Action Star*, *Scream Queen*), shown on your Career page.

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
- ✍️ **Write scripts** — sell them to studios, or produce them yourself.
- 🎬 **Produce** films at micro / mid / blockbuster budgets. Box office depends
  on script quality, your producing skill, and—if you also **direct**—your
  directing skill.

**Award season** happens at the end of each year. Prestigious work earns
nominations and possibly a **Golden Star**, rocketing your fame and reputation.

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
