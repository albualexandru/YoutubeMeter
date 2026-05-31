const STORAGE_KEY = 'youtubeMeterState';
const ALARM_NAME = 'youtubeMeterTick';

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isYoutubeUrl(url = '') {
  return /^https?:\/\/(?:[^/]+\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

function formatBadgeTime(totalMs) {
  const totalMinutes = Math.floor(totalMs / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

async function getState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function getCurrentTrackable() {
  try {
    const focusedWindow = await chrome.windows.getLastFocused();
    if (!focusedWindow || !focusedWindow.focused) {
      return false;
    }

    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return Boolean(activeTab && isYoutubeUrl(activeTab.url || ''));
  } catch {
    return false;
  }
}

async function updateBadge(totalMs) {
  await chrome.action.setBadgeBackgroundColor({ color: '#cc0000' });
  await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  await chrome.action.setBadgeText({ text: formatBadgeTime(totalMs) });
}

async function sampleAndPersist() {
  const now = Date.now();
  const today = getTodayKey();

  const existingState =
    (await getState()) || {
      dayKey: today,
      totalMs: 0,
      lastSampleMs: now,
      wasTrackable: false,
    };

  const state = { ...existingState };

  if (state.dayKey !== today) {
    state.dayKey = today;
    state.totalMs = 0;
    state.lastSampleMs = now;
    state.wasTrackable = false;
  }

  const elapsed = Math.max(0, now - (state.lastSampleMs || now));
  if (state.wasTrackable) {
    state.totalMs += elapsed;
  }

  state.lastSampleMs = now;
  state.wasTrackable = await getCurrentTrackable();

  await saveState(state);
  await updateBadge(state.totalMs);
}

async function initialize() {
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  await sampleAndPersist();
}

chrome.runtime.onInstalled.addListener(() => {
  initialize();
});

chrome.runtime.onStartup.addListener(() => {
  initialize();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    sampleAndPersist();
  }
});

chrome.tabs.onActivated.addListener(() => {
  sampleAndPersist();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status || changeInfo.url) {
    sampleAndPersist();
  }
});

chrome.windows.onFocusChanged.addListener(() => {
  sampleAndPersist();
});

initialize();
