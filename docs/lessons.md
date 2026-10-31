# Lessons

What building the prototype taught us, as rules for the next phases. Newest first within each group.

## Testing and verification
- **Test like a player.** Tap what a player would tap (the glass of a door, a chair, a person), not a tile coordinate. A door you could only enter by tapping the floor behind it felt like an invisible wall, and tile-based tests missed it.
- **Check every screen on a phone and a desktop size** before calling it done, with screenshots.
- **Measure, don't guess.** The walk looked like sliding until its speed was measured from the clip. Fonts are checked for clear digits and Turkish letters before they are adopted (Pixelify Sans turned 2 and 5 into Z and S).
- **Check HUD panels against the world labels.** Three's label renderer gives every label its own z-index, so names and signs drew over panels on phones until the label layer got a stacking context of its own.
- **Test crowds, not just pairs.** Four players on one spot showed what two never did: bubbles stacking and folding, and lines folding into icons.
- **Locale-aware text from day one.** Lowercasing "IŞIK" letter by letter gave "işık"; the whole message has to be handled at once.

## 3D and art
- **Learn a model's texture layout by rendering it.** Put a labeled grid (and then labeled bands) on the model and look at it from four sides; guessing from the shipped skins was wrong about the torso and arms.
- **Painted details have limits.** Hair painted on the head cannot reach the shoulders, so long, bob and short hair look alike. Real hairstyles need hair meshes or a modular character.
- **Never put two surfaces at the same height where they overlap.** Coplanar faces flicker as the camera moves (z-fighting). Offset them or stop them from overlapping.
- **Things behind a wall still show above it** in an isometric view; height plus depth decides what is hidden.
- **Get a reference image before art work.** The Stardew Valley screenshot turned into a panel style in one pass; vague wishes take many rounds.
- **Make art decisions before polishing.** Furniture size, chair height and poses are tuned to the character, so a room is polished after its characters are chosen, not before.
- **Avoid import cycles in `shared`.** Protocol schemas need the status lists and the status code needs text cleanup, so cleanup lives in its own `text.ts`; a cycle would break at load time, not at compile time.
- **Keep systems apart from art.** Appearance, status and rules are data in `shared`; how they are drawn lives in one client module, so swapping models does not touch the rest.

## Layout and design
- **Lay rooms out by how people move.** Entrance and main destination on one straight line, service desks facing arrivals, side rooms off the main path, arriving and leaving never crossing.
- **Put boards and signs where nothing frames them.** The first notice board stood behind the entrance's door frame and was hard to see; move it until a screenshot shows it plainly.
- **Measure movement, do not eyeball it.** Sampling a walker's screen position every 50 ms from another player's view showed the stop-and-go at every tile and proved the fix; a single screenshot never shows feel.
- **On an isometric screen, keys must follow the screen.** Map axes look diagonal from the camera, so "up" walking up-right felt broken.
- **A quick key tap must still do something.** Smooth braking turned short taps into nothing; a tap now always takes one step.
- **Anything a body can walk into must block the tile.** A floor lamp on a walkable tile was invisible with tile steps and obvious with free movement.
- **Check the HUD at phone width after adding a link or button.** The phone link pushed the top links under the room chat button and a door sign drew over them; the row now wraps and sits above world labels.
- **Ask before throwing away someone's progress.** Standing up or leaving with a timer running asks first, and "stay" is always one of the answers.
- **Make doors read as doors without labels:** frame, leaves, doormat and a sign, and let them open as people approach.
- **Rooms should fit their content.** Big empty floors look unfinished; shrink the room before adding filler.

## Process
- **One cycle = one roadmap step + the top 3–5 issues**, then commit, deploy and try it on a phone.
- **Fix what breaks the core loop immediately** (entering, walking, sitting, seeing others); everything else goes on the list and is polished in the phase that touches that room anyway.
- **Feedback works best one topic per message**, with a screenshot, "expected vs. saw" and a priority (must / nice).
- **Prefer what deploys without manual setup.** A Durable Object's own SQLite needed no new resource, while D1 would have blocked the deploy until someone created a database by hand.
- **Restart the dev server cleanly.** A leftover `workerd` process locks the local SQLite file; stop every `wrangler`/`workerd` process before starting again.
