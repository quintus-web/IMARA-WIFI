# Hotspot Router Map

A simple, static map for keeping track of where your Wi-Fi hotspot routers are installed. No backend, no database, no build step — just HTML, CSS, and vanilla JavaScript, using [Leaflet.js](https://leafletjs.com/) and OpenStreetMap tiles.

Your router data is saved in your browser's `localStorage`, and you can export it to a JSON file at any time for backup.

## Files

```
index.html   The page structure
style.css    All styling
app.js       All app logic (map, storage, forms, import/export)
README.md    This file
```

## Running it locally

Just open `index.html` in a browser — or, better, serve the folder with any static server so geolocation and Leaflet tiles behave normally, e.g.:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Hosting on GitHub Pages

1. Create a new GitHub repository, e.g. `hotspot-router-map`.
2. Add these four files to the repo root.
3. Commit and push:

   ```bash
   git init
   git add .
   git commit -m "Initial hotspot router map"
   git branch -M main
   git remote add origin https://github.com/<your-username>/hotspot-router-map.git
   git push -u origin main
   ```

4. In the repo on GitHub, go to **Settings → Pages**.
5. Under **Build and deployment**, set **Source** to `Deploy from a branch`, choose branch `main` and folder `/ (root)`, then save.
6. After a minute or two, your map will be live at:

   ```
   https://<your-username>.github.io/hotspot-router-map/
   ```

No server, database, or API keys are needed — everything runs in the visitor's browser.

## Using the app

- **Map** — the whole screen is an interactive Leaflet/OpenStreetMap map. Each router is a colored pin: 🟢 Active, 🔴 Offline, 🟡 Problem.
- **Router list** — the side panel (☰ menu on mobile) lists every router. Tap one to fly the map to it and open its details.
- **+ Add Router** — opens a form. Fill in the ID, model, status, and notes, then tap anywhere on the map to drop the pin — the latitude/longitude fill in automatically and a preview is shown before you save.
- **Marker popup** — tap any pin to see its full details, with **Edit** and **Delete** buttons. Deleting always asks for confirmation first.
- **Use My Location** — asks for GPS permission and centers the map on you. If the Add/Edit form is open, it also places the router at your current position — handy when you're standing next to the router you're installing.
- **Export Data** — downloads all your routers as a `.json` file, for backup or moving to another device/browser.
- **Import Data** — pick a previously exported (or hand-written) JSON file. It's validated first; you'll then be asked whether to **merge** it into your current routers (matching IDs get updated) or **replace** everything.

## Router data format

Each router is a plain JSON object:

```json
{
  "id": "R01",
  "model": "Tenda F6",
  "lat": -1.2345,
  "lng": 36.8765,
  "status": "active",
  "notes": "Installed at the shop"
}
```

`status` is one of `"active"`, `"offline"`, or `"problem"`.

## Notes on data safety

- All data lives only in the current browser's `localStorage` — clearing site data/cookies will erase it, so export a backup regularly.
- Because there's no server, data isn't automatically shared between devices or browsers. Use **Export**/**Import** to move it around.