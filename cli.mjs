const base = (process.env.KANBAN_API_URL || "http://127.0.0.1:4173/api").replace(/\/$/, "");
const [command, ...args] = process.argv.slice(2);

async function request(path, method = "GET", body, accessToken) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = "Bearer " + accessToken;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(data.error || "API request failed: " + response.status);
  return data;
}

function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) result[args[index].slice(2)] = args[++index];
  }
  return result;
}

try {
  if (command === "list") {
    const data = await request("/board");
    if (args.includes("--json")) console.log(JSON.stringify(data, null, 2));
    else {
      for (const item of data.tasks || []) {
        const status = (data.statuses || []).find(function (entry) { return entry.status_id === item.status_id; });
        console.log("task:" + item.task_id + " #" + item.github_issue_number + " [" + (status && status.status_name || "?") + "] " + item.title);
      }
      for (const item of data.codex_work_items || []) console.log("codex:" + item.id + " [" + item.status_name + "] " + item.title);
    }
  } else if (command === "add") {
    const firstOption = args.findIndex(function (arg) { return arg.startsWith("--"); });
    const title = args.slice(0, firstOption < 0 ? args.length : firstOption).join(" ").trim();
    const opts = options(args.slice(firstOption < 0 ? args.length : firstOption));
    if (!title) throw new Error('Usage: node cli.mjs add "title" [--status "Todo"] [--description "..."]');
    const item = await request("/work-items", "POST", { title, status_name: opts.status || "Todo", description: opts.description || "" });
    console.log("Created codex:" + item.id + " [" + item.status_name + "] " + item.title);
  } else if (command === "move") {
    const [id, ...status] = args.filter(function (arg) { return !arg.startsWith("--"); });
    const status_name = status.join(" ");
    if (!id || !status_name) throw new Error('Usage: node cli.mjs move <task-id> "In Progress"');
    if (id.startsWith("codex:")) await request("/work-items/" + encodeURIComponent(id.slice(6)), "PATCH", { status_name });
    else {
      const taskId = id.startsWith("task:") ? id.slice(5) : id;
      if (!/^\d+$/.test(taskId)) throw new Error("Use task:<id> or codex:<id>");
      await request("/tasks/" + taskId + "/status", "PATCH", { status_name }, process.env.SUPABASE_ACCESS_TOKEN);
    }
    console.log("Moved " + id + " to " + status_name);
  } else {
    throw new Error("Usage: node cli.mjs list [--json] | add <title> [--status <name>] [--description <text>] | move <id> <status>");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
