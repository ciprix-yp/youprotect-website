// Test cases for .semgrep/shift-left.yml — run: semgrep --test --config .semgrep/shift-left.yml .semgrep/shift-left.js
const { exec, execFile, execSync } = require("child_process");

app.get("/orders", (req, res) => {
  const id = req.query.id;
  // ruleid: sql-injection-from-request
  db.query("SELECT * FROM orders WHERE id = '" + id + "'");
  // ruleid: sql-injection-from-request
  db.query(`SELECT * FROM orders WHERE id = ${req.params.id}`);
  // ok: sql-injection-from-request
  db.query("SELECT * FROM orders WHERE id = $1", [id]);
  // ok: sql-injection-from-request
  db.query("SELECT * FROM orders WHERE id = " + Number.parseInt(id, 10));
});

app.post("/ping", (req, res) => {
  // ruleid: command-injection-from-request
  exec("ping -c 1 " + req.body.host);
  // ok: command-injection-from-request
  execFile("ping", ["-c", "1", req.body.host]);
});

// Hono
app.get("/orders/:id", async (c) => {
  const id = c.req.param("id");
  // ruleid: sql-injection-from-request
  await sql.unsafe("SELECT * FROM orders WHERE id = " + id);
  // ok: sql-injection-from-request
  await sql`SELECT * FROM orders WHERE id = ${id}`;
  const body = await c.req.json();
  // ruleid: sql-injection-from-request
  await db.query(`DELETE FROM orders WHERE note = '${body.note}'`);
  // ruleid: command-injection-from-request
  exec("convert " + c.req.query("file"));
  // ruleid: command-injection-from-request
  exec("tool " + c.req.header("x-value"));
  const form = await c.req.formData();
  // ruleid: command-injection-from-request
  execSync(`zip ${form.get("name")}`);
});

app.post("/cookie", (req, res) => {
  // ruleid: command-injection-from-request
  exec("echo " + req.cookies.session);
  // ruleid: command-injection-from-request
  exec("echo " + req.headers["user-agent"]);
});
