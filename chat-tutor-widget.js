/*
  DevPath AI Tutor Widget
  ------------------------
  Drop this one file into any roadmap page:

    <script src="/chat-tutor-widget.js" data-topic="Go / Golang roadmap"></script>

  Set data-topic to whatever that page is about (e.g. "React roadmap",
  "SQL best practices", "Code review best practices"). The widget uses
  it to scope the AI's system prompt so answers stay relevant to the
  page the visitor is on.

  This file only builds the UI and calls YOUR backend at /api/chat.
  It never calls the Anthropic API directly (that would expose your
  API key to every visitor's browser) — see api/chat.js for the proxy.
*/
(function () {
  var scriptTag = document.currentScript;
  var topic = (scriptTag && scriptTag.getAttribute('data-topic')) || 'software development';
  var endpoint = (scriptTag && scriptTag.getAttribute('data-endpoint')) || '/api/chat';

  var css = '\
    .dp-tutor-launcher{position:fixed;bottom:20px;right:20px;width:52px;height:52px;border-radius:50%;background:#4F7EFF;border:none;cursor:pointer;z-index:9999;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.35);transition:transform .15s}\
    .dp-tutor-launcher:hover{transform:scale(1.06)}\
    .dp-tutor-launcher svg{width:24px;height:24px}\
    .dp-tutor-panel{position:fixed;bottom:84px;right:20px;width:340px;max-width:calc(100vw - 40px);height:460px;max-height:calc(100vh - 120px);background:#111827;border:1px solid #263652;border-radius:14px;z-index:9999;display:none;flex-direction:column;overflow:hidden;font-family:Inter,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.45)}\
    .dp-tutor-panel.open{display:flex}\
    .dp-tutor-head{padding:.85rem 1rem;background:#131C2E;border-bottom:1px solid #1E2D4A;display:flex;align-items:center;justify-content:space-between}\
    .dp-tutor-head-title{font-family:"Space Grotesk",sans-serif;font-size:.85rem;font-weight:600;color:#E8EDF8}\
    .dp-tutor-head-sub{font-size:.7rem;color:#6B7FA8;margin-top:1px}\
    .dp-tutor-close{background:none;border:none;color:#6B7FA8;cursor:pointer;font-size:1.1rem;line-height:1;padding:4px}\
    .dp-tutor-close:hover{color:#E8EDF8}\
    .dp-tutor-msgs{flex:1;overflow-y:auto;padding:.9rem;display:flex;flex-direction:column;gap:.6rem}\
    .dp-tutor-msg{font-size:.83rem;line-height:1.5;padding:.55rem .75rem;border-radius:10px;max-width:85%;white-space:pre-wrap;word-wrap:break-word}\
    .dp-tutor-msg.user{align-self:flex-end;background:#4F7EFF;color:#fff;border-bottom-right-radius:3px}\
    .dp-tutor-msg.bot{align-self:flex-start;background:#1A2540;color:#E8EDF8;border-bottom-left-radius:3px}\
    .dp-tutor-msg.bot.pending{color:#6B7FA8;font-style:italic}\
    .dp-tutor-input-row{border-top:1px solid #1E2D4A;padding:.6rem;display:flex;gap:.5rem}\
    .dp-tutor-input{flex:1;resize:none;background:#0D1117;border:1px solid #1E2D4A;border-radius:8px;color:#E8EDF8;font-family:Inter,sans-serif;font-size:.83rem;padding:.5rem .6rem;max-height:80px;outline:none}\
    .dp-tutor-input:focus{border-color:#4F7EFF}\
    .dp-tutor-send{background:#4F7EFF;border:none;border-radius:8px;color:#fff;font-weight:600;font-size:.78rem;padding:0 .9rem;cursor:pointer;flex-shrink:0}\
    .dp-tutor-send:disabled{opacity:.5;cursor:default}\
  ';
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var launcher = document.createElement('button');
  launcher.className = 'dp-tutor-launcher';
  launcher.setAttribute('aria-label', 'Open AI tutor chat');
  launcher.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  var panel = document.createElement('div');
  panel.className = 'dp-tutor-panel';
  panel.innerHTML =
    '<div class="dp-tutor-head">' +
      '<div><div class="dp-tutor-head-title">DevPath AI Tutor</div><div class="dp-tutor-head-sub">' + escapeHtml(topic) + '</div></div>' +
      '<button class="dp-tutor-close" aria-label="Close">&#10005;</button>' +
    '</div>' +
    '<div class="dp-tutor-msgs"></div>' +
    '<div class="dp-tutor-input-row">' +
      '<textarea class="dp-tutor-input" rows="1" placeholder="Ask about ' + escapeAttr(topic) + '..."></textarea>' +
      '<button class="dp-tutor-send">Send</button>' +
    '</div>';

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  var msgsEl = panel.querySelector('.dp-tutor-msgs');
  var inputEl = panel.querySelector('.dp-tutor-input');
  var sendBtn = panel.querySelector('.dp-tutor-send');
  var closeBtn = panel.querySelector('.dp-tutor-close');

  var history = []; // {role, content}

  addMessage('bot', "Hi! I'm your AI tutor for this page (" + topic + "). Ask me anything about it \u2014 concepts, what to learn next, or to explain something you're stuck on.");

  launcher.addEventListener('click', function () {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) inputEl.focus();
  });
  closeBtn.addEventListener('click', function () {
    panel.classList.remove('open');
  });
  sendBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  inputEl.addEventListener('input', function () {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
  });

  function send() {
    var text = inputEl.value.trim();
    if (!text || sendBtn.disabled) return;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    addMessage('user', text);
    history.push({ role: 'user', content: text });

    var pending = addMessage('bot', 'Thinking...', true);
    sendBtn.disabled = true;

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: topic, messages: history })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Request failed (' + r.status + ')');
        return r.json();
      })
      .then(function (data) {
        pending.remove();
        var reply = data.reply || "Sorry, I didn't get a response.";
        addMessage('bot', reply);
        history.push({ role: 'assistant', content: reply });
      })
      .catch(function (err) {
        pending.remove();
        addMessage('bot', "Couldn't reach the tutor backend. " + err.message);
      })
      .finally(function () {
        sendBtn.disabled = false;
      });
  }

  function addMessage(role, text, pending) {
    var el = document.createElement('div');
    el.className = 'dp-tutor-msg ' + role + (pending ? ' pending' : '');
    el.textContent = text;
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }
})();
