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
    if (kind === 'fix' && available.fix !== id) throw new Error('Only the latest open mutation can be fixed');
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

  function outcome(state) {
    if (state.turn !== state.players) throw new Error('Round is not over');
    const open = openMutations(state).length;
    return { open, type: open === 0 ? 'safe' : open < 4 ? 'messy' : 'disaster' };
  }

  return { create, options, play, openMutations, outcome, shuffle };
});
