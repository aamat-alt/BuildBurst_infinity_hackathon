/**
 * POST /api/transcript  (ADMIN only) - the core judged feature.
 * Login + admin check are applied in server.js (requireAuth + requireRole('ADMIN')),
 * using the signed cookie, never a role sent by the browser.
 *
 * Flow:
 *   1. reject empty / too-short transcript                    -> 400
 *   2. block a second concurrent click from the same admin    -> 409
 *   3. build directory from DB (no emails, no passwords)
 *   4. call the AI                                             -> 502 if it fails
 *   5. validate the whole draft; save NOTHING on any problem   -> 422 { errors }
 *   6. save all projects + tasks in ONE transaction            -> 500 if it fails (rolled back)
 *   7. return created projects                                 -> 201 { projects }
 */
const express = require('express');
const { withTransaction } = require('../db');
const { extractProjects, AiError } = require('../ai/extract');
const { buildDirectoryFromDb, buildRefIndex, DEMO_DIRECTORY } = require('../ai/directory');
const { validateDraft } = require('../validation/validateDraft');

const MEETING_DATE = process.env.MEETING_DATE || '2026-10-07';
const MIN_LENGTH = 40;

/** in-flight guard so a double click cannot create duplicates */
const inFlight = new Set();

const router = express.Router();

router.post('/', async (req, res) => {
  const adminId = req.user.id;
  const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript : '';

  // --- 1. input ---
  if (!transcript.trim()) {
    return res.status(400).json({ ok: false, stage: 'input', error: 'Please paste a meeting transcript before creating projects.' });
  }
  if (transcript.trim().length < MIN_LENGTH) {
    return res.status(400).json({ ok: false, stage: 'input', error: 'That transcript is too short to contain project decisions. Paste the full meeting.' });
  }

  // --- 2. duplicate click guard ---
  if (inFlight.has(adminId)) {
    return res.status(409).json({ ok: false, stage: 'input', error: 'A transcript is already being processed. Please wait.' });
  }
  inFlight.add(adminId);

  try {
    // --- 3. directory ---
    let directory;
    try {
      directory = await buildDirectoryFromDb();
    } catch (e) {
      console.warn('[POST /transcript] directory read failed, using demo directory:', e.message);
      directory = DEMO_DIRECTORY;
    }
    if (!directory.length) {
      return res.status(500).json({ ok: false, stage: 'directory', error: 'No managers or agents are seeded. Run "npm run seed" first.' });
    }
    const refIndex = buildRefIndex(directory);

    // --- 4. AI ---
    let draft;
    let provider;
    try {
      ({ draft, provider } = await extractProjects({ transcript, directory, meetingDate: MEETING_DATE }));
    } catch (e) {
      if (e instanceof AiError) {
        console.error('[POST /transcript] AI error:', e.message, e.details || '');
        return res.status(502).json({
          ok: false,
          stage: 'ai',
          error: `The AI could not produce a usable result. Nothing was saved. (${e.message})`,
        });
      }
      throw e;
    }

    // --- 5. validate everything before saving anything ---
    const result = validateDraft(draft, refIndex);
    if (!result.ok) {
      return res.status(422).json({
        ok: false,
        stage: 'validation',
        error: 'Some required information could not be resolved. Nothing was saved. Fix the transcript and try again.',
        errors: result.errors,
        warnings: result.warnings,
      });
    }

    // --- 6. one transaction: all projects + all tasks, or nothing ---
    const created = await withTransaction(async (client) => {
      const out = [];
      for (const p of result.normalized) {
        const { rows } = await client.query(
          `INSERT INTO projects (name, client_name, description, manager_id, deadline)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [p.name, p.clientName, p.description, p.managerId, p.deadline]
        );
        const projectId = rows[0].id;

        for (const t of p.tasks) {
          await client.query(
            `INSERT INTO tasks (project_id, title, description, assignee_id, deadline, estimated_hours)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [projectId, t.title, t.description, t.assigneeId, t.deadline, t.estimatedHours]
          );
        }

        out.push({
          id: projectId,
          name: p.name,
          clientName: p.clientName,
          managerId: p.managerId,
          managerName: refIndex.get(p.managerRef)?.name || null,
          deadline: p.deadline,
          taskCount: p.tasks.length,
          totalHours: p.tasks.reduce((s, t) => s + t.estimatedHours, 0),
        });
      }
      return out;
    });

    // --- 7. success ---
    const taskTotal = created.reduce((s, p) => s + p.taskCount, 0);
    console.log(`[POST /transcript] ${provider}: created ${created.length} projects / ${taskTotal} tasks`);
    return res.status(201).json({
      ok: true,
      stage: 'saved',
      message: `Created ${created.length} project${created.length === 1 ? '' : 's'} with ${taskTotal} task${taskTotal === 1 ? '' : 's'}.`,
      projects: created,
      warnings: result.warnings,
    });
  } catch (err) {
    console.error('[POST /transcript]', err);
    return res.status(500).json({ ok: false, stage: 'save', error: 'Saving failed, so nothing was created. Please try again.' });
  } finally {
    inFlight.delete(adminId);
  }
});

module.exports = router;
