import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;
const SCHOOL = "http://101.227.232.33:8001";

// In-memory session store: token -> { cookies, studentId?, credentials }
const sessions = new Map();

// ---- Helper: extract value from hidden/text input in HTML ----
function extractInput(html, name) {
  // Matches <input ... name="X" ... value="Y" /> in any attribute order
  const re = new RegExp(
    `<(?:input|select)[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']` +
    `|value=["']([^"']*?)["'][^>]*name=["']${name}["']`,
    "i"
  );
  const m = html.match(re);
  if (m) return m[1] ?? m[2];

  // For <select>, look for <option selected value="...">
  const selectRe = new RegExp(
    `<select[^>]*name=["']${name}["'][^>]*>[\\s\\S]*?<option[^>]*selected[^>]*value=["']([^"']*)["']`,
    "i"
  );
  const sm = html.match(selectRe);
  return sm ? sm[1] : null;
}

// ---- Helper: login to school server, return { cookies, studentId, profile } ----
async function schoolLogin(code, password) {
  const loginRes = await fetch(`${SCHOOL}/Home/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, password }),
    redirect: "manual",
  });

  const setCookies = loginRes.headers.getSetCookie();
  const cookieString = setCookies
    .map((c) => c.split(";")[0])
    .join("; ");

  const loginData = await loginRes.json();
  if (loginData.ResultType !== 0) {
    throw new Error(loginData.Message || "Login failed");
  }

  // Fetch student profile from /Home/UserInfo (redirects to /Home/StudentInfo)
  let studentId = null;
  let profile = null;

  const profileRes = await fetch(`${SCHOOL}/Home/UserInfo`, {
    headers: { Cookie: cookieString },
    redirect: "follow",
  });

  if (profileRes.ok) {
    const html = await profileRes.text();
    studentId = extractInput(html, "id");
    profile = {
      studentId,
      userNo: extractInput(html, "UserNo"),
      userCode: extractInput(html, "UserCode"),
      userName: extractInput(html, "UserName"),
      nickName: extractInput(html, "NickName"),
      firstName: extractInput(html, "FirstName"),
      lastName: extractInput(html, "LastName"),
      gradeId: extractInput(html, "GradeId"),
      birthday: extractInput(html, "Birthday"),
    };
  }

  // Fallback: try /Stu/Timetable/Index for `var studentId = '1152';`
  if (!studentId) {
    const ttPage = await fetch(`${SCHOOL}/Stu/Timetable/Index`, {
      headers: { Cookie: cookieString },
      redirect: "manual",
    });
    if (ttPage.ok) {
      const html = await ttPage.text();
      const m = html.match(/var\s+studentId\s*=\s*['"](\d+)['"]/);
      if (m) studentId = m[1];
    }
  }

  return { cookies: cookieString, studentId, profile };
}

// ---- Helper: detect if school session is dead (302 or non-JSON response) ----
function isSessionDead(res) {
  if (res.status === 302) return true;
  const ct = res.headers.get("content-type") || "";
  // School API always returns JSON; if we get HTML back, session is gone
  if (!ct.includes("json") && ct.includes("html")) return true;
  return false;
}

// ---- Helper: make a request to school server, re-auth if session expired ----
// Returns { res, body } where body is the parsed JSON (or null on failure)
async function schoolFetch(session, url, options = {}) {
  const doFetch = (cookies) =>
    fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Cookie: cookies,
      },
      redirect: "manual",
    });

  let res = await doFetch(session.cookies);

  // Clone before reading body so we can still return the response
  if (isSessionDead(res) && session.credentials) {
    console.log("School session expired, re-authenticating...");
    try {
      const fresh = await schoolLogin(session.credentials.code, session.credentials.password);
      session.cookies = fresh.cookies;
      if (fresh.studentId) session.studentId = fresh.studentId;
      if (fresh.profile) session.profile = fresh.profile;
      res = await doFetch(session.cookies);
    } catch (err) {
      console.error("Re-auth failed:", err.message);
    }
  }

  return res;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static HTML
app.get("/", (_req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

// ---- Auth middleware for protected routes ----
function auth(req, res, next) {
  const token = req.headers["x-token"];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.session = sessions.get(token);
  next();
}

// ---- LOGIN ----
app.post("/api/login", async (req, res) => {
  const { code, password } = req.body;
  if (!code || !password) {
    return res.status(400).json({ error: "code and password required" });
  }

  try {
    const { cookies, studentId, profile } = await schoolLogin(code, password);

    // Issue our own token
    const token = crypto.randomBytes(16).toString("hex");
    sessions.set(token, {
      cookies,
      studentId,
      profile,
      // Store credentials in memory so we can re-auth when school session expires
      // NOTE: MVP only — production should use encrypted storage
      credentials: { code, password },
    });

    res.json({
      ok: true,
      token,
      studentId,
      profile,
    });
  } catch (err) {
    console.error("Login error:", err);
    const msg = err.message || "Failed to connect to school server";
    res.status(401).json({ error: msg });
  }
});

// ---- TIMETABLE ----
app.get("/api/timetable", auth, async (req, res) => {
  const { cookies, studentId } = req.session;
  const sid = req.query.studentId || studentId;
  const yearId = req.query.yearId || "31"; // current semester

  if (!sid) {
    return res.status(400).json({
      error: "studentId unknown. Pass ?studentId=XXXX manually.",
    });
  }

  try {
    const ttRes = await schoolFetch(
      req.session,
      `${SCHOOL}/Stu/Timetable/GetTimetableByStudent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: new URLSearchParams({ yearId, studentId: sid }),
      }
    );

    if (isSessionDead(ttRes)) {
      return res.status(401).json({ error: "School session expired and re-auth failed" });
    }

    const text = await ttRes.text();
    try {
      res.json(JSON.parse(text));
    } catch {
      console.error("Timetable: non-JSON response:", text.slice(0, 200));
      res.status(502).json({ error: "School server returned invalid response" });
    }
  } catch (err) {
    console.error("Timetable error:", err);
    res.status(500).json({ error: "Failed to fetch timetable" });
  }
});

// ---- GRADES ----
app.get("/api/grades", auth, async (req, res) => {
  const yearId = req.query.yearId || "31";

  try {
    const gradesRes = await schoolFetch(
      req.session,
      `${SCHOOL}/Stu/Exam/GetScoreData`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: new URLSearchParams({ yearId, page: "1", limit: "100" }),
      }
    );

    if (isSessionDead(gradesRes)) {
      return res.status(401).json({ error: "School session expired and re-auth failed" });
    }

    const text = await gradesRes.text();
    try {
      res.json(JSON.parse(text));
    } catch {
      console.error("Grades: non-JSON response:", text.slice(0, 200));
      res.status(502).json({ error: "School server returned invalid response" });
    }
  } catch (err) {
    console.error("Grades error:", err);
    res.status(500).json({ error: "Failed to fetch grades" });
  }
});

// ---- DEBUG: Fetch any page from school server (for discovering studentId) ----
app.get("/api/debug/page", auth, async (req, res) => {
  const { cookies } = req.session;
  const path = req.query.path || "/";

  try {
    const pageRes = await schoolFetch(req.session, `${SCHOOL}${path}`);
    const text = await pageRes.text();
    res.type("html").send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- LOGOUT ----
app.post("/api/logout", (req, res) => {
  const token = req.headers["x-token"];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`MVP running at http://localhost:${PORT}`);
});
