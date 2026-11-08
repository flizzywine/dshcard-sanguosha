import assert from 'node:assert/strict'
import test from 'node:test'
import { DECK, GENERALS, cardLabel } from '../plugin/standard.mjs'
import { accept, createState, gameMode, localChoice, perspective } from '../plugin/rules.mjs'

function cardsInState(s) {
  return [...s.deck, ...s.discard, ...s.table, ...(s.market || []), ...(s.yiji || []), ...Object.values(s.arrange || {}).flat(),
    ...s.players.flatMap(p => [...p.hand, ...Object.values(p.equip), ...p.delay.map(card => card.id)])]
}

test('经典标准牌池与五人选将', () => {
  assert.equal(Object.keys(GENERALS).length, 25)
  assert.equal(DECK.length, 108)
  assert.equal(DECK.filter(card => card.ex).length, 4)
  for (const [name, n] of [['杀', 30], ['闪', 15], ['桃', 8], ['无懈可击', 4], ['闪电', 2]]) {
    assert.equal(DECK.filter(card => card.name === name).length, n)
  }
  const s = createState(981)
  assert.deepEqual(s.players.map(p => p.role).sort(), ['主公', '忠臣', '反贼', '反贼', '内奸'].sort())
  accept(s, 0)
  assert.equal(s.pending.actor, s.lord)
  assert.equal(s.pending.choices.length, 5)
  accept(s, 0)
  for (let i = 0; i < 4; i++) {
    assert.equal(s.pending.choices.length, 3)
    accept(s, 0)
  }
  assert.equal(new Set(s.players.map(p => p.general)).size, 5)
  assert.equal(s.players[s.lord - 1].maxHp, 5)
  assert.equal(s.current, s.lord)
  assert.equal(s.deck.length, 86)
})

function setup(generals, handNames = {}, topNames = []) {
  const s = createState(321)
  s.current = s.lord = s.human = 1
  s.turn = 1
  s.phase = '出牌'
  s.flags = { slashes: 0, playSlash: false, nude: false, rende: 0 }
  const pool = DECK.map(card => card.id)
  const take = query => pool.splice(pool.findIndex(id => query === DECK[id].name || query === DECK[id].suit + DECK[id].rank + DECK[id].name), 1)[0]
  s.players.forEach((p, i) => {
    p.general = generals[i]
    p.role = ['主公', '忠臣', '反贼', '反贼', '内奸'][i]
    p.maxHp = p.hp = GENERALS[p.general].hp + Number(i === 0)
    p.hand = (handNames[p.id] || []).map(take)
  })
  s.deck = [...topNames.map(take), ...pool]
  s.stack = [{ type: 'play', actor: 1 }]
  s.pending = { actor: 1, choices: [{ task: { type: 'noop' } }] }
  accept(s, 0)
  return s
}

function choose(s, predicate) {
  const index = s.pending.choices.findIndex(predicate)
  assert.ok(index >= 0, s.pending.prompt)
  accept(s, index)
}

test('无双需要两次闪，濒死救援在死亡结算前完成', () => {
  const s = setup(['吕布', '孙权', '张飞', '刘备', '赵云'], { 1: ['杀'], 2: ['闪'], 3: ['桃'] })
  s.players[1].hp = 1
  choose(s, option => option.name === '杀' && option.targets[0] === 2)
  assert.match(s.pending.prompt, /还需 2 张闪/)
  choose(s, option => option.kind === 'response')
  assert.equal(s.pending.kind, 'rescue')
  assert.equal(s.pending.actor, 3)
  assert.equal(s.players[1].hp, 0)
  s.stack.unshift({ type: 'turn', actor: 2 })
  choose(s, option => option.kind === 'response')
  assert.equal(s.players[1].hp, 1)
  assert.equal(s.players[1].alive, true)
})

test('五谷丰登的无懈可击仅抵消一个目标，反制可以恢复效果', () => {
  const s = setup(['张飞', '刘备', '曹操', '赵云', '孙权'],
    { 1: ['五谷丰登'], 2: ['无懈可击'], 3: ['无懈可击'] }, ['杀', '闪', '桃', '无中生有', '决斗'])
  choose(s, option => option.name === '五谷丰登')
  assert.equal(s.pending.actor, 2)
  choose(s, option => option.kind === 'nullify')
  assert.equal(s.pending.actor, 3)
  choose(s, option => option.kind === 'nullify')
  assert.equal(s.pending.kind, 'market')
  assert.equal(s.pending.actor, 1)
  s.stack.unshift({ type: 'turn', actor: 2 })
  for (let actor = 1; actor <= 5; actor++) {
    assert.equal(s.pending.actor, actor)
    assert.equal(s.pending.kind, 'market')
    accept(s, 0)
  }
  assert.equal(s.players[0].hand.length, 1)
  assert.equal(s.market, undefined)
})

test('行动投影只公开有权查看的身份、选项与手牌', () => {
  const s = setup(['张飞', '刘备', '曹操', '赵云', '孙权'], { 1: ['过河拆桥'], 2: ['桃'] })
  choose(s, option => option.name === '过河拆桥' && option.targets[0] === 2)
  const targetCard = s.players[1].hand[0]
  const view = perspective(s, 1)
  assert.deepEqual(view.seats.map(p => p.role), ['主公', null, null, null, null])
  assert.deepEqual(view.action.options, [{ label: '随机手牌', kind: 'take', target: 2, index: 0 }])
  assert.ok(!JSON.stringify(view).includes(cardLabel(targetCard)))
  assert.equal(perspective(s, 3).action.kind, 'auto')
  assert.equal(perspective(s, 2).hand[0].name, '桃')
  assert.throws(() => accept(s, 99), /合法行动/)
  assert.equal(s.pending.actor, 1)
})

test('后台模型只收到当前武将的视角，返回非法选项时由本地策略推进', async () => {
  const s = setup(['刘备', '关羽', '曹操', '赵云', '孙权'], { 1: ['杀', '桃'] })
  s.human = 2
  s.npc = 'model'
  const actor = s.pending.actor
  assert.equal(actor, s.lord)
  const result = await gameMode.advance({ state: s, input: null, agent: async ({ member, prompt }) => {
    assert.equal(member, 'npc-' + actor)
    const view = JSON.parse(prompt)
    assert.equal(view.self, actor)
    assert.equal(view.seats.filter(p => p.role).length, 1)
    assert.equal(view.action.kind, 'play')
    assert.ok(view.action.options.some(option => option.name === '杀'))
    assert.ok(!('deck' in view))
    return { text: '{"choice":999}' }
  } })
  assert.ok(result.state.log.some(entry => entry.text.includes('使用 杀')))
  assert.ok(result.events.every(event => typeof event.text === 'string'))
})

test('亮明主公武将后立即轮到真人选将，其余身份保密', () => {
  const s = createState(981)
  s.pending.actor = s.human = s.lord === 1 ? 2 : 1
  accept(s, 0)
  assert.equal(s.pending.actor, s.lord)
  accept(s, 0)
  assert.equal(s.pending.actor, s.human)
  const view = gameMode.project({ state: s })
  assert.equal(view.seats[s.lord - 1].general.name, '刘备')
  assert.equal(view.seats.filter(p => p.general).length, 1)
  assert.equal(view.action.kind, 'general')
})

test('桌面只投射已经亮出的牌，攻击的实体牌和目标可用于直接点选', () => {
  const s = setup(['刘备', '孙权', '张飞', '刘备', '赵云'], { 1: ['杀'], 2: ['闪'] })
  const view = gameMode.project({ state: s })
  const slash = view.action.options.find(option => option.name === '杀' && option.targets[0] === 2)
  assert.deepEqual(slash.ui, { cards: [view.hand[0].id], skill: null, targets: [2], ordered: false })
  assert.deepEqual(view.moves, [])
  accept(s, slash.index)
  const after = gameMode.project({ state: s })
  assert.equal(after.action.kind, 'auto')
  assert.equal(after.moves.at(-1).cards[0].name, '杀')
  assert.deepEqual(after.moves.at(-1).targets, [2])
  assert.ok(!JSON.stringify(after).includes(cardLabel(s.players[1].hand[0])))
})

test('一次确认多张弃牌或制衡，拒绝重复或越界的牌', async () => {
  const discard = setup(['刘备', '孙权', '张飞', '赵云', '曹操'], { 1: ['杀', '闪', '桃'] })
  discard.players[0].hp = 1
  discard.stack.push({ type: 'turn', actor: 2 }, { type: 'discardPhase', actor: 1 })
  choose(discard, option => option.kind === 'pass')
  const { selection } = gameMode.project({ state: discard }).action
  assert.equal(selection.min, 2)
  assert.equal(selection.max, 2)
  const [a, b] = selection.cards
  await assert.rejects(gameMode.advance({ state: discard, input: { selection: [a, a] } }), /数量和区域/)
  assert.equal(discard.players[0].hand.length, 3)
  await gameMode.advance({ state: discard, input: { selection: [a, b] } })
  assert.ok(discard.discard.includes(a) && discard.discard.includes(b))
  assert.equal(discard.players[0].hand.length, 1)

  const balance = setup(['孙权', '刘备', '张飞', '赵云', '曹操'], { 1: ['杀', '闪', '桃'] })
  choose(balance, option => option.name === '制衡')
  const cost = gameMode.project({ state: balance }).action.selection
  assert.equal(cost.min, 1)
  assert.equal(cost.max, 3)
  await gameMode.advance({ state: balance, input: { selection: cost.cards.slice(0, 2) } })
  assert.equal(balance.players[0].hand.length, 3)
  assert.equal(balance.flags.zhiheng, true)
})

test('多局经过 JSON 存档往返后仍守恒，三方均可达成胜利', () => {
  const winners = new Set()
  for (let seed = 1; seed <= 300; seed++) {
    let s = createState(seed * 91121)
    for (let i = 0; !s.winner && i < 2000; i++) {
      if (i % 15 === 0) s = JSON.parse(JSON.stringify(s))
      accept(s, localChoice(s))
      const cards = cardsInState(s)
      assert.equal(cards.length, 108)
      assert.equal(new Set(cards).size, 108)
    }
    assert.ok(s.winner, '第 ' + seed + ' 局应进入终局')
    winners.add(s.winner)
  }
  assert.deepEqual([...winners].sort(), ['主忠', '反贼', '内奸'].sort())
})
