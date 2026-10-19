# Camel Up Exact Leg Analyzer

An exact probability calculator for **Camel Up (Second Edition)**. It enumerates every possible outcome of the rest of a leg rather than using random simulation.

It models camel towers, both crazy camels, the grey-die exceptions, cheering and booing spectator tiles, and races that end before the leg is complete.

## Fastest way to use it

### Windows executable — no installation

1. Download `CamelUpAnalyzer.exe` from this GitHub release.
2. Double-click the executable.
3. Your browser opens automatically with the analyzer.
4. Keep the small terminal window open while using the app.
5. Close the terminal or press `Ctrl+C` when finished.

The executable starts a private server accessible only from the same computer. Board data is not uploaded anywhere.

Because the executable is not digitally signed, Windows SmartScreen may show a warning. Only choose **More info → Run anyway** when you received the file from someone you trust.

### Source version — Node.js required

Install [Node.js](https://nodejs.org/) 18 or newer, download or clone this repository, and run:

```powershell
node .\server.js --open
```

On Windows, you can instead double-click `start-interface.cmd`.

## Using the interface

The interface lets you:

- Mark dice that have already been rolled
- Drag or click camels onto the 16 track spaces
- Arrange towers in exact top-to-bottom order
- Cycle empty spaces between no tile, cheering and booing
- Calculate exact finishing and movement probabilities

The current setup is saved automatically in the browser.

## Build the Windows executable

The build uses the maintained `@yao-pkg/pkg` packager. Node.js and npm are required only on the computer building the executable.

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build:exe
```

The shareable file is created at:

```text
dist\CamelUpAnalyzer.exe
```

Your friend only needs that single `.exe` file. They do not need Node.js or the source folder.

To rebuild exactly from `package-lock.json`, use `npm.cmd ci` instead of `npm.cmd install`.

### Attach the executable to GitHub

Do not commit the large generated executable into the repository. Instead:

1. Open the repository on GitHub and select **Releases**.
2. Select **Draft a new release**.
3. Create a tag such as `v1.0.0`.
4. Drag `dist\CamelUpAnalyzer.exe` into the release attachments area.
5. Publish the release and send its link to your friend.

## Development

Start the local server at [http://127.0.0.1:4173](http://127.0.0.1:4173):

```powershell
npm.cmd start
```

Run all analyzer and web integration tests:

```powershell
npm.cmd test
```

## Command-line interface

Node.js 18 or newer is recommended.

```powershell
node .\camel-up-analyzer.js .\sample-state.json
```

The included shortcut analyzes the sample state:

```powershell
npm run analyze
```

For machine-readable output:

```powershell
node .\camel-up-analyzer.js .\sample-state.json --json
```

## Input format

Create a JSON file like `sample-state.json`:

```json
{
  "trackLength": 16,
  "stacks": [
    { "space": 2, "camels": ["purple"] },
    { "space": 3, "camels": ["blue", "yellow"] },
    { "space": 5, "camels": ["green", "red"] },
    { "space": 14, "camels": ["black"] },
    { "space": 16, "camels": ["white"] }
  ],
  "traps": [
    { "space": 7, "side": "cheer", "owner": "Alice" },
    { "space": 11, "side": "boo", "owner": "Bob" }
  ],
  "remainingDice": ["blue", "green", "yellow", "red", "purple", "grey"]
}
```

- Valid racing camel names are `blue`, `green`, `yellow`, `red`, and `purple`.
- The crazy camels are `white` and `black`.
- In each stack, list camels **from bottom to top**.
- `traps` is optional. Its `owner` field is optional and only labels the report.
- `remainingDice` lists the dice currently inside the pyramid. Use `grey` for the crazy-camel die. At the start of a leg, list all six dice. Partway through a leg, remove the dice already revealed.
- `trackLength` defaults to 16.

The script validates the normal placement restrictions: all camels must appear exactly once, spectator tiles must be on empty non-adjacent spaces, and tiles cannot be on space 1.

## Reported statistics

- Exact probabilities of every racing camel finishing the leg in each rank.
- Expected final rank and final space.
- Net displacement, which is signed in the racing direction (a camel carried backward can have a negative value).
- Total distance travelled, which counts all movement in either direction, including movement while being carried.
- Variance and standard deviation for the movement metrics in JSON output.
- Probability of the race ending during the leg and expected number of additional dice revealed.
- Trigger probability and expected Egyptian Pounds for every spectator tile.

All branches are probability-weighted correctly. Grey results such as white-2 and black-2 are distinct outcomes with probability 1/6 each. If the race ends before the leg would normally finish, the branch stops immediately and its remaining probability mass is preserved.
