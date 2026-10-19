"use strict";

const assert = require("node:assert/strict");
const { createServer } = require("./server");

async function run() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    const pageSource = await page.text();
    assert.match(pageSource, /Camel Up Leg Analyzer/);
    assert.doesNotMatch(pageSource, /load-sample/, "the sample control must not appear in the header");

    const appResponse = await fetch(`${baseUrl}/app.js`);
    const appSource = await appResponse.text();
    assert.match(appSource, /compareForecasts/, "finishing rows must support dynamic forecast sorting");
    assert.match(appSource, /metricCell/, "movement cells must use heat gradients");
    assert.match(appSource, /canShowTileButton/, "tile buttons must be hidden where placement is illegal");
    assert.match(appSource, /space === 1 \|\| stack/, "space 1 and occupied spaces must not render tile buttons");
    assert.match(appSource, /Math\.abs\(existingTrap\.space - space\) === 1/, "spaces adjacent to a tile must not render tile buttons");

    const stylesResponse = await fetch(`${baseUrl}/styles.css`);
    const stylesSource = await stylesResponse.text();
    assert.match(stylesSource, /\.space-16::after/, "the track must show the final clockwise direction arrow");
    assert.match(stylesSource, /content:\s*"⬆ 🏁"/, "the finish gap must show a checkered flag");
    assert.match(stylesSource, /z-index:\s*30/, "direction arrows must paint above neighboring track tiles");
    assert.match(stylesSource, /font-weight:\s*1000/, "direction arrows must use a bold weight");
    assert.match(stylesSource, /\.metric-cell/, "movement gradient styles must be served");
    assert.match(stylesSource, /border:\s*2px solid #8d5c18/, "empty tile buttons must have a high-contrast border");

    const health = await fetch(`${baseUrl}/api/health`);
    assert.deepEqual(await health.json(), { ok: true });

    const sampleResponse = await fetch(`${baseUrl}/api/sample-state`);
    const sample = await sampleResponse.json();
    assert.equal(sample.stacks.flatMap((stack) => stack.camels).length, 7);

    const analysisResponse = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sample),
    });
    assert.equal(analysisResponse.status, 200);
    const analysis = await analysisResponse.json();
    assert.equal(analysis.maximumObservableOutcomes, 320760);
    assert.ok(Math.abs(analysis.probabilitySum - 1) < 1e-10);

    const invalidResponse = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stacks: [] }),
    });
    assert.equal(invalidResponse.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  console.log("All Camel Up web interface tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
