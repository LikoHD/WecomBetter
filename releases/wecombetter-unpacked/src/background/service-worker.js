import { DEFAULT_FEATURES, mergeFeatures } from "../shared.js";

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get({ features: DEFAULT_FEATURES });
  await chrome.storage.sync.set({ features: mergeFeatures(stored.features) });
});
