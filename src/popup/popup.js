import { FEATURE_IDS, readFeatures, writeFeatures } from "../shared.js";

const toggles = {
  [FEATURE_IDS.search]: document.getElementById("toggle-search"),
  [FEATURE_IDS.viewers]: document.getElementById("toggle-viewers"),
  [FEATURE_IDS.refs]: document.getElementById("toggle-refs"),
  [FEATURE_IDS.docMeta]: document.getElementById("toggle-doc-meta"),
};

function paint(features) {
  for (const [id, input] of Object.entries(toggles)) {
    if (input) input.checked = features[id] !== false;
  }
}

async function persist() {
  const next = {};
  for (const [id, input] of Object.entries(toggles)) {
    next[id] = Boolean(input?.checked);
  }
  paint(await writeFeatures(next));
}

const features = await readFeatures();
paint(features);
for (const input of Object.values(toggles)) {
  input?.addEventListener("change", persist);
}
