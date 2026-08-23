/**
 * StudyFlow AI — Onboarding Coach (Conversational Profile Builder)
 * ─────────────────────────────────────────────────────────────
 * Kept fully separate from app.js per prior direction.
 *
 * NOT a form, NOT a 16-question wizard. The user just talks about
 * themselves in their own words (or uploads a timetable/resume/notes),
 * and the AI extracts structured profile fields from that in real time —
 * see onboardingChat() in provider-manager.js for the extraction logic.
 * At most one follow-up question is asked, only if genuinely useful
 * information is still missing (never a checklist of questions).
 *
 * Everything extracted is saved into the EXISTING ai_memory system (same
 * store getAIContextSummary() already reads), so it personalizes every
 * AI feature in the app automatically — no new storage, no duplicated
 * logic.
 *
 * Public surface (attached to window):
 *   OnboardingCoach.maybeStart()      — call once after login
 *   OnboardingCoach.open()            — force-open (e.g. from the profile
 *                                        dropdown's "My Profile" later)
 *   OnboardingCoach.maybeEncourage()  — call after a task is completed
 *
 * Depends on globals already defined in app.js (same non-module <script>
 * scope): toast(), escapeHTML(), navigateTo(), generateTaskPlanPreview(),
 * showRoadmapApproval(). Depends on window.studyflow (preload.js).
 */
'use strict';

const OnboardingCoach = (() => {

  let state = null;

  function freshState() {
    return {
      knownFields: {},   // cumulative extracted profile fields
      transcript: [],    // { role, content, attachmentName? }
      attachment: null,  // { mimeType, base64Data, fileName } pending send
      sending: false,
      recognizing: false,
      recognition: null,
      readyForSummary: false,
      timetableUploaded: false
    };
  }

  // ─── Entry points ──────────────────────────────────────────────────────

  async function maybeStart() {
    try {
      if (window.OnboardingAPI) {
        const statusRes = await window.OnboardingAPI.getStatus();
        if (statusRes?.success && statusRes?.data?.completed) return; // already done or skipped on backend
      }
      const res = await window.studyflow.memoryGetAll();
      if (res?.data?.onboarding_profile_complete) return; // local fallback
    } catch (err) {
      return;
    }
    await open();
  }

  async function open() {
    state = freshState();
    let name = 'there';
    try {
      const settingsRes = await window.studyflow.db('getAllSettings');
      name = settingsRes?.data?.user_name || 'there';
    } catch (err) { /* fall back to generic greeting */ }
    mount(name);
  }

  /** Time-of-day greeting reusing the same IST logic already used by the
   *  dashboard greeting elsewhere in app.js (getISTParts). */
  function getTimeGreeting() {
    const hour = (typeof getISTParts === 'function' ? getISTParts().hour : new Date().getHours());
    if (hour < 5)  return 'Good Night';
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    if (hour < 21) return 'Good Evening';
    return 'Good Night';
  }

  // ─── DOM construction ──────────────────────────────────────────────────

  function mount(name = 'there') {
    if (document.getElementById('onboarding-overlay')) return;
    document.body.classList.add('onboarding-active');

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.className = 'onboarding-overlay active';
    overlay.innerHTML = `
      <div class="onboarding-modal" id="onboarding-modal">
        <div class="onboarding-welcome" id="onboarding-welcome">
          <div class="onboarding-header">
            <img src="../../assets/icons/icon.png" class="onboarding-icon" alt=""
                 onerror="this.style.display='none'">
            <div class="onboarding-title">${getTimeGreeting()}, ${escapeHTML(name)} 👋</div>
          </div>
          <p class="onboarding-intro">
            Welcome to StudyFlow AI. I'm your personal AI mentor — I'll understand your goals
            naturally through conversation, help you manage college, prepare for placements,
            build projects, and stay consistent along the way.<br><br>
            No forms. No questionnaires. Just tell me about yourself — or upload a timetable,
            study plan, resume, or notes, and I'll understand everything automatically.
          </p>
          <div class="onboarding-welcome-actions">
            <button class="btn btn-secondary btn-sm" id="onboarding-upload-timetable">📅 Upload Timetable</button>
            <button class="btn btn-secondary btn-sm" id="onboarding-upload-studyplan">📄 Upload Study Plan</button>
            <button class="btn btn-secondary btn-sm" id="onboarding-upload-resume">📃 Upload Resume</button>
          </div>
          <div style="margin-top:16px">
            <button class="onboarding-skip-link" id="onboarding-skip-btn">Skip for now</button>
          </div>
        </div>

        <div class="onboarding-chat-header" id="onboarding-chat-header">
          <img src="../../assets/icons/icon.png" class="onboarding-chat-header-icon" alt=""
               onerror="this.style.display='none'">
          <span>StudyFlow Coach</span>
        </div>

        <div class="onboarding-live-panel" id="onboarding-live-panel"></div>

        <div class="onboarding-messages" id="onboarding-messages"></div>

        <div id="onboarding-attachment-chip"></div>

        <div class="onboarding-inputbar" id="onboarding-inputbar">
          <div class="claude-chat-inputwrap">
            <button class="onboarding-icon-btn" id="onboarding-attach-btn" title="Attach a timetable, resume, or notes">+</button>
            <input type="file" id="onboarding-file-input" accept="image/*,application/pdf" style="display:none">
            <textarea id="onboarding-text-input" rows="1" placeholder="Tell me about yourself, or use the mic..."></textarea>
            <button class="onboarding-icon-btn" id="onboarding-mic-btn" title="Speak instead">🎤</button>
            <button class="claude-chat-send" id="onboarding-send-btn" title="Send">➤</button>
          </div>
          <div class="onboarding-input-hint"><kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line · drag &amp; drop files anywhere here</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    wireHandlers();
  }

  /** Smooth fade-out, then remove the overlay and restore the sidebar/dashboard. */
  function unmount() {
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) { document.body.classList.remove('onboarding-active'); return; }
    overlay.classList.add('closing');
    setTimeout(() => {
      overlay.remove();
      document.body.classList.remove('onboarding-active');
    }, 350);
  }

  function enterChatMode() {
    const modal   = document.getElementById('onboarding-modal');
    const welcome = document.getElementById('onboarding-welcome');
    const header  = document.getElementById('onboarding-chat-header');
    const panel   = document.getElementById('onboarding-live-panel');
    if (modal.classList.contains('chat-mode')) return;
    modal.classList.add('chat-mode');
    welcome.style.display = 'none';
    header.style.display  = 'flex';
    panel.style.display   = 'flex';
    renderLivePanel();
  }

  /**
   * renderLivePanel — the always-visible "what I know so far" strip
   * (requirement: live profile summary with ✓ / "Waiting..." per field),
   * updated after every extraction so the user can see progress without
   * waiting for the final summary screen.
   */
  function renderLivePanel() {
    const panel = document.getElementById('onboarding-live-panel');
    if (!panel) return;
    const a = state.knownFields;
    const row = (icon, label, value) => `
      <div class="onboarding-live-row ${value ? 'done' : ''}">
        <span class="onboarding-live-icon">${icon}</span>
        <span class="onboarding-live-label">${label}</span>
        <span class="onboarding-live-value">${value ? escapeHTML(Array.isArray(value) ? value.join(', ') : value) : 'Waiting...'}</span>
      </div>
    `;
    panel.innerHTML = [
      row('🎓', 'Education', a.education_branch ? `${a.education_branch}${a.current_year ? ' · ' + a.current_year + ' Year' : ''}` : null),
      row('📅', 'Timetable', state.timetableUploaded ? 'Analyzed successfully' : null),
      row('💻', 'Languages', a.known_languages),
      row('🎯', 'Career Goal', a.career_goal),
      row('🏢', 'Dream Company', a.dream_companies),
      row('📚', 'Weak Subjects', a.weak_subjects),
      row('⭐', 'Strong Subjects', a.strong_subjects)
    ].join('');
  }

  // ─── Event wiring ───────────────────────────────────────────────────────

  function wireHandlers() {
    const textInput = document.getElementById('onboarding-text-input');
    document.getElementById('onboarding-send-btn').addEventListener('click', handleSend);
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    // Auto-resize like Claude's input — grows with content, capped by CSS max-height.
    textInput.addEventListener('input', () => {
      textInput.style.height = 'auto';
      textInput.style.height = `${textInput.scrollHeight}px`;
    });

    document.getElementById('onboarding-attach-btn').addEventListener('click', () => triggerFilePick(null));
    document.getElementById('onboarding-file-input').addEventListener('change', handleFileSelected);
    document.getElementById('onboarding-mic-btn').addEventListener('click', toggleMic);
    document.getElementById('onboarding-skip-btn').addEventListener('click', handleSkip);

    document.getElementById('onboarding-upload-timetable').addEventListener('click', () => triggerFilePick('timetable'));
    document.getElementById('onboarding-upload-studyplan').addEventListener('click', () => triggerFilePick('study plan'));
    document.getElementById('onboarding-upload-resume').addEventListener('click', () => triggerFilePick('resume'));

    // Drag & drop a file straight onto the input bar.
    const inputBar = document.getElementById('onboarding-inputbar');
    ['dragenter', 'dragover'].forEach(evt => inputBar.addEventListener(evt, (e) => {
      e.preventDefault();
      inputBar.classList.add('drag-over');
    }));
    ['dragleave', 'drop'].forEach(evt => inputBar.addEventListener(evt, (e) => {
      e.preventDefault();
      inputBar.classList.remove('drag-over');
    }));
    inputBar.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFileSelected({ target: { files: [file], value: '' } });
    });
  }

  let pendingUploadContext = null;

  function triggerFilePick(context) {
    pendingUploadContext = context;
    document.getElementById('onboarding-file-input').click();
  }

  // ─── Attachment handling ────────────────────────────────────────────────

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isPDF   = file.type === 'application/pdf';
    if (!isImage && !isPDF) {
      toast('Please attach an image or a PDF for now (DOCX/PPTX/XLSX support isn\'t available yet)', 'error');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast('That file is a bit large — please use one under 8MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = String(reader.result).split(',')[1];
      state.attachment = { mimeType: file.type, base64Data, fileName: file.name, rawFile: file };
      renderAttachmentChip();
      enterChatMode();
      if (pendingUploadContext) {
        const label = pendingUploadContext;
        document.getElementById('onboarding-text-input').value = `Here's my ${label}.`;
        handleSend();
      }
    };
    reader.onerror = () => toast('Could not read that file — please try again', 'error');
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function renderAttachmentChip() {
    const el = document.getElementById('onboarding-attachment-chip');
    if (!el) return;
    if (!state.attachment) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="onboarding-attachment-chip">
        <span>📎 ${escapeHTML(state.attachment.fileName)}</span>
        <button id="onboarding-remove-attachment" title="Remove">✕</button>
      </div>
    `;
    document.getElementById('onboarding-remove-attachment').addEventListener('click', () => {
      state.attachment = null;
      renderAttachmentChip();
    });
  }

  // ─── Voice input (Web Speech API) ───────────────────────────────────────

  function toggleMic() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { toast('Voice input is not supported in this build', 'error'); return; }

    const micBtn = document.getElementById('onboarding-mic-btn');
    if (state.recognizing) { state.recognition?.stop(); return; }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    const textInput = document.getElementById('onboarding-text-input');
    const baseText  = textInput.value ? textInput.value.trim() + ' ' : '';

    recognition.onstart = () => {
      state.recognizing = true;
      micBtn.classList.add('recording');
      micBtn.title = 'Listening... click to stop';
    };
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      textInput.value = baseText + transcript;
    };
    recognition.onerror = (event) => {
      const messages = {
        'no-speech':     "Didn't catch any speech — try again and speak right after tapping the mic.",
        'audio-capture': 'No microphone found — check that one is connected, or type instead.',
        'not-allowed':   'Microphone access is blocked — allow it for StudyFlow AI and try again, or type instead.',
        'network':       'Voice input needs an internet connection — try again, or type instead.',
        'aborted':       null
      };
      const msg = messages[event.error];
      if (msg) toast(msg, 'error');
    };
    recognition.onend = () => {
      state.recognizing = false;
      micBtn.classList.remove('recording');
      micBtn.title = 'Speak instead';
    };

    state.recognition = recognition;
    recognition.start();
  }

  // ─── Conversation rendering ──────────────────────────────────────────────

  // ─── Markdown rendering (assistant messages only) ───────────────────────
  // Escapes raw text FIRST, then only ever wraps already-escaped text in
  // tags this function controls — the AI's output can never inject real
  // HTML, matching the escaping discipline used everywhere else in the app.
  function renderMarkdown(raw) {
    if (!raw) return '';

    // 1. Pull out fenced code blocks first so nothing inside them gets
    // touched by later inline/heading rules.
    const codeBlocks = [];
    let text = String(raw).replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      codeBlocks.push(`<pre class="onboarding-code-block"><code>${escapeHTML(code.trim())}</code></pre>`);
      return `\u0000CODEBLOCK${codeBlocks.length - 1}\u0000`;
    });

    text = escapeHTML(text);

    // 2. Inline formatting (order matters: bold before italic, code before both).
    text = text
      .replace(/`([^`]+)`/g, '<code class="onboarding-inline-code">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // 3. Block-level: process line by line, grouping consecutive list items.
    const lines = text.split('\n');
    const out = [];
    let listBuffer = [];
    let listType = null; // 'ul' | 'ol'

    const flushList = () => {
      if (!listBuffer.length) return;
      out.push(`<${listType}>${listBuffer.join('')}</${listType}>`);
      listBuffer = [];
      listType = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Table: a "| a | b |" row immediately followed by a "|---|---|" separator.
      if (/^\|.+\|$/.test(trimmed) && lines[i + 1] && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
        flushList();
        const headerCells = trimmed.slice(1, -1).split('|').map(c => c.trim());
        let tableHtml = `<table class="onboarding-md-table"><thead><tr>${headerCells.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;
        i += 2; // skip header + separator
        while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
          const cells = lines[i].trim().slice(1, -1).split('|').map(c => c.trim());
          tableHtml += `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
          i++;
        }
        tableHtml += '</tbody></table>';
        out.push(tableHtml);
        i--; // compensate for the loop's own increment
        continue;
      }

      if (/^---+$/.test(trimmed)) { flushList(); out.push('<hr class="onboarding-hr">'); continue; }
      if (/^###\s+/.test(trimmed)) { flushList(); out.push(`<h4 class="onboarding-md-h4">${trimmed.replace(/^###\s+/, '')}</h4>`); continue; }
      if (/^##\s+/.test(trimmed))  { flushList(); out.push(`<h3 class="onboarding-md-h3">${trimmed.replace(/^##\s+/, '')}</h3>`); continue; }
      if (/^#\s+/.test(trimmed))   { flushList(); out.push(`<h2 class="onboarding-md-h2">${trimmed.replace(/^#\s+/, '')}</h2>`); continue; }
      if (/^&gt;\s?/.test(trimmed)) { flushList(); out.push(`<blockquote class="onboarding-quote">${trimmed.replace(/^&gt;\s?/, '')}</blockquote>`); continue; }

      const taskMatch = trimmed.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/);
      if (taskMatch) {
        if (listType !== 'ul') { flushList(); listType = 'ul'; }
        const checked = taskMatch[1].toLowerCase() === 'x';
        listBuffer.push(`<li class="onboarding-task-item">${checked ? '☑' : '☐'} ${taskMatch[2]}</li>`);
        continue;
      }

      const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
      if (ulMatch) {
        if (listType !== 'ul') { flushList(); listType = 'ul'; }
        listBuffer.push(`<li>${ulMatch[1]}</li>`);
        continue;
      }

      const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
      if (olMatch) {
        if (listType !== 'ol') { flushList(); listType = 'ol'; }
        listBuffer.push(`<li>${olMatch[1]}</li>`);
        continue;
      }

      flushList();
      if (trimmed === '') { out.push(''); continue; }
      out.push(`<p class="onboarding-md-p">${line}</p>`);
    }
    flushList();

    let html = out.join('').replace(/(<\/p>)(\s*<p class="onboarding-md-p">\s*<\/p>\s*)+/g, '$1');

    // 4. Restore code blocks.
    html = html.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (_, i) => codeBlocks[parseInt(i, 10)]);

    return html;
  }

  function renderMessages() {
    const el = document.getElementById('onboarding-messages');
    if (!el) return;
    el.innerHTML = state.transcript.map((m, i) => `
      <div class="claude-msg-row ${m.role} onboarding-msg-in" style="animation-delay:${Math.min(i, 1) * 0}ms">
        <div class="claude-msg-avatar">${m.role === 'user' ? '🙂' : '✺'}</div>
        <div class="claude-msg-bubble">
          ${m.attachmentName ? `<div class="onboarding-msg-attachment">📎 ${escapeHTML(m.attachmentName)}</div>` : ''}
          ${m.role === 'assistant' ? renderMarkdown(m.content) : escapeHTML(m.content).replace(/\n/g, '<br>')}
        </div>
      </div>
    `).join('');
    el.scrollTop = el.scrollHeight;
  }

  function showTyping() {
    const el = document.getElementById('onboarding-messages');
    if (!el) return;
    el.insertAdjacentHTML('beforeend', `
      <div class="claude-msg-row assistant onboarding-msg-in" id="onboarding-typing">
        <div class="claude-msg-avatar">✺</div>
        <div class="claude-msg-bubble">
          <div class="onboarding-thinking-row">
            <div class="ai-thinking"><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span></div>
            <span>StudyFlow AI is thinking...</span>
          </div>
        </div>
      </div>
    `);
    el.scrollTop = el.scrollHeight;
  }

  /** Shown instead of showTyping() when the message includes an attachment
   *  — reuses the same #onboarding-typing id so hideTyping()/error paths
   *  keep working unchanged. */
  function showAnalyzing(fileName) {
    const el = document.getElementById('onboarding-messages');
    if (!el) return;
    el.insertAdjacentHTML('beforeend', `
      <div class="claude-msg-row assistant onboarding-msg-in" id="onboarding-typing">
        <div class="claude-msg-avatar">✺</div>
        <div class="claude-msg-bubble">
          <div class="onboarding-thinking-row">
            <div class="onboarding-upload-spinner"></div>
            <span>📄 ${escapeHTML(fileName)} — Analyzing...</span>
          </div>
        </div>
      </div>
    `);
    el.scrollTop = el.scrollHeight;
  }

  /** Briefly flashes a "✓ Analysis Complete" state before the AI's actual
   *  reply renders, then removes itself — a real completion signal (the
   *  backend call has genuinely finished by the time this shows), not a
   *  faked delay. */
  function flashAnalysisComplete(fileName) {
    return new Promise((resolve) => {
      const row = document.getElementById('onboarding-typing');
      if (!row) { resolve(); return; }
      const bubble = row.querySelector('.claude-msg-bubble');
      if (bubble) {
        bubble.innerHTML = `<div class="onboarding-thinking-row" style="color:var(--success)">✓ <span>Analysis complete</span></div>`;
      }
      setTimeout(() => { row.remove(); resolve(); }, 500);
    });
  }

  function hideTyping() {
    document.getElementById('onboarding-typing')?.remove();
  }

  async function handleSend() {
    if (state.sending) return;
    enterChatMode();

    const textInput = document.getElementById('onboarding-text-input');
    const text = textInput.value.trim();
    if (!text && !state.attachment) {
      toast('Tell me a bit about yourself, or attach something first', 'error');
      return;
    }

    const attachment = state.attachment;
    const uploadContext = pendingUploadContext;
    pendingUploadContext = null;
    state.attachment = null;
    renderAttachmentChip();
    textInput.value = '';
    textInput.style.height = 'auto';
    state.sending = true;

    state.transcript.push({ role: 'user', content: text || '(see attached document)', attachmentName: attachment?.fileName });
    renderMessages();
    if (attachment) showAnalyzing(attachment.fileName); else showTyping();

    try {
      // 1. Submit to authenticated backend Onboarding & RAG pipeline
      if (window.OnboardingAPI) {
        if (text) {
          window.OnboardingAPI.submitMessage(text).catch(e => console.warn('[Onboarding] Backend message index notice:', e));
        }
        if (attachment?.rawFile) {
          const sType = (uploadContext === 'timetable' ? 'timetable' : (uploadContext === 'study plan' ? 'study_plan' : (uploadContext === 'resume' ? 'resume' : 'notes')));
          window.OnboardingAPI.uploadFile(attachment.rawFile, sType).catch(e => console.warn('[Onboarding] Backend document index notice:', e));
        }
      }

      // 2. Chat extraction for conversational UI
      const res = await window.studyflow.onboardingChat({
        userMessage: text,
        attachment,
        uploadContext, // 'timetable' | 'study plan' | 'resume' | null — triggers a richer, targeted analysis on the backend for timetables specifically
        history: state.transcript.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
        knownFields: state.knownFields
      });

      if (attachment) {
        await flashAnalysisComplete(attachment.fileName);
      } else {
        hideTyping();
      }

      if (!res.success) {
        state.transcript.push({ role: 'assistant', content: "Something went wrong on my end — could you try that again?" });
        renderMessages();
        return;
      }

      state.transcript.push({ role: 'assistant', content: res.reply });
      renderMessages();

      Object.assign(state.knownFields, res.extracted || {});
      if (attachment && uploadContext === 'timetable') state.timetableUploaded = true;
      renderLivePanel();

      state.readyForSummary = !!res.readyForSummary;

      if (state.readyForSummary) {
        setTimeout(() => {
          state.transcript.push({ role: 'assistant', content: 'Perfect, I understand you now.' });
          renderMessages();
          setTimeout(showSummary, 500);
        }, 500);
      }
    } catch (err) {
      hideTyping();
      state.transcript.push({ role: 'assistant', content: "Something went wrong on my end — could you try that again?" });
      renderMessages();
    } finally {
      state.sending = false;
    }
  }

  // ─── Summary screen ──────────────────────────────────────────────────────

  function showSummary() {
    const a = state.knownFields;
    const el = document.getElementById('onboarding-messages');
    const list = (v) => Array.isArray(v) ? v.join(', ') : (v || '—');
    const has = (v) => v !== undefined && v !== null && v !== '';

    el.insertAdjacentHTML('beforeend', `
      <div class="onboarding-summary-card">
        <div class="onboarding-summary-title">Your AI Student Profile</div>

        ${has(a.education_branch) || has(a.current_year) || has(a.college_name) ? `
        <div class="onboarding-summary-section">
          <div class="onboarding-summary-label">Education</div>
          <div class="onboarding-summary-value">${escapeHTML(list(a.education_branch))}${has(a.current_year) ? ` · ${escapeHTML(list(a.current_year))} Year` : ''}</div>
          ${has(a.college_name) ? `<div class="onboarding-summary-sub">${escapeHTML(a.college_name)}</div>` : ''}
        </div>` : ''}

        ${has(a.career_goal) ? `
        <div class="onboarding-summary-section">
          <div class="onboarding-summary-label">Career Goal</div>
          <div class="onboarding-summary-value">${escapeHTML(list(a.career_goal))}</div>
        </div>` : ''}

        ${has(a.dream_companies) ? `
        <div class="onboarding-summary-section">
          <div class="onboarding-summary-label">Dream Companies</div>
          <div class="onboarding-summary-value">${escapeHTML(list(a.dream_companies))}</div>
        </div>` : ''}

        ${has(a.known_languages) || has(a.target_language) ? `
        <div class="onboarding-summary-section">
          <div class="onboarding-summary-label">Programming</div>
          ${has(a.known_languages) ? `<div class="onboarding-summary-value">Knows: ${escapeHTML(list(a.known_languages))}</div>` : ''}
          ${has(a.target_language) ? `<div class="onboarding-summary-sub">Mastering next: ${escapeHTML(list(a.target_language))}</div>` : ''}
        </div>` : ''}

        ${has(a.college_start_time) || has(a.daily_study_hours) || has(a.wake_time) || has(a.sleep_time) ? `
        <div class="onboarding-summary-section">
          <div class="onboarding-summary-label">Daily Routine</div>
          ${has(a.college_start_time) ? `<div class="onboarding-summary-value">College: ${escapeHTML(list(a.college_start_time))} – ${escapeHTML(list(a.college_end_time))}</div>` : ''}
          <div class="onboarding-summary-sub">${has(a.daily_study_hours) ? `Study: ${escapeHTML(list(a.daily_study_hours))}h · ` : ''}${has(a.wake_time) ? `Wake: ${escapeHTML(list(a.wake_time))} · ` : ''}${has(a.sleep_time) ? `Sleep: ${escapeHTML(list(a.sleep_time))}` : ''}</div>
        </div>` : ''}

        ${has(a.best_study_windows) || has(a.weekly_workload_summary) ? `
        <div class="onboarding-summary-section">
          <div class="onboarding-summary-label">From Your Timetable</div>
          ${has(a.best_study_windows) ? `<div class="onboarding-summary-value">Best study windows: ${escapeHTML(list(a.best_study_windows))}</div>` : ''}
          ${has(a.weekly_workload_summary) ? `<div class="onboarding-summary-sub">${escapeHTML(list(a.weekly_workload_summary))}</div>` : ''}
        </div>` : ''}

        ${has(a.weak_subjects) || has(a.strong_subjects) ? `
        <div class="onboarding-summary-section">
          <div class="onboarding-summary-label">Strengths / Weak Spots</div>
          ${has(a.strong_subjects) ? `<div class="onboarding-summary-value">Strong: ${escapeHTML(list(a.strong_subjects))}</div>` : ''}
          ${has(a.weak_subjects) ? `<div class="onboarding-summary-sub">Working on: ${escapeHTML(list(a.weak_subjects))}</div>` : ''}
        </div>` : ''}

        <div class="onboarding-summary-question">Is everything correct?</div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn btn-ghost" id="onboarding-edit-btn">Keep Chatting</button>
          <button class="btn btn-primary" id="onboarding-looksgood-btn">Looks Good</button>
        </div>
      </div>
    `);
    el.scrollTop = el.scrollHeight;

    document.getElementById('onboarding-edit-btn').addEventListener('click', () => {
      document.querySelector('.onboarding-summary-card')?.remove();
      document.getElementById('onboarding-text-input')?.focus();
    });
    document.getElementById('onboarding-looksgood-btn').addEventListener('click', confirmProfile);
  }

  // ─── Save + kick off generation ─────────────────────────────────────────

  async function confirmProfile() {
    const el = document.getElementById('onboarding-messages');
    document.querySelector('.onboarding-summary-card')?.remove();
    el.insertAdjacentHTML('beforeend', `
      <div class="onboarding-summary-card" style="text-align:center">
        <div class="ai-thinking" style="justify-content:center;margin-bottom:10px">
          <span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span>
        </div>
        <div style="font-size:13px;color:var(--text-2)">Saving your profile...</div>
      </div>
    `);

    // Synchronize completion with authenticated backend state
    if (window.OnboardingAPI) {
      window.OnboardingAPI.complete().catch(e => console.warn('[Onboarding] Complete notice:', e));
    }

    const a = state.knownFields;
    await Promise.all(Object.keys(a).map(key => window.studyflow.memorySet(key, a[key])));
    await window.studyflow.memorySet('onboarding_profile_complete', true);

    if (a.college_start_time || a.wake_time || a.daily_study_hours) {
      const routineSummary = `College ${a.college_start_time || '?'}-${a.college_end_time || '?'}, wakes ${a.wake_time || '?'}, sleeps ${a.sleep_time || '?'}, studies ~${a.daily_study_hours || '?'}h/day.`;
      await window.studyflow.memorySet('user_daily_routine', routineSummary);
    }
    if (a.career_goal) await window.studyflow.memorySet('user_stated_goal', a.career_goal);

    showGenerationOffer(a);
  }

  function showGenerationOffer(a) {
    const el = document.getElementById('onboarding-messages');
    document.querySelector('.onboarding-summary-card')?.remove();
    el.insertAdjacentHTML('beforeend', `
      <div class="onboarding-summary-card" style="text-align:center">
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px">Profile saved 🎉</div>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:16px">
          I'll use this everywhere from now on — every schedule, plan, and chat with your coach
          already knows your goals and routine.${a.career_goal ? ' Want your first plan now?' : ''}
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          ${a.career_goal ? `<button class="btn btn-primary" id="onboarding-gen-tasks-btn">✨ Generate My First Plan</button>` : ''}
          ${a.career_goal ? `<button class="btn btn-secondary" id="onboarding-gen-roadmap-btn">🗺️ Build My ${escapeHTML(a.career_goal)} Roadmap</button>` : ''}
        </div>
        <div style="margin-top:14px">
          <button class="onboarding-skip-link" id="onboarding-finish-btn">Take me to the dashboard</button>
        </div>
      </div>
    `);
    el.scrollTop = el.scrollHeight;

    document.getElementById('onboarding-gen-tasks-btn')?.addEventListener('click', async () => {
      unmount();
      await navigateTo('dashboard');
      const prompt = a.target_language
        ? `Study ${a.target_language} and prepare for a ${a.career_goal} role`
        : `Prepare for a ${a.career_goal} role`;
      await generateTaskPlanPreview(prompt, null);
    });

    document.getElementById('onboarding-gen-roadmap-btn')?.addEventListener('click', async () => {
      unmount();
      try {
        const res = await window.studyflow.roadmapPlanPreview({
          targetRole: a.career_goal,
          totalMonths: 6,
          currentLevel: (Array.isArray(a.known_languages) && a.known_languages.length > 1) ? 'intermediate' : 'beginner',
          title: `${a.career_goal} Roadmap`
        });
        await navigateTo('roadmap');
        if (res.success) showRoadmapApproval(res.plan);
        else toast(res.error || 'Roadmap generation failed — you can try again from the Roadmap page.', 'error');
      } catch (err) {
        await navigateTo('roadmap');
        toast('Could not generate the roadmap automatically — try the Generate Roadmap button here.', 'error');
      }
    });

    document.getElementById('onboarding-finish-btn').addEventListener('click', () => unmount());
  }

  function handleSkip() {
    if (window.OnboardingAPI) {
      window.OnboardingAPI.skip().catch(e => console.warn('[Onboarding] Skip notice:', e));
    }
    window.studyflow.memorySet('onboarding_profile_complete', '__skipped__');
    unmount();
  }

  // ─── Ongoing motivational nudges ────────────────────────────────────────

  const MEMORY_ENCOURAGE_COUNT_KEY = 'encouragement_completion_count';
  const ENCOURAGE_EVERY_N_TASKS = 3;

  async function maybeEncourage() {
    try {
      const res = await window.studyflow.memoryGetAll();
      const memory = res?.data || {};
      const goal = memory.career_goal || memory.user_stated_goal;
      if (!goal || goal === '__skipped__') return;

      const count = (parseInt(memory[MEMORY_ENCOURAGE_COUNT_KEY], 10) || 0) + 1;
      await window.studyflow.memorySet(MEMORY_ENCOURAGE_COUNT_KEY, String(count));
      if (count % ENCOURAGE_EVERY_N_TASKS !== 0) return;

      const companies = memory.dream_companies;
      const companyBit = Array.isArray(companies) && companies.length ? ` at ${companies[0]}` : '';
      const messages = [
        `🔥 That's ${count} tasks done — every one gets you closer to becoming a ${goal}${companyBit}.`,
        `💪 ${count} tasks completed. Remember why you started: ${goal}${companyBit}.`,
        `🎯 Nice momentum — ${count} tasks in, and that ${goal} role is getting closer.`
      ];
      toast(messages[count % messages.length], 'success');
    } catch (err) { /* non-critical */ }
  }

  return { maybeStart, open, maybeEncourage };
})();

window.OnboardingCoach = OnboardingCoach;