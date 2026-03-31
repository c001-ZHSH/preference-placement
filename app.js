/* ============================================================
   VocabMaster – App Logic
   ============================================================ */

// ── Stop words for fill-blank algorithm ──────────────────────
const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could',
  'should','may','might','shall','to','of','in','on','at','by',
  'for','with','about','as','into','through','during','before',
  'after','above','below','from','up','down','out','off','over',
  'under','and','but','or','nor','not','so','yet','that','which',
  'who','whom','whose','when','where','why','how','all','any',
  'each','every','few','more','most','other','some','such','no',
  'only','same','than','too','very','just','then','once','if',
  'while','although','though','since','until','unless','however',
  'therefore','thus','its','it','this','these','those','they',
  'them','their','we','us','our','you','your','he','she','his',
  'her','him','i','me','my','one','also','can','what','used',
  'often','especially','particularly','generally','usually',
  'typically','known','refers','refers','term','used','means',
  'refers','way','type','kind','form','state','process','act',
  'quality','feeling','ability','fact','idea','thing','person'
]);

// ── Sample data ───────────────────────────────────────────────
const SAMPLE_DATA = `gratitude\ta feeling of being thankful; readiness to show appreciation and to return kindness. e.g., She expressed deep gratitude for all the help she received during her illness.
ambiguous\topen to more than one interpretation; not having one obvious meaning. e.g., The politician gave a deliberately ambiguous answer to avoid controversy.
benevolent\twell-meaning and kindly; generous in helping others. e.g., The benevolent donor gave millions to fund scholarships for underprivileged students.
candid\ttruthful and straightforward; frank in expressing oneself. e.g., She gave a candid assessment of the project's weaknesses.
diligent\thaving or showing care and conscientiousness in one's work or duties. e.g., The diligent student reviewed her notes every evening without fail.
eloquent\tfluent or persuasive in speaking or writing; clearly expressive. e.g., His eloquent speech moved the audience to tears and inspired action.
frugal\tsparing or economical with money or food; not wasteful. e.g., By living frugally and saving diligently, she retired early at fifty.
gregarious\tfond of company; sociable and outgoing. e.g., Her gregarious personality made her instantly popular at every party she attended.
haughty\tarrogantly superior and disdainful of others. e.g., His haughty manner made his colleagues feel inferior and resentful.
meticulous\tshowing great attention to detail or being very careful and precise. e.g., The meticulous editor caught every typo in the manuscript.
pragmatic\tdealing with things sensibly and realistically based on practical considerations. e.g., A pragmatic approach to budgeting helped the startup survive its first year.
resilient\table to recover quickly from difficulties; tough and adaptable. e.g., Children are remarkably resilient and can bounce back from adversity quickly.
tenacious\tholding firmly to something; determined and persistent. e.g., The tenacious lawyer refused to give up despite losing the first three hearings.
ubiquitous\tpresent, appearing, or found everywhere. e.g., Smartphones have become ubiquitous in modern society.
verbose\tusing or expressed in more words than are needed; wordy. e.g., His verbose writing style made even simple ideas difficult to follow.`;

// ══════════════════════════════════════════════════════════════
// Store – data + localStorage persistence
// ══════════════════════════════════════════════════════════════
const Store = {
  vocabulary: [],  // { id, term, raw, definitions, examples }
  wordbook: [],    // { id, termId, addedAt }

  // ── Project management ──
  projects: [],          // [{ id, name, createdAt }]
  currentProjectId: null,

  _projectKey(pid, suffix) { return `vm_proj_${pid}_${suffix}`; },

  loadProjectList() {
    try {
      const p = localStorage.getItem('vm_projects');
      if (p) this.projects = JSON.parse(p);
      this.currentProjectId = localStorage.getItem('vm_current_project') || null;
      // Auto-migrate: if there is old data with no project, create a default project
      if (this.projects.length === 0) {
        const oldV = localStorage.getItem('vm_vocab');
        const oldW = localStorage.getItem('vm_wordbook');
        if (oldV && JSON.parse(oldV).length > 0) {
          const proj = { id: uid(), name: '我的單字', createdAt: new Date().toISOString() };
          this.projects.push(proj);
          localStorage.setItem(this._projectKey(proj.id, 'vocab'), oldV);
          localStorage.setItem(this._projectKey(proj.id, 'wb'), oldW || '[]');
          this.currentProjectId = proj.id;
          this.saveProjectList();
          // Clean old keys
          localStorage.removeItem('vm_vocab');
          localStorage.removeItem('vm_wordbook');
        }
      }
    } catch(e) { console.warn('Project list load error', e); }
  },

  saveProjectList() {
    localStorage.setItem('vm_projects', JSON.stringify(this.projects));
    if (this.currentProjectId) localStorage.setItem('vm_current_project', this.currentProjectId);
  },

  createProject(name) {
    const proj = { id: uid(), name: name.trim(), createdAt: new Date().toISOString() };
    this.projects.push(proj);
    localStorage.setItem(this._projectKey(proj.id, 'vocab'), '[]');
    localStorage.setItem(this._projectKey(proj.id, 'wb'), '[]');
    this.saveProjectList();
    return proj;
  },

  switchProject(pid) {
    // Save current first
    if (this.currentProjectId) this.save();
    this.currentProjectId = pid;
    localStorage.setItem('vm_current_project', pid);
    this.load();
  },

  renameProject(pid, newName) {
    const p = this.projects.find(p => p.id === pid);
    if (p) { p.name = newName.trim(); this.saveProjectList(); }
  },

  deleteProject(pid) {
    this.projects = this.projects.filter(p => p.id !== pid);
    localStorage.removeItem(this._projectKey(pid, 'vocab'));
    localStorage.removeItem(this._projectKey(pid, 'wb'));
    this.saveProjectList();
    if (this.currentProjectId === pid) {
      this.currentProjectId = this.projects.length > 0 ? this.projects[0].id : null;
      if (this.currentProjectId) {
        localStorage.setItem('vm_current_project', this.currentProjectId);
        this.load();
      } else {
        this.vocabulary = [];
        this.wordbook = [];
      }
    }
  },

  getCurrentProjectName() {
    const p = this.projects.find(p => p.id === this.currentProjectId);
    return p ? p.name : '';
  },

  load() {
    try {
      if (!this.currentProjectId) { this.vocabulary = []; this.wordbook = []; return; }
      const v = localStorage.getItem(this._projectKey(this.currentProjectId, 'vocab'));
      const w = localStorage.getItem(this._projectKey(this.currentProjectId, 'wb'));
      this.vocabulary = v ? JSON.parse(v) : [];
      this.wordbook   = w ? JSON.parse(w) : [];
    } catch(e) { console.warn('Load error', e); }
  },

  save() {
    if (!this.currentProjectId) return;
    localStorage.setItem(this._projectKey(this.currentProjectId, 'vocab'), JSON.stringify(this.vocabulary));
    localStorage.setItem(this._projectKey(this.currentProjectId, 'wb'),    JSON.stringify(this.wordbook));
  },

  addToWordbook(termId) {
    if (!this.wordbook.find(w => w.termId === termId)) {
      this.wordbook.push({ id: uid(), termId, addedAt: new Date().toISOString() });
      this.save();
      return true;
    }
    return false;
  },

  removeFromWordbook(termId) {
    this.wordbook = this.wordbook.filter(w => w.termId !== termId);
    this.save();
  },

  isInWordbook(termId) {
    return this.wordbook.some(w => w.termId === termId);
  },

  getWordbookEntries() {
    return this.wordbook
      .map(w => this.vocabulary.find(v => v.id === w.termId))
      .filter(Boolean);
  },

  findByTerm(word) {
    const lower = word.toLowerCase().trim();
    return this.vocabulary.find(v =>
      v.term.toLowerCase() === lower ||
      v.term.toLowerCase() === lower + 's' ||
      v.term.toLowerCase() === lower + 'es' ||
      lower === v.term.toLowerCase() + 's' ||
      lower === v.term.toLowerCase() + 'es'
    );
  }
};

// ══════════════════════════════════════════════════════════════
// Parser
// ══════════════════════════════════════════════════════════════
const Parser = {
  // Parse raw CSV/text into vocabulary entries
  parse(text, termDefSep, cardSep) {
    const tds = termDefSep === 'tab' ? '\t' :
                termDefSep === 'comma' ? ',' : ';';
    const cs  = cardSep === 'newline' ? '\n' :
                cardSep === 'comma'   ? ','  : ';';

    const cards = text.split(cs).map(s => s.trim()).filter(Boolean);
    const results = [];

    for (const card of cards) {
      const idx = card.indexOf(tds);
      if (idx === -1) continue;
      const term = card.slice(0, idx).trim();
      const raw  = card.slice(idx + tds.length).trim();
      if (!term || !raw) continue;
      results.push(this.buildEntry(term, raw));
    }
    return results;
  },

  buildEntry(term, raw) {
    const { definitions, examples } = this.parseDefinition(raw);
    return { id: uid(), term, raw, definitions, examples, zhNotes: '' };
  },

  parseDefinition(raw) {
    const definitions = [];
    const examples    = [];

    // Extract "e.g., ..." or "for example, ..." sentences
    const egRe = /(?:e\.g\.|for example)[,.]?\s+([^.]+(?:\.[^.]+)?\.?)/gi;
    let m;
    let stripped = raw;
    while ((m = egRe.exec(raw)) !== null) {
      examples.push(m[1].trim().replace(/[""]|[""]$/g, ''));
    }
    stripped = raw.replace(egRe, '').trim();

    // Extract quoted examples: "..." or "..."
    const quoteRe = /["""](.[^"""]+)["""]/g;
    while ((m = quoteRe.exec(stripped)) !== null) {
      if (m[1].length > 10) examples.push(m[1].trim());
    }
    stripped = stripped.replace(quoteRe, '').trim().replace(/\s{2,}/g, ' ');

    // Split numbered definitions: "1. ... 2. ..." or "(1) ... (2) ..."
    if (/^\d\./.test(stripped) || /^\(1\)/.test(stripped)) {
      const parts = stripped.split(/(?:\d\.|(?:\(\d\)))\s+/).filter(p => p.trim());
      parts.forEach(p => { if (p.trim()) definitions.push(p.trim().replace(/\.$/, '')); });
    } else {
      // Split by semicolons — treat each as a separate definition sense
      const parts = stripped.split(/;\s*/);
      parts.forEach(p => { if (p.trim()) definitions.push(p.trim().replace(/\.$/, '')); });
    }

    return {
      definitions: definitions.length ? definitions : [stripped],
      examples
    };
  }
};

// ══════════════════════════════════════════════════════════════
// Lookup – Cmd+click any word → Chinese + English definition
// ══════════════════════════════════════════════════════════════
const Lookup = {
  // Extract the English word at a mouse click position
  wordAtPoint(x, y) {
    // Method 1: caretRangeFromPoint (Chrome/Safari)
    let node = null, offset = 0;
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; offset = r.startOffset; }
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) { node = pos.offsetNode; offset = pos.offset; }
    }

    // Must be a text node
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;

    const text = node.textContent;
    if (!text) return null;

    // Walk left to find word start
    let start = offset;
    while (start > 0 && /[a-zA-Z'-]/.test(text[start - 1])) start--;
    // Walk right to find word end
    let end = offset;
    while (end < text.length && /[a-zA-Z'-]/.test(text[end])) end++;

    const word = text.slice(start, end).replace(/^'+|'+$/g, '');
    return word.length >= 2 ? word : null;
  },

  // Position popup near cursor, keeping it inside viewport
  position(popup, x, y) {
    popup.style.left = '0';
    popup.style.top  = '0';
    popup.classList.remove('hidden');
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 12;
    let left = x + GAP;
    let top  = y + GAP;
    if (left + pw > vw - GAP) left = x - pw - GAP;
    if (top  + ph > vh - GAP) top  = y - ph - GAP;
    popup.style.left = Math.max(GAP, left) + 'px';
    popup.style.top  = Math.max(GAP, top)  + 'px';
  },

  // Extract surrounding sentence from the clicked position
  sentenceAtPoint(x, y) {
    let node = null, offset = 0;
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; offset = r.startOffset; }
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) { node = pos.offsetNode; offset = pos.offset; }
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;

    // Collect text from nearby sibling/parent text nodes (up to ~300 chars)
    const el = node.parentElement;
    return (el?.textContent || '').trim().slice(0, 300) || null;
  },

  // Detect phrase containing the clicked word (phrasal verbs, collocations)
  detectPhrase(word, sentence) {
    if (!sentence) return null;
    const clean = sentence.replace(/[^a-zA-Z\s'-]/g, ' ');
    const words = clean.toLowerCase().split(/\s+/).filter(Boolean);
    const idx   = words.indexOf(word.toLowerCase());
    if (idx === -1) return null;

    // Common particles / prepositions that form phrasal verbs/idioms
    const PARTICLES = new Set([
      'up','out','in','on','off','away','back','down','over','through',
      'into','about','of','for','with','at','to','by','from','well',
      'along','around','after','ahead','apart','aside','forth','forward',
      'together','across','behind','beyond','upon','within'
    ]);

    const candidates = [];
    // 2-word: word + next
    if (idx + 1 < words.length && PARTICLES.has(words[idx + 1])) {
      candidates.push(words.slice(idx, idx + 2).join(' '));
      // 3-word: word + next + next+1
      if (idx + 2 < words.length && PARTICLES.has(words[idx + 2])) {
        candidates.push(words.slice(idx, idx + 3).join(' '));
      }
    }
    // Also check preceding particle (e.g. "well of" where "think" is before)
    // by looking backward: "think well of" — if word is "think" and idx+1 is a non-particle
    if (idx + 2 < words.length && !PARTICLES.has(words[idx + 1]) && PARTICLES.has(words[idx + 2])) {
      candidates.push(words.slice(idx, idx + 3).join(' '));
    }

    // Return longest candidate (most specific)
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
  },

  async show(word, x, y) {
    if (!word || word.length < 2) return;
    const popup  = document.getElementById('lookupPopup');
    const body   = document.getElementById('lookupBody');
    const wordEl = document.getElementById('lookupWord');

    wordEl.textContent = word;
    body.innerHTML = '<div class="lookup-loading">查詢中…</div>';
    this.position(popup, x, y);

    const sentence   = this.sentenceAtPoint(x, y);
    const phrase     = this.detectPhrase(word, sentence);
    const vocabEntry = Store.findByTerm(word);

    // Fetch dictionary + phrase in parallel
    const [zhResult, phraseResult] = await Promise.allSettled([
      this.fetchChineseFull(word, null),
      phrase ? this.fetchPhraseTranslation(phrase) : Promise.resolve(null)
    ]);

    const zhData      = zhResult.status    === 'fulfilled' ? zhResult.value    : null;
    const phraseData  = phraseResult.status === 'fulfilled' ? phraseResult.value : null;

    // ── Build HTML ────────────────────────────────────────────
    let html = '';

    // 1. Phrase section (if detected)
    if (phrase && phraseData) {
      html += `<div class="lookup-section-label">片語 <em style="font-weight:400;color:var(--text)">${phrase}</em></div>
               <div class="lookup-zh">${phraseData}</div>`;
    }

    // 2. Dictionary: POS-grouped Chinese meanings
    if (zhData?.dict?.length > 0) {
      html += `<div class="lookup-section-label">字典翻譯</div>`;
      zhData.dict.forEach(({ pos, zh }) => {
        html += `<div class="lookup-dict-row">
          <span class="lookup-pos">${pos}</span>
          <span class="lookup-dict-trans">${zh}</span>
        </div>`;
      });
    }

    if (!zhData && !phraseData) {
      html += `<div class="lookup-error">查無此字，請確認拼字是否正確。</div>`;
    }

    // 5. Actions
    const inWB = vocabEntry && Store.isInWordbook(vocabEntry.id);
    html += `<div class="lookup-actions">`;
    if (vocabEntry) {
      html += `<button class="btn btn-primary btn-sm" id="lookupWbBtn">
        ${inWB ? '★ 已在單字簿' : '☆ 加入單字簿'}
      </button>`;
    } else {
      html += `<button class="btn btn-outline btn-sm" id="lookupAddBtn">+ 加入單字簿</button>`;
    }
    html += `<button class="btn btn-ghost btn-sm" id="lookupSpeakBtn">🔊</button>`;
    html += `</div>`;

    body.innerHTML = html;
    this.position(popup, x, y);

    // Bind buttons
    document.getElementById('lookupSpeakBtn')?.addEventListener('click', () => TTS.speak(word));

    const wbBtn = document.getElementById('lookupWbBtn');
    if (wbBtn && vocabEntry) {
      if (inWB) { wbBtn.disabled = true; }
      else {
        wbBtn.addEventListener('click', () => {
          Store.addToWordbook(vocabEntry.id);
          wbBtn.textContent = '★ 已在單字簿';
          wbBtn.disabled = true;
          showToast(`已加入單字簿 ★「${word}」`);
          renderWordbook(); renderBrowse();
        });
      }
    }

    const addBtn = document.getElementById('lookupAddBtn');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        addBtn.disabled = true;
        addBtn.textContent = '加入中…';
        // Fetch English definition for a proper vocab entry
        let defText = word;
        try {
          const defs = await Lookup.fetchEnglish(word);
          if (defs && defs.length > 0) defText = defs.join('; ');
        } catch(e) { /* use word as fallback */ }
        const entry   = Parser.buildEntry(word, defText);
        const zhNote  = zhData?.dict?.map(d => (d.pos ? d.pos + '：' : '') + d.zh).join('｜') || '';
        if (zhNote) entry.zhNotes = zhNote;
        Store.vocabulary.push(entry);
        Store.addToWordbook(entry.id);
        Store.save();
        updateVocabCount();
        renderProjectSelector();
        addBtn.textContent = '★ 已加入單字簿';
        showToast(`已加入單字簿 ★「${word}」`);
        renderBrowse(); renderWordbook();
      });
    }
  },

  // Fetch English definitions grouped by POS
  async fetchEnglish(word) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!res.ok) return [];
      const data = await res.json();
      const defs = [];
      for (const entry of data) {
        for (const meaning of entry.meanings || []) {
          for (const def of meaning.definitions || []) {
            if (def.definition) defs.push(`(${meaning.partOfSpeech}) ${def.definition}`);
            if (defs.length >= 4) return defs;
          }
        }
      }
      return defs;
    } catch(e) { return []; }
  },

  // Fetch Chinese data: bilingual dictionary (dt=bd) + context sentence
  async fetchChineseFull(word, sentence) {
    try {
      const POS_MAP = {
        noun:'名詞', verb:'動詞', adjective:'形容詞', adverb:'副詞',
        pronoun:'代名詞', preposition:'介系詞', conjunction:'連接詞',
        interjection:'感嘆詞', article:'冠詞', exclamation:'感嘆詞',
        abbreviation:'縮寫'
      };

      // dt=bd gives actual dictionary equivalents per POS (not translated definitions)
      const res = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&dt=bd&q=${encodeURIComponent(word)}`
      );
      if (!res.ok) return null;
      const data = await res.json();

      // dt=bd structure: data[1] = [[pos, shortList, detailedList, word, score], ...]
      // detailedList = [[chTerm, [enEquiv, ...]], ...]
      const bdRaw = data?.[1];
      const dict  = [];
      if (Array.isArray(bdRaw)) {
        for (const item of bdRaw) {
          const pos         = item[0];
          const detailList  = item[2]; // [[chTerm, [enEquivs]], ...]
          if (!Array.isArray(detailList)) continue;
          // Take top 4 Chinese terms that are 2+ chars and not punctuation-only
          const translations = detailList
            .map(e => e[0])
            .filter(t => t && /[\u4e00-\u9fff]/.test(t) && t.replace(/[^\u4e00-\u9fff]/g,'').length >= 2)
            .slice(0, 4);
          if (translations.length) {
            dict.push({ pos: POS_MAP[pos] || pos, zh: translations.join('、') });
          }
        }
      }

      // Fallback: simple translation if bd gave nothing
      if (dict.length === 0) {
        const simple = data?.[0]?.[0]?.[0]?.trim();
        if (simple && simple !== word && /[\u4e00-\u9fff]/.test(simple)) {
          dict.push({ pos: '', zh: simple });
        }
      }

      // Context: translate the surrounding sentence
      let context = null;
      if (sentence && sentence.trim().split(/\s+/).length > 2) {
        try {
          const r = await fetch(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(sentence.slice(0, 200))}`
          );
          if (r.ok) {
            const d = await r.json();
            context = d?.[0]?.map(s => s?.[0]).filter(Boolean).join('') || null;
          }
        } catch(e) { /* ignore */ }
      }

      if (dict.length === 0 && !context) return null;
      return { dict, context };
    } catch(e) { return null; }
  },

  // Translate a detected phrase (e.g. "think well of")
  async fetchPhraseTranslation(phrase) {
    try {
      const r = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(phrase)}`
      );
      if (!r.ok) return null;
      const d = await r.json();
      const zh = d?.[0]?.map(s => s?.[0]).filter(Boolean).join('') || null;
      // Only return if translation differs from just translating each word
      return zh && zh !== phrase ? zh : null;
    } catch(e) { return null; }
  },

  hide() {
    document.getElementById('lookupPopup').classList.add('hidden');
  }
};

// ══════════════════════════════════════════════════════════════
// TTS – Text-to-Speech (prefer natural / premium voices)
// ══════════════════════════════════════════════════════════════
const TTS = {
  _voice: null,
  _resolved: false,

  _pickVoice() {
    if (this._resolved) return;
    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) return;           // voices not loaded yet
    this._resolved = true;

    // Rank preferences: Premium / Enhanced macOS voices → any en voice
    const prefs = ['samantha','daniel','karen','moira','alex','fiona','tessa'];
    // 1. Try premium (name contains "Premium" or "Enhanced")
    let v = voices.find(v => /en[_-]/i.test(v.lang) && /(premium|enhanced)/i.test(v.name));
    // 2. Try preferred names
    if (!v) {
      for (const p of prefs) {
        v = voices.find(vv => vv.lang.startsWith('en') && vv.name.toLowerCase().includes(p));
        if (v) break;
      }
    }
    // 3. Any en-US voice
    if (!v) v = voices.find(vv => vv.lang === 'en-US');
    // 4. Any en voice
    if (!v) v = voices.find(vv => vv.lang.startsWith('en'));
    this._voice = v || null;
  },

  speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    this._pickVoice();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = 0.92;
    utter.pitch = 1.0;
    if (this._voice) utter.voice = this._voice;
    window.speechSynthesis.speak(utter);
  }
};

// ══════════════════════════════════════════════════════════════
// Quiz Engine
// ══════════════════════════════════════════════════════════════
const Quiz = {
  questions: [],
  current: 0,
  correct: 0,
  mode: 'def-to-word',
  mistakes: [],

  init(words, mode, count) {
    this.mode = mode;
    this.correct = 0;
    this.mistakes = [];
    this.current = 0;

    const shuffled = [...words].sort(() => Math.random() - 0.5);
    const pool = shuffled.slice(0, Math.min(count, shuffled.length));

    this.questions = pool.map(entry => {
      if (mode === 'def-to-word') {
        return { type: 'def-to-word', entry, answer: entry.term };
      } else {
        const { display, blanks } = this.makeBlanks(entry);
        // If no blanks found, fall back to def-to-word
        if (blanks.length === 0) {
          return { type: 'def-to-word', entry, answer: entry.term };
        }
        return { type: 'word-to-fill', entry, display, blanks };
      }
    });
  },

  makeBlanks(entry) {
    const text   = entry.raw;
    const termWs = new Set(entry.term.toLowerCase().split(/\s+/));
    // Tokenize: words and non-words alternating
    const tokens = text.match(/[a-zA-Z'-]+|[^a-zA-Z'-]+/g) || [];

    const candidates = [];
    tokens.forEach((tok, idx) => {
      if (!/^[a-zA-Z'-]+$/.test(tok)) return;
      const lower = tok.toLowerCase().replace(/'s?$/, '');
      if (STOP_WORDS.has(lower)) return;
      if (termWs.has(lower)) return;
      if (tok.length < 4) return;
      candidates.push({ idx, tok });
    });

    // Pick 2-3 blanks
    const blankCount = Math.min(candidates.length, text.length < 60 ? 1 : text.length < 100 ? 2 : 3);
    const chosen = [...candidates].sort(() => Math.random() - 0.5).slice(0, blankCount);
    chosen.sort((a, b) => a.idx - b.idx);

    const blanks = chosen.map(c => c.tok);
    let blankIdx = 0;
    const displayTokens = [...tokens];
    chosen.forEach(c => {
      displayTokens[c.idx] = `__BLANK${blankIdx++}__`;
    });

    return { display: displayTokens.join(''), blanks };
  },

  get total()   { return this.questions.length; },
  get isDone()  { return this.current >= this.total; },
  currentQ()    { return this.questions[this.current]; },

  checkDefToWord(userAnswer) {
    const q = this.currentQ();
    const ok = userAnswer.trim().toLowerCase() === q.answer.toLowerCase();
    if (ok) this.correct++;
    else this.mistakes.push({ q, userAnswer });
    this.current++;
    return ok;
  },

  checkFillBlanks(userAnswers) {
    const q = this.currentQ();
    let allOk = true;
    const results = userAnswers.map((ua, i) => {
      const expected = q.blanks[i].toLowerCase();
      const given    = ua.trim().toLowerCase();
      const ok = given === expected || given === expected + 's' ||
                 given + 's' === expected || given === expected.replace(/ing$/, '');
      if (!ok) allOk = false;
      return { ok, expected: q.blanks[i], given: ua };
    });
    if (allOk) this.correct++;
    else this.mistakes.push({ q, results });
    this.current++;
    return { allOk, results };
  },

  score() {
    return this.total > 0 ? Math.round((this.correct / this.total) * 100) : 0;
  }
};

// ══════════════════════════════════════════════════════════════
// UI helpers
// ══════════════════════════════════════════════════════════════
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function showToast(msg, duration = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), duration);
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.remove('hidden');
  document.querySelector(`.nav-btn[data-page="${name}"]`).classList.add('active');
}

function updateVocabCount() {
  const n = Store.vocabulary.length;
  document.getElementById('vocabCount').textContent =
    n > 0 ? `${n} word${n !== 1 ? 's' : ''}` : '0 words';
  const projNameEl = document.getElementById('currentProjectName');
  if (projNameEl) {
    projNameEl.textContent = Store.getCurrentProjectName();
  }
}

// ── Word Detail Modal ─────────────────────────────────────────
function openWordModal(entry) {
  const inWB = Store.isInWordbook(entry.id);
  const html = `
    <div class="modal-term">
      ${entry.term}
      ${inWB ? '<span class="wb-badge">★ 已儲存</span>' : ''}
      <button class="btn-icon speak-btn" onclick="TTS.speak('${entry.term.replace(/'/g,"\\'")}')">🔊</button>
    </div>

    <div class="modal-section-label">
      English Definition${entry.definitions.length > 1 ? 's' : ''}
      <button class="btn-toggle-zh" id="toggleZhDefs">顯示中文翻譯 ▼</button>
    </div>
    ${entry.definitions.map(d => `<p class="modal-def">${d}</p>`).join('')}
    <div class="modal-zh-defs hidden" id="modalZhDefs">
      <div class="zh-defs-loading">翻譯中…</div>
    </div>

    ${entry.examples.length ? `
      <div class="modal-section-label">Examples</div>
      ${entry.examples.map(e => `<p class="modal-ex">"${e}"</p>`).join('')}
    ` : ''}

    <div class="modal-section-label">中文筆記</div>
    <textarea class="notes-textarea" id="modalNotes" placeholder="在此輸入中文翻譯或個人筆記…">${entry.zhNotes || ''}</textarea>

    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" id="modalWbBtn">
        ${inWB ? '★ 從 Wordbook 移除' : '☆ 加入 Wordbook'}
      </button>
      <button class="btn btn-ghost btn-sm" id="modalSpeakDefBtn">
        🔊 朗讀定義
      </button>
      <button class="btn btn-danger btn-sm" id="modalDeleteBtn">🗑 刪除單字</button>
    </div>`;

  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('wordModal').classList.remove('hidden');

  // Auto-save Chinese notes on input
  document.getElementById('modalNotes').addEventListener('input', function() {
    saveWordNotes(entry.id, this.value);
  });

  document.getElementById('modalWbBtn').onclick = () => {
    if (Store.isInWordbook(entry.id)) {
      Store.removeFromWordbook(entry.id);
      showToast(`已從 Wordbook 移除「${entry.term}」`);
    } else {
      Store.addToWordbook(entry.id);
      showToast(`已加入 Wordbook ★「${entry.term}」`);
    }
    openWordModal(entry);
    renderBrowse();
    renderWordbook();
  };

  document.getElementById('modalSpeakDefBtn').onclick = () => {
    TTS.speak(entry.definitions.join('. '));
  };

  document.getElementById('modalDeleteBtn').onclick = () => {
    deleteWord(entry.id);
  };

  // Toggle collapsible Chinese translation of definitions
  const toggleBtn = document.getElementById('toggleZhDefs');
  const zhDefsDiv = document.getElementById('modalZhDefs');
  let zhDefsFetched = false;

  toggleBtn.onclick = async () => {
    const isHidden = zhDefsDiv.classList.contains('hidden');
    if (isHidden) {
      zhDefsDiv.classList.remove('hidden');
      toggleBtn.textContent = '隱藏中文翻譯 ▲';
      if (!zhDefsFetched) {
        zhDefsFetched = true;
        try {
          const text = entry.definitions.join('. ');
          const r = await fetch(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(text.slice(0, 500))}`
          );
          if (r.ok) {
            const d = await r.json();
            const zh = d?.[0]?.map(s => s?.[0]).filter(Boolean).join('') || '翻譯失敗';
            zhDefsDiv.innerHTML = `<p class="zh-defs-text">${zh}</p>`;
          } else {
            zhDefsDiv.innerHTML = '<p class="zh-defs-text">翻譯失敗</p>';
          }
        } catch(e) {
          zhDefsDiv.innerHTML = '<p class="zh-defs-text">翻譯失敗</p>';
        }
      }
    } else {
      zhDefsDiv.classList.add('hidden');
      toggleBtn.textContent = '顯示中文翻譯 ▼';
    }
  };
}

function saveWordNotes(termId, notes) {
  const entry = Store.vocabulary.find(v => v.id === termId);
  if (entry) {
    entry.zhNotes = notes;
    Store.save();
  }
}

function deleteWord(termId) {
  const entry = Store.vocabulary.find(v => v.id === termId);
  if (!entry) return;
  if (!confirm(`確定要刪除「${entry.term}」嗎？`)) return;
  Store.vocabulary = Store.vocabulary.filter(v => v.id !== termId);
  Store.wordbook   = Store.wordbook.filter(w => w.termId !== termId);
  Store.save();
  updateVocabCount();
  closeModal();
  renderBrowse();
  renderWordbook();
  showToast(`已刪除「${entry.term}」`);
}

function clearVocabulary() {
  if (Store.vocabulary.length === 0) return;
  const name = Store.getCurrentProjectName() || '目前專案';
  if (!confirm(`確定要刪除「${name}」中全部 ${Store.vocabulary.length} 個單字嗎？此操作無法復原。`)) return;
  Store.vocabulary = [];
  Store.wordbook   = [];
  Store.save();
  updateVocabCount();
  renderProjectSelector();
  renderBrowse();
  renderWordbook();
  showToast('已清除所有單字');
}

function closeModal() {
  document.getElementById('wordModal').classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════
// Render: Project Selector
// ══════════════════════════════════════════════════════════════
function renderProjectSelector() {
  const container = document.getElementById('projectSelector');
  if (!container) return;

  if (Store.projects.length === 0) {
    container.innerHTML = `<div class="project-empty">
      <p>尚無專案。匯入單字時將建立新專案。</p>
    </div>`;
    return;
  }

  let html = `<div class="project-list">`;
  Store.projects.forEach(p => {
    const isCurrent = p.id === Store.currentProjectId;
    const count = (() => {
      try {
        const v = localStorage.getItem(Store._projectKey(p.id, 'vocab'));
        return v ? JSON.parse(v).length : 0;
      } catch { return 0; }
    })();
    html += `
      <div class="project-item ${isCurrent ? 'active' : ''}" data-pid="${p.id}">
        <div class="project-info">
          <span class="project-name">${p.name}</span>
          <span class="project-count">${count} 字</span>
        </div>
        <div class="project-actions">
          <button class="btn-icon project-rename" title="重新命名" data-pid="${p.id}">✏️</button>
          <button class="btn-icon project-delete" title="刪除專案" data-pid="${p.id}">🗑</button>
        </div>
      </div>`;
  });
  html += `</div>`;
  container.innerHTML = html;

  // Click to switch project
  container.querySelectorAll('.project-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.project-rename') || e.target.closest('.project-delete')) return;
      const pid = el.dataset.pid;
      if (pid === Store.currentProjectId) return;
      Store.switchProject(pid);
      updateVocabCount();
      renderProjectSelector();
      renderBrowse();
      renderWordbook();
      showToast(`已切換至「${Store.getCurrentProjectName()}」`);
    });
  });

  // Rename
  container.querySelectorAll('.project-rename').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const pid = btn.dataset.pid;
      const proj = Store.projects.find(p => p.id === pid);
      const newName = prompt('輸入新名稱：', proj.name);
      if (newName && newName.trim()) {
        Store.renameProject(pid, newName);
        renderProjectSelector();
      }
    });
  });

  // Delete
  container.querySelectorAll('.project-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const pid = btn.dataset.pid;
      const proj = Store.projects.find(p => p.id === pid);
      if (!confirm(`確定要刪除專案「${proj.name}」嗎？所有單字將被移除且無法復原。`)) return;
      Store.deleteProject(pid);
      updateVocabCount();
      renderProjectSelector();
      renderBrowse();
      renderWordbook();
      showToast(`已刪除專案「${proj.name}」`);
    });
  });
}

// ══════════════════════════════════════════════════════════════
// Render: Browse
// ══════════════════════════════════════════════════════════════
function renderBrowse() {
  const query = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const sort  = document.getElementById('sortSelect')?.value || 'alpha';

  let words = [...Store.vocabulary];

  if (query) {
    words = words.filter(w =>
      w.term.toLowerCase().includes(query) ||
      w.raw.toLowerCase().includes(query)
    );
  }

  if (sort === 'alpha')     words.sort((a,b) => a.term.localeCompare(b.term));
  if (sort === 'alpha-rev') words.sort((a,b) => b.term.localeCompare(a.term));

  const grid = document.getElementById('wordGrid');
  document.getElementById('browseCount').textContent =
    `${words.length} word${words.length !== 1 ? 's' : ''}${query ? ' found' : ''}`;

  if (words.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">${Store.vocabulary.length === 0 ? '📥' : '🔍'}</div>
      <p>${Store.vocabulary.length === 0 ? 'Import vocabulary to get started.' : 'No words match your search.'}</p>
    </div>`;
    return;
  }

  grid.innerHTML = words.map(entry => {
    const starred = Store.isInWordbook(entry.id);
    const defPreview = entry.definitions[0] || entry.raw;
    return `
      <div class="word-card" data-id="${entry.id}" title="雙擊查看詳情 ｜ ⌘+點擊查詢任何字詞">
        <div class="word-card-term">${entry.term}</div>
        <div class="word-card-def">${defPreview}</div>
        ${entry.zhNotes ? `<div class="word-card-zh">${entry.zhNotes}</div>` : ''}
        <div class="word-card-actions">
          <button class="speak-btn" title="發音" onclick="event.stopPropagation(); TTS.speak('${entry.term.replace(/'/g,"\\'")}')">🔊</button>
          <button class="star-btn ${starred ? 'starred' : ''}" title="${starred ? '從 Wordbook 移除' : '加入 Wordbook'}"
            onclick="event.stopPropagation(); toggleWordbook('${entry.id}')">
            ${starred ? '★' : '☆'}
          </button>
          <button class="delete-card-btn" title="刪除" onclick="event.stopPropagation(); deleteWord('${entry.id}')">🗑</button>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.word-card').forEach(card => {
    card.addEventListener('dblclick', e => {
      e.preventDefault();
      const entry = Store.vocabulary.find(v => v.id === card.dataset.id);
      if (entry) openWordModal(entry);
    });
  });
}

function toggleWordbook(termId) {
  if (Store.isInWordbook(termId)) {
    Store.removeFromWordbook(termId);
    const entry = Store.vocabulary.find(v => v.id === termId);
    showToast(`Removed "${entry?.term}" from Wordbook`);
  } else {
    Store.addToWordbook(termId);
    const entry = Store.vocabulary.find(v => v.id === termId);
    showToast(`Added "${entry?.term}" to Wordbook ★`);
  }
  renderBrowse();
  renderWordbook();
}

// ══════════════════════════════════════════════════════════════
// Render: Wordbook
// ══════════════════════════════════════════════════════════════
function renderWordbook() {
  const entries = Store.getWordbookEntries();
  const list    = document.getElementById('wordbookList');

  if (entries.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⭐</div>
      <p>No words saved yet. Click ☆ on any card to save a word.</p>
    </div>`;
    return;
  }

  list.innerHTML = entries.map(entry => `
    <div class="wb-item" data-id="${entry.id}" title="雙擊查看詳情 ｜ ⌘+點擊查詢任何字詞">
      <div class="wb-term">${entry.term}</div>
      <div class="wb-body">
        <div class="wb-def">${entry.definitions[0] || entry.raw}</div>
        ${entry.zhNotes ? `<div class="wb-zh">${entry.zhNotes}</div>` : ''}
      </div>
      <div class="wb-actions">
        <button class="btn-icon speak-btn" onclick="event.stopPropagation(); TTS.speak('${entry.term.replace(/'/g,"\\'")}')">🔊</button>
        <button class="wb-remove" onclick="event.stopPropagation(); toggleWordbook('${entry.id}')">✕</button>
      </div>
    </div>
  `).join('');

  // Double-click entire row to open modal
  list.querySelectorAll('.wb-item').forEach(item => {
    item.addEventListener('dblclick', e => {
      e.preventDefault();
      const entry = Store.vocabulary.find(v => v.id === item.dataset.id);
      if (entry) openWordModal(entry);
    });
  });
}

// ══════════════════════════════════════════════════════════════
// Render: Reader
// ══════════════════════════════════════════════════════════════
function loadReaderText() {
  const text = document.getElementById('readerInput').value.trim();
  if (!text) return;

  // Tokenize preserving whitespace and punctuation
  const tokens = text.match(/[a-zA-Z'-]+|[^a-zA-Z'-]+/g) || [];
  const html = tokens.map(tok => {
    if (!/^[a-zA-Z'-]+$/.test(tok)) {
      return tok.replace(/\n/g, '<br>');
    }
    const entry = Store.findByTerm(tok);
    const cls   = entry ? 'reader-word vocab-word' : 'reader-word';
    const eid   = entry ? `data-id="${entry.id}"` : '';
    return `<span class="${cls}" ${eid}>${tok}</span>`;
  }).join('');

  document.getElementById('readerContent').innerHTML = html;
  document.getElementById('readerInputArea').classList.add('hidden');
  document.getElementById('readerDisplay').classList.remove('hidden');

  // Cmd+click on vocab words in reader → lookup popup
  document.querySelectorAll('.reader-word').forEach(span => {
    span.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        Lookup.show(span.textContent.trim(), e.clientX, e.clientY);
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════
// Quiz UI
// ══════════════════════════════════════════════════════════════
function startQuiz() {
  const source  = document.querySelector('input[name="quizSource"]:checked').value;
  const mode    = document.querySelector('.mode-card.selected')?.dataset.mode || 'def-to-word';
  const count   = parseInt(document.getElementById('questionCount').value) || 10;

  const words = source === 'wordbook'
    ? Store.getWordbookEntries()
    : Store.vocabulary;

  if (words.length === 0) {
    showToast(source === 'wordbook' ? 'Add words to your Wordbook first.' : 'Import vocabulary first.');
    return;
  }

  Quiz.init(words, mode, count);

  document.getElementById('quizSetup').classList.add('hidden');
  document.getElementById('quizInProgress').classList.remove('hidden');
  document.getElementById('quizResults').classList.add('hidden');

  renderQuizQuestion();
}

function renderQuizQuestion() {
  if (Quiz.isDone) { showResults(); return; }

  const q = Quiz.currentQ();
  updateQuizHeader();

  const card = document.getElementById('quizCard');
  document.getElementById('quizFeedback').classList.add('hidden');
  document.getElementById('quizFeedback').innerHTML = '';
  document.getElementById('checkAnswerBtn').classList.remove('hidden');
  document.getElementById('hintBtn').classList.remove('hidden');
  document.getElementById('nextQuestionBtn').classList.add('hidden');

  // Reset hint state
  window._hintLevel = 0;

  if (q.type === 'def-to-word') {
    const ansLen = q.answer.length;
    const inputW = Math.max(120, ansLen * 16 + 32);
    card.innerHTML = `
      <div class="quiz-mode-label">Definition → Word</div>
      <div class="quiz-definition">${q.entry.definitions.join('<br>')}</div>
      ${q.entry.examples.length ? `<p style="font-size:.875rem;color:var(--text-2);font-style:italic;margin-bottom:16px;">"${q.entry.examples[0]}"</p>` : ''}
      <div class="quiz-answer-row">
        <input type="text" class="quiz-input" id="quizAnswer" placeholder="${'_ '.repeat(ansLen).trim()}" autocomplete="off" style="width:${inputW}px;max-width:100%;letter-spacing:2px;">
        <span class="quiz-char-count">${ansLen} letters</span>
      </div>`;
  } else {
    // word-to-fill: show term + definition with blanks
    let rendered = q.display;
    q.blanks.forEach((_, i) => {
      rendered = rendered.replace(`__BLANK${i}__`, `<INPUT_${i}>`);
    });
    // Build HTML for definition with inline inputs sized to answer
    let defHtml = rendered;
    q.blanks.forEach((blank, i) => {
      const w = Math.max(60, blank.length * 12 + 24);
      defHtml = defHtml.replace(`<INPUT_${i}>`,
        `<input type="text" class="blank-input" id="blank-${i}" placeholder="${'_'.repeat(blank.length)}" autocomplete="off" style="width:${w}px;letter-spacing:1px;">`);
    });

    card.innerHTML = `
      <div class="quiz-mode-label">Word → Fill in the Blanks</div>
      <div class="quiz-term">
        ${q.entry.term}
        <span class="quiz-term-speak" onclick="TTS.speak('${q.entry.term.replace(/'/g,"\\'")}')">🔊</span>
      </div>
      <div class="quiz-definition" style="line-height:2">${defHtml}</div>`;
  }

  // Focus first input
  setTimeout(() => {
    const inp = document.getElementById('quizAnswer') || document.getElementById('blank-0');
    inp?.focus();
  }, 60);
}

function checkAnswer() {
  const q = Quiz.currentQ();
  const fb = document.getElementById('quizFeedback');

  if (q.type === 'def-to-word') {
    const inp = document.getElementById('quizAnswer');
    const ua  = inp.value;
    if (!ua.trim()) return;
    const ok  = Quiz.checkDefToWord(ua);
    inp.classList.add(ok ? 'correct' : 'wrong');
    fb.className = `quiz-feedback ${ok ? 'correct' : 'wrong'}`;
    fb.innerHTML = ok
      ? `✓ Correct! The word is <strong>${q.answer}</strong>.`
      : `✗ The correct answer is <strong>${q.answer}</strong>. You wrote: "${ua}"`;

  } else {
    const userAnswers = q.blanks.map((_, i) =>
      (document.getElementById(`blank-${i}`)?.value || '').trim()
    );
    if (userAnswers.every(a => !a)) return;
    const { allOk, results } = Quiz.checkFillBlanks(userAnswers);

    results.forEach((r, i) => {
      const inp = document.getElementById(`blank-${i}`);
      if (inp) inp.classList.add(r.ok ? 'correct' : 'wrong');
    });

    const wrongItems = results.filter(r => !r.ok)
      .map(r => `"${r.given || '(blank)'}" → <strong>${r.expected}</strong>`).join('; ');
    fb.className = `quiz-feedback ${allOk ? 'correct' : 'wrong'}`;
    fb.innerHTML = allOk
      ? '✓ All blanks correct!'
      : `✗ Some blanks wrong: ${wrongItems}`;
  }

  fb.classList.remove('hidden');
  document.getElementById('checkAnswerBtn').classList.add('hidden');
  document.getElementById('hintBtn').classList.add('hidden');
  document.getElementById('nextQuestionBtn').classList.remove('hidden');
  updateQuizHeader();
}

function giveHint() {
  const q = Quiz.currentQ();
  if (!q) return;
  window._hintLevel = (window._hintLevel || 0) + 1;
  const level = window._hintLevel;

  if (q.type === 'def-to-word') {
    const inp = document.getElementById('quizAnswer');
    if (!inp) return;
    const answer = q.answer;
    // Reveal first N letters based on hint level
    const reveal = answer.slice(0, level);
    inp.value = reveal;
    inp.focus();
    // Show hint cost
    showToast(`提示：前 ${level} 個字母 "${reveal}"`, 1500);
  } else {
    // Fill-blanks: reveal first letter(s) of the first empty blank
    for (let i = 0; i < q.blanks.length; i++) {
      const inp = document.getElementById(`blank-${i}`);
      if (inp && !inp.value.trim()) {
        const reveal = q.blanks[i].slice(0, level);
        inp.value = reveal;
        inp.focus();
        showToast(`提示：「${reveal}…」`, 1500);
        break;
      }
    }
  }
}

function updateQuizHeader() {
  const total    = Quiz.total;
  const answered = Quiz.current;  // after checkAnswer, current is already incremented
  const pct      = total > 0 ? (answered / total) * 100 : 0;

  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent =
    `${Math.min(answered + 1, total)} / ${total}`;
  document.getElementById('scoreCorrect').textContent  = Quiz.correct;
  document.getElementById('scoreAnswered').textContent = answered;
}

function showResults() {
  document.getElementById('quizInProgress').classList.add('hidden');
  document.getElementById('quizResults').classList.remove('hidden');

  const pct = Quiz.score();
  document.getElementById('finalPct').textContent = pct + '%';
  document.getElementById('resultsTitle').textContent =
    pct === 100 ? 'Perfect Score! 🎉' :
    pct >= 80   ? 'Great Job! 👍' :
    pct >= 60   ? 'Keep Practicing! 📚' : 'Need More Study 💪';
  document.getElementById('resultsSub').textContent =
    `${Quiz.correct} correct out of ${Quiz.total} questions`;

  document.getElementById('mistakesList').classList.add('hidden');
}

function showMistakes() {
  const list = document.getElementById('mistakesList');
  if (Quiz.mistakes.length === 0) {
    list.innerHTML = '<p style="color:var(--success);text-align:center;padding:16px">No mistakes! Perfect score!</p>';
    list.classList.remove('hidden');
    return;
  }
  list.innerHTML = `<h3 style="margin-bottom:12px">Mistakes (${Quiz.mistakes.length})</h3>` +
    Quiz.mistakes.map(m => {
      const term = m.q.entry.term;
      const def  = m.q.entry.definitions[0] || m.q.entry.raw;
      if (m.q.type === 'def-to-word') {
        return `<div class="mistake-item">
          <div class="mistake-term">✗ ${term}</div>
          <div class="mistake-your">Your answer: "${m.userAnswer || '(blank)'}"</div>
          <div class="mistake-correct">Correct: ${term}</div>
          <div style="font-size:.82rem;color:var(--text-2);margin-top:6px">${def}</div>
        </div>`;
      } else {
        const wrong = m.results.filter(r => !r.ok)
          .map(r => `"${r.given || '(blank)'}" should be <strong>${r.expected}</strong>`).join(', ');
        return `<div class="mistake-item">
          <div class="mistake-term">✗ ${term}</div>
          <div class="mistake-your">${wrong}</div>
          <div style="font-size:.82rem;color:var(--text-2);margin-top:6px">${def}</div>
        </div>`;
      }
    }).join('');
  list.classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════════
// Import
// ══════════════════════════════════════════════════════════════
function doImport(text) {
  const tds = document.getElementById('termDefSep').value;
  const cs  = document.getElementById('cardSep').value;
  const entries = Parser.parse(text, tds, cs);

  if (entries.length === 0) {
    showImportStatus('No valid entries found. Check your separator settings.', 'error');
    return;
  }

  // If no project selected, prompt to create one
  if (!Store.currentProjectId) {
    const name = prompt('為這組單字命名（專案名稱）：', '');
    if (!name || !name.trim()) {
      showImportStatus('請先建立專案才能匯入。', 'error');
      return;
    }
    const proj = Store.createProject(name);
    Store.switchProject(proj.id);
    renderProjectSelector();
  }

  // Merge (skip exact duplicates)
  let added = 0;
  for (const e of entries) {
    const exists = Store.vocabulary.some(v => v.term.toLowerCase() === e.term.toLowerCase());
    if (!exists) { Store.vocabulary.push(e); added++; }
  }

  Store.save();
  updateVocabCount();
  renderProjectSelector();
  showImportStatus(
    `已匯入 ${added} 個新單字（${entries.length - added} 個重複已略過）。專案「${Store.getCurrentProjectName()}」共 ${Store.vocabulary.length} 字。`,
    'success'
  );
  renderBrowse();
}

function showImportStatus(msg, type) {
  const el = document.getElementById('importStatus');
  el.textContent = msg;
  el.className = `import-status ${type}`;
  el.classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════════
// Event Listeners
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Load voices early (async on some browsers)
  if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => TTS._pickVoice();
  }

  Store.loadProjectList();
  if (Store.currentProjectId) {
    Store.load();
  }
  updateVocabCount();
  renderProjectSelector();
  showPage(Store.currentProjectId ? 'import' : 'import');

  // ── Navigation ──
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      showPage(page);
      if (page === 'browse') renderBrowse();
      if (page === 'wordbook') renderWordbook();
      if (page === 'quiz') {
        document.getElementById('allWordCount').textContent = Store.vocabulary.length;
        document.getElementById('wbWordCount').textContent  = Store.wordbook.length;
        // Reset to setup screen
        document.getElementById('quizSetup').classList.remove('hidden');
        document.getElementById('quizInProgress').classList.add('hidden');
        document.getElementById('quizResults').classList.add('hidden');
      }
    });
  });

  // ── Import: file drop ──
  const dropZone = document.getElementById('dropZone');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });
  dropZone.addEventListener('click', () => document.getElementById('fileInput').click());

  document.getElementById('fileInput').addEventListener('change', e => {
    if (e.target.files[0]) readFile(e.target.files[0]);
  });

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('pasteInput').value = ev.target.result;
      doImport(ev.target.result);
    };
    reader.readAsText(file, 'UTF-8');
  }

  document.getElementById('importBtn').addEventListener('click', () => {
    const text = document.getElementById('pasteInput').value.trim();
    if (text) doImport(text);
    else showImportStatus('Please paste vocabulary data or choose a file.', 'error');
  });

  document.getElementById('loadSampleBtn').addEventListener('click', () => {
    document.getElementById('pasteInput').value = SAMPLE_DATA;
    doImport(SAMPLE_DATA);
  });

  document.getElementById('clearVocabBtn').addEventListener('click', clearVocabulary);

  // ── Project: new project ──
  document.getElementById('newProjectBtn').addEventListener('click', () => {
    const name = prompt('輸入專案名稱：', '');
    if (!name || !name.trim()) return;
    const proj = Store.createProject(name);
    Store.switchProject(proj.id);
    updateVocabCount();
    renderProjectSelector();
    renderBrowse();
    renderWordbook();
    showToast(`已建立並切換至專案「${proj.name}」`);
  });

  // ── Browse: search & sort ──
  document.getElementById('searchInput').addEventListener('input', renderBrowse);
  document.getElementById('sortSelect').addEventListener('change', renderBrowse);

  // ── Wordbook: actions ──
  document.getElementById('quizWordbookBtn').addEventListener('click', () => {
    if (Store.wordbook.length === 0) { showToast('Add words to Wordbook first.'); return; }
    showPage('quiz');
    document.querySelector('input[name="quizSource"][value="wordbook"]').checked = true;
    document.getElementById('allWordCount').textContent = Store.vocabulary.length;
    document.getElementById('wbWordCount').textContent  = Store.wordbook.length;
    document.getElementById('quizSetup').classList.remove('hidden');
    document.getElementById('quizInProgress').classList.add('hidden');
    document.getElementById('quizResults').classList.add('hidden');
  });

  document.getElementById('clearWordbookBtn').addEventListener('click', () => {
    if (Store.wordbook.length === 0) return;
    if (confirm('Remove all words from Wordbook?')) {
      Store.wordbook = [];
      Store.save();
      renderWordbook();
      renderBrowse();
      showToast('Wordbook cleared.');
    }
  });

  // ── Reader ──
  document.getElementById('loadTextBtn').addEventListener('click', loadReaderText);
  document.getElementById('editTextBtn').addEventListener('click', () => {
    document.getElementById('readerDisplay').classList.add('hidden');
    document.getElementById('readerInputArea').classList.remove('hidden');
  });

  // ── Quiz: mode selection ──
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  // ── Quiz: count ──
  document.getElementById('countMinus').addEventListener('click', () => {
    const inp = document.getElementById('questionCount');
    inp.value = Math.max(1, (parseInt(inp.value) || 1) - 1);
  });
  document.getElementById('countPlus').addEventListener('click', () => {
    const inp = document.getElementById('questionCount');
    inp.value = Math.min(100, (parseInt(inp.value) || 1) + 1);
  });

  // ── Quiz: start / check / next ──
  document.getElementById('startQuizBtn').addEventListener('click', startQuiz);

  document.getElementById('checkAnswerBtn').addEventListener('click', checkAnswer);
  document.getElementById('hintBtn').addEventListener('click', giveHint);

  // Allow Enter key to submit answer
  document.getElementById('quizInProgress').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const nextBtn = document.getElementById('nextQuestionBtn');
      if (!nextBtn.classList.contains('hidden')) {
        renderQuizQuestion();
      } else {
        checkAnswer();
      }
    }
  });

  document.getElementById('nextQuestionBtn').addEventListener('click', renderQuizQuestion);
  document.getElementById('quitQuizBtn').addEventListener('click', () => {
    if (confirm('Quit the quiz?')) {
      document.getElementById('quizSetup').classList.remove('hidden');
      document.getElementById('quizInProgress').classList.add('hidden');
    }
  });

  // ── Results ──
  document.getElementById('retryBtn').addEventListener('click', () => {
    // Restart with same settings
    const source = document.querySelector('input[name="quizSource"]:checked').value;
    const mode   = document.querySelector('.mode-card.selected')?.dataset.mode || 'def-to-word';
    const count  = parseInt(document.getElementById('questionCount').value) || 10;
    const words  = source === 'wordbook' ? Store.getWordbookEntries() : Store.vocabulary;
    Quiz.init(words, mode, count);
    document.getElementById('quizResults').classList.add('hidden');
    document.getElementById('quizInProgress').classList.remove('hidden');
    renderQuizQuestion();
  });

  document.getElementById('reviewBtn').addEventListener('click', showMistakes);

  document.getElementById('newQuizBtn').addEventListener('click', () => {
    document.getElementById('quizResults').classList.add('hidden');
    document.getElementById('quizSetup').classList.remove('hidden');
    document.getElementById('allWordCount').textContent = Store.vocabulary.length;
    document.getElementById('wbWordCount').textContent  = Store.wordbook.length;
  });

  // ── Modal: close ──
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('wordModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // ── Lookup popup: close ──
  document.getElementById('lookupClose').addEventListener('click', () => Lookup.hide());

  // ── Global Cmd+click → lookup any word ──
  document.addEventListener('click', e => {
    if (!(e.metaKey || e.ctrlKey)) return;
    // Don't intercept clicks on buttons, inputs, modals, or the popup itself
    const tag = e.target.tagName;
    if (['BUTTON','INPUT','TEXTAREA','SELECT','A'].includes(tag)) return;
    if (e.target.closest('#lookupPopup')) return;

    e.preventDefault();
    const word = Lookup.wordAtPoint(e.clientX, e.clientY);
    if (word) {
      Lookup.show(word, e.clientX, e.clientY);
    } else {
      showToast('⌘+click 已偵測，但無法識別字詞，請點擊在單字的中間', 2500);
    }
  });

  // Close lookup popup when clicking elsewhere (without Cmd)
  document.addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey) return;
    if (!e.target.closest('#lookupPopup')) Lookup.hide();
  });

  // ── Expose for inline onclick ──
  window.TTS = TTS;
  window.Store = Store;
  window.Lookup = Lookup;
  window.openWordModal = openWordModal;
  window.toggleWordbook = toggleWordbook;
  window.deleteWord = deleteWord;
});
