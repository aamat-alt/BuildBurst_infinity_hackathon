/**
 * Validates the AI draft BEFORE anything touches the database.
 *
 * Returns { ok, errors, warnings, normalized }.
 * If ok === false the caller saves NOTHING and returns the error list to the UI
 * so the admin can correct the transcript and retry.
 *
 * Error objects are shaped for the frontend:
 *   { path: 'projects[1].tasks[3].estimatedHours', field: 'estimatedHours', message: '...' }
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict calendar check: rejects 2026-02-30, 2026-13-01, etc. */
function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Features the meeting may have rejected. Surfaced as warnings, not hard errors. */
const SUSPICIOUS_TASK_PATTERNS = [
  { re: /\bpayment|payment gateway|checkout|stripe|paypal\b/i, label: 'payment' },
  { re: /\binventory|stock integration|stock level\b/i, label: 'inventory' },
  { re: /\bmap|maps|driver tracking|live tracking|gps\b/i, label: 'maps/tracking' },
  { re: /\b(send|sending|real)\s+(e-?mail)|smtp|ticketing integration\b/i, label: 'real email/ticketing' },
  { re: /\bsign ?up|registration flow|forgot password|password reset|email verification\b/i, label: 'signup/password reset' },
  { re: /\bcost calculation|budget|hourly rate|progress monitoring|timesheet\b/i, label: 'cost/progress' },
];

/**
 * @param {object} draft           parsed AI output
 * @param {Map}    refIndex        ref -> { ref, id, role, name } from buildRefIndex()
 * @param {object} [opts]
 * @param {number} [opts.expectedProjects]  optional strict count for the demo transcript
 * @param {number} [opts.expectedTasks]
 */
function validateDraft(draft, refIndex, opts = {}) {
  const errors = [];
  const warnings = [];

  const err = (path, field, message) => errors.push({ path, field, message });
  const warn = (path, message) => warnings.push({ path, message });

  if (!draft || typeof draft !== 'object') {
    return { ok: false, errors: [{ path: 'root', field: 'root', message: 'AI output was not an object.' }], warnings, normalized: null };
  }
  if (!Array.isArray(draft.projects)) {
    return { ok: false, errors: [{ path: 'projects', field: 'projects', message: 'AI output is missing a "projects" array.' }], warnings, normalized: null };
  }
  if (draft.projects.length === 0) {
    return { ok: false, errors: [{ path: 'projects', field: 'projects', message: 'The AI found no projects in this transcript. Check that the transcript contains project decisions.' }], warnings, normalized: null };
  }

  const normalized = [];
  let totalTasks = 0;

  draft.projects.forEach((p, pi) => {
    const pPath = `projects[${pi}]`;
    const projectLabel = isNonEmptyString(p && p.name) ? p.name.trim() : `project #${pi + 1}`;

    if (!p || typeof p !== 'object') {
      err(pPath, 'project', 'Project entry is not an object.');
      return;
    }

    // --- project name ---
    if (!isNonEmptyString(p.name)) err(pPath + '.name', 'name', `Project name is missing (${projectLabel}).`);

    // --- client ---
    if (!isNonEmptyString(p.clientName)) err(pPath + '.clientName', 'clientName', `Client name is missing for "${projectLabel}".`);

    // --- manager must be a real MANAGER ---
    const mgr = isNonEmptyString(p.managerId) ? refIndex.get(p.managerId.trim()) : null;
    if (!isNonEmptyString(p.managerId)) {
      err(pPath + '.managerId', 'managerId', `No project manager was resolved for "${projectLabel}".`);
    } else if (!mgr) {
      err(pPath + '.managerId', 'managerId', `"${p.managerId}" is not a person in the team directory (project "${projectLabel}"). The AI must not invent people.`);
    } else if (mgr.role !== 'MANAGER') {
      err(pPath + '.managerId', 'managerId', `${mgr.name} has role ${mgr.role}, not MANAGER, so cannot manage "${projectLabel}".`);
    }

    // --- project deadline ---
    if (!isValidDate(p.deadline)) {
      err(pPath + '.deadline', 'deadline', `Project deadline for "${projectLabel}" is missing or not a valid YYYY-MM-DD date (got ${JSON.stringify(p.deadline)}).`);
    }

    // --- tasks ---
    if (!Array.isArray(p.tasks) || p.tasks.length === 0) {
      err(pPath + '.tasks', 'tasks', `Project "${projectLabel}" has no tasks.`);
    }

    const normTasks = [];
    (Array.isArray(p.tasks) ? p.tasks : []).forEach((t, ti) => {
      const tPath = `${pPath}.tasks[${ti}]`;
      const taskLabel = isNonEmptyString(t && t.title) ? t.title.trim() : `task #${ti + 1}`;
      totalTasks++;

      if (!t || typeof t !== 'object') {
        err(tPath, 'task', 'Task entry is not an object.');
        return;
      }

      if (!isNonEmptyString(t.title)) err(tPath + '.title', 'title', `A task in "${projectLabel}" has no title.`);

      // assignee must be a real AGENT
      const agent = isNonEmptyString(t.assigneeId) ? refIndex.get(t.assigneeId.trim()) : null;
      if (!isNonEmptyString(t.assigneeId)) {
        err(tPath + '.assigneeId', 'assigneeId', `No owner was resolved for task "${taskLabel}" in "${projectLabel}".`);
      } else if (!agent) {
        err(tPath + '.assigneeId', 'assigneeId', `"${t.assigneeId}" is not a person in the team directory (task "${taskLabel}"). The AI must not invent people.`);
      } else if (agent.role !== 'AGENT') {
        err(tPath + '.assigneeId', 'assigneeId', `${agent.name} has role ${agent.role}, not AGENT, so cannot own task "${taskLabel}".`);
      }

      // positive hours
      const hours = typeof t.estimatedHours === 'string' ? Number(t.estimatedHours) : t.estimatedHours;
      if (hours === null || hours === undefined || hours === '') {
        err(tPath + '.estimatedHours', 'estimatedHours', `No estimated hours were agreed for task "${taskLabel}".`);
      } else if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) {
        err(tPath + '.estimatedHours', 'estimatedHours', `Estimated hours for "${taskLabel}" must be a positive number (got ${JSON.stringify(t.estimatedHours)}).`);
      }

      // task deadline valid and <= project deadline
      if (!isValidDate(t.deadline)) {
        err(tPath + '.deadline', 'deadline', `Deadline for task "${taskLabel}" is missing or not a valid YYYY-MM-DD date (got ${JSON.stringify(t.deadline)}).`);
      } else if (isValidDate(p.deadline) && t.deadline > p.deadline) {
        err(tPath + '.deadline', 'deadline', `Task "${taskLabel}" is due ${t.deadline}, after its project deadline ${p.deadline}. A task cannot finish after its project.`);
      }

      // rejected-feature smell test.
      // Drop clauses that EXCLUDE a feature ("without payment processing",
      // "no inventory integration") — naming something as out of scope is correct
      // behaviour, not a violation. Only an actual task for it is a problem.
      const kept = String(t.description || '')
        .split(/[.;,]/)
        .filter((clause) => !/\b(no|not|non|without|exclud\w*|omit\w*|out of scope|future work|instead of|rather than|only)\b/i.test(clause))
        .join(' ');
      const haystack = `${t.title || ''} ${kept}`;
      for (const pat of SUSPICIOUS_TASK_PATTERNS) {
        if (pat.re.test(haystack)) {
          warn(tPath, `Task "${taskLabel}" mentions ${pat.label}, which the meeting may have ruled out of scope. Check before demoing.`);
        }
      }

      normTasks.push({
        title: isNonEmptyString(t.title) ? t.title.trim() : null,
        description: isNonEmptyString(t.description) ? t.description.trim() : '',
        assigneeRef: isNonEmptyString(t.assigneeId) ? t.assigneeId.trim() : null,
        assigneeId: agent ? agent.id : null,
        deadline: t.deadline,
        estimatedHours: typeof hours === 'number' ? hours : null,
      });
    });

    normalized.push({
      name: isNonEmptyString(p.name) ? p.name.trim() : null,
      clientName: isNonEmptyString(p.clientName) ? p.clientName.trim() : null,
      description: isNonEmptyString(p.description) ? p.description.trim() : '',
      managerRef: isNonEmptyString(p.managerId) ? p.managerId.trim() : null,
      managerId: mgr ? mgr.id : null,
      deadline: p.deadline,
      tasks: normTasks,
    });
  });

  // duplicate project names in one draft usually means the AI split one project in two
  const names = normalized.map((p) => (p.name || '').toLowerCase()).filter(Boolean);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) warn('projects', `Duplicate project names in the draft: ${[...new Set(dupes)].join(', ')}.`);

  if (opts.expectedProjects && normalized.length !== opts.expectedProjects) {
    warn('projects', `Expected ${opts.expectedProjects} projects, got ${normalized.length}.`);
  }
  if (opts.expectedTasks && totalTasks !== opts.expectedTasks) {
    warn('projects', `Expected ${opts.expectedTasks} tasks, got ${totalTasks}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized: errors.length === 0 ? normalized : null,
    counts: { projects: normalized.length, tasks: totalTasks },
  };
}

module.exports = { validateDraft, isValidDate };
