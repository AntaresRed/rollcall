// ============================================================
// POST /functions/v1/parse-timetable
// Body: { image: "<base64>", mimeType: "image/png" }
//
// Secondary path only. The primary way to build a timetable is the in-app
// course picker, which reads the same catalogue and cannot misread anything.
// This exists for students who already have a personal grid image.
//
// Because every Term V course carries a short code, the model is asked for
// the CODE rather than the full title — that turns a fuzzy-text problem into
// an exact lookup, and phase/section then come from the catalogue rather
// than from the image at all.
//
//   supabase secrets set GEMINI_API_KEY=...
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CATALOGUE, findByCode, findByName, isIgnored } from "../_shared/catalogue.ts";

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAY_INDEX: Record<string, number> = {
  MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7,
};

const SLOT_END: Record<string, string> = {
  "08:30": "09:45", "10:15": "11:30", "12:00": "13:15",
  "14:30": "15:45", "16:15": "17:30", "18:00": "19:15",
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    classes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          code: { type: "STRING", description: "Course code in brackets, e.g. LSCM" },
          name: { type: "STRING", description: "Course title as printed" },
          section: { type: "STRING", description: "Trailing section letter, A or B" },
          day: { type: "STRING", enum: Object.keys(DAY_INDEX) },
          start: { type: "STRING", description: "Slot start, 24h HH:MM" },
          room: { type: "STRING" },
        },
        required: ["name", "day", "start"],
      },
    },
  },
  required: ["classes"],
};

const PROMPT = `Read this weekly class timetable image and list every class block.

Layout: columns are days (MON..SUN across the top); the far-left column holds
slot start times in 24-hour format — usually 08:30, 10:15, 12:00, 14:30, 16:15,
18:00. Each slot runs 75 minutes.

For each block report:
- "code": the short course code printed in brackets, e.g. "(LSCM)" -> LSCM.
  Omit only if no bracketed code is visible.
- "name": the course title as printed.
- "section": the trailing letter after the code, e.g. "(LSCM)-B" -> B.
  A PRE or POST marker in that suffix is not the section — ignore it.
- "day", "start": which column and which row the block sits in.
- "room": the smaller line under the title, if there is one.

Skip any block titled "IDT" entirely.

Term V codes in use:
${CATALOGUE.map((c) => `${c.code} = ${c.name}`).join("\n")}

Return JSON only.`;

function normaliseTime(t: string): string | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec((t ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function snapSlot(t: string): string {
  const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  let best = t;
  let diff = Infinity;
  for (const slot of Object.keys(SLOT_END)) {
    const d = Math.abs(toMin(slot) - toMin(t));
    if (d < diff) { diff = d; best = slot; }
  }
  return diff <= 20 ? best : t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sign in required." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "Sign in required." }, 401);

    const { image, mimeType } = await req.json();
    if (!image) return json({ error: "No image received." }, 400);
    if (image.length > 11_000_000) {
      return json({ error: "That image is too large. Try a screenshot instead of a photo." }, 413);
    }

    const gRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType ?? "image/png", data: image } },
              { text: PROMPT },
            ],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );

    if (!gRes.ok) {
      console.error("gemini", gRes.status, await gRes.text());
      const msg = gRes.status === 429
        ? "The reader is busy. Pick your courses from the list instead — it's quicker anyway."
        : "Couldn't read that image. Pick your courses from the list instead.";
      return json({ error: msg }, gRes.status === 429 ? 429 : 502);
    }

    const gJson = await gRes.json();
    const text = gJson?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";

    let parsed: { classes?: unknown[] };
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      console.error("unparseable", text.slice(0, 400));
      return json({ error: "Couldn't read that image. Pick your courses from the list instead." }, 502);
    }

    const rows = (parsed.classes ?? []).flatMap((raw) => {
      const c = raw as Record<string, string>;
      if (!c.name || isIgnored(c.name) || isIgnored(c.code ?? "")) return [];

      const day = DAY_INDEX[(c.day ?? "").toUpperCase()];
      const startRaw = normaliseTime(c.start);
      if (!day || !startRaw) return [];
      const start = snapSlot(startRaw);

      // Exact code lookup first; name similarity only as a fallback.
      const course = (c.code ? findByCode(c.code) : undefined) ?? findByName(c.name).course;

      const letter = (c.section ?? "A").trim().toUpperCase().slice(-1) || "A";
      const section = course
        ? (course.sections[letter] ? letter : Object.keys(course.sections)[0])
        : null;

      return [{
        day_of_week: day,
        start_time: start,
        end_time: SLOT_END[start] ?? start,
        subject: course?.name ?? c.name.trim(),
        course_code: course?.code ?? null,
        section,
        room: c.room?.trim() || null,
        term_phase: course?.phase ?? "full",
        credits: course?.credits ?? 3.0,
        total_classes: course?.total_classes ?? 20,
        min_pct: course?.min_pct ?? 75,
        _matchedCatalogue: Boolean(course),
      }];
    });

    const seen = new Set<string>();
    const unique = rows.filter((r) => {
      const k = `${r.day_of_week}|${r.start_time}|${r.subject}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (!unique.length) {
      return json({ error: "No classes found in that image. Pick your courses from the list instead." }, 422);
    }

    // Nothing is saved until the student approves it on the confirm screen.
    return json({ classes: unique });
  } catch (err) {
    console.error(err);
    return json({ error: "Something broke on our side. Try again." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
