"use strict";

const assert = require("node:assert/strict");
const {
  analyze,
  applyDie,
  chooseCrazyCamel,
  initialState,
  moveCamel,
  normalizeConfig,
  racingOrder,
} = require("./camel-up-analyzer");

function baseConfig(overrides = {}) {
  return normalizeConfig({
    trackLength: 16,
    stacks: [
      { space: 1, camels: ["blue", "yellow"] },
      { space: 3, camels: ["green"] },
      { space: 5, camels: ["red"] },
      { space: 7, camels: ["purple"] },
      { space: 14, camels: ["black"] },
      { space: 16, camels: ["white"] },
    ],
    traps: [],
    remainingDice: ["blue", "green"],
    ...overrides,
  });
}

function stackAt(state, space) {
  return state.stacks.find((stack) => stack.space === space)?.camels;
}

{
  const config = baseConfig();
  const state = initialState(config);
  moveCamel(state, "blue", 2, config);
  assert.deepEqual(stackAt(state, 3), ["green", "blue", "yellow"], "a camel carries those above and lands on top");
}

{
  const config = baseConfig({
    stacks: [
      { space: 1, camels: ["blue", "yellow"] },
      { space: 4, camels: ["green"] },
      { space: 5, camels: ["red"] },
      { space: 7, camels: ["purple"] },
      { space: 14, camels: ["black"] },
      { space: 16, camels: ["white"] },
    ],
    traps: [{ space: 3, side: "boo", owner: "Tester" }],
  });
  const state = initialState(config);
  moveCamel(state, "blue", 2, config);
  assert.deepEqual(stackAt(state, 2), ["blue", "yellow"], "a boo tile moves the unit back");
  assert.equal(state.tileHits["Tester (boo, space 3)"], 1);
}

{
  const config = baseConfig({
    stacks: [
      { space: 1, camels: ["blue"] },
      { space: 3, camels: ["green"] },
      { space: 5, camels: ["red"] },
      { space: 7, camels: ["purple"] },
      { space: 10, camels: ["white", "yellow"] },
      { space: 14, camels: ["black"] },
    ],
  });
  const state = initialState(config);
  assert.equal(chooseCrazyCamel(state, "black"), "white", "the sole crazy camel carrying a racer must move");
}

{
  const config = baseConfig({
    stacks: [
      { space: 1, camels: ["blue"] },
      { space: 3, camels: ["green"] },
      { space: 5, camels: ["red"] },
      { space: 7, camels: ["purple"] },
      { space: 10, camels: ["white", "black"] },
      { space: 12, camels: ["yellow"] },
    ],
  });
  const state = initialState(config);
  assert.equal(chooseCrazyCamel(state, "white"), "black", "the upper crazy camel must move when they are adjacent");
}

{
  const config = baseConfig();
  const state = applyDie(initialState(config), "blue", { steps: 2, probability: 1 / 3 }, config);
  assert.deepEqual(racingOrder(state).slice(0, 3), ["purple", "red", "yellow"]);
}

{
  const result = analyze(baseConfig());
  assert.ok(Math.abs(result.probabilitySum - 1) < 1e-12, "all probability mass must be preserved");
  for (let rank = 0; rank < 5; rank += 1) {
    const rankTotal = Object.values(result.camels).reduce(
      (sum, camel) => sum + (camel.rankProbabilities?.[rank] ?? 0),
      0,
    );
    assert.ok(Math.abs(rankTotal - 1) < 1e-12, `rank ${rank + 1} probabilities must sum to 1`);
  }
}

{
  const fullLeg = baseConfig({
    remainingDice: ["blue", "green", "yellow", "red", "purple", "grey"],
  });
  const result = analyze(fullLeg);
  assert.equal(result.maximumObservableOutcomes, 320760);
  assert.ok(Math.abs(result.probabilitySum - 1) < 1e-10);
}

{
  const finishLineState = baseConfig({
    stacks: [
      { space: 3, camels: ["green"] },
      { space: 5, camels: ["red"] },
      { space: 7, camels: ["purple"] },
      { space: 9, camels: ["yellow"] },
      { space: 14, camels: ["black"] },
      { space: 16, camels: ["blue"] },
      { space: 15, camels: ["white"] },
    ],
    remainingDice: ["blue", "green"],
  });
  const result = analyze(finishLineState);
  assert.equal(result.raceEndProbability, 0.5, "drawing blue must end the race for every blue result");
  assert.ok(Math.abs(result.probabilitySum - 1) < 1e-12, "early stopping must preserve probability mass");
}

console.log("All Camel Up analyzer tests passed.");
