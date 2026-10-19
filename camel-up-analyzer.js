#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RACING_CAMELS = ["blue", "green", "yellow", "red", "purple"];
const CRAZY_CAMELS = ["white", "black"];
const ALL_CAMELS = [...RACING_CAMELS, ...CRAZY_CAMELS];
const ALL_DICE = [...RACING_CAMELS, "grey"];

function usage() {
  return `Usage: node camel-up-analyzer.js <state.json> [--json]

Exhaustively analyzes every possible outcome of the rest of a Camel Up leg.

Options:
  --json     Print machine-readable JSON instead of tables
  --help     Show this help

See sample-state.json and README.md for the input format.`;
}

function isRacingCamel(camel) {
  return RACING_CAMELS.includes(camel);
}

function normalizeConfig(raw) {
  const config = {
    trackLength: raw.trackLength ?? 16,
    stacks: raw.stacks,
    traps: raw.traps ?? raw.spectatorTiles ?? [],
    remainingDice: raw.remainingDice ?? [...ALL_DICE],
  };
  validateConfig(config);
  return config;
}

function validateConfig(config) {
  if (!Number.isInteger(config.trackLength) || config.trackLength < 2) {
    throw new Error("trackLength must be an integer of at least 2");
  }
  if (!Array.isArray(config.stacks) || config.stacks.length === 0) {
    throw new Error("stacks must be a non-empty array");
  }

  const seenCamels = new Set();
  const seenSpaces = new Set();
  for (const stack of config.stacks) {
    if (!Number.isInteger(stack.space) || stack.space < 1 || stack.space > config.trackLength) {
      throw new Error(`Stack space ${stack.space} must be between 1 and ${config.trackLength}`);
    }
    if (seenSpaces.has(stack.space)) {
      throw new Error(`More than one stack was supplied for space ${stack.space}`);
    }
    seenSpaces.add(stack.space);
    if (!Array.isArray(stack.camels) || stack.camels.length === 0) {
      throw new Error(`The stack on space ${stack.space} must contain at least one camel`);
    }
    for (const camel of stack.camels) {
      if (!ALL_CAMELS.includes(camel)) {
        throw new Error(`Unknown camel '${camel}'`);
      }
      if (seenCamels.has(camel)) {
        throw new Error(`Camel '${camel}' appears more than once`);
      }
      seenCamels.add(camel);
    }
  }
  const missingCamels = ALL_CAMELS.filter((camel) => !seenCamels.has(camel));
  if (missingCamels.length > 0) {
    throw new Error(`Missing camel(s): ${missingCamels.join(", ")}`);
  }

  if (!Array.isArray(config.remainingDice) || config.remainingDice.length < 2) {
    throw new Error("remainingDice must contain at least 2 dice; otherwise the leg is already over");
  }
  const seenDice = new Set();
  for (const die of config.remainingDice) {
    if (!ALL_DICE.includes(die)) {
      throw new Error(`Unknown die '${die}'`);
    }
    if (seenDice.has(die)) {
      throw new Error(`Die '${die}' appears more than once in remainingDice`);
    }
    seenDice.add(die);
  }

  if (!Array.isArray(config.traps)) {
    throw new Error("traps must be an array");
  }
  const trapSpaces = new Set();
  for (const trap of config.traps) {
    if (!Number.isInteger(trap.space) || trap.space < 2 || trap.space > config.trackLength) {
      throw new Error(`Trap space ${trap.space} must be between 2 and ${config.trackLength}`);
    }
    if (trap.side !== "cheer" && trap.side !== "boo") {
      throw new Error(`Trap on space ${trap.space} must use side 'cheer' or 'boo'`);
    }
    if (seenSpaces.has(trap.space)) {
      throw new Error(`Trap on space ${trap.space} is underneath a camel stack`);
    }
    if (trapSpaces.has(trap.space)) {
      throw new Error(`More than one trap was supplied for space ${trap.space}`);
    }
    if ([...trapSpaces].some((space) => Math.abs(space - trap.space) === 1)) {
      throw new Error(`Trap on space ${trap.space} is adjacent to another trap`);
    }
    trapSpaces.add(trap.space);
  }
}

function initialState(config) {
  const startPositions = {};
  for (const stack of config.stacks) {
    for (const camel of stack.camels) startPositions[camel] = stack.space;
  }
  return {
    stacks: config.stacks.map((stack) => ({ space: stack.space, camels: [...stack.camels] })),
    distance: Object.fromEntries(ALL_CAMELS.map((camel) => [camel, 0])),
    tileHits: Object.fromEntries(config.traps.map((trap, index) => [tileKey(trap, index), 0])),
    startPositions,
    diceRevealed: 0,
    raceEnded: false,
  };
}

function tileKey(trap, index) {
  return trap.owner ? `${trap.owner} (${trap.side}, space ${trap.space})` : `tile ${index + 1} (${trap.side}, space ${trap.space})`;
}

function cloneState(state) {
  return {
    stacks: state.stacks.map((stack) => ({ space: stack.space, camels: [...stack.camels] })),
    distance: { ...state.distance },
    tileHits: { ...state.tileHits },
    startPositions: state.startPositions,
    diceRevealed: state.diceRevealed,
    raceEnded: state.raceEnded,
  };
}

function findCamel(state, camel) {
  for (let stackIndex = 0; stackIndex < state.stacks.length; stackIndex += 1) {
    const camelIndex = state.stacks[stackIndex].camels.indexOf(camel);
    if (camelIndex !== -1) return { stackIndex, camelIndex };
  }
  throw new Error(`Camel '${camel}' is not present in the state`);
}

function carriesRacingCamel(state, crazyCamel) {
  const { stackIndex, camelIndex } = findCamel(state, crazyCamel);
  return state.stacks[stackIndex].camels.slice(camelIndex + 1).some(isRacingCamel);
}

function chooseCrazyCamel(state, faceColor) {
  const whiteCarries = carriesRacingCamel(state, "white");
  const blackCarries = carriesRacingCamel(state, "black");
  if (whiteCarries !== blackCarries) return whiteCarries ? "white" : "black";

  const white = findCamel(state, "white");
  const black = findCamel(state, "black");
  if (white.stackIndex === black.stackIndex && Math.abs(white.camelIndex - black.camelIndex) === 1) {
    return white.camelIndex > black.camelIndex ? "white" : "black";
  }
  return faceColor;
}

function crossesFinish(oldSpace, newSpace, trackLength) {
  return (oldSpace <= trackLength && newSpace > trackLength) || (oldSpace >= 1 && newSpace < 1);
}

function addDistance(state, camels, delta) {
  for (const camel of camels) state.distance[camel] += Math.abs(delta);
}

function putMovingUnitAt(state, movingCamels, space, placement) {
  const destinationIndex = state.stacks.findIndex((stack) => stack.space === space);
  if (destinationIndex === -1) {
    state.stacks.push({ space, camels: [...movingCamels] });
    return;
  }
  const destination = state.stacks[destinationIndex];
  destination.camels = placement === "bottom"
    ? [...movingCamels, ...destination.camels]
    : [...destination.camels, ...movingCamels];
}

function moveCamel(state, selectedCamel, steps, config) {
  const { stackIndex, camelIndex } = findCamel(state, selectedCamel);
  const source = state.stacks[stackIndex];
  const oldSpace = source.space;
  const movingCamels = source.camels.slice(camelIndex);
  const leftBehind = source.camels.slice(0, camelIndex);
  if (leftBehind.length === 0) state.stacks.splice(stackIndex, 1);
  else source.camels = leftBehind;

  const direction = isRacingCamel(selectedCamel) ? 1 : -1;
  const firstDelta = direction * steps;
  const landingSpace = oldSpace + firstDelta;
  addDistance(state, movingCamels, firstDelta);

  if (crossesFinish(oldSpace, landingSpace, config.trackLength)) {
    putMovingUnitAt(state, movingCamels, landingSpace, "top");
    state.raceEnded = true;
    return;
  }

  const trapIndex = config.traps.findIndex((trap) => trap.space === landingSpace);
  if (trapIndex === -1) {
    putMovingUnitAt(state, movingCamels, landingSpace, "top");
    return;
  }

  const trap = config.traps[trapIndex];
  state.tileHits[tileKey(trap, trapIndex)] += 1;
  const extraDelta = direction * (trap.side === "cheer" ? 1 : -1);
  const finalSpace = landingSpace + extraDelta;
  addDistance(state, movingCamels, extraDelta);
  if (crossesFinish(landingSpace, finalSpace, config.trackLength)) state.raceEnded = true;
  putMovingUnitAt(state, movingCamels, finalSpace, trap.side === "boo" ? "bottom" : "top");
}

function dieFaces(die) {
  if (die === "grey") {
    return ["white", "black"].flatMap((crazy) => [1, 2, 3].map((steps) => ({ crazy, steps, probability: 1 / 6 })));
  }
  return [1, 2, 3].map((steps) => ({ steps, probability: 1 / 3 }));
}

function applyDie(state, die, face, config) {
  const next = cloneState(state);
  const selectedCamel = die === "grey" ? chooseCrazyCamel(next, face.crazy) : die;
  moveCamel(next, selectedCamel, face.steps, config);
  next.diceRevealed += 1;
  return next;
}

function racingOrder(state) {
  const result = [];
  const orderedStacks = [...state.stacks].sort((a, b) => b.space - a.space);
  for (const stack of orderedStacks) {
    for (let index = stack.camels.length - 1; index >= 0; index -= 1) {
      if (isRacingCamel(stack.camels[index])) result.push(stack.camels[index]);
    }
  }
  return result;
}

function camelPositions(state) {
  const positions = {};
  for (const stack of state.stacks) {
    for (const camel of stack.camels) positions[camel] = stack.space;
  }
  return positions;
}

function blankMoment() {
  return { sum: 0, sumSquares: 0 };
}

function addMoment(moment, value, probability) {
  moment.sum += value * probability;
  moment.sumSquares += value * value * probability;
}

function finishMoment(moment) {
  const variance = Math.max(0, moment.sumSquares - moment.sum * moment.sum);
  return { mean: moment.sum, variance, standardDeviation: Math.sqrt(variance) };
}

function createAccumulator(config) {
  const camelMetrics = {};
  for (const camel of ALL_CAMELS) {
    camelMetrics[camel] = {
      ranks: isRacingCamel(camel) ? Array(5).fill(0) : null,
      finalSpace: blankMoment(),
      netDisplacement: blankMoment(),
      totalDistance: blankMoment(),
    };
  }
  return {
    probability: 0,
    leaves: 0,
    raceEndProbability: 0,
    diceRevealed: blankMoment(),
    camelMetrics,
    tileMetrics: Object.fromEntries(config.traps.map((trap, index) => [tileKey(trap, index), {
      expectedHits: 0,
      hitProbability: 0,
    }])),
  };
}

function recordOutcome(accumulator, state, probability) {
  accumulator.probability += probability;
  accumulator.leaves += 1;
  if (state.raceEnded) accumulator.raceEndProbability += probability;
  addMoment(accumulator.diceRevealed, state.diceRevealed, probability);

  const order = racingOrder(state);
  const positions = camelPositions(state);
  order.forEach((camel, index) => {
    accumulator.camelMetrics[camel].ranks[index] += probability;
  });
  for (const camel of ALL_CAMELS) {
    const metrics = accumulator.camelMetrics[camel];
    addMoment(metrics.finalSpace, positions[camel], probability);
    addMoment(metrics.netDisplacement, positions[camel] - state.startPositions[camel], probability);
    addMoment(metrics.totalDistance, state.distance[camel], probability);
  }
  for (const [key, hits] of Object.entries(state.tileHits)) {
    accumulator.tileMetrics[key].expectedHits += hits * probability;
    if (hits > 0) accumulator.tileMetrics[key].hitProbability += probability;
  }
}

function enumerate(state, remainingDice, rollsLeft, probability, config, accumulator) {
  if (rollsLeft === 0 || state.raceEnded) {
    recordOutcome(accumulator, state, probability);
    return;
  }

  const dieChoiceProbability = 1 / remainingDice.length;
  for (let dieIndex = 0; dieIndex < remainingDice.length; dieIndex += 1) {
    const die = remainingDice[dieIndex];
    const nextDice = remainingDice.filter((_, index) => index !== dieIndex);
    for (const face of dieFaces(die)) {
      const nextState = applyDie(state, die, face, config);
      enumerate(
        nextState,
        nextDice,
        rollsLeft - 1,
        probability * dieChoiceProbability * face.probability,
        config,
        accumulator,
      );
    }
  }
}

function maximumObservableOutcomes(remainingDice) {
  function count(dice, rollsLeft) {
    if (rollsLeft === 0) return 1;
    let total = 0;
    for (let index = 0; index < dice.length; index += 1) {
      const die = dice[index];
      const next = dice.filter((_, other) => other !== index);
      total += dieFaces(die).length * count(next, rollsLeft - 1);
    }
    return total;
  }
  return count(remainingDice, remainingDice.length - 1);
}

function analyze(rawConfig) {
  const config = normalizeConfig(rawConfig);
  const state = initialState(config);
  const accumulator = createAccumulator(config);
  enumerate(state, config.remainingDice, config.remainingDice.length - 1, 1, config, accumulator);

  const camels = {};
  for (const camel of ALL_CAMELS) {
    const source = accumulator.camelMetrics[camel];
    camels[camel] = {
      rankProbabilities: source.ranks,
      expectedRank: source.ranks
        ? source.ranks.reduce((sum, probability, index) => sum + probability * (index + 1), 0)
        : null,
      finalSpace: finishMoment(source.finalSpace),
      netDisplacement: finishMoment(source.netDisplacement),
      totalDistance: finishMoment(source.totalDistance),
    };
  }

  return {
    probabilitySum: accumulator.probability,
    evaluatedLeaves: accumulator.leaves,
    maximumObservableOutcomes: maximumObservableOutcomes(config.remainingDice),
    raceEndProbability: accumulator.raceEndProbability,
    diceRevealed: finishMoment(accumulator.diceRevealed),
    camels,
    traps: accumulator.tileMetrics,
  };
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function number(value) {
  return value.toFixed(3);
}

function printReport(result) {
  console.log("\nCAMEL UP — EXACT LEG ANALYSIS");
  console.log(`Probability checked: ${percent(result.probabilitySum)}`);
  console.log(`Observable outcomes (without early stopping): ${result.maximumObservableOutcomes.toLocaleString("en-US")}`);
  console.log(`Evaluated terminal branches: ${result.evaluatedLeaves.toLocaleString("en-US")}`);
  console.log(`Chance the race ends during this leg: ${percent(result.raceEndProbability)}`);
  console.log(`Expected additional dice revealed: ${number(result.diceRevealed.mean)}`);

  console.log("\nRANK PROBABILITIES");
  console.table(RACING_CAMELS.map((camel) => ({
    Camel: camel,
    "1st": percent(result.camels[camel].rankProbabilities[0]),
    "2nd": percent(result.camels[camel].rankProbabilities[1]),
    "3rd": percent(result.camels[camel].rankProbabilities[2]),
    "4th": percent(result.camels[camel].rankProbabilities[3]),
    "5th": percent(result.camels[camel].rankProbabilities[4]),
    "Avg rank": number(result.camels[camel].expectedRank),
  })));

  console.log("MOVEMENT STATISTICS");
  console.table(ALL_CAMELS.map((camel) => ({
    Camel: camel,
    "Avg final space": number(result.camels[camel].finalSpace.mean),
    "Avg net move": number(result.camels[camel].netDisplacement.mean),
    "Net variance": number(result.camels[camel].netDisplacement.variance),
    "Avg distance": number(result.camels[camel].totalDistance.mean),
    "Distance variance": number(result.camels[camel].totalDistance.variance),
  })));

  const traps = Object.entries(result.traps);
  if (traps.length > 0) {
    console.log("SPECTATOR TILE STATISTICS");
    console.table(traps.map(([tile, metrics]) => ({
      Tile: tile,
      "Chance triggered": percent(metrics.hitProbability),
      "Expected EP / triggers": number(metrics.expectedHits),
    })));
  }
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return;
  }
  const inputArg = argv.find((argument) => !argument.startsWith("--"));
  if (!inputArg) throw new Error(usage());
  const inputPath = path.resolve(process.cwd(), inputArg);
  const rawConfig = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const result = analyze(rawConfig);
  if (argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else printReport(result);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  analyze,
  applyDie,
  chooseCrazyCamel,
  initialState,
  moveCamel,
  normalizeConfig,
  racingOrder,
};

