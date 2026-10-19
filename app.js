const CONFIG = window.KANBAN_CONFIG || {};
const state = { project: null, statuses: [], users: [], milestones: [], tasks: [], issueDetails: [], issueComments: [], issueTimelineEvents: [], projectStatusHistory: [], timelineCollectionRequests: [], query: "", assignee: "all", issueState: "all", sort: "issue", live: false, draggingId: null };
const $ = function (selector) { return document.querySelector(selector); };
const board = $("#board");
const searchInput = $("#search-input");
const filterPopover = $("#filter-popover");
const assigneeFilter = $("#assignee-filter");
const stateFilter = $("#state-filter");
const authDialog = $("#auth-dialog");
const authForm = $("#auth-form");
const authEmail = $("#auth-email");
const authMessage = $("#auth-message");
const authStorageKey = "cones-board-auth";
let authSession = null;
let authUser = null;

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}
function avatarColor(value) {
  const colors = ["#8250df", "#0969da", "#1a7f37", "#bf8700", "#cf222e", "#0550ae"];
  const hash = Array.from(String(value || "")).reduce(function (sum, char) { return sum + char.charCodeAt(0); }, 0);
  return colors[hash % colors.length];
}
function avatar(user) {
  if (!user) return "";
  const name = user.display_name || user.github_username || "?";
  return '<span class="avatar" title="' + escapeHtml(user.github_username) + '" style="background:' + avatarColor(name) + '">' + escapeHtml(name.slice(0, 1).toUpperCase()) + "</span>";
}
function projectRepo() { return state.project && state.project.github_repo_full_name || "seune-h0203/cones"; }
function issueUrl(task) { return task.issue_url || "https://github.com/" + projectRepo() + "/issues/" + task.github_issue_number; }
function storeAuthSession(session) {
  session.expires_at = session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
  authSession = session;
  sessionStorage.setItem(authStorageKey, JSON.stringify(session));
}
function clearAuthSession() {
  authSession = null; authUser = null; sessionStorage.removeItem(authStorageKey); updateAuthButton();
}
async function authRequest(path, method, body, accessToken) {
  const headers = { apikey: CONFIG.supabaseKey, "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = "Bearer " + accessToken;
  const response = await fetch(String(CONFIG.supabaseUrl).replace(/\/$/, "") + "/auth/v1/" + path, { method: method || "GET", headers: headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || "Authentication failed (" + response.status + ")");
  return data;
}
async function currentAccessToken() {
  if (!authSession) {
    try { authSession = JSON.parse(sessionStorage.getItem(authStorageKey) || "null"); } catch { clearAuthSession(); }
  }
  if (!authSession) return null;
  if (Number(authSession.expires_at || 0) * 1000 < Date.now() + 30000) {
    try { storeAuthSession(await authRequest("token?grant_type=refresh_token", "POST", { refresh_token: authSession.refresh_token })); }
    catch { clearAuthSession(); return null; }
  }
  return authSession.access_token || null;
}
function updateAuthButton() {
  const button = $("#auth-button");
  if (!button) return;
  button.textContent = authUser ? "Sign out" : "Sign in";
  button.setAttribute("aria-label", authUser ? "Sign out " + authUser.email : "Sign in to edit GitHub issue status");
  button.title = authUser ? authUser.email : "GitHub Issue 상태 변경은 로그인이 필요합니다.";
}
async function initAuth() {
  const callback = new URLSearchParams(location.hash.slice(1));
  if (callback.get("access_token") && callback.get("refresh_token")) {
    storeAuthSession({ access_token: callback.get("access_token"), refresh_token: callback.get("refresh_token"), expires_in: callback.get("expires_in"), expires_at: callback.get("expires_at") });
    history.replaceState(null, "", location.pathname + location.search);
  }
  if (!authSession) {
    try { authSession = JSON.parse(sessionStorage.getItem(authStorageKey) || "null"); } catch { clearAuthSession(); }
  }
  const accessToken = await currentAccessToken();
  if (accessToken) {
    try { authUser = await authRequest("user", "GET", undefined, accessToken); }
    catch { clearAuthSession(); }
  }
  updateAuthButton();
}
function openAuthDialog() {
  authMessage.textContent = "";
  if (!authDialog.open) authDialog.showModal();
  authEmail.focus();
}
async function sendLoginLink(event) {
  event.preventDefault();
  authMessage.textContent = "로그인 링크를 보내는 중…";
  try {
    await authRequest("otp?redirect_to=" + encodeURIComponent(location.origin + location.pathname), "POST", { email: authEmail.value.trim(), create_user: false });
    authMessage.textContent = "메일을 확인하고 로그인 링크를 열어주세요. 링크를 열면 이 보드로 돌아옵니다.";
  } catch (error) { authMessage.textContent = error.message; }
}
async function signOut() {
  const token = await currentAccessToken();
  if (token) await authRequest("logout?scope=local", "POST", {}, token).catch(function () {});
  clearAuthSession();
  showToast("Signed out.");
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}
// ponytail: GitHub Markdown subset; use a pinned parser if full CommonMark parity is required.
function markdownInline(value) {
  const tokens = [];
  const save = function (html) { const key = "\u0000" + tokens.length + "\u0000"; tokens.push(html); return key; };
  let html = escapeHtml(value);
  html = html.replace(/`([^`\n]+)`/g, function (_, code) { return save("<code>" + code + "</code>"); });
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, label, url) { return save('<a href="' + url + '" target="_blank" rel="noreferrer">' + label + "</a>"); });
  html = html.replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, function (_, strong, alternate) { return "<strong>" + (strong || alternate) + "</strong>"; });
  html = html.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return html.replace(/\u0000(\d+)\u0000/g, function (_, index) { return tokens[Number(index)]; });
}
function renderMarkdown(value) {
  const lines = String(value == null ? "" : value).replace(/\r\n?/g, "\n").split("\n");
  const output = [], paragraph = [];
  const flushParagraph = function () { if (paragraph.length) output.push("<p>" + paragraph.map(markdownInline).join("<br>") + "</p>"); paragraph.length = 0; };
  const cells = function (line) { return line.trim().replace(/^\||\|$/g, "").split("|").map(function (cell) { return cell.trim(); }); };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) { flushParagraph(); continue; }
    if (/^\s*```/.test(line)) {
      flushParagraph(); const code = []; index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) { code.push(lines[index]); index += 1; }
      output.push("<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>"); continue;
    }
    if (line.indexOf("|") !== -1 && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] || "")) {
      flushParagraph(); const header = cells(line); const rows = []; index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].indexOf("|") !== -1) { rows.push(cells(lines[index])); index += 1; }
      index -= 1;
      output.push("<table><thead><tr>" + header.map(function (cell) { return "<th>" + markdownInline(cell) + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.map(function (row) { return "<tr>" + header.map(function (_, cellIndex) { return "<td>" + markdownInline(row[cellIndex] || "") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>"); continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) { flushParagraph(); const level = heading[1].length; output.push("<h" + level + ">" + markdownInline(heading[2]) + "</h" + level + ">"); continue; }
    if (/^\s*((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line)) { flushParagraph(); output.push("<hr>"); continue; }
    const list = line.match(/^\s*([-+*]|\d+\.)\s+(.+)$/);
    if (list) {
      flushParagraph(); const ordered = /\d/.test(list[1]); const tag = ordered ? "ol" : "ul"; const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-+*]|\d+\.)\s+(.+)$/);
        if (!item || /\d/.test(item[1]) !== ordered) break;
        const task = item[2].match(/^\[([ xX])\]\s+(.+)$/);
        items.push("<li>" + (task ? '<label><input type="checkbox" disabled' + (task[1].toLowerCase() === "x" ? " checked" : "") + "> " + markdownInline(task[2]) + "</label>" : markdownInline(item[2])) + "</li>"); index += 1;
      }
      index -= 1; output.push("<" + tag + ">" + items.join("") + "</" + tag + ">"); continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return output.join("");
}

function unwrap(raw) {
  const usersById = new Map((raw.users || []).map(function (user) { return [user.user_id, user]; }));
  const assigneesByTask = new Map();
  (raw.task_assignees || []).forEach(function (row) {
    const user = usersById.get(row.user_id);
    if (user) assigneesByTask.set(row.task_id, (assigneesByTask.get(row.task_id) || []).concat(user));
  });
  const statuses = (raw.statuses || []).sort(function (a, b) { return a.position - b.position; });
  const tasks = (raw.tasks || []).map(function (task) { return Object.assign({}, task, { assignees: assigneesByTask.get(task.task_id) || [] }); });
  (raw.codex_work_items || []).forEach(function (item) {
    const status = statuses.find(function (entry) { return entry.status_name === item.status_name; });
    tasks.push({ task_id: "codex:" + item.id, codex: true, codex_id: item.id, description: item.description, title: item.title, status_id: status && status.status_id, issue_state: "open", assignees: [] });
  });
  return {
    project: (raw.projects || [])[0] || {},
    statuses: statuses,
    users: raw.users || [],
    milestones: raw.milestones || [],
    tasks: tasks,
    issueDetails: raw.issue_details || [],
    issueComments: raw.issue_comments || [],
    issueTimelineEvents: raw.issue_timeline_events || [],
    projectStatusHistory: raw.project_status_history || [],
    timelineCollectionRequests: raw.timeline_collection_requests || []
  };
}
async function fetchSnapshot() {
  const response = await fetch(CONFIG.snapshotPath || "./data.json");
  if (!response.ok) throw new Error("Snapshot request failed: " + response.status);
  return unwrap(await response.json());
}
async function fetchLive() {
  const response = await fetch("/api/board");
  if (!response.ok) throw new Error("Board API: " + response.status);
  return unwrap(await response.json());
}
function applyData(data, live) {
  state.project = data.project; state.statuses = data.statuses; state.users = data.users; state.milestones = data.milestones; state.tasks = data.tasks; state.issueDetails = data.issueDetails; state.issueComments = data.issueComments; state.issueTimelineEvents = data.issueTimelineEvents; state.projectStatusHistory = data.projectStatusHistory; state.timelineCollectionRequests = data.timelineCollectionRequests; state.live = live;
  renderProject(); renderAssigneeOptions(); render();
}
function renderProject() {
  const repo = projectRepo();
  $("#header-repository").textContent = repo.replace("/", " / ");
  $("#repository-link").textContent = repo;
  $("#repository-link").href = "https://github.com/" + repo;
  $("#project-title").textContent = state.project.project_name || "GitHub Project";
  $("#project-link").href = state.project.github_project_url || "https://github.com/" + repo;
  $("#header-owner").textContent = (repo.split("/")[0] || "S").slice(0, 1).toUpperCase();
  $("#header-owner").href = "https://github.com/" + (repo.split("/")[0] || "seune-h0203");
  document.title = (state.project.project_name || "Projects") + " · Projects";
}
function renderAssigneeOptions() {
  assigneeFilter.innerHTML = '<option value="all">Everyone</option>' + state.users.map(function (user) { return '<option value="' + user.user_id + '">' + escapeHtml(user.github_username) + "</option>"; }).join("");
  assigneeFilter.value = state.assignee; stateFilter.value = state.issueState;
}
function visibleTasks() {
  const query = state.query.trim().toLowerCase();
  return state.tasks.filter(function (task) {
    if (state.assignee !== "all" && !task.assignees.some(function (user) { return String(user.user_id) === state.assignee; })) return false;
    if (state.issueState !== "all" && task.issue_state !== state.issueState) return false;
    if (!query) return true;
    const text = [task.title, task.github_issue_number, task.issue_state].concat(task.assignees.map(function (user) { return user.github_username; })).join(" ").toLowerCase();
    return text.indexOf(query) !== -1;
  }).sort(function (a, b) { return state.sort === "title" ? a.title.localeCompare(b.title, "ko") : (a.github_issue_number || Number.MAX_SAFE_INTEGER) - (b.github_issue_number || Number.MAX_SAFE_INTEGER); });
}
function render() {
  const tasks = visibleTasks();
  const buckets = new Map(state.statuses.map(function (status) { return [status.status_id, []]; }));
  tasks.forEach(function (task) { const bucket = buckets.get(task.status_id); if (bucket) bucket.push(task); });
  board.innerHTML = state.statuses.map(function (status) {
    const items = buckets.get(status.status_id) || [];
    return '<section class="column" data-status-id="' + status.status_id + '"><header class="column-header"><span class="column-title">' + escapeHtml(status.status_name) + '</span><span class="column-count">' + items.length + '</span><button type="button" class="column-menu" data-action="column-menu" aria-label="More options">···</button></header><div class="cards">' + (items.length ? items.map(renderCard).join("") : '<p class="empty-column">No items</p>') + '</div><button type="button" class="add-item" data-action="add-item" data-status-name="' + escapeHtml(status.status_name) + '"><span>＋</span> Add item</button></section>';
  }).join("");
  const done = state.statuses.find(function (status) { return status.is_done; });
  const doneCount = done ? state.tasks.filter(function (task) { return task.status_id === done.status_id; }).length : 0;
  $("#board-status").textContent = tasks.length + " items · " + (state.tasks.length - doneCount) + " active · " + doneCount + " done · " + (state.live ? "live data" : "snapshot");
  updateFilterUi();
}
function renderCard(task) {
  const milestone = state.milestones.find(function (item) { return item.milestone_id === task.milestone_id; });
  const label = task.codex ? "Codex work" : "Issue #" + task.github_issue_number;
  const meta = task.codex ? "<span>Codex</span><span>· shared work</span>" : '<span>#' + task.github_issue_number + "</span><span>· " + escapeHtml(projectRepo().split("/")[1]) + "</span>";
  return '<article class="card" draggable="true" data-task-id="' + task.task_id + '" tabindex="0" aria-label="' + label + ': ' + escapeHtml(task.title) + '"><button class="card-title" type="button" data-action="open-task" data-task-id="' + task.task_id + '">' + escapeHtml(task.title) + '</button><div class="card-meta"><span class="issue-state ' + (task.issue_state === "closed" ? "closed" : "") + '"></span>' + meta + '</div><div class="card-footer">' + (milestone ? '<span class="milestone">' + escapeHtml(milestone.title) + "</span>" : "") + '<div class="assignees">' + task.assignees.slice(0, 3).map(avatar).join("") + "</div></div></article>";
}
function updateFilterUi() {
  const active = Number(state.assignee !== "all") + Number(state.issueState !== "all") + Number(Boolean(state.query));
  $("#filter-count").hidden = active === 0; $("#filter-count").textContent = active;
  const labels = [];
  if (state.query) labels.push("Search: " + state.query);
  if (state.assignee !== "all") labels.push("Assignee: " + ((state.users.find(function (user) { return String(user.user_id) === state.assignee; }) || {}).github_username || ""));
  if (state.issueState !== "all") labels.push("State: " + state.issueState);
  $("#active-filter").hidden = labels.length === 0; $("#active-filter").textContent = labels.join(" · ");
}
function showToast(message) {
  const toast = document.createElement("div"); toast.className = "toast"; toast.textContent = message; $("#toast-region").append(toast);
  setTimeout(function () { toast.remove(); }, 3200);
}
function renderActivity(taskId) {
  const comments = state.issueComments.filter(function (item) { return String(item.task_id) === String(taskId); }).map(function (comment) {
    return { date: comment.created_at, html: '<article class="activity-item"><div class="activity-meta"><strong>' + escapeHtml(comment.author_login || "Unknown user") + '</strong><time datetime="' + escapeHtml(comment.created_at || "") + '">' + escapeHtml(formatDate(comment.created_at)) + '</time></div><p class="activity-body">' + escapeHtml(comment.body || "") + '</p></article>' };
  });
  const timeline = state.issueTimelineEvents.filter(function (item) { return String(item.task_id) === String(taskId); }).map(function (event) {
    return { date: event.occurred_at, html: '<article class="activity-item timeline-item"><div class="activity-meta"><strong>' + escapeHtml(event.actor_login || "GitHub") + '</strong><time datetime="' + escapeHtml(event.occurred_at || "") + '">' + escapeHtml(formatDate(event.occurred_at)) + '</time></div><p class="activity-body">' + escapeHtml(event.note || event.event_type || "Issue activity") + '</p></article>' };
  });
  const statusHistory = state.projectStatusHistory.filter(function (item) { return String(item.task_id) === String(taskId); }).map(function (event) {
    const from = state.statuses.find(function (status) { return String(status.status_id) === String(event.from_status_id); });
    const to = state.statuses.find(function (status) { return String(status.status_id) === String(event.to_status_id); });
    const text = event.note || "Moved from " + (from ? from.status_name : "unknown") + " to " + (to ? to.status_name : "unknown");
    return { date: event.occurred_at, html: '<article class="activity-item timeline-item"><div class="activity-meta"><strong>' + escapeHtml(event.actor_login || "Project") + '</strong><time datetime="' + escapeHtml(event.occurred_at || "") + '">' + escapeHtml(formatDate(event.occurred_at)) + '</time></div><p class="activity-body">' + escapeHtml(text) + '</p></article>' };
  });
  const items = comments.concat(timeline, statusHistory).sort(function (a, b) { return new Date(b.date || 0) - new Date(a.date || 0); });
  if (items.length) return '<div class="activity-list">' + items.map(function (item) { return item.html; }).join("") + '</div>';
  const request = state.timelineCollectionRequests.find(function (item) { return String(item.requested_task_id) === String(taskId); });
  return request && request.failure_reason ? '<p class="empty-detail">Timeline history unavailable: ' + escapeHtml(request.failure_reason) + '</p>' : '<p class="empty-detail">No activity recorded for this issue.</p>';
}
function openTask(taskId) {
  const task = state.tasks.find(function (item) { return String(item.task_id) === String(taskId); });
  if (!task) return;
  const status = state.statuses.find(function (item) { return item.status_id === task.status_id; });
  const milestone = state.milestones.find(function (item) { return item.milestone_id === task.milestone_id; });
  const details = state.issueDetails.find(function (item) { return String(item.task_id) === String(task.task_id); });
  const names = task.assignees.length ? task.assignees.map(function (user) { return escapeHtml(user.github_username); }).join(", ") : "Unassigned";
  const issueLabel = task.codex ? "Codex work" : task.issue_state === "closed" ? "Closed" : "Open";
  const heading = task.codex ? "Shared team work · Codex" : "Issue #" + task.github_issue_number + " · " + escapeHtml(projectRepo());
  const description = task.codex ? task.description : details && details.body || "No description available for this issue.";
  const activity = task.codex ? '<p class="empty-detail">Registered by Codex CLI/API.</p>' : renderActivity(task.task_id);
  const githubLink = task.codex ? "" : '<div class="modal-actions"><a class="control-button" href="' + escapeHtml(issueUrl(task)) + '" target="_blank" rel="noreferrer">Open in GitHub ↗</a></div>';
  $("#modal-root").innerHTML = '<div class="modal-backdrop"><article class="modal issue-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><div><p class="modal-kicker">' + heading + '</p><h2 id="modal-title">' + escapeHtml(task.title) + '</h2><p class="issue-status"><span class="issue-state ' + (task.issue_state === "closed" ? "closed" : "") + '"></span>' + issueLabel + '</p></div><button type="button" class="modal-close" data-action="close-modal" aria-label="Close">×</button></div><div class="issue-section"><h3>Description</h3><div class="issue-body markdown-body">' + renderMarkdown(description) + '</div></div><div class="issue-section"><h3>Activity</h3>' + activity + '</div><dl class="modal-details"><div class="detail-row"><dt>Project status</dt><dd>' + escapeHtml(status ? status.status_name : "Unknown") + '</dd></div><div class="detail-row"><dt>Assignees</dt><dd>' + names + '</dd></div><div class="detail-row"><dt>Milestone</dt><dd>' + escapeHtml(milestone ? milestone.title : "None") + '</dd></div></dl>' + githubLink + '</article></div>';
}
function closeModal() { $("#modal-root").innerHTML = ""; }
async function persistStatus(task, previousStatusId) {
  if (!state.live) return;
  const status = state.statuses.find(function (item) { return item.status_id === task.status_id; });
  const path = task.codex ? "/api/work-items/" + encodeURIComponent(task.codex_id) : "/api/tasks/" + encodeURIComponent(task.task_id) + "/status";
  const body = task.codex ? { status_name: status.status_name } : { status_id: task.status_id };
  const token = task.codex ? null : await currentAccessToken();
  if (!task.codex && !token) throw new Error("Sign in to update GitHub Issue status.");
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(path, { method: "PATCH", headers: headers, body: JSON.stringify(body) });
  if (!response.ok) { task.status_id = previousStatusId; render(); throw new Error("status update failed"); }
}
function moveTask(taskId, statusId) {
  const task = state.tasks.find(function (item) { return String(item.task_id) === String(taskId); });
  if (!task || task.status_id === statusId) return;
  if (!state.live) { showToast("Snapshot mode: changes are not saved."); return; }
  if (!task.codex && !authUser) { showToast("Sign in before changing a GitHub Issue status."); openAuthDialog(); return; }
  const previousStatusId = task.status_id; task.status_id = statusId; render();
  const status = state.statuses.find(function (item) { return item.status_id === statusId; });
  showToast((task.codex ? "Codex work" : "#" + task.github_issue_number) + " moved to " + (status ? status.status_name : "new status"));
  persistStatus(task, previousStatusId).catch(function () { showToast("Could not save status change."); });
}
function handleAction(action, target) {
  if (action === "toggle-filter") { filterPopover.hidden = !filterPopover.hidden; target.setAttribute("aria-expanded", String(!filterPopover.hidden)); }
  if (action === "close-filter") filterPopover.hidden = true;
  if (action === "clear-filter") { state.query = ""; state.assignee = "all"; state.issueState = "all"; searchInput.value = ""; assigneeFilter.value = "all"; stateFilter.value = "all"; filterPopover.hidden = true; render(); }
  if (action === "focus-search") searchInput.focus();
  if (action === "open-task") openTask(target.dataset.taskId || (target.closest(".card") || {}).dataset.taskId);
  if (action === "sort") { state.sort = state.sort === "issue" ? "title" : "issue"; render(); showToast(state.sort === "title" ? "Sorted by title" : "Sorted by issue number"); }
  if (action === "add-item") showToast("New items are created in the source GitHub Project.");
  if (action === "add-view") showToast("Board is the available project view.");
  if (action === "more" || action === "column-menu") showToast("View settings are read-only.");
  if (action === "close-modal") closeModal();
}
function bindEvents() {
  document.addEventListener("click", function (event) {
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) handleAction(actionTarget.dataset.action, actionTarget);
    const card = event.target.closest(".card");
    if (card && !event.target.closest("a") && !event.target.closest("button")) openTask(card.dataset.taskId);
    if (event.target.classList.contains("modal-backdrop")) closeModal();
  });
  document.querySelectorAll("[data-view]").forEach(function (tab) { tab.addEventListener("click", function () { document.querySelectorAll("[data-view]").forEach(function (item) { item.classList.toggle("active", item === tab); }); if (tab.dataset.view !== "board") showToast(tab.textContent.trim() + " view is not enabled for this lean board."); }); });
  searchInput.addEventListener("input", function () { state.query = searchInput.value; render(); });
  assigneeFilter.addEventListener("change", function () { state.assignee = assigneeFilter.value; render(); });
  stateFilter.addEventListener("change", function () { state.issueState = stateFilter.value; render(); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "/" && document.activeElement !== searchInput && !event.metaKey && !event.ctrlKey) { event.preventDefault(); searchInput.focus(); }
    if (event.key === "Escape") { closeModal(); filterPopover.hidden = true; }
    if (event.key === "Enter" && document.activeElement && document.activeElement.closest(".card")) openTask(document.activeElement.closest(".card").dataset.taskId);
  });
  board.addEventListener("dragstart", function (event) { const card = event.target.closest(".card"); if (!card) return; state.draggingId = card.dataset.taskId; card.classList.add("dragging"); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", state.draggingId); });
  board.addEventListener("dragend", function (event) { const card = event.target.closest(".card"); if (card) card.classList.remove("dragging"); document.querySelectorAll(".column.is-over").forEach(function (column) { column.classList.remove("is-over"); }); state.draggingId = null; });
  board.addEventListener("dragover", function (event) { const column = event.target.closest(".column"); if (!column) return; event.preventDefault(); column.classList.add("is-over"); event.dataTransfer.dropEffect = "move"; });
  board.addEventListener("dragleave", function (event) { const column = event.target.closest(".column"); if (column && !column.contains(event.relatedTarget)) column.classList.remove("is-over"); });
  board.addEventListener("drop", function (event) { const column = event.target.closest(".column"); if (!column) return; event.preventDefault(); column.classList.remove("is-over"); moveTask(state.draggingId || event.dataTransfer.getData("text/plain"), Number(column.dataset.statusId)); });
}
async function init() {
  bindEvents();
  $("#auth-button").addEventListener("click", function () { if (authUser) signOut(); else openAuthDialog(); });
  $("#auth-cancel").addEventListener("click", function () { authDialog.close(); });
  authForm.addEventListener("submit", sendLoginLink);
  await initAuth();
  try {
    let data;
    try { data = await fetchLive(); applyData(data, true); }
    catch (liveError) { data = await fetchSnapshot(); applyData(data, false); console.info("Using snapshot fallback:", liveError.message); }
  } catch (error) { $("#board-status").className = "board-status error"; $("#board-status").textContent = "Could not load board data."; console.error(error); }
}
init();
