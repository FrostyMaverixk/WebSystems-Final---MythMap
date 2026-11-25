# Myths Map

A local Philippine folklore atlas using Mapbox GL JS 3.35.2, Three.js r160 and the dependency-free Node/JSON server. The built-in collection contains the 17 creatures from the attached WebSystems project. Approved community stories use a shared pin.

## The 17 creatures

Every entry has a transparent 2D map sprite, its full illustrated plate and a distinct animated 3D model. The attachment defines the meshes, materials, part transforms and motion in `Script/engine.js` through `createEncounterModel(id)`. Their drop-in home is [Script/encounter-scene.js](Script/encounter-scene.js). Each model key below selects the matching branch in that file. The attachment supplies the animations as time-driven poses. Each ink PNG preserves the corresponding updated canvas drawing from its `Script/creatures.js`. The original WebP story banners are in `assets/banners/`.

| Creature | 2D map sprite | Full 2D illustration | 3D model key |
| --- | --- | --- | --- |
| Amdag | [assets/ink/amdag.png](assets/ink/amdag.png) | [assets/amdag.png](assets/amdag.png) | `amdag` |
| Amomongo | [assets/ink/amomongo.png](assets/ink/amomongo.png) | [assets/amomongo.png](assets/amomongo.png) | `amomongo` |
| Borak | [assets/ink/borak.png](assets/ink/borak.png) | [assets/borak.png](assets/borak.png) | `borak` |
| Buyagan | [assets/ink/buyagan.png](assets/ink/buyagan.png) | [assets/buyagan.png](assets/buyagan.png) | `buyagan` |
| Duwende | [assets/ink/duwende.png](assets/ink/duwende.png) | [assets/duwende.png](assets/duwende.png) | `duwende` |
| Janggu | [assets/ink/janggu.png](assets/ink/janggu.png) | [assets/janggu.png](assets/janggu.png) | `janggu` |
| Magindara | [assets/ink/magindara.png](assets/ink/magindara.png) | [assets/magindara.png](assets/magindara.png) | `magindara` |
| Manananggal | [assets/ink/manananggal.png](assets/ink/manananggal.png) | [assets/manananggal.png](assets/manananggal.png) | `manananggal` |
| Mangyan Nature Spirit | [assets/ink/mangyan_nature_spirit.png](assets/ink/mangyan_nature_spirit.png) | [assets/mangyan_nature_spirit.png](assets/mangyan_nature_spirit.png) | `mangyan_nature_spirit` |
| Mumu | [assets/ink/mumu.png](assets/ink/mumu.png) | [assets/mumu.png](assets/mumu.png) | `mumu` |
| Sarimanok | [assets/ink/sarimanok.png](assets/ink/sarimanok.png) | [assets/sarimanok.png](assets/sarimanok.png) | `sarimanok` |
| Sigbin | [assets/ink/sigbin.png](assets/ink/sigbin.png) | [assets/sigbin.png](assets/sigbin.png) | `sigbin` |
| Tambanokano | [assets/ink/tambanokano.png](assets/ink/tambanokano.png) | [assets/tambanokano.png](assets/tambanokano.png) | `tambanokano` |
| Tarabusaw | [assets/ink/tarabusaw.png](assets/ink/tarabusaw.png) | [assets/tarabusaw.png](assets/tarabusaw.png) | `tarabusaw` |
| Tikbalang | [assets/ink/tikbalang.png](assets/ink/tikbalang.png) | [assets/tikbalang.png](assets/tikbalang.png) | `tikbalang` |
| Tiyanak | [assets/ink/tiyanak.png](assets/ink/tiyanak.png) | [assets/tiyanak.png](assets/tiyanak.png) | `tiyanak` |
| White Deer | [assets/ink/white_deer.png](assets/ink/white_deer.png) | [assets/white_deer.png](assets/white_deer.png) | `white_deer` |

## Start locally

Use Node.js 20 or newer. Open a terminal in the folder containing `server.mjs`. The application and the baker use Node built-ins. The browser libraries and the interface fonts are included.

The working folder supplied with this handoff already has your public Mapbox token in its private `.env`. For a fresh unzip, copy `.env.example` to `.env` and fill it in as shown. Preserve any existing `.env` and `data/store.json` when updating an installation.

```dotenv
MAPBOX_TOKEN=YOUR_PUBLIC_PK_TOKEN
MAPBOX_STYLE=
```

Leave the style empty to use the included vintage design. To use Studio, enter a published `mapbox://styles/USERNAME/STYLE_ID` URL. If your token has URL restrictions, allow the local origin you open. [Mapbox access tokens](https://docs.mapbox.com/help/getting-started/access-tokens/)

From the directory containing `server.mjs`, run:

```sh
npm start
```

The server reads the two Mapbox settings from the adjacent `.env` at startup. Exported values take precedence. The macOS and Windows launchers start the same server. If a copy already occupies port 3000, stop that process in its terminal with Ctrl+C before restarting it.

Open the atlas and choose **Continue as guest**. With the bundled style, the Philippine land, shoreline and parchment fills come from `assets/ph-coastline.json`, served by your Node server. Neighboring countries and labels use hosted Mapbox services. To use the local Philippine coastline on another computer, transfer the entire project and leave `MAPBOX_STYLE=` empty. With an empty token, Discover, the reader and account actions still run locally. After changing the settings, restart the server with the new environment and choose **Reload map**. [Open the local atlas](http://127.0.0.1:3000/)

The server creates `data/store.json` on first start. To use an existing store, point `DATA_DIR` at its directory and keep the account environment variables from that installation. Run a single server against a given store. This distribution contains source and public assets only.

## How the map lines up

Mapbox owns one WebGL2 canvas, its Mercator camera, native gestures and frame schedule. Longitude increases X eastward, latitude decreases Y northward. Both custom layers apply the supplied matrix relative to a common origin at 121.5° E, 13° N, which keeps vertex values small at zoom 15. [Mapbox Three.js custom-layer example](https://docs.mapbox.com/mapbox-gl-js/example/add-3d-model/)

The **ocean-shader** layer draws a 2D quad across the allowed navigation bounds. Its distance texture measures projected distance to Philippine land. For a Mercator position `p`, the shader samples `(p - min) / (max - min)`, with the two vectors read from the bake metadata. PNG row zero represents the north edge and `flipY = false`. Depth controls the shallow, mid and deep water colors. The opaque vector fills above the ocean define the coastline, including beyond the texture’s resolution.

The wake shader converts Mercator displacements back to the original east/north radian units for the wave normals. The CPU provides forward directions and at most 64 live trail samples. Both sides use a 1.2-second lifetime. Width is 7.5 CSS pixels at zero pitch, converted with `512 × 2^zoom`. Foam noise runs only at crests.

**creatures-and-clouds** draws the transparent ink billboards at every zoom, 52 CSS pixels wide with a 1.3× sea multiplier. Approved community stories share a pin. Markers follow ground elevation and keep their screen-space hit area. With Effects on, five brighter cloud banks drift across the viewport and fade at the ends of their lifetimes.

Selecting a story focuses the map at zoom 9.5 or closer. **Enter 3D view** opens the creature’s original habitat in a separate perspective viewer with orbit and zoom. The full-size plate opens from the illustration in the reader. Effects off freezes the animation and stops continuous repaint requests. The encounter pauses the underlying map's animation loop while open.

At close zoom the camera eases toward 30° pitch. Selecting a story measures the visible reader and chooses padding for the largest clear part of the map. Reduced motion and Effects off use an unpitched focus. Mobile readers typically leave open space above them, desktop readers to their left.

## Mapbox Studio recipe

The complete **Style Specification v8** definition is in `assets/atlas-style.json`. It can be used immediately as the local default. For a Studio copy, upload that JSON as a new style from the Styles page. Alternatively create an empty, editable style, add the three sources below, and reproduce the layers in the listed order. Set projection to **Mercator**. [Mapbox Studio interface](https://docs.mapbox.com/console-tools/studio/studio-interface/)

| Source ID | Type | Tileset URL | Source layer or options |
| --- | --- | --- | --- |
| `countries` | vector | `mapbox://mapbox.country-boundaries-v1` | `country_boundaries` |
| `streets` | vector | `mapbox://mapbox.mapbox-streets-v8` | `natural_label`, `place_label` |
| `relief` | raster-dem | `mapbox://mapbox.mapbox-terrain-dem-v1` | Tile size 512, maximum source zoom 14 |

In **Images → Upload SVG**, select `assets/parchment-grain.svg` and name it `parchment-grain`. It is a 64 × 64 transparent repeat tile. Place its pattern fill above the opaque parchment fill. The local app also registers this image when a style has no matching sprite. [Studio SVG and pattern support](https://docs.mapbox.com/help/troubleshooting/studio-svg-upload-errors/)

| Bottom to top | Layer ID | Paint and selection |
| --- | --- | --- |
| 1 | `ocean-paper` | Background `#112b39` |
| 2 | `ocean-shader` | Added by the app before `ph-land`. Shallow `#3c6b77`, mid `#1d4656`, deep `#112b39` |
| 3 | `ph-land` | Opaque country fill `#e9d9b6`, ISO code `PH` |
| 4 | `neighbor-land` | Remaining countries, opaque muted sage `#9caa9e` |
| 5 | `ph-parchment` | Same Philippine filter, fill-pattern `parchment-grain`, opacity 0.36 |
| 6 | `engraved-relief` | Hillshade from `relief`. Map-anchored light at 315°, exaggeration 0.3, shadows and accent `#c9ae82`, highlights `#f7f3e9` |
| 7 | `ph-shore` | Philippine outline `#c9ae82`, width 0.5 px at zoom 4.5 interpolating to 1.1 px at zoom 12 |
| 8 | `province-label` | Streets `place_label`, class `state`, ISO `PH`, minimum zoom 7 |
| 9 | `island-label` | Streets `natural_label`, class `landform`, island/islet/archipelago types, minimum zoom 7 |
| 10 | `creatures-and-clouds` | Added by the app after the style layers |

Use the country filters in the JSON, including `disputed = "false"` and the `all`/US worldview selection. Both symbol layers use ink `#243b3e`, a 1 px paper halo `#f7f3e9`, and the English or local feature name. The JSON contains the exact label font stack, spacing and zoom expressions. [Country polygon fields](https://docs.mapbox.com/data/tilesets/reference/mapbox-countries-v1/) · [Streets label fields](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/)

The supplied style enables terrain automatically. In Studio select the `relief` DEM under Terrain. Use the following top-level setting to transition from a flat overview to raised ground at close zoom. The camera pitches up to 30° with Effects on. [Mapbox terrain specification](https://docs.mapbox.com/style-spec/reference/terrain/)

```json
"terrain": { "source": "relief", "exaggeration": ["interpolate", ["linear"], ["zoom"], 6, 0, 9, 1.25, 12, 1.6] }
```

With `MAPBOX_STYLE=` empty the app uses local hillshade and can switch to its bundled Philippine elevation tiles if the hosted elevation source fails. The fallback covers 115.5–127.5° E and 3.5–22.5° N at source zooms 4–8. At closer zooms the fallback magnifies this coarser relief. Terrain Tiles from Mapzen supply USGS SRTM/GMTED2010 and NOAA ETOPO1 data. For the local tiles, samples below sea level were raised to sea level to keep the atlas ocean level. [Dataset and credits](https://registry.opendata.aws/terrain-tiles/) · [Attribution details](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)

Publish your Studio style, copy its published style URL into `MAPBOX_STYLE`, restart the server and select **Reload map**. Keep `ph-land` as the first opaque land layer in a custom atlas style. A starter style with a recognized land-fill ID can use that ID directly. For background-based or imported styles, the app inserts its own vector coastline mask and uses the bottom slot when available. Other layers in a starter style retain that style’s appearance. [Mapbox layer ordering](https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/)

## Rebuild and verify

```sh
node scripts/bake-distance-field.mjs
npm test
```

The 1024 × 1024 grayscale PNG and its exact Mercator bounds are already present in `assets/`. Rebake after replacing the offline country TopoJSON. To use a different input or write to a scratch directory, run `node scripts/bake-distance-field.mjs path/to/country.topo.json path/to/output`. The baker decodes arcs, fills polygon interiors and holes, then computes Euclidean distances with separate X and Y pixel spacing. The browser only loads the generated image and JSON. A missing bake uses a neutral 1 × 1 texture.

To check your **hosted style**, enter as guest, zoom from the archipelago to a coast and move the pointer across it. Wakes should stop at land. Check labels just below and above zoom 7. Select Tikbalang from Discover on a desktop and a narrow phone viewport. The reading panel should leave the ink marker visible. Open **Enter 3D view** to turn the model, then return to the illustrated map. Focus the map and try the arrow keys, +, − and Home. Turn Effects off, let the camera settle, and check that the map stops animating. Sign in as an explorer to place a pin, or press Escape to cancel.

The Node tests cover account permissions, CSRF, submissions, moderation, bookmarks, config, asset serving, all 17 creature models and the north-first distance texture. Safari WebGL2 checks exercise close-zoom ink markers, map picking, coastal and hill habitats, encounter controls, and idle behavior with Effects off. The hosted default style and the Tikbalang encounter were also opened on localhost. Use a physical touch device to check the feel of pinch gestures.

The two project skills live in `.agents/skills/`. Open this project in Codex to use `$myths-map-rendering` for atlas changes and `$playwright` for browser checks.

## Demo accounts

Choose an account role on the sign-in screen, then enter these values:

| Role | Email / username | Password | Access |
| --- | --- | --- | --- |
| Admin | `admin` | `admin` | Explore, save stories, submit stories, review all community submissions |
| Explorer / User | `admin` | `admin` | Explore, save stories, submit stories, track personal submissions |
| Guest | No credentials | No credentials | Browse the map, search and read published stories |

The sign-in field accepts `admin` even though it is not a formatted email address. Choosing the role distinguishes the two demo accounts. These shared demo credentials were requested for the project; replace them before publicly deploying it.

## Main workflows

- **Explore:** search the story library, filter land or sea stories, and select a tale to focus its location on the map.
- **Contribute:** sign in as an explorer or admin, choose Share a Myth, select a location and submit a story. New stories start as pending.
- **Dashboard** gives administrators two views. Submissions supports filtering by owner and status, approval, rejection and removal. Accounts lists each stored account, its current session status and submission count. Removing another account revokes its sessions and clears its bookmarks. Its stories remain for separate moderation. Removing a submission clears it from the atlas, review history and saved collections. Guest visits are temporary sessions.
- **Track:** explorers can check their submission history, including review decisions and notes.
- **Collect:** signed-in accounts can bookmark stories. Each account has its own saved collection.
- **Guest mode:** browse without entering an email or password. Sign in to contribute or save a collection.

## Saved data and accounts

The server creates `data/store.json` on its first run. It stores password hashes, community stories, review decisions and per-account bookmarks. The file is private and is never served as a web asset. Back up the `data` folder to preserve submissions.

Sessions use HttpOnly, SameSite cookies and expire after eight hours. Restarting the server signs everyone out while retaining stories and bookmarks. Sensitive operations check role permissions on the server and require a session CSRF token. Passwords use individually salted scrypt hashes; failed sign-in attempts are rate limited.

This project uses two shared demo accounts. It does not include account registration, password recovery, email delivery or a multi-user identity provider. Earlier browser-only submissions stored by the original project in `localStorage` are not automatically imported.

## Configuration

Environment variables can override the defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAPBOX_TOKEN` | empty | Public browser token for hosted tiles, glyphs and styles |
| `MAPBOX_STYLE` | empty | Published Studio style URL. Empty selects the bundled atlas style |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address; use `0.0.0.0` to serve other devices on your network |
| `DATA_DIR` | `data` beside server.mjs | Private saved-data directory |
| `ADMIN_LOGIN` | `admin` | Admin email / username |
| `ADMIN_PASSWORD` | `admin` | Admin password |
| `USER_LOGIN` | `admin` | Explorer email / username |
| `USER_PASSWORD` | `admin` | Explorer password |
| `COOKIE_SECURE` | `false` | Set `true` when serving through HTTPS |

Credentials are applied to their respective demo account at every startup, preserving that account's bookmarks and submissions. Keep custom credential variables configured on later starts; otherwise the demo defaults are applied again. For a public deployment, use HTTPS, distinct strong credentials, `COOKIE_SECURE=true` and a persistent private data directory. The JSON store is intended for a small project running one server process.

Example on macOS/Linux:

```sh
ADMIN_LOGIN=admin@example.com ADMIN_PASSWORD='replace-with-a-strong-password' USER_LOGIN=explorer@example.com USER_PASSWORD='another-strong-password' npm start
```
