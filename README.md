# It's a Gift 💍

*"It's a gift."* — a Lord of the Rings themed Secret Santa for you and your friends.

## Run it

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`). There are no npm dependencies.

```sh
npm start          # http://localhost:3000
npm test           # unit + HTTP integration tests
```

| Env var    | Default          | Meaning |
|------------|------------------|---------|
| `PORT`     | `3000`           | HTTP port |
| `DB_PATH`  | `./data.sqlite`  | SQLite database file |
| `BASE_URL` | from `Host` header | Public URL used in generated links, e.g. `https://gift.example.com` |
| `MEME_DIR` | `./public/meme`  | Folder holding the Boromir photo |

To let friends reach it from their own devices, deploy it somewhere public (any VPS or Node host
with a persistent disk) and set `BASE_URL`. For a quick test you can use a tunnel such as
`cloudflared tunnel --url http://localhost:3000`.

## How it works

1. **Forge**: the organizer creates a Fellowship and gets a secret *organizer link*.
2. **Gather**: friends open the *invite link*, enter their name and wishlist, and each gets a secret *personal link*.
3. **Exclusions** (optional): the organizer marks pairs who shouldn't draw each other.
4. **Cast lots**: the organizer runs the draw. The Fellowship is then sealed.
5. **Reveal**: everyone opens their personal link and reveals whom they bear a gift for.

There are no accounts. The links are the keys (128-bit random tokens), so keep them private.
The organizer page never shows who drew whom, but it does let the organizer resend
someone's personal link, which means an organizer *could* peek. That's an accepted trade-off
for a game among friends.

## Boromir 📸

Save the famous *"It's a gift"* photo of Boromir into `public/meme/`. Any filename works, as long as
it's a jpg/png/webp/gif/avif (if there are several, a name containing "boromir" wins). No restart is
needed, and `npm start` tells you whether he was found. Once it's there:

- there's a 1-in-5 chance per page view (at most once every 2 minutes) that he peeks in from the corner,
- he blesses **every** reveal, and everyone in a Fellowship gets a different saying (see `src/lore.js`),
- clicking the *"It's a gift."* quote in the footer always summons him,
- adding `?boromir` to any URL forces the cameo, which is handy for showing off.

Without the photo, the site works normally with no meme.

<details><summary>Easter eggs (spoilers!)</summary>

- Members named Frodo, Sam, Gandalf, Aragorn, Legolas, Gimli, Boromir, Merry, Pippin, Bilbo,
  Galadriel, Gollum/Sméagol, Sauron or Saruman get a special greeting.
- Click any ring (the header logo on every page, the big ring on the home and invite pages, or the ring on
  the gift page) to put it on. Sauron will see you, out loud (`public/sauron.mp3`).
- Type `mellon` on any page (outside a text field).
- If an exchange date is set, personal pages count down the sleeps, and something special happens on the day itself.
- Open the browser's developer console.

</details>

## Themes

A sun/moon button in the header switches between **Shadow of Mordor** (dark, with rising embers)
and **Morning in Rivendell** (light, with golden motes). The first visit follows the system
setting, and the choice is remembered after that.

See `PLAN.md` for the design and revision notes.
