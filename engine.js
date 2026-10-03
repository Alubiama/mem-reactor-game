(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MemReactorEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function shuffle(ids, seed) {
    const result = [...ids];
    let value = (seed >>> 0) || 1;
    for (let i = result.length - 1; i > 0; i--) {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      const j = value % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function create({ players = 6, solo = false, seed = Date.now(), cards }) {
    if (!Array.isArray(cards) || cards.length !== 8 || new Set(cards.map(c => c.id)).size !== 8) throw new Error('Eight unique cards required');
    if (!Number.isInteger(players) || players < 4 || players > 8) throw new Error('Players must be 4–8');
    return { players, solo, seed, order: shuffle(cards.map(c => c.id), seed), turn: 0, history: [] };
  }

  function openMutations(state) {
    return state.history.filter(h => h.kind === 'mutation' && !h.fixedBy);
  }

  function options(state) {
    if (state.turn >= state.players) return { mutations: [], fix: null };
    const used = new Set(state.history.filter(h => h.kind === 'mutation').map(h => h.id));
    const order = state.order;
    const start = (state.turn * 2) % order.length;
    const mutations = [];
    for (let i = 0; i < order.length && mutations.length < 2; i++) {
      const id = order[(start + i) % order.length];
      if (!used.has(id)) mutations.push(id);
    }
    const open = openMutations(state);
    return { mutations, fix: open.length ? open[open.length - 1].id : null };
  }

  function play(state, kind, id) {
    const available = options(state);
    if (kind === 'mutation' && !available.mutations.includes(id)) throw new Error('Mutation not offered');
    if (kind === 'fix' && (available.fix !== id || !state.order.includes(id))) throw new Error('Only the latest card mutation can use a card fix');
    if (kind !== 'mutation' && kind !== 'fix') throw new Error('Unknown move');
    const history = state.history.map(entry => ({ ...entry }));
    const turn = state.turn + 1;
    if (kind === 'fix') {
      const target = [...history].reverse().find(h => h.kind === 'mutation' && !h.fixedBy);
      target.fixedBy = turn;
    }
    history.push({ kind, id, turn, player: state.solo ? 'YOU' : `P${turn}` });
    return { ...state, turn, history };
  }

  function playCustom(state, kind, fields) {
    if (state.turn >= state.players) throw new Error('Round is over');
    if (kind !== 'mutation' && kind !== 'fix') throw new Error('Unknown move');
    const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    const name = clean(fields && fields.name);
    const primary = clean(fields && fields[kind === 'fix' ? 'change' : 'power']);
    const consequence = clean(fields && fields[kind === 'fix' ? 'quirk' : 'problem']);
    if (name.length < 2 || name.length > 48 || primary.length < 8 || primary.length > 140 || consequence.length < 8 || consequence.length > 140) {
      throw new Error('Use a 2–48 character name and 8–140 characters for each detail');
    }
    const history = state.history.map(entry => ({ ...entry }));
    const turn = state.turn + 1;
    let id = `C${turn}`;
    if (kind === 'fix') {
      const target = [...history].reverse().find(h => h.kind === 'mutation' && !h.fixedBy);
      if (!target) throw new Error('No open problem to fix');
      target.fixedBy = turn;
      id = target.id;
    }
    const custom = kind === 'fix' ? { name, change: primary, quirk: consequence } : { name, power: primary, problem: consequence };
    history.push({ kind, id, turn, player: state.solo ? 'YOU' : `P${turn}`, custom });
    return { ...state, turn, history };
  }

  function outcome(state) {
    if (state.turn !== state.players) throw new Error('Round is not over');
    const open = openMutations(state).length;
    return { open, type: open === 0 ? 'safe' : open < 4 ? 'messy' : 'disaster' };
  }

  return { create, options, play, playCustom, openMutations, outcome, shuffle };
});
