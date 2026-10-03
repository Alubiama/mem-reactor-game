(() => {
  const engine = window.MemReactorEngine;
  const cards = window.MEM_REACTOR_CARDS;
  const byId = Object.fromEntries(cards.map(card => [card.id, card]));
  const $ = id => document.getElementById(id);
  const panels = ['setup', 'handoff', 'choose', 'reaction', 'finale'];
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const storageKey = 'mem-reactor-round-v4';
  let game = null;
  let phase = 'setup';
  let authorKind = 'mutation';
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (saved && saved.game && Array.isArray(saved.game.history) && saved.game.history.length <= 8 &&
        Number.isInteger(saved.game.players) && saved.game.players >= 4 && saved.game.players <= 8 &&
        Number.isInteger(saved.game.turn) && saved.game.turn === saved.game.history.length &&
        panels.includes(saved.phase) && saved.phase !== 'setup') {
      game = saved.game;
      phase = saved.phase;
    }
  } catch (_) { /* A damaged tab snapshot starts a fresh round. */ }

  function currentSeed() {
    if (window.crypto && window.crypto.getRandomValues) return window.crypto.getRandomValues(new Uint32Array(1))[0];
    return Date.now();
  }

  function start(solo) {
    game = engine.create({ players: solo ? 6 : Number($('players').value), solo, seed: currentSeed(), cards });
    phase = solo ? 'choose' : 'handoff';
    render();
  }

  function showPhase() {
    panels.forEach(id => { $(id).hidden = id !== phase; });
  }

  function render() {
    showPhase();
    document.body.dataset.phase = phase;
    const turn = game ? game.turn : 0;
    $('turn-pill').textContent = !game ? 'READY' : phase === 'finale' ? 'THE END' : `TURN ${phase === 'reaction' ? turn : turn + 1} / ${game.players}`;
    $('open-count').textContent = game ? engine.openMutations(game).length : '0';
    $('track').innerHTML = game ? Array.from({length:game.players}, (_,i) => `<span class="${i<turn?'done':''}"></span>`).join('') : '';
    $('trail').innerHTML = game ? game.history.map(h => `<span class="${h.kind==='fix'?'fixed':''}">${escapeHtml(h.player)} · ${escapeHtml(h.kind==='fix'?'FIX ': 'MUTATE ')}${escapeHtml(h.id.slice(1))}</span>`).join('') : '';
    drawCreature();
    if (phase === 'handoff') renderHandoff();
    if (phase === 'choose') renderChoices();
    if (phase === 'reaction') renderReaction();
    if (phase === 'finale') renderFinale();
    if (game) {
      try { sessionStorage.setItem(storageKey, JSON.stringify({ game, phase })); }
      catch (_) { /* Private browsing may disable tab storage; play still works. */ }
    }
    const focusTarget = { handoff:'handoff-title', choose:'choose-title', reaction:'reaction-title', finale:'finale-title' }[phase];
    if (focusTarget) {
      requestAnimationFrame(() => {
        const target = $(focusTarget);
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        if (window.innerWidth <= 850) {
          const top = $('choose').closest('.control').getBoundingClientRect().top + window.scrollY - 155;
          window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
      });
    }
  }

  function renderHandoff() {
    $('handoff-kicker').textContent = `TURN ${game.turn+1} OF ${game.players}`;
    $('handoff-title').textContent = game.solo ? 'YOUR NEXT MOVE' : `PASS TO PLAYER ${game.turn+1}`;
    $('handoff-text').textContent = game.turn === 0 ? 'The courier is ready. Give it a power—and a problem.' : 'Look at what the previous player left behind. Keep the chaos or transform it.';
    $('reveal').textContent = game.solo ? 'SEE OPTIONS' : `I'M PLAYER ${game.turn+1}`;
  }

  function renderChoices() {
    $('choose-kicker').textContent = `${game.solo ? 'SOLO' : 'PLAYER '+(game.turn+1)} · TURN ${game.turn+1}/${game.players}`;
    const offered = engine.options(game);
    $('invent-fix').hidden = !offered.fix;
    $('author-form').hidden = true;
    $('author-error').textContent = '';
    const mutationButtons = offered.mutations.map(id => {
      const card = byId[id];
      return `<button class="card" type="button" data-kind="mutation" data-id="${id}"><span class="card-meta"><span>MAKE IT WEIRDER</span><span>${id}</span></span><span class="card-name">${escapeHtml(card.mutation.name)}</span><span class="card-line"><b>POWER</b> ${escapeHtml(card.mutation.power)}</span><span class="card-line"><b>TROUBLE</b> ${escapeHtml(card.mutation.problem)}</span></button>`;
    });
    if (offered.fix && byId[offered.fix]) {
      const card = byId[offered.fix];
      mutationButtons.push(`<button class="card fix" type="button" data-kind="fix" data-id="${offered.fix}"><span class="card-meta"><span>MAKE IT WORK</span><span>FIX ${offered.fix.slice(1)}</span></span><span class="card-name">${escapeHtml(card.fix.name)}</span><span class="card-line"><b>TRANSFORM</b> ${escapeHtml(card.fix.change)}</span><span class="card-line"><b>NEW QUIRK</b> ${escapeHtml(card.fix.quirk)}</span></button>`);
    }
    $('card-list').innerHTML = mutationButtons.join('');
  }

  function renderReaction() {
    const move = game.history.at(-1);
    const fixed = move.kind === 'fix';
    const detail = move.custom || byId[move.id][fixed ? 'fix' : 'mutation'];
    $('reaction-title').textContent = fixed ? `${detail.name} SAVES THE DAY?` : `${detail.name} CHANGES EVERYTHING.`;
    $('reaction-card').classList.toggle('fix', fixed);
    $('reaction-card').innerHTML = fixed
      ? `<strong>PROBLEM REINVENTED</strong><p>${escapeHtml(detail.change)}</p><p><b>New price:</b> ${escapeHtml(detail.quirk)}</p>`
      : `<strong>NEW POWER, NEW TROUBLE</strong><p>${escapeHtml(detail.power)}</p><p><b>But:</b> ${escapeHtml(detail.problem)}</p>`;
    $('continue').textContent = game.turn === game.players ? 'SEE THE ENDING' : game.solo ? 'NEXT MOVE' : 'PASS THE SCREEN';
  }

  function renderFinale() {
    const result = engine.outcome(game);
    const open = engine.openMutations(game);
    const feature = result.type === 'safe' ? [...game.history].reverse().find(h => h.kind === 'fix') : open.at(-1);
    const detail = feature.custom || byId[feature.id][feature.kind === 'fix' ? 'fix' : 'mutation'];
    $('finale-title').textContent = { safe:'CAKE DELIVERED.', messy:'DELIVERED. SORT OF.', disaster:'CAKE DISASTER.' }[result.type];
    $('finale-story').textContent = feature.kind === 'fix'
      ? `${detail.name} saved the day. ${detail.change} But ${detail.quirk}`
      : `${detail.name} changed the mission. ${detail.power} But ${detail.problem}`;
    $('result-head').textContent = result.open === 0 ? 'EVERY PROBLEM REINVENTED' : `${result.open} UNFIXED ${result.open===1?'PROBLEM':'PROBLEMS'}`;
    $('timeline').innerHTML = game.history.map(h => {
      const move = h.custom || byId[h.id][h.kind === 'fix' ? 'fix' : 'mutation'];
      const description = h.kind === 'fix' ? move.change : move.problem;
      return `<li class="${h.kind==='fix'?'fix':''}"><b>${escapeHtml(h.player)}</b> · ${escapeHtml(h.kind==='fix'?'FIXED':'ADDED')} ${escapeHtml(move.name)} — ${escapeHtml(description)}</li>`;
    }).join('');
    $('toast').textContent = '';
  }

  function drawCreature() {
    const status = new Map();
    if (game) game.history.forEach(h => { if (h.kind === 'mutation') status.set(h.id,'open'); else status.set(h.id,'fixed'); });
    const has = id => status.has(id);
    const fixed = id => status.get(id) === 'fixed';
    const openCount = game ? engine.openMutations(game).length : 0;
    const shapes = [];
    shapes.push(`<defs><linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${openCount>=4?'#ff9ea9':'#ffadd9'}"/><stop offset="1" stop-color="${openCount>=4?'#ed4788':'#ef65b1'}"/></linearGradient><radialGradient id="moon"><stop stop-color="#fff"/><stop offset="1" stop-color="#f4cae6"/></radialGradient></defs>`);
    shapes.push('<ellipse cx="260" cy="385" rx="217" ry="33" fill="#b3689d" opacity=".18"/><circle cx="260" cy="219" r="175" fill="url(#moon)" opacity=".36"/>');
    if (has('M6')) shapes.push(fixed('M6') ? '<path d="M339 300 Q451 391 407 309 Q390 285 411 276" fill="none" stroke="#f8993d" stroke-width="12" stroke-linecap="round" stroke-dasharray="8 8"/><circle cx="413" cy="274" r="11" fill="#ffc559"/>' : '<path d="M337 311 Q437 372 431 281 Q448 254 469 259" fill="none" stroke="#e93291" stroke-width="27" stroke-linecap="round"/><path d="M433 284 Q473 236 466 275" fill="none" stroke="#ffb64e" stroke-width="14" stroke-linecap="round"/>');
    if (has('M1')) shapes.push(fixed('M1') ? '<path d="M76 110 L147 121 L104 184 Z" fill="#b480e4" stroke="#482044" stroke-width="6"/><path d="M104 184 Q157 230 156 273" fill="none" stroke="#59335c" stroke-width="4"/>' : '<circle cx="88" cy="100" r="30" fill="#ff74bd" stroke="#4d244d" stroke-width="6"/><circle cx="145" cy="76" r="26" fill="#bb91ed" stroke="#4d244d" stroke-width="6"/><path d="M88 131 L163 247 M145 103 L163 247" stroke="#4d244d" stroke-width="4" fill="none"/>');
    if (has('M7') && fixed('M7')) shapes.push('<path d="M354 325 L461 325 M370 325 L370 363 M445 325 L445 363" stroke="#552459" stroke-width="9" stroke-linecap="round"/><path d="M390 342 Q408 360 425 342" fill="none" stroke="#9b67c6" stroke-width="4"/>');
    shapes.push('<path d="M192 310 L180 360 Q194 380 216 367 L230 327 M278 328 L294 366 Q317 383 332 361 L315 305" fill="url(#body)" stroke="#452143" stroke-width="9" stroke-linejoin="round"/>');
    if (has('M2')) shapes.push(fixed('M2') ? '<path d="M174 367 Q195 380 224 365 M286 365 Q312 381 339 365" fill="none" stroke="#76338a" stroke-width="12" stroke-linecap="round"/><circle cx="185" cy="380" r="5" fill="#ffcf60"/><circle cx="324" cy="380" r="5" fill="#ffcf60"/>' : '<path d="M193 368 L178 403 L206 382 M313 368 L301 404 L327 381" fill="#ffa64a" stroke="#ed5b66" stroke-width="5"/>');
    if (has('M7') && !fixed('M7')) shapes.push('<path d="M172 356 L224 356 L219 383 L173 383 Z M286 356 L338 356 L334 383 L289 383 Z" fill="#51406d" stroke="#34203c" stroke-width="5"/>');
    shapes.push('<path d="M158 201 Q165 107 255 106 Q345 107 353 202 L363 293 Q354 357 255 359 Q155 357 146 293 Z" fill="url(#body)" stroke="#452143" stroke-width="10" stroke-linejoin="round"/>');
    if (has('M8')) shapes.push(fixed('M8') ? '<path d="M175 152 L338 317 M166 215 L290 342 M237 118 L356 236" stroke="#f6e65b" stroke-width="12" opacity=".86"/><path d="M251 176 Q212 139 211 177 Q217 199 251 184 Q290 205 296 176 Q296 144 251 176" fill="#ffd057" stroke="#673658" stroke-width="5"/>' : '<path d="M177 163 L207 135 M308 132 L337 161 M157 278 L188 295 M320 290 L352 276" stroke="#9b86e2" stroke-width="19" opacity=".7"/>');
    shapes.push('<path d="M168 240 Q122 236 114 291 M341 239 Q383 240 398 291" fill="none" stroke="#452143" stroke-width="21" stroke-linecap="round"/><circle cx="114" cy="291" r="15" fill="#f497c9"/><circle cx="398" cy="291" r="15" fill="#f497c9"/>');
    if (has('M3')) shapes.push(fixed('M3') ? '<path d="M110 291 Q252 360 399 291" fill="none" stroke="#9c61cb" stroke-width="11" stroke-linecap="round"/><path d="M152 310 Q255 337 355 310" fill="none" stroke="#f6cbee" stroke-width="5"/>' : '<path d="M114 291 Q40 244 50 320 Q70 352 129 306 M398 291 Q466 248 466 321 Q452 354 386 309" fill="none" stroke="#ed70b2" stroke-width="17" stroke-linecap="round"/>');
    if (has('M4')) shapes.push(fixed('M4') ? '<ellipse cx="398" cy="282" rx="89" ry="29" transform="rotate(-14 398 282)" fill="none" stroke="#8d64cb" stroke-width="6" stroke-dasharray="13 9"/>' : '<path d="M92 293 L92 319 Q113 334 129 316 L129 292 M380 292 L380 318 Q400 334 418 317 L418 293" fill="none" stroke="#7858ae" stroke-width="9"/><path d="M100 302 L122 302 M389 303 L411 303" stroke="#fff" stroke-width="5"/>');
    shapes.push('<ellipse cx="215" cy="214" rx="25" ry="31" fill="#fff"/><ellipse cx="291" cy="214" rx="25" ry="31" fill="#fff"/><circle cx="221" cy="217" r="11" fill="#35213d"/><circle cx="285" cy="217" r="11" fill="#35213d"/><path d="M221 279 Q255 304 289 279" fill="none" stroke="#452143" stroke-width="8" stroke-linecap="round"/>');
    if (has('M5')) shapes.push(fixed('M5') ? '<path d="M244 109 L255 70 L269 109 Z" fill="#a76ce0" stroke="#4d244d" stroke-width="6"/><path d="M256 75 L338 45" stroke="#9be3eb" stroke-width="6" opacity=".8"/>' : '<path d="M255 107 L255 63" stroke="#4d244d" stroke-width="10"/><circle cx="255" cy="54" r="20" fill="#fff" stroke="#4d244d" stroke-width="7"/><circle cx="260" cy="55" r="8" fill="#d71893"/>');
    shapes.push('<path d="M356 274 L441 274 L451 323 L364 323 Z" fill="#ffefc6" stroke="#663453" stroke-width="7" stroke-linejoin="round"/><path d="M361 272 L445 272 L433 248 L372 248 Z" fill="#fff7e1" stroke="#663453" stroke-width="7" stroke-linejoin="round"/><path d="M407 250 L407 319" stroke="#e92594" stroke-width="8"/><path d="M367 285 L447 285" stroke="#e92594" stroke-width="6"/><circle cx="407" cy="285" r="6" fill="#fff"/>');
    if (has('M2') && fixed('M2')) shapes.push('<path d="M388 245 L388 227 M426 245 L426 227" stroke="#f09d48" stroke-width="4"/><path d="M388 230 Q380 219 389 213 Q399 221 388 230 M426 230 Q418 219 427 213 Q437 221 426 230" fill="#ffcb57"/>');
    $('creature').innerHTML = shapes.join('');
    $('creature').setAttribute('aria-label', `${status.size} visible mutation traits; ${openCount} unresolved problems; cake courier on the Moon`);
    const authored = game && [...game.history].reverse().find(h => h.custom);
    $('authored-tag').hidden = !authored;
    if (authored) {
      $('authored-tag').textContent = `${authored.kind === 'fix' ? '✦ REMIXED' : '✦ PLAYER INVENTED'} · ${authored.custom.name}`;
      $('authored-tag').classList.toggle('fixed', authored.kind === 'fix');
    }
  }

  function openAuthor(kind) {
    if (kind === 'fix' && !engine.options(game).fix) return;
    authorKind = kind;
    $('author-form').reset();
    $('author-error').textContent = '';
    $('author-title').textContent = kind === 'fix' ? 'INVENT THE FIX' : 'INVENT THE MUTATION';
    $('author-hint').textContent = kind === 'fix' ? 'Transform the latest unfixed problem. The solution needs a funny new price.' : 'Give the courier a useful power and one deliciously awkward problem.';
    $('author-primary-label').textContent = kind === 'fix' ? 'How does it solve the problem?' : 'What useful power does it give?';
    $('author-consequence-label').textContent = kind === 'fix' ? 'What new quirk comes with it?' : 'What trouble does it cause?';
    $('author-form').hidden = false;
    $('author-name').focus();
  }

  async function shareStory() {
    const result = engine.outcome(game);
    const moves = game.history.map(h => `${h.player}: ${h.kind==='fix'?'fixed':'added'} ${(h.custom || byId[h.id][h.kind==='fix'?'fix':'mutation']).name}`).join('\n');
    const link = location.protocol === 'https:' ? `\n${location.href.split('#')[0]}` : '';
    const text = `MEM REACTOR · ${$('finale-title').textContent}\n${$('finale-story').textContent}\n${result.open} unfixed problems\n${moves}${link}`;
    try {
      if (navigator.share) { await navigator.share({ text }); $('toast').textContent = 'Story shared.'; return; }
      await navigator.clipboard.writeText(text);
      $('toast').textContent = 'Story copied. Send it to your friends.';
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      $('toast').textContent = 'Copy unavailable. Take a screenshot of this ending.';
    }
  }

  async function copyGameLink() {
    const text = 'One phone. One cake. Your chaos. Play Mem Reactor: The Last Cake with 4–8 friends: https://alubiama.itch.io/mem-reactor-the-last-cake';
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
      $('toast').textContent = 'Game link copied. Send it to your group.';
    } catch (error) {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      $('toast').textContent = copied ? 'Game link copied. Send it to your group.' : 'Copy unavailable. Use alubiama.itch.io/mem-reactor-the-last-cake';
    }
  }

  $('start-group').addEventListener('click', () => start(false));
  $('start-solo').addEventListener('click', () => start(true));
  $('invent-mutation').addEventListener('click', () => openAuthor('mutation'));
  $('invent-fix').addEventListener('click', () => openAuthor('fix'));
  $('author-cancel').addEventListener('click', () => { $('author-form').hidden = true; $('invent-mutation').focus(); });
  $('author-form').addEventListener('submit', event => {
    event.preventDefault();
    const fields = { name:$('author-name').value };
    fields[authorKind === 'fix' ? 'change' : 'power'] = $('author-primary').value;
    fields[authorKind === 'fix' ? 'quirk' : 'problem'] = $('author-consequence').value;
    try {
      game = engine.playCustom(game, authorKind, fields);
      phase = 'reaction';
      $('art').classList.remove('pop');
      void $('art').offsetWidth;
      $('art').classList.add('pop');
      render();
    } catch (error) { $('author-error').textContent = error.message; }
  });
  $('reveal').addEventListener('click', () => { phase='choose'; render(); });
  $('card-list').addEventListener('click', event => {
    const button = event.target.closest('button[data-kind]');
    if (!button || phase !== 'choose') return;
    game = engine.play(game, button.dataset.kind, button.dataset.id);
    phase='reaction';
    $('art').classList.remove('pop');
    void $('art').offsetWidth;
    $('art').classList.add('pop');
    render();
  });
  $('continue').addEventListener('click', () => { phase=game.turn===game.players?'finale':game.solo?'choose':'handoff'; render(); });
  $('again').addEventListener('click', () => { game=null; phase='setup'; try { sessionStorage.removeItem(storageKey); } catch (_) {} render(); });
  $('share').addEventListener('click', shareStory);
  $('copy-link').addEventListener('click', copyGameLink);
  render();
})();
