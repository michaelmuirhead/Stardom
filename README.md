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

Enter a stage name (or leave blank for a random one) and start your career.
Progress autosaves to your browser — use **Continue** to resume.

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
