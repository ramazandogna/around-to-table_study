# Lessons

What building the prototype taught us, as rules for the next phases. Newest first within each group.

## Testing and verification
- **Test like a player.** Tap what a player would tap (the glass of a door, a chair, a person), not a tile coordinate. A door you could only enter by tapping the floor behind it felt like an invisible wall, and tile-based tests missed it.
- **Check every screen on a phone and a desktop size** before calling it done, with screenshots.
- **Measure, don't guess.** The walk looked like sliding until its speed was measured from the clip. Fonts are checked for clear digits and Turkish letters before they are adopted (Pixelify Sans turned 2 and 5 into Z and S).
- **Check HUD panels against the world labels.** Three's label renderer gives every label its own z-index, so names and signs drew over panels on phones until the label layer got a stacking context of its own.
- **Test crowds, not just pairs.** Four players on one spot showed what two never did: bubbles stacking and folding, and lines folding into icons.
- **Locale-aware text from day one.** Lowercasing "IŞIK" letter by letter gave "işık"; the whole message has to be handled at once.
- **Test on a slow frame, not only a fast one.** The seated "running" legs came from a blend that slipped back towards standing on every other frame; at 60 fps that was an 8 % shiver, on a phone at low frame rate it was half the pose. Logging the blend frame by frame found it, where screenshots on a fast machine never would.
- **Reproduce a mobile bug on a phone engine before fixing it.** Empty emote buttons could not be reproduced in Chromium or WebKit; the icons that really looked empty were the HUD's 🏷️ and 📜.
- **A presence count needs a heartbeat.** Hibernated WebSockets stay "open" long after a phone sleeps; test the sweep with a socket that never pings and wait the full timeout.
- **Measure taps over a thing's whole shape.** Sampling 27 points on every chair showed that only half of a chair could be tapped, everywhere, not just at the "hard" desk; the centre alone looked fine.
- **Fake the clock to test events.** Shifting `Date` in the page showed the Thursday meetup, the calendar in two time zones and the dressed room without waiting a week.

## 3D and art
- **Learn a model's texture layout by rendering it.** Put a labeled grid (and then labeled bands) on the model and look at it from four sides; guessing from the shipped skins was wrong about the torso and arms.
- **Painted details have limits.** Hair painted on the head cannot reach the shoulders, so long, bob and short hair look alike. Real hairstyles need hair meshes or a modular character.
- **Never put two surfaces at the same height where they overlap.** Coplanar faces flicker as the camera moves (z-fighting). Offset them or stop them from overlapping.
- **Things behind a wall still show above it** in an isometric view; height plus depth decides what is hidden.
- **Get a reference image before art work.** The Stardew Valley screenshot turned into a panel style in one pass; vague wishes take many rounds.
- **Make art decisions before polishing.** Furniture size, chair height and poses are tuned to the character, so a room is polished after its characters are chosen, not before.
- **Avoid import cycles in `shared`.** Protocol schemas need the status lists and the status code needs text cleanup, so cleanup lives in its own `text.ts`; a cycle would break at load time, not at compile time.
- **Keep systems apart from art.** Appearance, status and rules are data in `shared`; how they are drawn lives in one client module, so swapping models does not touch the rest.
- **Look at the atlas before recolouring a model.** Mini Characters are two meshes on one colour atlas with shared swatches, so recolouring had to work per vertex; mapping every swatch to its bone and height first showed which parts could be told apart.
- **Check a rule on every model, not one.** The recolour looked right on the first character; rendering all twelve side by side found a crutch and a fringe it got wrong.
- **Read a model's facing from a screenshot.** The laptop's front is the back of its screen, so "turn it to face the person" pointed the screen at the room.

## Layout and design
- **Lay rooms out by how people move.** Entrance and main destination on one straight line, service desks facing arrivals, side rooms off the main path, arriving and leaving never crossing.
- **Put boards and signs where nothing frames them.** The first notice board stood behind the entrance's door frame and was hard to see; move it until a screenshot shows it plainly.
- **Measure movement, do not eyeball it.** Sampling a walker's screen position every 50 ms from another player's view showed the stop-and-go at every tile and proved the fix; a single screenshot never shows feel.
- **On an isometric screen, keys must follow the screen.** Map axes look diagonal from the camera, so "up" walking up-right felt broken.
- **A quick key tap must still do something.** Smooth braking turned short taps into nothing; a tap now always takes one step.
- **Measure an animation's tempo, don't trust a formula.** The walk played twelve times too fast because its "ground speed" was measured on a foot that slid forward after landing; tracing the foot over the cycle showed it at once.
- **Know a rig's rest pose before posing it.** Mini Characters rest in a T-pose, so arms must be aimed by direction, not by angles that assume they hang down.
- **Spread a crowd across the screen, not into it.** People sharing a tile were offset along the camera's depth axis and stood inside each other on screen.
- **Anything a body can walk into must block the tile.** A floor lamp on a walkable tile was invisible with tile steps and obvious with free movement.
- **Check the HUD at phone width after adding a link or button.** The phone link pushed the top links under the room chat button and a door sign drew over them; the row now wraps and sits above world labels.
- **Ask before throwing away someone's progress.** Standing up or leaving with a timer running asks first, and "stay" is always one of the answers.
- **Make doors read as doors without labels:** frame, leaves, doormat and a sign, and let them open as people approach.
- **Rooms should fit their content.** Big empty floors look unfinished; shrink the room before adding filler.
- **A dialog must not live inside something that can fold.** A hidden parent hides its fixed children too; overlays belong in a portal.
- **Keep things that open a board away from things you walk to.** A topic jar beside the notice board opened the board every time.
- **Let the server end what it started for someone else.** Clearing a remote player's dance or cigarette when their body moved on this screen lost it whenever it arrived while they were still walking over.
- **Do not rely on the server for seeking audio.** The dev server answered range requests with the whole file, so Chromium could not jump to the room's point; fetching the track whole and playing it from memory works everywhere.
- **Look at what a hidden overlay covers on a phone.** A joystick moved the chat line, which pushed Send off the screen; the music card sat on the joystick. Every new fixed element needs a phone screenshot.
- **Reproduce a bug before calling it fixed.** The jukebox "black screen" pointed at an effect returning a value, but bringing that line back did not break anything; the report says so rather than claiming a fix.
- **A zustand selector must not build a new array or object.** It re-renders forever; select the plain value and work the rest out in the component.
- **Wait for the state, not for an element to be gone.** A loader that appears a tick after a click passed "no loader" checks and the test acted on the old room.
- **Optimistic switches need the world to watch the store, not the message.** The owner's own switch changed the store first, so the room's echo looked like no change and the owner's pet never came back.
- **Turn a body about the point that stays put.** A pet rearing up or rolling over sank into the floor until it turned about its back paws and its middle.

## Process
- **One cycle = one roadmap step + the top 3–5 issues**, then commit, deploy and try it on a phone.
- **Fix what breaks the core loop immediately** (entering, walking, sitting, seeing others); everything else goes on the list and is polished in the phase that touches that room anyway.
- **Feedback works best one topic per message**, with a screenshot, "expected vs. saw" and a priority (must / nice).
- **Prefer what deploys without manual setup.** A Durable Object's own SQLite needed no new resource, while D1 would have blocked the deploy until someone created a database by hand.
- **Restart the dev server cleanly.** A leftover `workerd` process locks the local SQLite file; stop every `wrangler`/`workerd` process before starting again.

## Durable Object memory does not survive hibernation

The library lamps first lived in a `Set` on the AreaRoom. With the WebSocket hibernation API the object is evicted between messages, so the set came back empty and the librarian's "put it back" was ignored. Anything a room must remember goes to `ctx.storage` (as `opened` already did). Found by a two-browser test, not by reading the code.

## Clean-ups that forget everything also forget preferences

The data epoch reset removed every `att.*` key, including the language just chosen. Keep a list of keys that belong to the person, not the building.

## Test selectors that match text match hints too

`:has-text("Game")` picked the "Silent" preset because its hint says "no games". Select by the most specific text, or by a test id.

## Measure before optimising a crowd

The plan was to drop shadows and name tags in crowds. Turning them off by hand first showed they cost 3 ms of 27; the bodies themselves cost the rest on a software renderer, and nothing at all on a real GPU. The cheap level of detail stays, but the number in the report is the measured one.

## A screen in an orthographic scene is a parallelogram

Laying a page over a 3D surface with its bounding box covered people standing in front of it. With no perspective the projected corners form a parallelogram, and one CSS `matrix()` from three corners fits the page exactly.

## Long labels squeeze form fields

The Turkish "Ne zaman (senin saatinle)" left the date field a few pixels wide in a row of three. Labels above fields hold up in every language.

## A fixed fake clock can stall the page

Playwright's `clock.setFixedTime` froze the loader; shifting `Date` by an offset (time still runs) is what the clock tests need.

## A sleeping room forgets what it had in memory

A player who left while the area room was hibernating stayed seated at a table game forever: the close handler ran before the tables were loaded, found none, and skipped getting them up. Every handler that touches state loaded on a message (close, error, kick) has to load it first, and the room's sweep now also gets absent players up from tables.

## A stacked fixed panel can swallow a dialog's clicks

The smoking room's music card sat at a higher z-index than dialogs, so on a phone its header covered the table game's buttons. Anything that floats over the world stays below the dialog layer.

## Folding letters makes new collisions

Folding Turkish letters to plain ones (ı→i, ö→o) is what lets the swear filter see "sikerim" written as "s1kerim", but it also turns "sıkıntı" and "göt" into "sikinti" and "got". Short words that collide with everyday words are matched only on a form that keeps the Turkish letters.

## A copied record must carry all of its parts

The table logic copied `{ table, secret }` for each move; the new hidden picks of the quick games were dropped on every move until the copy carried them too.

## A rule only the screen enforces is not a rule

Round F stopped people from presenting off the stage, but anyone could still walk up and stand there. A place that belongs to someone is closed in the shared grid, so the client's routes and the server's move check say the same thing; the client only explains it.

## Ask again while the connection is down

The first check after a lost connection ran once, 2.5 seconds in, while a deploy still had the server away: it got no answer and never asked again, so nobody saw the door. A disconnection is explained by asking every few seconds until there is an answer.
