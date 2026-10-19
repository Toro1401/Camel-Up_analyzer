"use strict";

const RACING_CAMELS = ["blue", "green", "yellow", "red", "purple"];
const CRAZY_CAMELS = ["white", "black"];
const ALL_CAMELS = [...RACING_CAMELS, ...CRAZY_CAMELS];
const ALL_DICE = [...RACING_CAMELS, "grey"];
const STORAGE_KEY = "camel-up-analyzer-state-v1";
const CAMEL_COLORS = {
  blue: "#3978c3",
  green: "#3f8b57",
  yellow: "#efc840",
  red: "#ce453d",
  purple: "#7654a4",
  white: "#f6f0de",
  black: "#292725",
};

const DEFAULT_STATE = {
  stacks: [
    { space: 1, camels: ["blue"] },
    { space: 2, camels: ["green"] },
    { space: 3, camels: ["yellow", "red", "purple"] },
    { space: 14, camels: ["black"] },
    { space: 16, camels: ["white"] },
  ],
  traps: [],
  rolledDice: [],
};

let state = loadSavedState() ?? structuredClone(DEFAULT_STATE);
let selectedCamel = null;

const elements = {
  track: document.querySelector("#track"),
  diceControls: document.querySelector("#dice-controls"),
  diceStatus: document.querySelector("#dice-status"),
  camelRoster: document.querySelector("#camel-roster"),
  selectionHint: document.querySelector("#selection-hint"),
  runSummary: document.querySelector("#run-summary"),
  analyze: document.querySelector("#analyze"),
  message: document.querySelector("#message"),
  results: document.querySelector("#results"),
  summaryCards: document.querySelector("#summary-cards"),
  rankTable: document.querySelector("#rank-table"),
  movementTable: document.querySelector("#movement-table"),
  tileResults: document.querySelector("#tile-results"),
  tileTable: document.querySelector("#tile-table"),
  resultTime: document.querySelector("#result-time"),
};

function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return isPlausibleState(saved) ? saved : null;
  } catch {
    return null;
  }
}

function isPlausibleState(value) {
  if (!value || !Array.isArray(value.stacks) || !Array.isArray(value.traps) || !Array.isArray(value.rolledDice)) return false;
  const camels = value.stacks.flatMap((stack) => stack.camels ?? []);
  return ALL_CAMELS.every((camel) => camels.includes(camel)) && new Set(camels).size === ALL_CAMELS.length;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function camelStyle(camel) {
  const text = camel === "white" || camel === "yellow" ? "#28251e" : "#fff";
  return `--camel-color:${CAMEL_COLORS[camel]};--camel-text:${text}`;
}

function camelButton(camel, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `camel-token ${extraClass}`.trim();
  button.dataset.camel = camel;
  button.draggable = true;
  button.style.cssText = camelStyle(camel);
  button.textContent = camel;
  button.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", camel);
    event.dataTransfer.effectAllowed = "move";
    selectCamel(camel);
  });
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    selectCamel(selectedCamel === camel ? null : camel);
  });
  return button;
}

function selectCamel(camel) {
  selectedCamel = camel;
  elements.selectionHint.textContent = camel
    ? `${camel[0].toUpperCase()}${camel.slice(1)} selected — choose a track space`
    : "No camel selected";
  document.querySelectorAll(".camel-token").forEach((token) => {
    token.classList.toggle("selected", token.dataset.camel === camel);
  });
}

function renderDice() {
  elements.diceControls.replaceChildren();
  for (const die of ALL_DICE) {
    const rolled = state.rolledDice.includes(die);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `die-toggle${rolled ? " rolled" : ""}`;
    button.dataset.die = die;
    button.setAttribute("aria-pressed", rolled ? "true" : "false");
    if (die !== "grey") button.style.setProperty("--camel-color", CAMEL_COLORS[die]);
    button.innerHTML = `<span class="die-icon" aria-hidden="true"></span><span class="die-name">${die}</span>`;
    button.title = rolled ? `${die} die already rolled` : `${die} die still in pyramid`;
    button.addEventListener("click", () => toggleDie(die));
    elements.diceControls.append(button);
  }
  const remaining = ALL_DICE.length - state.rolledDice.length;
  elements.diceStatus.textContent = `${remaining} inside`;
  elements.runSummary.textContent = remaining >= 2
    ? `${remaining} dice remain; ${remaining - 1} will be revealed before this leg scores.`
    : "This leg has already finished. Mark fewer dice as rolled to analyze it.";
}

function toggleDie(die) {
  state.rolledDice = state.rolledDice.includes(die)
    ? state.rolledDice.filter((current) => current !== die)
    : [...state.rolledDice, die];
  saveState();
  renderDice();
  hideResults();
}

function renderRoster() {
  elements.camelRoster.replaceChildren();
  const onBoard = new Set(state.stacks.flatMap((stack) => stack.camels));
  for (const camel of ALL_CAMELS) {
    elements.camelRoster.append(camelButton(camel, onBoard.has(camel) ? "on-board" : ""));
  }
  selectCamel(selectedCamel);
}

function stackOn(space) {
  return state.stacks.find((stack) => stack.space === space);
}

function trapOn(space) {
  return state.traps.find((trap) => trap.space === space);
}

function canShowTileButton(space, stack, trap) {
  if (trap) return true;
  if (space === 1 || stack) return false;
  return !state.traps.some((existingTrap) => Math.abs(existingTrap.space - space) === 1);
}

function moveCamelTo(camel, space) {
  for (const stack of state.stacks) stack.camels = stack.camels.filter((current) => current !== camel);
  state.stacks = state.stacks.filter((stack) => stack.camels.length > 0);
  let destination = stackOn(space);
  if (!destination) {
    destination = { space, camels: [] };
    state.stacks.push(destination);
  }
  destination.camels.push(camel);
  state.traps = state.traps.filter((trap) => trap.space !== space);
  state.stacks.sort((a, b) => a.space - b.space);
  saveState();
  selectCamel(null);
  renderAll();
  hideResults();
}

function reorderCamel(space, camel, direction) {
  const stack = stackOn(space);
  const index = stack.camels.indexOf(camel);
  const target = index + direction;
  if (target < 0 || target >= stack.camels.length) return;
  [stack.camels[index], stack.camels[target]] = [stack.camels[target], stack.camels[index]];
  saveState();
  renderTrack();
  hideResults();
}

function cycleTrap(space) {
  if (stackOn(space) || space === 1) return;
  const existing = trapOn(space);
  if (!existing && state.traps.some((trap) => Math.abs(trap.space - space) === 1)) {
    showMessage("Spectator tiles cannot be placed on adjacent spaces.");
    return;
  }
  showMessage(null);
  if (!existing) state.traps.push({ space, side: "cheer" });
  else if (existing.side === "cheer") existing.side = "boo";
  else state.traps = state.traps.filter((trap) => trap.space !== space);
  saveState();
  renderTrack();
  hideResults();
}

function renderTrack() {
  elements.track.replaceChildren();
  for (let space = 1; space <= 16; space += 1) {
    const stack = stackOn(space);
    const trap = trapOn(space);
    const spaceElement = document.createElement("article");
    spaceElement.className = `track-space space-${space}${trap ? ` has-${trap.side}` : ""}${space === 1 ? " finish-space" : ""}`;
    spaceElement.dataset.space = String(space);
    spaceElement.tabIndex = 0;
    spaceElement.setAttribute("aria-label", `Track space ${space}`);
    spaceElement.addEventListener("click", () => {
      if (selectedCamel) moveCamelTo(selectedCamel, space);
    });
    spaceElement.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && selectedCamel) {
        event.preventDefault();
        moveCamelTo(selectedCamel, space);
      }
    });
    spaceElement.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      spaceElement.classList.add("drop-target");
    });
    spaceElement.addEventListener("dragleave", () => spaceElement.classList.remove("drop-target"));
    spaceElement.addEventListener("drop", (event) => {
      event.preventDefault();
      spaceElement.classList.remove("drop-target");
      const camel = event.dataTransfer.getData("text/plain");
      if (ALL_CAMELS.includes(camel)) moveCamelTo(camel, space);
    });

    const header = document.createElement("div");
    header.className = "space-header";
    const number = document.createElement("span");
    number.className = "space-number";
    number.textContent = String(space);
    header.append(number);
    if (space === 1) {
      const finish = document.createElement("span");
      finish.className = "finish-flag";
      finish.textContent = "FINISH";
      header.append(finish);
    }
    if (canShowTileButton(space, stack, trap)) {
      const tileButton = document.createElement("button");
      tileButton.type = "button";
      tileButton.className = "tile-cycle";
      tileButton.textContent = trap ? (trap.side === "cheer" ? "+1 →" : "−1 ←") : "⊕ Tile";
      tileButton.title = trap ? `${trap.side} tile; click to change` : "Add spectator tile";
      tileButton.addEventListener("click", (event) => {
        event.stopPropagation();
        cycleTrap(space);
      });
      header.append(tileButton);
    }
    spaceElement.append(header);

    const stackElement = document.createElement("div");
    stackElement.className = "space-stack";
    if (!stack) {
      const empty = document.createElement("span");
      empty.className = "empty-space";
      empty.textContent = trap ? (trap.side === "cheer" ? "Cheering tile" : "Booing tile") : "Drop camel";
      stackElement.append(empty);
    } else {
      [...stack.camels].reverse().forEach((camel, displayIndex) => {
        const actualIndex = stack.camels.indexOf(camel);
        const row = document.createElement("div");
        row.className = "stack-row";
        if (displayIndex === 0) {
          const topLabel = document.createElement("span");
          topLabel.className = "top-label";
          topLabel.textContent = "Top";
          topLabel.style.gridColumn = "1 / -1";
          row.append(topLabel);
        }
        row.append(camelButton(camel));
        const controls = document.createElement("span");
        controls.className = "stack-order";
        const up = document.createElement("button");
        up.type = "button";
        up.textContent = "▲";
        up.title = `Move ${camel} toward the top`;
        up.disabled = actualIndex === stack.camels.length - 1;
        up.addEventListener("click", (event) => {
          event.stopPropagation();
          reorderCamel(space, camel, 1);
        });
        const down = document.createElement("button");
        down.type = "button";
        down.textContent = "▼";
        down.title = `Move ${camel} toward the bottom`;
        down.disabled = actualIndex === 0;
        down.addEventListener("click", (event) => {
          event.stopPropagation();
          reorderCamel(space, camel, -1);
        });
        controls.append(up, down);
        row.append(controls);
        stackElement.append(row);
      });
    }
    spaceElement.append(stackElement);
    elements.track.append(spaceElement);
  }
  selectCamel(selectedCamel);
}

function renderAll() {
  renderDice();
  renderRoster();
  renderTrack();
}

function analysisPayload() {
  return {
    trackLength: 16,
    stacks: state.stacks.map((stack) => ({ space: stack.space, camels: [...stack.camels] })),
    traps: state.traps.map((trap) => ({ space: trap.space, side: trap.side })),
    remainingDice: ALL_DICE.filter((die) => !state.rolledDice.includes(die)),
  };
}

function validateClientState() {
  const remaining = ALL_DICE.filter((die) => !state.rolledDice.includes(die));
  if (remaining.length < 2) return "At least two dice must still be inside the pyramid.";
  const trapSpaces = state.traps.map((trap) => trap.space).sort((a, b) => a - b);
  for (let index = 1; index < trapSpaces.length; index += 1) {
    if (trapSpaces[index] - trapSpaces[index - 1] === 1) {
      return `Spectator tiles cannot be adjacent (spaces ${trapSpaces[index - 1]} and ${trapSpaces[index]}).`;
    }
  }
  return null;
}

async function runAnalysis() {
  const validationError = validateClientState();
  if (validationError) {
    showMessage(validationError);
    return;
  }
  showMessage(null);
  elements.analyze.disabled = true;
  elements.analyze.classList.add("loading");
  const startedAt = performance.now();
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(analysisPayload()),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Analysis failed");
    renderResults(body, performance.now() - startedAt);
  } catch (error) {
    showMessage(error.message);
  } finally {
    elements.analyze.disabled = false;
    elements.analyze.classList.remove("loading");
  }
}

function showMessage(text) {
  elements.message.hidden = !text;
  elements.message.textContent = text ?? "";
}

function hideResults() {
  elements.results.hidden = true;
}

function formatPercent(value, digits = 2) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatNumber(value, digits = 3) {
  return Number(value).toFixed(digits);
}

function camelNameMarkup(camel) {
  return `<span class="camel-name"><i class="camel-swatch" style="${camelStyle(camel)}"></i>${camel}</span>`;
}

function tableMarkup(headers, rows) {
  return `<thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody>`;
}

function compareForecasts(result, firstCamel, secondCamel) {
  const first = result.camels[firstCamel];
  const second = result.camels[secondCamel];
  const expectedRankDifference = first.expectedRank - second.expectedRank;
  if (Math.abs(expectedRankDifference) > 1e-12) return expectedRankDifference;
  for (let rank = 0; rank < 5; rank += 1) {
    const probabilityDifference = second.rankProbabilities[rank] - first.rankProbabilities[rank];
    if (Math.abs(probabilityDifference) > 1e-12) return probabilityDifference;
  }
  return firstCamel.localeCompare(secondCamel);
}

function normalizedHeat(value, minimum, maximum) {
  if (Math.abs(maximum - minimum) < 1e-12) return 0.5;
  return Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
}

function metricCell(value, className, heat) {
  const colorStrength = 10 + heat * 48;
  return `<td class="metric-cell ${className}" style="--heat:${colorStrength.toFixed(1)}%">${formatNumber(value)}</td>`;
}

function renderResults(result, elapsedMs) {
  elements.summaryCards.innerHTML = [
    ["Outcomes", result.maximumObservableOutcomes.toLocaleString()],
    ["Race ends", formatPercent(result.raceEndProbability)],
    ["Expected rolls", formatNumber(result.diceRevealed.mean, 2)],
    ["Probability checked", formatPercent(result.probabilitySum)],
  ].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("");

  const forecastOrder = [...RACING_CAMELS].sort((first, second) => compareForecasts(result, first, second));
  const positionIcons = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  const rankRows = forecastOrder.map((camel, forecastIndex) => {
    const metrics = result.camels[camel];
    const cells = metrics.rankProbabilities.map((probability) =>
      `<td class="probability-cell" style="--probability:${probability}">${formatPercent(probability)}</td>`,
    ).join("");
    return `<tr class="${forecastIndex === 0 ? "winner-row" : ""}"><td><span class="forecast-rank" title="Forecast position ${forecastIndex + 1}">${positionIcons[forecastIndex]}</span>${camelNameMarkup(camel)}</td>${cells}<td>${formatNumber(metrics.expectedRank, 2)}</td></tr>`;
  });
  elements.rankTable.innerHTML = tableMarkup(
    ["Forecast", "<span class=\"rank-heading\">🥇 1st</span>", "<span class=\"rank-heading\">🥈 2nd</span>", "<span class=\"rank-heading\">🥉 3rd</span>", "<span class=\"rank-heading\">4️⃣ 4th</span>", "<span class=\"rank-heading\">5️⃣ 5th</span>", "Avg rank"],
    rankRows,
  );

  const movementOrder = [...forecastOrder, ...CRAZY_CAMELS];
  const movementValues = movementOrder.map((camel) => {
    const metrics = result.camels[camel];
    return {
      camel,
      finalSpace: metrics.finalSpace.mean,
      netMove: metrics.netDisplacement.mean,
      netVariance: metrics.netDisplacement.variance,
      distance: metrics.totalDistance.mean,
      distanceVariance: metrics.totalDistance.variance,
    };
  });
  const rangeFor = (property) => {
    const values = movementValues.map((row) => row[property]);
    return [Math.min(...values), Math.max(...values)];
  };
  const finalSpaceRange = rangeFor("finalSpace");
  const netVarianceRange = rangeFor("netVariance");
  const distanceRange = rangeFor("distance");
  const distanceVarianceRange = rangeFor("distanceVariance");
  const maximumAbsoluteNetMove = Math.max(...movementValues.map((row) => Math.abs(row.netMove)), 1e-12);
  const movementRows = movementValues.map((row) => {
    const netClass = row.netMove > 1e-12 ? "metric-net-positive" : row.netMove < -1e-12 ? "metric-net-negative" : "metric-net-neutral";
    return `<tr><td>${camelNameMarkup(row.camel)}</td>${metricCell(row.finalSpace, "metric-position", normalizedHeat(row.finalSpace, ...finalSpaceRange))}${metricCell(row.netMove, netClass, Math.abs(row.netMove) / maximumAbsoluteNetMove)}${metricCell(row.netVariance, "metric-net-variance", normalizedHeat(row.netVariance, ...netVarianceRange))}${metricCell(row.distance, "metric-distance", normalizedHeat(row.distance, ...distanceRange))}${metricCell(row.distanceVariance, "metric-distance-variance", normalizedHeat(row.distanceVariance, ...distanceVarianceRange))}</tr>`;
  });
  elements.movementTable.innerHTML = tableMarkup(
    ["Camel", "<span class=\"metric-heading metric-position\">Avg final space</span>", "<span class=\"metric-heading metric-net-positive\">Avg net move</span>", "<span class=\"metric-heading metric-net-variance\">Net variance</span>", "<span class=\"metric-heading metric-distance\">Avg distance</span>", "<span class=\"metric-heading metric-distance-variance\">Distance variance</span>"],
    movementRows,
  );

  const traps = Object.entries(result.traps);
  elements.tileResults.hidden = traps.length === 0;
  if (traps.length > 0) {
    const tileRows = traps.map(([tile, metrics]) => `<tr><td>${tile}</td><td>${formatPercent(metrics.hitProbability)}</td><td>${formatNumber(metrics.expectedHits)}</td></tr>`);
    elements.tileTable.innerHTML = tableMarkup(["Tile", "Chance triggered", "Expected triggers / EP"], tileRows);
  }

  elements.resultTime.textContent = `Calculated in ${(elapsedMs / 1000).toFixed(2)} s`;
  elements.results.hidden = false;
  elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetBoard() {
  state = structuredClone(DEFAULT_STATE);
  selectedCamel = null;
  saveState();
  renderAll();
  hideResults();
  showMessage(null);
}

document.querySelector("#clear-board").addEventListener("click", resetBoard);
elements.analyze.addEventListener("click", runAnalysis);

renderAll();
