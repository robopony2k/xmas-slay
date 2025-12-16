# xmas-slay

A Vite-powered holiday game prototype.

## Getting started
1. Install Node.js 18+ (see instructions below).
2. From the project folder (the directory containing `package.json`), install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open the printed `http://localhost:...` URL in your browser.

### How to install Node.js 18+
- **Windows (recommended):**
  1. Download the latest 18.x LTS installer from [nodejs.org](https://nodejs.org/en/download/prebuilt-installer).
  2. Run the installer and keep the default options (it adds `node`/`npm` to your PATH).
  3. Restart any open terminals so they pick up the new PATH entries.
- **macOS & Linux (recommended):**
  1. Install `nvm` (Node Version Manager) by following the official instructions for your shell: <https://github.com/nvm-sh/nvm#installing-and-updating>.
  2. After installing `nvm`, run `nvm install 18` to install Node.js 18 and `nvm use 18` to activate it.
  3. Confirm the version with `node -v` (it should print something like `v18.x.x`).
- **Direct downloads:** If you prefer not to use `nvm`, download platform-specific installers or binaries from <https://nodejs.org/en/download> and ensure `node` and `npm` are on your PATH.

## Troubleshooting
- **CORS error when loading `main.js`**: Make sure you are visiting the local dev server URL (e.g., `http://localhost:5173`) instead of opening `index.html` via `file://`. Browsers block file-based script requests.
- **`ENOENT: no such file or directory, open '.../package.json'` during `npm install`**: Run the command from inside the project directory (`xmas-slay`) so Node can find `package.json`.

## Scripts
- `npm run dev` — start the Vite dev server.
- `npm run build` — type-check and build for production.
- `npm run preview` — preview the production build locally.
