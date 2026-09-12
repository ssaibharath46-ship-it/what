const DEFAULT_SYNC_ENDPOINT = "https://what-peach-six.vercel.app/api/attendance/sync";
const DASHBOARD_URL = "https://what-peach-six.vercel.app/dashboard";
const SYNC_ENDPOINT = DEFAULT_SYNC_ENDPOINT;

const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const notFoundEl = document.getElementById("notFound");
const resultEl = document.getElementById("result");
const subjectCountEl = document.getElementById("subjectCount");
const syncBtn = document.getElementById("syncBtn");

let detectedPayload = null;

async function getAccessToken() {
  const data = await chrome.storage.local.get(["attendiq_access_token", "attendiq_token_saved_at"]);
  if (!data.attendiq_access_token) return null;
  // Force re-login/bridge after 2 hours; Supabase will still reject expired tokens.
  if (data.attendiq_token_saved_at && Date.now() - data.attendiq_token_saved_at > 2 * 60 * 60 * 1000) {
    await chrome.storage.local.remove(["attendiq_access_token", "attendiq_token_saved_at"]);
    return null;
  }
  return data.attendiq_access_token;
}

async function detectOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    statusEl.textContent = "Could not access the current tab.";
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "DETECT_ATTENDANCE" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      statusEl.hidden = true;
      notFoundEl.hidden = false;
      return;
    }
    if (!response.found) {
      statusEl.hidden = true;
      notFoundEl.hidden = false;
      return;
    }

    detectedPayload = response.payload;
    statusEl.hidden = true;
    previewEl.hidden = false;
    subjectCountEl.textContent = `${detectedPayload.subjects.length} subjects detected`;
  });
}

async function handleSync() {
  if (!detectedPayload) return;
  const token = await getAccessToken();
  if (!token) {
    resultEl.hidden = false;
    resultEl.textContent = "Open your AttendIQ dashboard once, then return to this popup.";
    await chrome.tabs.create({ url: DASHBOARD_URL });
    return;
  }

  syncBtn.disabled = true;
  syncBtn.textContent = "Syncing…";
  resultEl.hidden = true;

  try {
    const res = await fetch(SYNC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(detectedPayload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      resultEl.textContent = `Sync failed: ${data.error || `HTTP ${res.status}`}`;
    } else {
      const failed = Array.isArray(data.failures) ? data.failures.length : 0;
      resultEl.textContent = failed
        ? `Synced ${data.subjectsProcessed - failed} subjects. ${failed} failed.`
        : `Synced ${data.subjectsProcessed} subjects successfully.`;
    }
    resultEl.hidden = false;
  } catch (err) {
    resultEl.hidden = false;
    resultEl.textContent = "Network error — check your connection and deployed API URL.";
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = "Sync Attendance";
  }
}

syncBtn.addEventListener("click", handleSync);
detectOnActiveTab();
