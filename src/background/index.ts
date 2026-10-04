// First run: open the playground so the product explains itself in seconds.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('playground.html?welcome=1') });
});
