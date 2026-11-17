// dashboard.html - project cards (filtered by role on the server) + transcript box (ADMIN only).
(function () {
  const { api, requireUser, esc, initials, hours, messageBox } = window.Nova;

  const grid = document.getElementById('projects-grid');
  const countEl = document.getElementById('project-count');
  const scopeEl = document.getElementById('project-scope');

  const ACCENTS = [
    { bar: 'bg-primary', avatar: 'bg-primary-container text-on-primary-container' },
    { bar: 'bg-tertiary', avatar: 'bg-tertiary-fixed text-on-tertiary-fixed' },
    { bar: 'bg-secondary', avatar: 'bg-secondary-fixed text-on-secondary-fixed' },
    { bar: 'bg-tertiary-container', avatar: 'bg-surface-container-high text-on-surface' },
    { bar: 'bg-primary-container', avatar: 'bg-primary-fixed-dim text-on-primary-fixed' },
    { bar: 'bg-on-secondary-fixed-variant', avatar: 'bg-secondary-container text-on-secondary-container' },
  ];

  function projectCard(p, i, user) {
    const a = ACCENTS[i % ACCENTS.length];
    const taskLabel = user.role === 'AGENT' ? 'your tasks' : 'tasks';
    return `
<article class="group bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
<div>
<div class="h-[3px] w-full ${a.bar}"></div>
<div class="p-space-lg flex flex-col gap-space-md">
<div class="flex items-center justify-between">
<span class="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold">${esc(p.clientName)}</span>
<span class="material-symbols-outlined text-secondary group-hover:text-primary transition-colors text-[20px]">domain</span>
</div>
<h4 class="font-title-md text-title-md font-semibold text-on-surface group-hover:text-primary transition-colors leading-snug">${esc(p.name)}</h4>
<div class="flex items-center gap-space-sm pt-space-xs">
<div class="w-8 h-8 rounded-full ${a.avatar} flex items-center justify-center font-label-sm text-label-sm font-bold tracking-wider">${esc(initials(p.managerName))}</div>
<div class="flex flex-col min-w-0">
<span class="font-label-md text-label-md text-on-surface font-medium truncate">${esc(p.managerName)}</span>
<span class="font-caption text-caption text-secondary">Project Manager</span>
</div>
</div>
<div class="flex items-center gap-space-md font-body-sm text-body-sm text-secondary">
<span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">task_alt</span>${p.taskCount} ${taskLabel}</span>
<span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">schedule</span>${hours(p.totalHours)}</span>
</div>
</div>
</div>
<div class="px-space-lg py-space-md bg-surface-container-low/50 flex items-center justify-between">
<span class="font-mono text-body-sm font-medium text-secondary">DL: ${esc(p.deadline)}</span>
<a class="inline-flex items-center gap-space-xs font-label-md text-label-md text-primary font-medium hover:underline" href="project.html?id=${encodeURIComponent(p.id)}">
<span>View Details</span>
<span class="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
</a>
</div>
</article>`;
  }

  async function loadProjects(user) {
    try {
      const { projects } = await api('/projects');
      countEl.textContent = `${projects.length} Active`;
      scopeEl.textContent = {
        ADMIN: 'across all accounts',
        MANAGER: 'that you manage',
        AGENT: 'with tasks assigned to you',
      }[user.role] || '';
      grid.innerHTML = projects.length
        ? projects.map((p, i) => projectCard(p, i, user)).join('')
        : messageBox(user.role === 'ADMIN'
          ? 'No projects yet. Paste a meeting transcript above to create them.'
          : 'No projects to show yet.');
    } catch (err) {
      if (err.status !== 401) grid.innerHTML = messageBox(err.message, 'error');
    }
  }

  // ---- Transcript -> projects (ADMIN only; server also enforces this) ----
  function setupTranscript(user) {
    const section = document.getElementById('transcript-section');
    if (user.role !== 'ADMIN') { section.remove(); return; }
    section.classList.remove('hidden');

    const trigger = document.getElementById('analyze-trigger');
    const input = document.getElementById('transcript-input');
    const statusText = document.getElementById('status-text');
    const statusIndicator = document.getElementById('status-indicator');
    const problemsEl = document.getElementById('transcript-problems');
    const base = 'inline-flex items-center gap-space-xs px-space-sm py-space-xs rounded-full font-label-sm text-label-sm';

    function setStatus(text, tone) {
      statusText.textContent = text;
      statusIndicator.className = `${base} ${{
        idle: 'bg-secondary-container text-on-secondary-container',
        busy: 'bg-tertiary-fixed text-on-tertiary-fixed animate-pulse',
        ok: 'bg-primary-fixed text-on-primary-fixed',
        error: 'bg-error-container text-on-error-container',
      }[tone]}`;
    }

    const warningsEl = document.getElementById('transcript-warnings');
    const text = (p) => (typeof p === 'string' ? p : (p.message || JSON.stringify(p)));

    function showList(el, heading, list) {
      if (!list || !list.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
      el.innerHTML = `<p class="font-label-md text-label-md font-semibold mb-1">${esc(heading)}</p>
<ul class="list-disc pl-5 space-y-0.5">${list.map((p) => `<li>${esc(text(p))}</li>`).join('')}</ul>`;
      el.classList.remove('hidden');
    }
    const showProblems = (list) => showList(problemsEl, 'Nothing was saved. Please correct the transcript and try again:', list);
    const showWarnings = (list) => showList(warningsEl, 'Saved, but please double-check:', list);

    // Demo helpers: load the challenge transcript (or the judges' changed-input version).
    document.querySelectorAll('[data-sample]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await fetch(`samples/${btn.dataset.sample}`);
          if (!res.ok) throw new Error();
          input.value = await res.text();
          setStatus('Transcript loaded — click Create from Transcript', 'idle');
        } catch {
          setStatus('Could not load the sample transcript', 'error');
        }
      });
    });

    trigger.addEventListener('click', async () => {
      const transcript = input.value.trim();
      showProblems(null);
      showWarnings(null);
      if (!transcript) {
        setStatus('Please enter transcript notes', 'error');
        input.focus();
        return;
      }

      // Disable while processing so a double click can't create duplicates.
      trigger.disabled = true;
      trigger.classList.add('opacity-60', 'cursor-wait');
      input.readOnly = true;
      setStatus('AI is reading the transcript… this can take up to a minute', 'busy');
      try {
        const data = await api('/transcript', { method: 'POST', body: { transcript } });
        const n = (data && Array.isArray(data.projects)) ? data.projects.length : 0;
        setStatus(data.message || `Done — ${n} project${n === 1 ? '' : 's'} created`, 'ok');
        showWarnings(data.warnings);
        input.value = '';
        await loadProjects(user);
      } catch (err) {
        if (err.status === 422) {
          setStatus('The AI result was incomplete, so nothing was saved', 'error');
          showProblems((err.data && (err.data.errors || err.data.problems)) || [err.message]);
        } else if (err.status === 501) {
          setStatus('Transcript conversion is not implemented on the server yet', 'error');
        } else {
          setStatus(err.message, 'error');
        }
      } finally {
        trigger.disabled = false;
        trigger.classList.remove('opacity-60', 'cursor-wait');
        input.readOnly = false;
      }
    });
  }

  requireUser()
    .then((user) => {
      setupTranscript(user);
      return loadProjects(user);
    })
    .catch((err) => {
      if (err.status !== 401) grid.innerHTML = messageBox(err.message, 'error');
    });
})();
