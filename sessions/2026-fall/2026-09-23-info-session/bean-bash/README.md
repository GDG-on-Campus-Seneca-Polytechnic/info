# Bean Bash

A Fall Guys–style trivia game for our events. The projector shows a 3D arena; the audience joins on their phones by scanning a QR code. Each question, you drag your bean onto one of four answer platforms before the timer ends. The wrong platforms drop away and those beans fall. Last bean standing wins.

One round type, on purpose. Nobody needs instructions, and a new group can be playing within a minute.

**Live at <https://gdg-bean-bash.tatandat110105.workers.dev>** — the arena is at `/arena.html`, players join at `/`.

## Running the night of the event

1. Open the arena page on the laptop driving the projector and put it full screen.
2. The page shows a QR code and a 4-letter room code. Leave it up while people arrive and eat.
3. Press **S** to start. Questions last 20 seconds, then a 6-second reveal.
4. Keep the browser tab open. Reloading is safe (the room is in the URL), but closing it ends the room.

Host keys on the arena page:

| Key | What it does |
| --- | --- |
| `S` | Start a game |
| `N` or space | Skip to the next question |
| `R` | Revive everyone, so knocked-out players are back in |
| `Esc` | New game, back to the lobby |

The same buttons are along the bottom of the screen if you'd rather click.

**Run it in short bursts.** Eight to ten questions takes about eight minutes. Run a game while people arrive, another after the team intros, and a final one for a prize. Anyone who arrives mid-game is marked as waiting and joins the next one.

## Editing the questions

Questions live in [`src/questions.json`](src/questions.json). Each one has the question text, four answers, and `correct` as the index of the right answer (0 is the first answer, 3 is the last).

```json
{
  "text": "What does the 'G' in GDG stand for?",
  "answers": ["Great", "Google", "Global", "Graduate"],
  "correct": 1
}
```

Keep answers short: they are printed on the platforms. Mix easy and silly ones so students who don't code still have fun. Questions are shuffled every game.

## Running it on your own machine

```bash
npx wrangler dev
```

Then open `http://localhost:8787/arena.html` for the screen and `http://localhost:8787/` for a phone. Phones on other devices can't reach `localhost`, so test a real crowd against the deployed version.

## Deploying

The game runs on Cloudflare Workers, which is free at our size. First time on a new machine:

```bash
npx wrangler login
```

Then, from this folder:

```bash
npx wrangler deploy
```

Wrangler prints the URL. That URL is what the QR code points at, so it works on Seneca Wi-Fi and on cellular data.

## How it works

| Piece | What it does |
| --- | --- |
| `src/server.js` | The room. One Durable Object per room code, holding players, the current question, and the timer. It is the only thing that decides who is knocked out. |
| `public/arena.html`, `public/arena.js` | The projector view. 3D arena, beans, QR code, host controls. |
| `public/index.html`, `public/phone.js` | The phone. Join, pick a colour, drag your bean. |
| `public/screen.html`, `public/screen.js` | A flat 2D version of the screen. Backup if 3D misbehaves on the venue laptop. |
| `src/questions.json` | The questions. |

Phones send where their bean is standing, ten times a second. The server works out which platform that is, and the correct answer never leaves the server until the reveal, so nobody can peek by opening the developer console.

## If something goes wrong

- **Phones can't join.** Check that the QR code points at the deployed URL and not at `localhost`.
- **The 3D arena is slow on the venue laptop.** Use `/screen.html` instead. Same game, flat 2D, much lighter.
- **Everyone is knocked out at once.** Press `R` to revive them all and keep going.
- **The whole thing misbehaves.** Have a Kahoot with the same questions ready and switch. Nobody will mind.
