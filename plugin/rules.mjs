import { randomInt } from 'node:crypto'
import { CARDS, DECK, GENERALS, LORD_GENERALS, MODE, ROLES, TITLE, cardLabel } from './standard.mjs'

const player = (s, id) => s.players[id - 1]
const alive = s => s.players.filter(p => p.alive)
const general = p => GENERALS[p.general]
const is = (p, name) => p.general === name
const equipped = (p, slot) => DECK[p.equip[slot]]?.name
const weapon = p => equipped(p, '武器')
const nameOf = (s, id) => player(s, id)?.general || id + '号'
const label = (s, id) => id + '号 ' + nameOf(s, id)
const board = p => [...p.hand, ...Object.values(p.equip)]
const countCards = p => p.hand.length + Object.keys(p.equip).length + p.delay.length
const defined = fields => Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
const action = (type, data = {}) => ({ type, ...defined(data) })
const pick = (label, task, info = {}) => ({ label, task, ...defined(info) })
const pass = (task = action('noop'), label = '跳过') => pick(label, task, { kind: 'pass' })
const cardPick = (card, task, info = {}) => pick(cardLabel(card), task, { card, ...info })
const push = (s, ...tasks) => s.stack.push(...tasks.filter(Boolean).reverse())
const suits = ['♠', '♥', '♣', '♦']

function event(s, text, to = null, cue) {
  s.log.push({ seq: ++s.seq, text, to, ...(cue && { cue: { ...cue, turn: s.turn } }) })
  if (s.log.length > 80) s.log.shift()
}

function random(s, n) {
  s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0
  return Math.floor(s.seed / 0x100000000 * n)
}

function shuffle(s, items) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(s, i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function top(s) {
  if (!s.deck.length && s.discard.length) {
    s.deck = shuffle(s, s.discard)
    s.discard = []
    event(s, '弃牌堆洗成新的牌堆。')
  }
  return s.deck.shift()
}

function draw(s, id, n, reason = '摸牌') {
  const p = player(s, id)
  if (!p?.alive) return
  let gained = 0
  for (let i = 0; i < n; i++) {
    const card = top(s)
    if (card === undefined) break
    p.hand.push(card)
    gained++
  }
  if (gained) event(s, `${label(s, id)} · ${reason}，获得 ${gained} 张手牌。`)
}

function removeFrom(zone, id) {
  const index = zone.indexOf(id)
  if (index === -1) return false
  zone.splice(index, 1)
  return true
}

function take(s, p, cards, destination) {
  const hadHand = p.hand.length > 0
  let lostEquip = 0
  for (const id of cards) {
    const slot = CARDS[DECK[id].name].slot
    if (slot && p.equip[slot] === id) {
      delete p.equip[slot]
      lostEquip++
    } else if (!removeFrom(p.hand, id)) {
      const index = p.delay.findIndex(card => card.id === id)
      if (index === -1) throw Error('此牌已离开原来的区域')
      p.delay.splice(index, 1)
    }
    destination.push(id)
  }
  if (!p.alive) return
  if (hadHand && !p.hand.length && is(p, '陆逊')) push(s, action('optionalDraw', { actor: p.id, n: 1, skill: '连营' }))
  for (let i = 0; is(p, '孙尚香') && i < lostEquip; i++) {
    push(s, action('optionalDraw', { actor: p.id, n: 2, skill: '枭姬' }))
  }
}

function discardTable(s, id) {
  if (removeFrom(s.table, id)) s.discard.push(id)
}

function transfer(s, from, to, cards, reason) {
  const p = player(s, from)
  const recipient = player(s, to)
  const visible = cards.filter(id => !p.hand.includes(id))
  take(s, p, cards, recipient.hand)
  event(s, `${label(s, to)} · ${reason}，获得 ${label(s, from)}的 ${cards.length} 张牌${visible.length ? '（' + visible.map(cardLabel).join('、') + '）' : ''}。`)
  if (visible.length !== cards.length) event(s, `${reason} · ${cards.map(cardLabel).join('、')}`, [from, to])
}

function order(s, start, after = false) {
  return Array.from({ length: 5 }, (_, index) => (start - 1 + index + Number(after)) % 5 + 1)
    .filter(id => player(s, id).alive)
}

function distance(s, from, to, excluded = []) {
  const seats = alive(s).map(p => p.id)
  const gap = Math.abs(seats.indexOf(from.id) - seats.indexOf(to.id))
  const def = Number(to.equip.防御马 !== undefined)
  const atk = Number(from.equip.进攻马 !== undefined && !excluded.includes(from.equip.进攻马))
  return Math.max(1, Math.min(gap, seats.length - gap) + def - atk - Number(is(from, '马超')))
}

function canSlash(s, from, to, cost = []) {
  const range = cost.includes(from.equip.武器) ? 1 : CARDS[weapon(from)]?.range || 1
  return from.id !== to.id && to.alive && !emptyCity(to) && distance(s, from, to, cost) <= range
}

const emptyCity = p => is(p, '诸葛亮') && !p.hand.length
const heal = (s, p, n, cause) => {
  const recovered = Math.min(n, p.maxHp - p.hp)
  if (!p.alive || recovered <= 0) return
  p.hp += recovered
  event(s, `${label(s, p.id)} · ${cause}，回复 ${recovered} 点体力。`, null,
    { kind: 'heal', actor: p.id, amount: recovered })
}

function offer(s, actor, prompt, choices, kind) {
  if (!choices.length) throw Error('缺少可用行动：' + prompt)
  if (choices.length === 1 && choices[0].kind === 'pass') {
    push(s, choices[0].task)
    return
  }
  s.pending = { actor, prompt, choices, kind }
}

function optional(s, actor, skill, yes, no) {
  offer(s, actor, '是否发动「' + skill + '」？', [
    pick('发动 ' + skill, yes, { kind: 'skill' }), pass(no),
  ], 'skill')
}

function pump(s) {
  for (let i = 0; !s.pending && !s.winner; i++) {
    if (i >= 256) throw Error('规则结算未能进入下一个行动点')
    const task = s.stack.pop()
    if (!task || !steps[task.type]) throw Error('无法继续结算：' + task?.type)
    steps[task.type](s, task)
  }
}

export function createState(seed = randomInt(0x100000000)) {
  const s = { seed, human: 1, lord: 0, players: [], deck: [], discard: [], table: [], stack: [], pending: null,
    turn: 0, current: 0, phase: '开局', winner: null, log: [], seq: 0, npc: 'local', attitudes: {} }
  const roles = shuffle(s, ['主公', '忠臣', '反贼', '反贼', '内奸'])
  s.players = roles.map((role, index) => ({
    id: index + 1, role, alive: true, general: null, hp: 0, maxHp: 0, hand: [], equip: {}, delay: [],
  }))
  s.human = random(s, 5) + 1
  s.lord = s.players.find(p => p.role === '主公').id
  s.deck = shuffle(s, DECK.map(card => card.id))
  event(s, s.lord + '号亮明身份：主公。')
  offer(s, s.human, '选择四位对手的行动方式', [
    pick('本地策略 · 直接开局', action('setup', { npc: 'local' })),
    pick('后台模型 · 独立武将代理', action('setup', { npc: 'model' })),
  ], 'setup')
  return s
}

export function accept(s, choice) {
  const option = Number.isInteger(choice) && s.pending?.choices[choice]
  if (!option) throw Error('请选择当前列出的合法行动')
  s.pending = null
  push(s, option.task)
  pump(s)
}

function chooseGeneral(s, actor, names) {
  offer(s, actor, '选择你本局使用的武将', names.map(name =>
    pick(name, action('seatGeneral', { actor, name }), { general: name, details: GENERALS[name] })), 'general')
}

function zones(p, areas) {
  const list = []
  if (areas.includes('h') && p.hand.length) list.push({ zone: 'h' })
  if (areas.includes('e')) list.push(...Object.values(p.equip).map(id => ({ id, zone: 'e' })))
  if (areas.includes('d')) list.push(...p.delay.map(card => ({ id: card.id, zone: 'd', name: card.name })))
  return list
}

function selectFrom(s, actor, target, areas, reason, gain = false, next) {
  const options = zones(player(s, target), areas).map(card =>
    pick(card.zone === 'h' ? '随机手牌' : card.name ? cardLabel(card.id) + '（' + card.name + '）' : cardLabel(card.id),
      action('takeTarget', { actor, target, card, reason, gain, next }), { kind: 'take', target, card: card.id }))
  if (options.length) offer(s, actor, reason + ' · 选择' + label(s, target) + '的一张牌', options, 'take')
  else push(s, next)
}

const steps = {
  noop() {},
  setup(s, { npc }) {
    s.npc = npc
    const others = shuffle(s, Object.keys(GENERALS).filter(name => !LORD_GENERALS.includes(name)))
    chooseGeneral(s, s.lord, [...LORD_GENERALS, ...others.slice(0, 2)])
  },
  seatGeneral(s, { actor, name }) {
    const p = player(s, actor)
    p.general = name
    p.hp = p.maxHp = general(p).hp + Number(actor === s.lord)
    if (actor === s.lord) {
      event(s, '主公选用 ' + name + '。')
      const pool = shuffle(s, Object.keys(GENERALS).filter(candidate => candidate !== name))
      const offers = order(s, s.lord, true).filter(id => id !== s.lord).map((id, index) =>
        action('offerGeneral', { actor: id, names: pool.slice(index * 3, index * 3 + 3) }))
      const human = offers.find(offer => offer.actor === s.human)
      push(s, human, ...offers.filter(offer => offer !== human), action('deal'))
    }
  },
  offerGeneral(s, { actor, names }) { chooseGeneral(s, actor, names) },
  deal(s) {
    event(s, '武将揭晓：' + s.players.map(p => p.id + '号 ' + p.general).join('、') + '。')
    for (const id of order(s, s.lord)) draw(s, id, 4, '起手')
    push(s, action('turn', { actor: s.lord }))
  },
  turn(s, { actor }) {
    s.current = actor
    s.phase = '准备'
    s.turn++
    s.flags = { slashes: 0, playSlash: false, skipPlay: false, skipDiscard: false, nude: false, rende: 0 }
    event(s, `第 ${s.turn} 回合 · ${label(s, actor)}。`)
    push(s, action('delays', { actor }), action('drawPhase', { actor }), action('playPhase', { actor }),
      action('discardPhase', { actor }), action('endPhase', { actor }), action('nextTurn', { actor }))
    const p = player(s, actor)
    if (is(p, '诸葛亮')) optional(s, actor, '观星', action('stargaze', { actor }))
    if (is(p, '甄姬')) optional(s, actor, '洛神', action('judge', { actor, reason: '洛神' }))
  },
  nextTurn(s, { actor }) { push(s, action('turn', { actor: order(s, actor, true)[0] })) },
  delays(s, { actor }) {
    s.phase = '判定'
    const tasks = [...player(s, actor).delay].reverse().map(card => action('delay', { actor, card }))
    push(s, ...tasks)
  },
  delay(s, { actor, card }) {
    const p = player(s, actor)
    if (!p.alive || !p.delay.some(item => item.id === card.id)) return
    take(s, p, [card.id], s.table)
    event(s, `${label(s, actor)} · ${card.name}即将判定。`)
    const canceled = card.name === '闪电' ? action('passLightning', { actor, card }) : action('cleanup', { cards: [card.id] })
    push(s, nullify(s, card.name, null, actor, action('judge', { actor, reason: card.name, delay: card }), canceled))
  },
  passLightning(s, { actor, card }) {
    const next = order(s, actor, true).find(id => !player(s, id).delay.some(item => item.name === '闪电'))
    if (next && removeFrom(s.table, card.id)) {
      player(s, next).delay.push(card)
      event(s, '闪电移至' + label(s, next) + '的判定区。')
    } else discardTable(s, card.id)
  },
  drawPhase(s, { actor }) {
    const p = player(s, actor)
    if (!p.alive) return
    s.phase = '摸牌'
    const normal = action('draw', { actor, n: 2 })
    if (is(p, '许褚')) return optional(s, actor, '裸衣', action('nude', { actor }), normal)
    if (is(p, '周瑜')) return optional(s, actor, '英姿', action('draw', { actor, n: 3, skill: '英姿' }), normal)
    if (is(p, '张辽')) {
      const targets = alive(s).filter(other => other.id !== actor && other.hand.length).map(other => other.id)
      const options = groups(targets, 2).map(ids => pick(ids.map(id => label(s, id)).join('、'),
        action('raid', { actor, targets: ids }), { kind: 'harm', targets: ids }))
      return offer(s, actor, '突袭 · 可改为取得一至两人的手牌', [...options, pass(normal, '正常摸两张')], 'skill')
    }
    push(s, normal)
  },
  draw(s, { actor, n, skill }) { draw(s, actor, n, skill) },
  nude(s, { actor }) { s.flags.nude = true; draw(s, actor, 1, '裸衣') },
  raid(s, { actor, targets }) {
    push(s, ...targets.map(target => action('chooseFrom', { actor, target, areas: 'h', reason: '突袭', gain: true })))
  },
  playPhase(s, { actor }) {
    if (!player(s, actor).alive) return
    s.phase = '出牌'
    if (!s.flags.skipPlay) push(s, action('play', { actor }))
  },
  play(s, { actor }) {
    const p = player(s, actor)
    if (!p.alive) return
    offer(s, actor, '出牌阶段 · 选择牌、技能或结束出牌', [
      ...playOptions(s, p), pass(action('noop'), '结束出牌'),
    ], 'play')
  },
  discardPhase(s, { actor }) {
    const p = player(s, actor)
    if (!p.alive) return
    s.phase = '弃牌'
    const excess = p.hand.length - Math.max(0, p.hp)
    if (excess <= 0 || s.flags.skipDiscard) return
    if (is(p, '吕蒙') && !s.flags.playSlash && !s.flags.kejiAsked) {
      s.flags.kejiAsked = true
      return optional(s, actor, '克己', action('skipDiscard'), action('discardPhase', { actor }))
    }
    offer(s, actor, '弃牌阶段 · 还需弃 ' + excess + ' 张', p.hand.map(card =>
      cardPick(card, action('discardOne', { actor, card }), { kind: 'discard' })), 'discard')
  },
  skipDiscard(s) { s.flags.skipDiscard = true; event(s, '吕蒙发动克己，跳过弃牌阶段。') },
  discardOne(s, { actor, card }) { steps.discardMany(s, { actor, cards: [card] }) },
  discardMany(s, { actor, cards }) {
    push(s, action('discardPhase', { actor }))
    take(s, player(s, actor), cards, s.discard)
    event(s, label(s, actor) + ' 弃置 ' + cards.map(cardLabel).join('、') + '。', null,
      { kind: 'discard', actor, cards })
  },
  endPhase(s, { actor }) {
    s.phase = '结束'
    const p = player(s, actor)
    if (p.alive && is(p, '貂蝉')) optional(s, actor, '闭月', action('draw', { actor, n: 1, skill: '闭月' }))
  },
  optionalDraw(s, { actor, n, skill }) {
    if (player(s, actor).alive) optional(s, actor, skill, action('draw', { actor, n, skill }))
  },
  takeTarget(s, { actor, target, card, reason, gain, next }) {
    const p = player(s, target)
    const id = card.zone === 'h' ? p.hand[random(s, p.hand.length)] : card.id
    push(s, next)
    if (id === undefined) return
    if (gain) transfer(s, target, actor, [id], reason)
    else {
      take(s, p, [id], s.discard)
      event(s, `${label(s, actor)} · ${reason}，弃置 ${label(s, target)}的 ${cardLabel(id)}。`)
    }
  },
  chooseFrom(s, { actor, target, areas, reason, gain, next }) {
    if (!player(s, actor).alive || !player(s, target).alive) return push(s, next)
    selectFrom(s, actor, target, areas, reason, gain, next)
  },
  cleanup(s, { cards }) { cards.forEach(id => discardTable(s, id)) },
}

function groups(items, max, min = 1) {
  const result = []
  function add(prefix, start) {
    if (prefix.length >= min) result.push(prefix)
    if (prefix.length === max) return
    for (let i = start; i < items.length; i++) add([...prefix, items[i]], i + 1)
  }
  add([], 0)
  return result
}


function forms(p, name, { sword = true, acute = false } = {}) {
  const result = []
  for (const id of board(p)) {
    const card = DECK[id]
    const hand = p.hand.includes(id)
    const skill = name === '杀'
      ? (is(p, '赵云') && hand && card.name === '闪' ? '龙胆' : is(p, '关羽') && card.red ? '武圣' : null)
      : name === '闪'
        ? (is(p, '赵云') && hand && card.name === '杀' ? '龙胆' : is(p, '甄姬') && hand && !card.red ? '倾国' : null)
        : name === '桃' && acute && is(p, '华佗') && card.red ? '急救' : null
    if (hand && card.name === name) result.push({ name, cards: [id] })
    else if (skill) result.push({ name, cards: [id], skill })
  }
  if (name === '杀' && sword && weapon(p) === '丈八蛇矛') {
    result.push(...groups(p.hand, 2, 2).map(cards => ({ name, cards, skill: '丈八蛇矛' })))
  }
  return result
}

function formLabel(form) {
  return form.skill ? form.skill + ' · ' + form.cards.map(cardLabel).join(' + ') + ' → ' + form.name : cardLabel(form.cards[0])
}

function playOptions(s, p) {
  const actor = p.id
  const others = alive(s).filter(other => other.id !== actor)
  const available = p.hand.filter(id => !['杀', '闪', '无懈可击'].includes(DECK[id].name))
    .map(id => ({ cards: [id], name: DECK[id].name }))
  const unlimited = is(p, '张飞') || weapon(p) === '诸葛连弩'
  if (!s.flags.slashes || unlimited) {
    available.push(...forms(p, '杀').filter(form =>
      !s.flags.slashes || is(p, '张飞') || !form.cards.includes(p.equip.武器)))
  }
  if (is(p, '甘宁')) available.push(...board(p).filter(id => !DECK[id].red && DECK[id].name !== '过河拆桥')
    .map(id => ({ cards: [id], name: '过河拆桥', skill: '奇袭' })))
  if (is(p, '大乔')) available.push(...board(p).filter(id => DECK[id].suit === '♦')
    .map(id => ({ cards: [id], name: '乐不思蜀', skill: '国色' })))

  const options = []
  for (const form of available) {
    const { name, cards } = form
    const info = CARDS[name]
    const title = formLabel(form)
    const add = (targets = [], kind = 'play') => {
      const caption = targets.length ? targets.map(id => label(s, id)).join(name === '借刀杀人' ? ' → ' : '、') : title
      options.push(pick(caption, action('use', { actor, form, targets, active: true }),
        { group: title, kind, name, targets, card: cards[0] }))
    }
    if (info.slot) add([], 'equip')
    else if (name === '杀') {
      for (const ids of slashTargets(s, p, form)) add(ids, 'harm')
    } else if (name === '桃') {
      if (p.hp < p.maxHp) add([], 'heal')
    } else if (name === '借刀杀人') {
      for (const armed of others.filter(other => weapon(other))) {
        for (const victim of alive(s).filter(other => canSlash(s, armed, other))) add([armed.id, victim.id], 'borrow')
      }
    } else if (['过河拆桥', '顺手牵羊', '乐不思蜀', '决斗'].includes(name)) {
      for (const target of others) {
        if (name === '乐不思蜀' && (is(target, '陆逊') || target.delay.some(card => card.name === name))) continue
        if (name === '决斗' && emptyCity(target)) continue
        if (name === '顺手牵羊' && (is(target, '陆逊') || (!is(p, '黄月英') && distance(s, p, target, cards) !== 1))) continue
        if (['顺手牵羊', '过河拆桥'].includes(name) && !countCards(target)) continue
        add([target.id], 'harm')
      }
    } else if (name !== '闪电' || !p.delay.some(card => card.name === name)) add()
  }

  const skill = (name, choices) => {
    for (const { task, label: caption, ...info } of choices) {
      options.push(pick(caption, task, { group: '武将技 · ' + name, name, ...info }))
    }
  }
  if (is(p, '黄盖')) skill('苦肉', [pick('失去 1 点体力，摸 2 张', action('kurou', { actor }), { kind: 'kurou' })])
  if (is(p, '刘备') && p.hand.length) skill('仁德', others.map(other =>
    pick(label(s, other.id), action('giveMenu', { actor, target: other.id }), { kind: 'give', targets: [other.id] })))
  if (is(p, '刘备') && p.role === '主公' && (!s.flags.slashes || unlimited) && !s.flags.aidFailed &&
    others.some(other => general(other).faction === '蜀')) {
    skill('激将', others.filter(other => canSlash(s, p, other)).map(other => pick(label(s, other.id),
      action('playAid', { actor, target: other.id }), { kind: 'harm', targets: [other.id] })))
  }
  if (is(p, '孙权') && !s.flags.zhiheng && board(p).length) {
    skill('制衡', [pick('选择要置换的牌', action('zhihengMenu', { actor, selected: [] }), { kind: 'exchange' })])
  }
  if (is(p, '周瑜') && !s.flags.fanjian && p.hand.length) skill('反间', others.map(other =>
    pick(label(s, other.id), action('fanjian', { actor, target: other.id }), { kind: 'harm', targets: [other.id] })))
  if (is(p, '华佗') && !s.flags.qingnang && p.hand.length) skill('青囊', alive(s).filter(other => other.hp < other.maxHp)
    .map(other => pick(label(s, other.id), action('paySkill', { actor, target: other.id, skill: '青囊' }),
      { kind: 'heal', targets: [other.id] })))
  if (is(p, '孙尚香') && !s.flags.jieyin && p.hand.length >= 2) skill('结姻', others.filter(other => !general(other).female && other.hp < other.maxHp)
    .map(other => pick(label(s, other.id), action('paySkill', { actor, target: other.id, skill: '结姻', selected: [] }),
      { kind: 'heal', targets: [other.id] })))
  if (is(p, '貂蝉') && !s.flags.lijian && board(p).length) {
    const men = others.filter(other => !general(other).female)
    skill('离间', men.flatMap(first => men.filter(second => first !== second && !emptyCity(first)).map(second =>
      pick(label(s, first.id) + ' 先出杀 · ' + label(s, second.id),
        action('paySkill', { actor, target: first.id, source: second.id, skill: '离间' }),
        { kind: 'harm', targets: [first.id] }))))
  }
  return options
}

function nullify(s, name, source, target, yes, no = action('noop')) {
  return action('nullify', { name, source, target, yes, no, canceled: false, queue: order(s, s.current) })
}

function slashTargets(s, p, form, required) {
  const eligible = alive(s).filter(other => canSlash(s, p, other, form.cards)).map(other => other.id)
  const halberd = weapon(p) === '方天画戟' && p.hand.length && p.hand.every(id => form.cards.includes(id))
  return groups(eligible, halberd ? 3 : 1).filter(ids => !required || ids.includes(required))
}

function beginSlash(s, actor, target, form, targets) {
  const p = player(s, actor)
  const reds = form.cards.filter(id => DECK[id].red).length
  return action('slashTarget', {
    actor, target, form, targets, black: reds === 0, ignored: weapon(p) === '青釭剑',
    damage: 1 + Number(s.current === actor && s.flags.nude),
  })
}

Object.assign(steps, {
  use(s, { actor, form, targets, active = false, supplied = false }) {
    const p = player(s, actor)
    const { name, cards, skill } = form
    const info = CARDS[name]
    if (active) push(s, action('play', { actor }))
    if (name === '杀' && active) s.flags.slashes++
    if (name === '杀' && actor === s.current && s.phase === '出牌') s.flags.playSlash = true
    if (!supplied) take(s, p, cards, s.table)
    const global = ['五谷丰登', '桃园结义'].includes(name)
    const area = global || ['南蛮入侵', '万箭齐发'].includes(name)
    const affected = area ? order(s, actor).filter(id => global || id !== actor) : targets
    event(s, `${label(s, actor)}${skill ? ' · ' + skill : ''} 使用 ${name}${targets.length ? ' → ' + targets.map(id => label(s, id)).join('、') : ''}（${cards.map(cardLabel).join('、')}）。`, null,
      { kind: 'play', actor, name, cards, targets: affected })
    // Losing the cost can trigger a skill before the card's effect.
    const loss = []
    while (s.stack.at(-1)?.type === 'optionalDraw') loss.push(s.stack.pop())
    const cleanup = action('cleanup', { cards })
    if (info.slot) return push(s, ...loss, action('equip', { actor, id: cards[0], slot: info.slot }))
    if (info.delay) return push(s, ...loss, action('installDelay', { actor: targets[0] ?? actor, name, id: cards[0] }))
    if (name === '桃') return push(s, ...loss, action('restore', { actor, n: 1, reason: '桃' }), cleanup)
    if (name === '杀') return push(s, ...loss, ...order(s, actor).filter(id => targets.includes(id)).map(target => beginSlash(s, actor, target, form, targets)), cleanup)
    const ids = area ? affected : [targets[0] ?? actor]
    push(s, ...loss, is(p, '黄月英') && !skill ? action('optionalDraw', { actor, n: 1, skill: '集智' }) : null,
      name === '五谷丰登' ? action('revealMarket', { count: ids.length }) : null,
      ...ids.map(target => action('trick', { actor, target, extra: targets[1], name, cards })),
      name === '五谷丰登' ? action('clearMarket') : null, cleanup)
  },
  equip(s, { actor, id, slot }) {
    const p = player(s, actor)
    if (p.equip[slot] !== undefined) take(s, p, [p.equip[slot]], s.discard)
    if (removeFrom(s.table, id)) p.equip[slot] = id
  },
  installDelay(s, { actor, name, id }) {
    if (removeFrom(s.table, id)) player(s, actor).delay.push({ name, id })
  },
  restore(s, { actor, n, reason }) { heal(s, player(s, actor), n, reason) },
  trick(s, task) {
    const { actor, target, name } = task
    const p = player(s, target)
    if (!p.alive || (name === '桃园结义' && p.hp === p.maxHp) || (name === '五谷丰登' && !s.market.length)) return
    push(s, nullify(s, name, actor, target, { ...task, type: 'trickEffect' }))
  },
  nullify(s, task) {
    const [actor, ...queue] = task.queue
    if (!actor) {
      if (task.canceled) event(s, task.name + ' 对' + label(s, task.target) + '的效果被抵消。')
      return push(s, task.canceled ? task.no : task.yes)
    }
    const next = { ...task, queue }
    const options = forms(player(s, actor), '无懈可击').map(form => cardPick(form.cards[0],
      action('cancelTrick', { actor, card: form.cards[0], next }),
      { kind: 'nullify', name: task.name, target: task.target, counter: task.canceled }))
    offer(s, actor, (task.canceled ? '反制无懈可击' : '可使用无懈可击') + ' · ' + task.name + ' → ' + label(s, task.target),
      [...options, pass(next, '不响应')], 'nullify')
  },
  cancelTrick(s, { actor, card, next }) {
    push(s, { ...next, canceled: !next.canceled, queue: order(s, actor, true) })
    take(s, player(s, actor), [card], s.discard)
    event(s, label(s, actor) + ' 使用 ' + cardLabel(card) + '。', null,
      { kind: 'respond', actor, name: '无懈可击', cards: [card], targets: [next.target] })
  },
  trickEffect(s, { actor, target, extra, name, cards }) {
    if (name === '无中生有') return draw(s, target, 2, name)
    if (name === '桃园结义') return heal(s, player(s, target), 1, name)
    if (name === '五谷丰登') return offer(s, target, '五谷丰登 · 选择一张明牌', s.market.map(card =>
      cardPick(card, action('marketTake', { actor: target, card }), { kind: 'gain' })), 'market')
    if (name === '过河拆桥' || name === '顺手牵羊') return selectFrom(s, actor, target, 'hed', name, name === '顺手牵羊')
    if (name === '决斗') return push(s, action('duel', { actor: target, other: actor, cards }))
    if (name === '借刀杀人') return push(s, action('borrow', { actor: target, source: actor, target: extra }))
    const response = name === '万箭齐发' ? '闪' : '杀'
    push(s, action('response', { actor: target, name: response, reason: name + ' · 来自' + label(s, actor),
      success: action('noop'), fail: action('damage', { actor: target, source: actor, n: 1, cards }) }))
  },
  revealMarket(s, { count }) {
    s.market = []
    for (let i = 0; i < count; i++) {
      const card = top(s)
      if (card !== undefined) s.market.push(card)
    }
    event(s, '五谷丰登翻出 ' + s.market.map(cardLabel).join('、') + '。')
  },
  marketTake(s, { actor, card }) {
    removeFrom(s.market, card)
    player(s, actor).hand.push(card)
    event(s, label(s, actor) + ' 取得五谷丰登中的 ' + cardLabel(card) + '。')
  },
  clearMarket(s) { s.discard.push(...s.market); delete s.market },
  borrow(s, { actor, source, target }) {
    const p = player(s, actor)
    const w = p.equip.武器
    if (w === undefined) return
    const done = action('noop')
    const give = action('giveWeapon', { actor, source, w })
    if (!canSlash(s, p, player(s, target))) return push(s, give)
    push(s, action('response', { actor, name: '杀', reason: '借刀杀人 · 对' + label(s, target) + '使用杀，或交出武器',
      useOn: target, success: done, fail: give }))
  },
  giveWeapon(s, { actor, source, w }) {
    if (player(s, actor).equip.武器 === w) transfer(s, actor, source, [w], '借刀杀人')
  },
  duel(s, { actor, other, cards, remaining }) {
    if (!player(s, actor).alive || !player(s, other).alive) return
    const n = remaining ?? (is(player(s, other), '吕布') ? 2 : 1)
    push(s, action('response', { actor, name: '杀', reason: '决斗 · 对手是' + label(s, other) + ' · 还需 ' + n + ' 张杀',
      success: action('duel', n > 1 ? { actor, other, cards, remaining: n - 1 } : { actor: other, other: actor, cards }),
      fail: action('damage', { actor, source: other, n: 1 + Number(s.current === other && s.flags.nude), cards }) }))
  },
  response(s, task) {
    const { actor, name, reason, fail, useOn, ignored, noArmor, noAid, target } = task
    const p = player(s, actor)
    if (!p.alive) return push(s, fail)
    const possible = forms(p, name, { acute: actor !== s.current })
    const choices = possible.flatMap(form => {
      const info = { kind: 'response', name, target: target ?? useOn, card: form.cards[0] }
      if (!useOn) return [pick(formLabel(form), action('respond', { task, form }), info)]
      return slashTargets(s, p, form, useOn).map(targets => pick(formLabel(form) + ' → ' + targets.map(id => label(s, id)).join('、'),
        action('use', { actor, form, targets }), info))
    })
    if (name === '闪' && !ignored && !noArmor && equipped(p, '防具') === '八卦阵') {
      choices.unshift(pick('发动 八卦阵', action('judge', { actor, reason: '八卦阵', response: task }), { kind: 'armor' }))
    }
    const lordSkill = name === '闪' && is(p, '曹操') ? '护驾' : name === '杀' && is(p, '刘备') ? '激将' : null
    const helpers = order(s, actor, true).filter(id => id !== actor && general(player(s, id)).faction === general(p).faction)
    if (p.role === '主公' && !noAid && lordSkill && helpers.length && (!useOn || canSlash(s, p, player(s, useOn)))) {
      choices.push(pick('发动 ' + lordSkill, action('aid', { task, helpers, skill: lordSkill }), { kind: 'aid' }))
    }
    offer(s, actor, reason, [...choices, pass(fail, '不响应')], name === '桃' ? 'rescue' : 'response')
  },
  respond(s, { task, form, supplier }) {
    const { actor, name, useOn, active } = task
    if (useOn) {
      push(s, action('use', { actor, form, targets: [useOn], active, supplied: Boolean(supplier) }))
      if (supplier) take(s, player(s, supplier), form.cards, s.table)
      return
    }
    const p = player(s, supplier ?? actor)
    push(s, task.success)
    const inTable = task.success.type === 'save'
    take(s, p, form.cards, inTable ? s.table : s.discard)
    if (inTable) push(s, action('cleanup', { cards: form.cards }))
    if (name === '杀' && s.phase === '出牌' && (s.current === actor || s.current === supplier)) s.flags.playSlash = true
    event(s, `${label(s, p.id)}${supplier ? ' 为' + label(s, actor) : ''} 打出 ${formLabel(form)}。`, null,
      { kind: 'respond', actor: p.id, name, cards: form.cards, targets: task.target ? [task.target] : [] })
  },
  aid(s, { task, helpers, skill }) {
    const [id, ...rest] = helpers
    if (!id) return push(s, task.noOwn ? task.fail : { ...task, noAid: true })
    const p = player(s, id)
    const choices = forms(p, task.name).map(form => pick(formLabel(form), action('respond', { task, form, supplier: id }),
      { kind: 'response', name: task.name, target: task.actor, aiding: true, card: form.cards[0] }))
    offer(s, id, skill + ' · 主公请你打出' + task.name, [
      ...choices, pass(action('aid', { task, helpers: rest, skill }), '不代打'),
    ], 'aid')
  },
  playAid(s, { actor, target }) {
    const helpers = order(s, actor, true).filter(id => id !== actor && general(player(s, id)).faction === '蜀')
    push(s, action('aid', { task: { actor, name: '杀', useOn: target, active: true, noOwn: true,
      reason: '激将', fail: action('aidFailed', { actor }) }, helpers, skill: '激将' }))
  },
  aidFailed(s, { actor }) { s.flags.aidFailed = true; push(s, action('play', { actor })) },
})


Object.assign(steps, {
  slashTarget(s, task) {
    const { actor, target } = task
    const p = player(s, actor), t = player(s, target)
    if (!p.alive || !t.alive) return
    const next = { ...task, type: 'slashGender' }
    if (is(t, '大乔') && board(t).length) {
      const choices = board(t).flatMap(card => alive(s).filter(other => other.id !== actor && !task.targets.includes(other.id) && canSlash(s, t, other, [card]))
        .map(other => pick(cardLabel(card) + ' → ' + label(s, other.id),
          action('redirect', { task, card, target: other.id }), { kind: 'harm', targets: [other.id], card })))
      return offer(s, target, '流离 · 可弃牌转移' + label(s, actor) + '的杀', [...choices, pass(next, '保留目标')], 'skill')
    }
    push(s, next)
  },
  redirect(s, { task, card, target }) {
    const p = player(s, task.target)
    push(s, { ...task, target })
    take(s, p, [card], s.discard)
    event(s, `${label(s, p.id)} · 流离，将杀转给 ${label(s, target)}，弃置 ${cardLabel(card)}。`)
  },
  slashGender(s, task) {
    const { actor, target } = task
    const p = player(s, actor), t = player(s, target)
    const next = { ...task, type: 'slashCavalry' }
    if (weapon(p) === '雌雄双股剑' && general(p).female !== general(t).female) {
      return optional(s, actor, '雌雄双股剑', { ...task, type: 'genderCost', next }, next)
    }
    push(s, next)
  },
  genderCost(s, { actor, target, next }) {
    const choices = player(s, target).hand.map(card => cardPick(card, action('genderDiscard', { target, card, next }),
      { kind: 'discard' }))
    offer(s, target, '雌雄双股剑 · 弃一张手牌，或令使用者摸一张', [
      ...choices, pass(action('genderDraw', { actor, next }), '令对方摸一张'),
    ], 'skill')
  },
  genderDiscard(s, { target, card, next }) {
    push(s, next)
    take(s, player(s, target), [card], s.discard)
    event(s, label(s, target) + ' 弃置 ' + cardLabel(card) + '。')
  },
  genderDraw(s, { actor, next }) { draw(s, actor, 1, '雌雄双股剑'); push(s, next) },
  slashCavalry(s, task) {
    const next = { ...task, type: 'slashArmor' }
    if (is(player(s, task.actor), '马超')) {
      return optional(s, task.actor, '铁骑', action('judge', { actor: task.actor, reason: '铁骑', slash: next }), next)
    }
    push(s, next)
  },
  slashArmor(s, task) {
    const { actor, target, ignored, black, direct } = task
    if (!ignored && black && equipped(player(s, target), '防具') === '仁王盾') {
      event(s, label(s, target) + ' 的仁王盾令黑色杀无效。')
      return
    }
    push(s, { ...task, type: direct ? 'slashHit' : 'slashDodge', remaining: is(player(s, actor), '吕布') ? 2 : 1 })
  },
  slashDodge(s, task) {
    const { actor, target, ignored, remaining } = task
    push(s, action('response', { actor: target, name: '闪', ignored,
      reason: '杀 · 来自' + label(s, actor) + ' · 还需 ' + remaining + ' 张闪',
      success: remaining === 1 ? { ...task, type: 'slashMiss' } : { ...task, remaining: remaining - 1 },
      fail: { ...task, type: 'slashHit' } }))
  },
  slashMiss(s, task) {
    const { actor, target } = task
    const p = player(s, actor)
    const t = player(s, target)
    event(s, label(s, target) + ' 闪避了杀。')
    const choices = []
    if (weapon(p) === '青龙偃月刀') {
      for (const form of forms(p, '杀')) {
        for (const targets of slashTargets(s, p, form, target)) {
          choices.push(pick(formLabel(form), action('use', { actor, form, targets }),
            { kind: 'harm', name: '杀', targets, card: form.cards[0] }))
        }
      }
      if (is(p, '刘备') && p.role === '主公') {
        const helpers = order(s, actor, true).filter(id => id !== actor && general(player(s, id)).faction === '蜀')
        if (helpers.length && canSlash(s, p, t)) choices.push(pick('发动 激将',
          action('aid', { task: { actor, name: '杀', useOn: target, noOwn: true, reason: '追杀', fail: action('noop') }, helpers, skill: '激将' }),
          { kind: 'harm', name: '杀', targets: [target] }))
      }
    }
    if (weapon(p) === '贯石斧') {
      choices.push(...groups(board(p).filter(id => id !== p.equip.武器), 2, 2).map(cards =>
        pick(cards.map(cardLabel).join(' + '), action('axe', { task, cards }), { kind: 'harm', targets: [target] })))
    }
    offer(s, actor, '是否发动「' + (weapon(p) || '追击') + '」？', [...choices, pass()], 'skill')
  },
  axe(s, { task, cards }) {
    push(s, { ...task, type: 'slashHit' })
    take(s, player(s, task.actor), cards, s.discard)
    event(s, '贯石斧弃置 ' + cards.map(cardLabel).join('、') + '，令杀命中。')
  },
  slashHit(s, task) {
    const { actor, target, form, damage } = task
    const t = player(s, target)
    const hit = action('damage', { actor: target, source: actor, n: damage, cards: form.cards })
    const w = weapon(player(s, actor))
    if (w === '寒冰剑' && countCards(t) > t.delay.length) {
      return optional(s, actor, '寒冰剑', action('chooseFrom', { actor, target, areas: 'he', reason: '寒冰剑',
        next: action('chooseFrom', { actor, target, areas: 'he', reason: '寒冰剑' }) }), hit)
    }
    const horses = ['进攻马', '防御马'].map(slot => t.equip[slot]).filter(id => id !== undefined)
    if (w === '麒麟弓' && horses.length) {
      return offer(s, actor, '麒麟弓 · 可弃置目标一匹马', [
        ...horses.map(id => cardPick(id, action('takeTarget', { actor, target, card: { id, zone: 'e' },
          reason: '麒麟弓', next: hit }), { kind: 'take', target })), pass(hit, '保留坐骑'),
      ], 'skill')
    }
    push(s, hit)
  },
  judge(s, task) {
    const id = top(s)
    if (id !== undefined) s.table.push(id)
    if (id === undefined) return push(s, { ...task, type: 'judgeResult' })
    event(s, `${label(s, task.actor)} · ${task.reason}判定，翻开 ${cardLabel(id)}。`, null,
      { kind: 'judge', actor: task.actor, name: task.reason, cards: [id] })
    push(s, { ...task, type: 'retrial', id, queue: order(s, s.current) })
  },
  retrial(s, task) {
    const [actor, ...queue] = task.queue
    if (!actor) return push(s, { ...task, type: 'judgeResult' })
    const p = player(s, actor)
    const next = { ...task, queue }
    if (!is(p, '司马懿')) return push(s, next)
    offer(s, actor, '鬼才 · ' + task.reason + ' → ' + label(s, task.actor) + ' · 当前 ' + cardLabel(task.id), [
      ...p.hand.map(card => cardPick(card, action('replaceJudge', { actor, card, next }),
        { kind: 'retrial', name: task.reason, target: task.actor, old: task.id })),
      pass(next, '保留判定'),
    ], 'retrial')
  },
  replaceJudge(s, { actor, card, next }) {
    discardTable(s, next.id)
    push(s, { ...next, id: card })
    take(s, player(s, actor), [card], s.table)
    event(s, label(s, actor) + ' · 鬼才，以 ' + cardLabel(card) + ' 改判。', null,
      { kind: 'judge', actor, name: '鬼才', cards: [card], targets: [next.actor] })
  },
  judgeResult(s, task) {
    const { actor, id, reason } = task
    const p = player(s, actor)
    const card = DECK[id]
    if (card) event(s, reason + '的判定结果为 ' + cardLabel(id) + '。')
    if (card && is(p, '郭嘉')) {
      optional(s, actor, '天妒', { ...task, type: 'judgeApply', keep: true }, { ...task, type: 'judgeApply' })
      return
    }
    push(s, { ...task, type: 'judgeApply' })
  },
  judgeApply(s, { actor, id, reason, delay, response, slash, source, keep }) {
    const card = DECK[id], p = player(s, actor)
    if (card && (keep || reason === '洛神' && !card.red) && removeFrom(s.table, id)) {
      p.hand.push(id)
      event(s, label(s, actor) + ' 获得判定牌 ' + cardLabel(id) + '。')
    } else discardTable(s, id)
    if (reason === '洛神' && card && !card.red) return optional(s, actor, '洛神', action('judge', { actor, reason }))
    if (reason === '八卦阵') return push(s, card?.red ? response.success : { ...response, noArmor: true })
    if (reason === '铁骑') return push(s, { ...slash, direct: Boolean(card?.red) })
    if (reason === '乐不思蜀') {
      if (card && card.suit !== '♥') s.flags.skipPlay = true
      event(s, label(s, actor) + (s.flags.skipPlay ? ' 跳过出牌阶段。' : ' 可以正常出牌。'))
      return discardTable(s, delay.id)
    }
    if (reason === '闪电') {
      if (card?.suit === '♠' && card.rank >= 2 && card.rank <= 9) {
        return push(s, action('damage', { actor, n: 3, cards: [delay.id] }), action('cleanup', { cards: [delay.id] }))
      }
      return push(s, action('passLightning', { actor, card: delay }))
    }
    if (reason === '刚烈' && card && card.suit !== '♥' && player(s, source)?.alive) {
      const hit = action('damage', { actor: source, source: actor, n: 1, cards: [] })
      const choices = groups(player(s, source).hand, 2, 2).map(cards =>
        pick(cards.map(cardLabel).join(' + '), action('retaliationCost', { actor: source, cards }), { kind: 'discard' }))
      offer(s, source, '刚烈 · 弃两张手牌，或受到一点伤害', [...choices, pass(hit, '受到 1 点伤害')], 'skill')
    }
  },
  retaliationCost(s, { actor, cards }) {
    take(s, player(s, actor), cards, s.discard)
    event(s, label(s, actor) + ' · 刚烈，弃置 ' + cards.map(cardLabel).join('、') + '。')
  },
  damage(s, { actor, source, n, cards = [], lose = false }) {
    const p = player(s, actor)
    if (!p.alive) return
    p.hp -= n
    if (source && source !== actor) {
      const key = source + ':' + actor
      s.attitudes[key] = (s.attitudes[key] || 0) - n
    }
    event(s, `${label(s, actor)} ${lose ? '失去' : '受到'} ${n} 点${lose ? '体力' : '伤害'}${source ? ' · 来源 ' + label(s, source) : ''}。`, null,
      { kind: 'damage', actor, amount: n })
    if (!lose) push(s, action('afterDamage', { actor, source, n, cards }))
    if (p.hp <= 0) {
      event(s, label(s, actor) + ' 进入濒死，需回复至至少 1 点体力。')
      push(s, action('rescue', { actor, source, queue: order(s, s.current) }))
    }
  },
  rescue(s, task) {
    const p = player(s, task.actor)
    if (p.hp > 0) return
    const [helper, ...queue] = task.queue
    if (!helper) return push(s, action('death', { actor: p.id, source: task.source }))
    push(s, action('response', { actor: helper, name: '桃', target: p.id,
      reason: '濒死求桃 · ' + label(s, p.id) + ' · 体力 ' + p.hp,
      success: action('save', { helper, task }), fail: { ...task, queue } }))
  },
  save(s, { helper, task }) {
    const p = player(s, task.actor)
    const extra = is(p, '孙权') && p.role === '主公' && p.id !== helper && general(player(s, helper)).faction === '吴'
    if (helper !== p.id) {
      const key = helper + ':' + p.id
      s.attitudes[key] = (s.attitudes[key] || 0) + 1
    }
    heal(s, p, extra ? 2 : 1, extra ? '桃 · 救援' : '桃')
    if (p.hp <= 0) push(s, { ...task, queue: task.queue.slice(task.queue.indexOf(helper)) })
  },
  death(s, { actor, source }) {
    const p = player(s, actor), killer = player(s, source)
    p.alive = false
    take(s, p, [...board(p), ...p.delay.map(card => card.id)], s.discard)
    event(s, label(s, actor) + ' 阵亡，身份为 ' + p.role + '。')
    const survivors = alive(s)
    if (p.role === '主公') s.winner = survivors.length === 1 && survivors[0].role === '内奸' ? '内奸' : '反贼'
    else if (!survivors.some(other => other.role === '反贼' || other.role === '内奸')) s.winner = '主忠'
    if (s.winner) {
      s.phase = '终局'
      event(s, winnerLabel(s.winner))
      s.discard.push(...s.table, ...(s.market || []), ...Object.values(s.arrange || {}).flat(), ...(s.yiji || []))
      s.table = []
      delete s.market
      delete s.arrange
      delete s.yiji
      s.stack = []
      return
    }
    if (killer?.alive && p.role === '反贼') draw(s, source, 3, '击杀反贼奖赏')
    if (killer?.role === '主公' && p.role === '忠臣') {
      const cost = board(killer)
      take(s, killer, cost, s.discard)
      event(s, '主公击杀忠臣，弃置所有手牌和装备' + (cost.length ? '：' + cost.map(cardLabel).join('、') : '') + '。')
    }
  },
  afterDamage(s, { actor, source, n, cards }) {
    const p = player(s, actor)
    if (!p.alive) return
    const cause = player(s, source)
    if (is(p, '曹操') && cards.some(id => s.table.includes(id))) {
      return optional(s, actor, '奸雄', action('recoverCause', { actor, cards }))
    }
    if (is(p, '司马懿') && cause?.alive && board(cause).length) {
      return optional(s, actor, '反馈', action('chooseFrom', { actor, target: source, areas: 'he', reason: '反馈', gain: true }))
    }
    if (is(p, '夏侯惇') && cause?.alive) return optional(s, actor, '刚烈', action('judge', { actor, source, reason: '刚烈' }))
    if (is(p, '郭嘉')) push(s, ...Array.from({ length: n }, () => action('askYiji', { actor })))
  },
  recoverCause(s, { actor, cards }) {
    const found = cards.filter(id => removeFrom(s.table, id))
    player(s, actor).hand.push(...found)
    if (found.length) event(s, label(s, actor) + ' · 奸雄，获得 ' + found.map(cardLabel).join('、') + '。')
  },
})


Object.assign(steps, {
  stargaze(s, { actor }) {
    s.arrange = { remaining: [], upper: [], lower: [] }
    for (let i = 0; i < alive(s).length; i++) {
      const card = top(s)
      if (card !== undefined) s.arrange.remaining.push(card)
    }
    push(s, action('arrangeMenu', { actor }))
  },
  arrangeMenu(s, { actor }) {
    const { remaining, upper, lower } = s.arrange
    if (!remaining.length) {
      s.deck.unshift(...upper)
      s.deck.push(...lower)
      delete s.arrange
      return event(s, `${label(s, actor)} · 观星，${upper.length} 张置顶，${lower.length} 张置底。`)
    }
    offer(s, actor, '观星 · 依次选择从上到下的牌序', remaining.flatMap(card => ['upper', 'lower'].map(side =>
      pick(cardLabel(card) + (side === 'upper' ? ' · 置顶' : ' · 置底'),
        action('arrangeCard', { actor, card, side }), { kind: side, card }))), 'arrange')
  },
  arrangeCard(s, { actor, card, side }) {
    removeFrom(s.arrange.remaining, card)
    s.arrange[side].push(card)
    push(s, action('arrangeMenu', { actor }))
  },
  askYiji(s, { actor }) {
    if (player(s, actor).alive) optional(s, actor, '遗计', action('yijiStart', { actor }))
  },
  yijiStart(s, { actor }) {
    s.yiji = []
    for (let i = 0; i < 2; i++) {
      const card = top(s)
      if (card !== undefined) s.yiji.push(card)
    }
    push(s, action('yijiMenu', { actor }))
  },
  yijiMenu(s, { actor }) {
    if (!s.yiji.length) { delete s.yiji; return }
    offer(s, actor, '遗计 · 分配观看的牌，可留给自己', s.yiji.flatMap(card => alive(s).map(other =>
      pick(cardLabel(card) + ' → ' + label(s, other.id), action('yijiGive', { actor, card, target: other.id }),
        { kind: 'give', card, targets: [other.id] }))), 'yiji')
  },
  yijiGive(s, { actor, card, target }) {
    removeFrom(s.yiji, card)
    player(s, target).hand.push(card)
    event(s, '遗计 · ' + label(s, target) + ' 获得一张牌。')
    event(s, '遗计 · ' + cardLabel(card), [actor, target])
    push(s, action('yijiMenu', { actor }))
  },
  kurou(s, { actor }) {
    event(s, label(s, actor) + ' 发动苦肉。')
    push(s, action('damage', { actor, n: 1, lose: true }), action('draw', { actor, n: 2, skill: '苦肉' }), action('play', { actor }))
  },
  giveMenu(s, { actor, target, selected = [] }) {
    const choices = player(s, actor).hand.filter(card => !selected.includes(card)).map(card =>
      cardPick(card, action('giveMenu', { actor, target, selected: [...selected, card] }), { kind: 'selectCost' }))
    if (selected.length) choices.unshift(pick('确认赠出 ' + selected.length + ' 张', action('rende', { actor, target, selected }), { kind: 'commitCost' }))
    choices.push(pass(action('play', { actor }), '返回出牌'))
    offer(s, actor, '仁德 · 赠牌给 ' + label(s, target) + (selected.length ? ' · 已选 ' + selected.map(cardLabel).join('、') : ''),
      choices, 'cost')
  },
  rende(s, { actor, target, selected }) {
    push(s, action('play', { actor }))
    const old = s.flags.rende
    s.flags.rende += selected.length
    if (old < 2 && s.flags.rende >= 2) push(s, action('restore', { actor, n: 1, reason: '仁德' }))
    transfer(s, actor, target, selected, '仁德')
  },
  zhihengMenu(s, { actor, selected }) {
    const choices = board(player(s, actor)).filter(card => !selected.includes(card)).map(card =>
      cardPick(card, action('zhihengMenu', { actor, selected: [...selected, card] }), { kind: 'selectCost' }))
    if (selected.length) choices.unshift(pick('确认置换 ' + selected.length + ' 张', action('zhiheng', { actor, selected }), { kind: 'commitCost' }))
    choices.push(pass(action('play', { actor }), '返回出牌'))
    offer(s, actor, '制衡 · 选择要弃置的牌' + (selected.length ? ' · 已选 ' + selected.map(cardLabel).join('、') : ''), choices, 'cost')
  },
  zhiheng(s, { actor, selected }) {
    s.flags.zhiheng = true
    push(s, action('draw', { actor, n: selected.length, skill: '制衡' }), action('play', { actor }))
    take(s, player(s, actor), selected, s.discard)
    event(s, label(s, actor) + ' · 制衡，弃置 ' + selected.map(cardLabel).join('、') + '。')
  },
  paySkill(s, { actor, target, source, skill, selected = [] }) {
    const p = player(s, actor)
    const choices = (skill === '离间' ? board(p) : p.hand).filter(card => !selected.includes(card)).map(card =>
      cardPick(card, action(skill === '结姻' && !selected.length ? 'paySkill' : 'resolveSkill',
        { actor, target, source, skill, selected: [...selected, card] }), { kind: 'selectCost' }))
    offer(s, actor, skill + ' · ' + label(s, target) + (selected.length ? ' · 已选 ' + selected.map(cardLabel).join('、') : ''),
      [...choices, pass(action('play', { actor }), '返回出牌')], 'cost')
  },
  resolveSkill(s, { actor, target, source, skill, selected }) {
    push(s, action('play', { actor }))
    if (skill === '离间') {
      s.flags.lijian = true
      push(s, action('duel', { actor: target, other: source, cards: [] }))
    } else {
      s.flags[skill === '青囊' ? 'qingnang' : 'jieyin'] = true
      push(s, action('restore', { actor: target, n: 1, reason: skill }),
        skill === '结姻' ? action('restore', { actor, n: 1, reason: skill }) : null)
    }
    take(s, player(s, actor), selected, s.discard)
    event(s, label(s, actor) + ' · ' + skill + ' → ' + label(s, target) + '，弃置 ' + selected.map(cardLabel).join('、') + '。')
  },
  fanjian(s, { actor, target }) {
    s.flags.fanjian = true
    push(s, action('play', { actor }))
    event(s, label(s, actor) + ' · 反间 → ' + label(s, target) + '。')
    offer(s, target, '反间 · 猜一张随机手牌的花色', suits.map(suit =>
      pick(suit, action('guess', { actor, target, suit }), { kind: 'guess' })), 'guess')
  },
  guess(s, { actor, target, suit }) {
    const p = player(s, actor)
    const id = p.hand[random(s, p.hand.length)]
    event(s, label(s, target) + ' 猜 ' + suit + '，亮出 ' + cardLabel(id) + '。')
    if (DECK[id].suit !== suit) push(s, action('damage', { actor: target, source: actor, n: 1, cards: [] }))
    take(s, p, [id], player(s, target).hand)
  },
})

const winnerLabel = winner => ({ 主忠: '主公与忠臣获胜。', 反贼: '反贼获胜。', 内奸: '内奸获胜。' })[winner]

function describe(id) {
  return { id, label: cardLabel(id), ...DECK[id], ...CARDS[DECK[id].name] }
}

export function perspective(s, id) {
  const own = player(s, id)
  const decision = s.pending?.actor === id ? s.pending : null
  const revealed = s.players.every(p => p.general)
  return {
    self: id, role: own.role, goal: ROLES[own.role], npc: s.npc, turn: s.turn, current: s.current,
    phase: s.phase, winner: s.winner ? winnerLabel(s.winner) : null, deckCount: s.deck.length, discardCount: s.discard.length,
    hand: own.hand.map(describe), market: s.market?.map(describe) ?? null,
    seats: s.players.map(p => ({
      id: p.id, general: revealed || p.id === id || p.id === s.lord ? general(p) ?? null : null,
      role: p.id === id || p.id === s.lord || !p.alive || s.winner ? p.role : null,
      alive: p.alive, hp: revealed || p.id === id || p.id === s.lord ? p.hp : null,
      maxHp: revealed || p.id === id || p.id === s.lord ? p.maxHp : null, handCount: p.hand.length,
      equip: Object.values(p.equip).map(describe), delay: p.delay.map(card => ({ ...describe(card.id), as: card.name })),
    })),
    history: s.log.filter(entry => !entry.to || entry.to.includes(id)).map(({ seq, text, to }) => ({ seq, text, private: Boolean(to) })),
    action: decision ? { kind: decision.kind, prompt: decision.prompt,
      options: decision.choices.map(({ task, ...option }, index) => ({ ...option, index })) }
      : s.winner ? null : { kind: 'auto' },
  }
}

function selectionFor(s) {
  const { actor, kind, choices } = s.pending
  if (kind === 'discard') {
    const p = player(s, actor)
    const count = p.hand.length - Math.max(0, p.hp)
    return { min: count, max: count, cards: choices.map(option => option.card), selected: [],
      task: action('discardMany', { actor }) }
  }
  if (kind !== 'cost') return null
  const costs = choices.filter(option => option.kind === 'selectCost')
  const commit = choices.find(option => option.kind === 'commitCost')
  const task = costs[0]?.task || commit?.task
  if (!task) return null
  const selected = commit?.task.selected || task.selected.slice(0, -1)
  const cards = [...selected, ...costs.map(option => option.card)]
  const type = ({ giveMenu: 'rende', zhihengMenu: 'zhiheng' })[task.type] || task.type
  const multi = type === 'rende' || type === 'zhiheng'
  const min = task.skill === '结姻' ? 2 : 1
  return { cards, selected, min, max: multi ? cards.length : min,
    task: action(multi ? type : 'resolveSkill', { actor, target: task.target, source: task.source, skill: task.skill }) }
}

function acceptSelection(s, cards) {
  const spec = selectionFor(s)
  if (!spec || !Array.isArray(cards) || cards.length < spec.min || cards.length > spec.max ||
    new Set(cards).size !== cards.length || !cards.every(id => spec.cards.includes(id))) {
    throw Error('请选择符合当前数量和区域要求的牌')
  }
  s.pending = null
  push(s, spec.task.type === 'discardMany' ? { ...spec.task, cards } : { ...spec.task, selected: cards })
  pump(s)
}

function describeChoice({ task, ...option }, ownCards) {
  const card = Number.isInteger(option.card) && ownCards.includes(option.card) ? [option.card] : []
  const cards = task.form?.cards || (['axe', 'retaliationCost'].includes(task.type) ? task.cards : card)
  const skill = task.form?.skill || (option.group?.startsWith('武将技 · ') ? option.name : null)
    || (option.label.startsWith('发动 ') ? option.label.slice(3) : null)
    || (task.type === 'redirect' ? '流离' : null)
  const targets = task.type === 'paySkill' && task.skill === '离间' ? [task.target, task.source]
    : task.type === 'yijiGive' ? [] : task.targets || option.targets || []
  return { cards, skill, targets, ordered: option.kind === 'borrow' || task.skill === '离间' }
}

function tableView(s) {
  const data = perspective(s, s.human)
  const visible = s.log.filter(entry => !entry.to && entry.cue)
  const lastTurn = visible.at(-1)?.cue.turn
  data.moves = visible.filter(entry => entry.cue.turn === lastTurn).slice(-6).map(entry => {
    const { cards, ...cue } = entry.cue
    return { seq: entry.seq, text: entry.text, ...cue, cards: (cards || []).map(describe) }
  })
  if (data.action?.options) {
    const ownCards = board(player(s, s.human))
    data.action.options = data.action.options.map((option, index) => ({
      ...option, ui: describeChoice(s.pending.choices[index], ownCards),
    }))
    const spec = selectionFor(s)
    if (spec) {
      const { task, ...selection } = spec
      data.action.selection = selection
    }
  }
  return data
}

function relation(data, attitudes, id) {
  if (id === data.self) return 2
  const target = data.seats.find(p => p.id === id)
  if (!target) return 0
  if (target.role === '主公') {
    if (data.role === '反贼') return -2
    if (data.role === '内奸') return data.seats.filter(p => p.alive).length === 2 ? -2 : 1
    return 2
  }
  const lord = data.seats.find(p => p.role === '主公')
  const evidence = Math.sign((attitudes[id + ':' + lord.id] || 0) + (attitudes[lord.id + ':' + id] || 0))
  if (data.role === '反贼') return -evidence || -0.25
  if (data.role === '内奸') return -1
  return evidence || -0.5
}

function cardValue(id) {
  return ({ 桃: 7, 无懈可击: 6, 无中生有: 5, 闪: 4, 杀: 3, 闪电: 0 })[DECK[id]?.name] ?? 2
}

function judgeGood(name, card) {
  if (name === '闪电') return card.suit !== '♠' || card.rank < 2 || card.rank > 9
  if (name === '乐不思蜀') return card.suit === '♥'
  if (name === '刚烈') return card.suit !== '♥'
  if (name === '洛神') return !card.red
  return card.red
}

function optionScore(data, attitudes, option) {
  const { kind, card, name, target, targets = [], old, counter } = option
  const me = data.seats.find(p => p.id === data.self)
  const theirs = id => relation(data, attitudes, id)
  const enemy = targets.reduce((sum, id) => sum - theirs(id), 0)
  const value = cardValue(card)
  if (kind === 'pass') return 0
  if (kind === 'equip') {
    const info = CARDS[name], previous = me.equip.find(e => e.slot === info.slot)
    return !previous ? 4 : info.range > previous.range ? 2 : -1
  }
  if (kind === 'discard' || kind === 'selectCost') return 7 - value
  if (kind === 'commitCost') return 10
  if (kind === 'take') return card === undefined ? 1 : 2 + (CARDS[DECK[card].name]?.slot === '防具' ? 3 : 0) + value / 5
  if (kind === 'gain' || kind === 'upper') return 1 + value
  if (kind === 'lower') return -1
  if (kind === 'heal') return targets.length ? theirs(targets[0]) * 3 : 8
  if (kind === 'give') return data.action.kind === 'yiji' ? theirs(targets[0]) : me.hp < me.maxHp ? theirs(targets[0]) - 1 : -1
  if (kind === 'exchange') return 1
  if (kind === 'kurou') return me.hp >= 3 && data.hand.length <= 3 ? 4 : -1
  if (kind === 'armor' || kind === 'aid') return 5
  if (option.label === '发动 寒冰剑') return -1
  if (kind === 'response') {
    if (name === '桃' || option.aiding) return theirs(target) * 3
    if (target) return -theirs(target)
    return 4 - value / 8
  }
  if (kind === 'nullify') {
    const benefit = ['五谷丰登', '桃园结义', '无中生有'].includes(name)
    return theirs(target) * (benefit === counter ? 2 : -2)
  }
  if (kind === 'retrial') {
    return (Number(judgeGood(name, DECK[card])) - Number(judgeGood(name, DECK[old]))) * theirs(target) - value / 10
  }
  if (kind === 'harm') {
    if (name === '杀' && targets.every(id => data.seats[id - 1].equip.some(e => e.name === '仁王盾')) &&
      card !== undefined && !DECK[card].red && !me.equip.some(e => e.name === '青釭剑') && !option.group?.startsWith('丈八蛇矛')) return -1
    return enemy > 0 ? 1 + enemy + (name === '杀' ? 2 : 0) + targets.reduce((n, id) => n + (data.seats[id - 1].hp === 1 ? 2 : 0), 0) - value / 9 : -1
  }
  if (kind === 'borrow') return targets[1] === data.self ? -1 : 2 - theirs(targets[0]) - theirs(targets[1])
  if (name === '闪电') return -1
  if (name === '桃园结义') return data.seats.reduce((n, p) => n + (p.alive && p.hp < p.maxHp ? theirs(p.id) : 0), 0)
  if (name === '南蛮入侵' || name === '万箭齐发') return 1 - data.seats.reduce((n, p) => n + (p.alive && p.id !== data.self ? theirs(p.id) : 0), 0)
  return 2
}

export function localChoice(s) {
  const data = perspective(s, s.pending.actor)
  return data.action.options.reduce((best, option) =>
    optionScore(data, s.attitudes, option) > optionScore(data, s.attitudes, best) ? option : best).index
}

async function modelChoice(s, agent, signal) {
  const actor = s.pending.actor
  const view = perspective(s, actor)
  const options = [...view.action.options].sort((a, b) => optionScore(view, s.attitudes, b) - optionScore(view, s.attitudes, a)).slice(0, 60)
  const pass = view.action.options.find(option => option.kind === 'pass')
  if (pass && !options.includes(pass)) options.push(pass)
  view.action.options = options
  view.history = view.history.slice(-20)
  const response = await agent({
    id: 'npc-' + actor, member: 'npc-' + actor,
    system: '你是三国杀经典标准包五人身份场的一位独立玩家。你只知道当前 JSON 中给你的信息。以自己的身份目标获胜，依据局面推理对手身份。选项已经过规则校验。仅返回 JSON 对象 {"choice":整数}，整数必须是 options 中某个选项的 index。',
    prompt: JSON.stringify(view),
  })
  signal?.throwIfAborted()
  const match = String(response?.text || '').match(/\{\s*"choice"\s*:\s*([0-9]+)\s*\}/)
  const choice = match ? Number(match[1]) : -1
  return options.some(option => option.index === choice) ? choice : localChoice(s)
}

export const gameMode = {
  name: MODE, title: TITLE, version: 1,
  create() { return { state: createState() } },
  project({ state }) { return tableView(state) },
  foreground({ data }) {
    return data.history.filter(entry => !entry.private).map(entry => entry.text).join('\n') || TITLE
  },
  async advance({ state, input, agent, signal }) {
    const s = state
    const seq = s.seq
    signal?.throwIfAborted()
    if (!s.pending) throw Error('本局已结束')
    if (s.pending.actor === s.human) {
      if (input?.selection !== undefined) acceptSelection(s, input.selection)
      else accept(s, input?.choice)
    }
    else {
      if (input?.local === true) {
        s.npc = 'local'
        event(s, '对手已切换为本地策略。')
      } else if (input != null) throw Error('现在轮到对手行动')
      const turn = s.turn
      for (let i = 0; i < 10 && s.pending && s.pending.actor !== s.human && s.turn === turn; i++) {
        signal?.throwIfAborted()
        const strategic = s.pending.kind === 'play' && s.npc === 'model'
        accept(s, strategic ? await modelChoice(s, agent, signal) : localChoice(s))
        if (strategic || s.log.some(entry => entry.seq > seq && !entry.to && entry.cue)) break
      }
    }
    return { state: s, events: s.log.filter(entry => entry.seq > seq && !entry.to).map(({ text }) => ({ text })) }
  },
}
