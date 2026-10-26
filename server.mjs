import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const config = require("./config.js");
const base = (process.env.SUPABASE_URL || config.supabaseUrl).replace(/\/$/, "");
const key = process.env.SUPABASE_PUBLISHABLE_KEY || config.supabaseKey;
const port = Number(process.env.PORT || 4173);
const root = resolve(".");

async function db(table, query, method = "GET", body, authorization) {
  const url = new URL("/rest/v1/" + table, base);
  Object.entries(query || {}).forEach(function ([name, value]) { url.searchParams.set(name, value); });
  const headers = { apikey: key, "Content-Type": "application/json", Prefer: "return=representation" };
  if (authorization) headers.Authorization = authorization;
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(data && data.message || table + " request failed (" + response.status + ")");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function board() {
  const tables = [
    ["projects", { select: "*", order: "project_id" }],
    ["statuses", { select: "*", order: "position" }],
    ["users", { select: "*", order: "user_id" }],
    ["milestones", { select: "*", order: "milestone_id" }],
    ["tasks", { select: "*", order: "status_id.asc,github_issue_number.asc" }],
    ["task_assignees", { select: "*", order: "task_id,user_id" }],
    ["issue_details", { select: "*", order: "task_id" }],
    ["issue_comments", { select: "*", order: "task_id,created_at" }],
    ["issue_timeline_events", { select: "*", order: "task_id,occurred_at" }],
    ["project_status_history", { select: "*", order: "task_id,occurred_at" }],
    ["timeline_collection_requests", { select: "*", order: "requested_issue_number" }]
  ];
  const data = await Promise.all(tables.map(function ([table, query]) { return db(table, query); }));
  let workItems = [];
  try { workItems = await db("codex_work_items", { select: "*", order: "created_at" }); }
  catch (error) { if (error.status !== 404) throw error; }
  return Object.fromEntries(tables.map(function ([table], index) { return [table, data[index]]; }).concat([["codex_work_items", workItems]]));
}

async function jsonBody(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 20000) throw Object.assign(new Error("Request body too large"), { status: 413 });
  }
  try { return JSON.parse(text || "{}"); }
  catch { throw Object.assign(new Error("Invalid JSON body"), { status: 400 }); }
}

async function validStatus(name) {
  if (typeof name !== "string" || !name.trim()) throw Object.assign(new Error("status_name is required"), { status: 400 });
  const statuses = await db("statuses", { select: "status_name" });
  if (!statuses.some(function (status) { return status.status_name === name; })) throw Object.assign(new Error("Unknown board status"), { status: 400 });
  return name;
}

async function api(request, response, url) {
  if (["POST", "PATCH", "DELETE"].includes(request.method)) {
    if (request.headers.origin && request.headers.origin !== "http://" + request.headers.host) throw Object.assign(new Error("Cross-origin write denied"), { status: 403 });
    if (!(request.headers["content-type"] || "").startsWith("application/json")) throw Object.assign(new Error("Content-Type must be application/json"), { status: 415 });
  }
  if (request.method === "GET" && url.pathname === "/api/board") return board();
  if (request.method === "POST" && url.pathname === "/api/work-items") {
    const body = await jsonBody(request);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description : "";
    if (!title || title.length > 200 || description.length > 10000) throw Object.assign(new Error("Title must be 1–200 characters and description at most 10000"), { status: 400 });
    const status_name = await validStatus(body.status_name || "Todo");
    const rows = await db("codex_work_items", {}, "POST", { title, description, status_name });
    if (!rows || !rows[0]) throw Object.assign(new Error("Work item was not returned by the database"), { status: 502 });
    response.statusCode = 201;
    return rows[0];
  }
  const workItem = url.pathname.match(/^\/api\/work-items\/(\d+)$/);
  if (request.method === "DELETE" && workItem) {
    const rows = await db("codex_work_items", { id: "eq." + workItem[1] }, "DELETE");
    if (!rows || !rows[0]) throw Object.assign(new Error("Work item not found or deletion denied"), { status: 404 });
    return rows[0];
  }
  if (request.method === "PATCH" && workItem) {
    const body = await jsonBody(request);
    const status_name = await validStatus(body.status_name);
    const rows = await db("codex_work_items", { id: "eq." + workItem[1] }, "PATCH", { status_name, updated_at: new Date().toISOString() });
    if (!rows || !rows[0]) throw Object.assign(new Error("Work item not found"), { status: 404 });
    return rows[0];
  }
  const taskStatus = url.pathname.match(/^\/api\/tasks\/(\d+)\/status$/);
  if (request.method === "PATCH" && taskStatus) {
    const authorization = request.headers.authorization || "";
    if (!/^Bearer\s+\S+$/.test(authorization)) throw Object.assign(new Error("Sign in is required to change a GitHub Issue status"), { status: 401 });
    const body = await jsonBody(request);
    const statuses = await db("statuses", { select: "status_id,status_name" });
    const selected = body.status_name ? statuses.find(function (status) { return status.status_name === body.status_name; }) : statuses.find(function (status) { return String(status.status_id) === String(body.status_id); });
    if (!selected) throw Object.assign(new Error("Unknown board status"), { status: 400 });
    const status_id = selected.status_id;
    const rows = await db("tasks", { task_id: "eq." + taskStatus[1] }, "PATCH", { status_id }, authorization);
    if (!rows || !rows[0]) throw Object.assign(new Error("Task not found or update denied"), { status: 404 });
    return rows[0];
  }
  throw Object.assign(new Error("Not found"), { status: 404 });
}

function send(response, status, value, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  response.end(type.startsWith("application/json") ? JSON.stringify(value) : value);
}

createServer(async function (request, response) {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      const result = await api(request, response, url);
      return send(response, response.statusCode || 200, result);
    }
    if (request.method !== "GET" && request.method !== "HEAD") return send(response, 405, { error: "Method not allowed" });
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    if (!["/index.html", "/styles.css", "/app.js", "/config.js", "/data.json"].includes(pathname)) return send(response, 404, { error: "Not found" });
    const file = resolve(root, "." + pathname);
    if (!(await stat(file)).isFile()) return send(response, 404, { error: "Not found" });
    const type = ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" })[extname(file)] || "application/octet-stream";
    send(response, 200, request.method === "HEAD" ? "" : await readFile(file), type);
  } catch (error) {
    if (!error.status || error.status >= 500) console.error(error.cause || error);
    const message = error.cause && error.cause.code ? error.message + " (" + error.cause.code + ")" : error.message;
    send(response, error.status || (error.code === "ENOENT" ? 404 : 502), { error: message || "Request failed" });
  }
}).listen(port, "127.0.0.1", function () {
  console.log("CONES Kanban API and board at http://127.0.0.1:" + port);
});
