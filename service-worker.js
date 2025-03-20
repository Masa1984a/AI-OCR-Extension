// service-worker.js
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: 'popup.html'
  });
});