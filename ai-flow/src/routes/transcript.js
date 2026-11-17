/**
 * POST /transcript   — the core judged feature.
 *
 * Flow:
 *   1. admin only (from the SESSION, never a client-supplied role)
 *   2. reject empty transcript
 *   3. block a second concurrent click from the same admin
 *   4. build directory from DB (no passwords)
 *   5. call the AI
 *   6. validate the whole draft; on failure save NOTHING and return the problems
 *   7. save projects + tasks in ONE transaction (all-or-nothing)
 *   8. return created projects with task counts
 *
 * Mount in your app:
 *   const transcriptRouter = require('./routes/transcript');
 *   app.use('/', transcriptRouter(prisma));
 */

const express = require('express');
const { extractProjects, AiError } = require('../ai/extract');
const { buildDirectoryFromDb, buildRefIndex, DEMO_DIRECTORY } = require('../ai/directory');
const { validateDraft } = require('../validation/validateDraft');

const MEETING_DATE = process.env.MEETING_DATE || '2026-10-07';

/** in-flight guard so a double click cannot create duplicates */
const inFlight = new Set();

/** Role comes from the session only. Never trust req.body.role. */
function requireAdmin(req, res, next) {
  const user = req.session && req.session.user;
  if (!user) return res.status(401).json({ ok: false, message: 'Please log in.' });
  if (user.role !== 'ADMIN') {
    return res.status(403).json({ ok: false, message: 'Only the administrator can create projects from a transcript.' });
  }
  next();
}

module.exports = function transcriptRouter(prisma) {
  const router = express.Router();

  router.post('/transcript', requireAdmin, async (req, res) => {
    const adminId = req.session.user.id;
    const transcript = typeof req.body.transcript === 'string' ? req.body.transcript : '';

    // --- 2. empty transcript ---
    if (transcript.trim().length === 0) {
      return res.status(400).json({ ok: false, stage: 'input', message: 'Please paste a meeting transcript before creating projects.' });
    }
    if (transcript.trim().length < 40) {
      return res.status(400).json({ ok: false, stage: 'input', message: 'That transcript is too short to contain project decisions. Paste the full meeting.' });
    }

    // --- 3. duplicate click guard ---
    if (inFlight.has(adminId)) {
      return res.status(409).json({ ok: false, stage: 'input', message: 'A transcript is already being processed. Please wait.' });
    }
    inFlight.add(adminId);

    try {
      // --- 4. directory (never includes passwordHash) ---
      let directory;
      try {
        directory = await buildDirectoryFromDb(prisma);
      } catch {
        directory = DEMO_DIRECTORY; // fallback if the ref column is not seeded yet
      }
      if (!directory.length) {
        return res.status(500).json({ ok: false, stage: 'directory', message: 'No managers or agents are seeded. Run the seed script first.' });
      }
      const refIndex = buildRefIndex(directory);

      // --- 5. AI ---
      let draft;
      try {
        ({ draft } = await extractProjects({ transcript, directory, meetingDate: MEETING_DATE }));
      } catch (e) {
        if (e instanceof AiError) {
          return res.status(502).json({
            ok: false,
            stage: 'ai',
            message: 'The AI could not produce a usable result from this transcript. Nothing was saved. Please try again.',
            detail: e.message,
          });
        }
        throw e;
      }

      // --- 6. validate everything before saving anything ---
      const result = validateDraft(draft, refIndex);
      if (!result.ok) {
        return res.status(422).json({
          ok: false,
          stage: 'validation',
          message: 'Some required information could not be resolved. Nothing was saved — fix the transcript and try again.',
          errors: result.errors,
          warnings: result.warnings,
        });
      }

      // --- 7. one transaction: all projects + all tasks, or nothing ---
      const created = await prisma.$transaction(async (tx) => {
        const out = [];
        for (const p of result.normalized) {
          const project = await tx.project.create({
            data: {
              name: p.name,
              clientName: p.clientName,
              description: p.description,
              managerId: p.managerId,
              deadline: new Date(p.deadline + 'T00:00:00.000Z'),
            },
          });

          await tx.task.createMany({
            data: p.tasks.map((t) => ({
              projectId: project.id,
              title: t.title,
              description: t.description,
              assigneeId: t.assigneeId,
              deadline: new Date(t.deadline + 'T00:00:00.000Z'),
              estimatedHours: t.estimatedHours,
            })),
          });

          out.push({
            id: project.id,
            name: project.name,
            clientName: project.clientName,
            managerId: project.managerId,
            deadline: p.deadline,
            taskCount: p.tasks.length,
            totalHours: p.tasks.reduce((s, t) => s + t.estimatedHours, 0),
          });
        }
        return out;
      });

      // --- 8. success ---
      return res.status(201).json({
        ok: true,
        stage: 'saved',
        message: `Created ${created.length} project${created.length === 1 ? '' : 's'} with ${created.reduce((s, p) => s + p.taskCount, 0)} tasks.`,
        projects: created,
        warnings: result.warnings,
      });
    } catch (err) {
      console.error('[POST /transcript]', err);
      return res.status(500).json({
        ok: false,
        stage: 'save',
        message: 'Saving failed, so nothing was created. Please try again.',
      });
    } finally {
      inFlight.delete(adminId);
    }
  });

  return router;
};
