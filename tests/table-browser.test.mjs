import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

const host = process.env.TAVERN_TEST_ROOT
const root = resolve(import.meta.dirname, '..')
const modeKey = 'dsh-card-sanguosha:five-player'

test('Tavern 卡包桌面可直接选将、点牌、选目标、响应与批量弃牌', { skip: !host }, async () => {
  const fromHost = relative => import(pathToFileURL(join(host, relative)))
  const [{ createCardPlugins }, { readCardArchive }, { openZipFile }, { createPluginGameModes }] = await Promise.all([
    fromHost('tavern-plugin/lib/domain/card-plugins.js'),
    fromHost('tavern-plugin/lib/domain/card-archive.js'),
    fromHost('tavern-plugin/lib/domain/zip-file.js'),
    fromHost('tavern-plugin/lib/domain/plugin-game-mode.js'),
  ])
  const require = createRequire(pathToFileURL(join(host, 'package.json')))
  const { chromium } = require('playwright')
  await mkdir(join(root, '.tmp'), { recursive: true })
  const tmp = await realpath(join(root, '.tmp'))
  const dir = await mkdtemp(join(tmp, 'table-'))
  const pluginsDir = join(dir, 'plugins')
  const zip = await openZipFile(join(root, 'dist/sanguosha.dshcard'))
  let browser
  try {
    const card = await readCardArchive(zip)
    assert.equal(card.info.version, '0.2.0')
    assert.ok(card.resolve(card.card.data.assets[0].uri).length)
    const manager = createCardPlugins({ dataRoot: dir, pluginsDir })
    const cardKey = 'sanguosha'
    const cardPath = 'cards/sanguosha.png'
    const plugins = await manager.stage(zip, { cardKey, plugins: card.plugins })
    await manager.enable({ cardKey, cardPath, plugins })
    const pluginDir = join(pluginsDir, (await manager.scope()).get('dsh-card-sanguosha').folder)
    const { createState, accept } = await import(pathToFileURL(join(pluginDir, 'rules.mjs')))
    const { DECK, GENERALS } = await import(pathToFileURL(join(pluginDir, 'standard.mjs')))
    const { apply, name } = await import(pathToFileURL(join(pluginDir, 'index.mjs')))

    function responseState() {
      const s = createState(123)
      s.human = s.lord = 1
      s.current = 2
      s.turn = 4
      s.phase = '出牌'
      s.flags = { slashes: 0, playSlash: false, nude: false, rende: 0 }
      s.players.forEach((p, i) => {
        p.general = ['赵云', '张飞', '张辽', '甄姬', '吕布'][i]
        p.role = ['主公', '忠臣', '反贼', '反贼', '内奸'][i]
        p.hp = p.maxHp = GENERALS[p.general].hp + Number(i === 0)
      })
      s.players[0].hp = 1
      const take = name => s.deck.splice(s.deck.findIndex(id => DECK[id].name === name), 1)[0]
      s.players[0].hand = ['闪', '桃', '杀'].map(take)
      const slash = take('杀')
      s.players[1].hand = [slash]
      s.stack = [{ type: 'turn', actor: 1 }, { type: 'use', actor: 2, form: { name: '杀', cards: [slash] }, targets: [1] }]
      s.pending = { actor: 2, choices: [{ task: { type: 'noop' } }] }
      accept(s, 0)
      return s
    }

    const docs = new Map()
    const calls = []
    const hostMode = createPluginGameModes({
      read: gameId => docs.get(gameId),
      write: (gameId, previous, doc) => {
        assert.equal(docs.get(gameId)?.revision ?? null, previous)
        docs.set(gameId, JSON.parse(JSON.stringify(doc)))
      },
      allowed: owner => assert.equal(owner, name),
      runAgent: () => assert.fail('本地对局调用了模型'),
    })
    apply({ tavern: { capabilities: { gameMode: 1 }, member() {},
      gameMode: definition => hostMode.register(name, { ...definition,
        create: ({ gameId }) => ({ state: gameId === 'response' ? responseState() : createState(91121) }) }) } })
    const source = await readFile(join(host, 'tavern-plugin/src/client/features/reply-observer.js'), 'utf8')
    const surface = source.slice(source.indexOf('function TavernGameModeSurface('), source.indexOf('function TavernComposerSlot('))
    const client = await readFile(join(pluginDir, 'client.js'), 'utf8')
    let bundle = 'const modules = {};'
    const libs = [['react','react.production.js'], ['scheduler','scheduler.production.js'],
      ['react-dom','react-dom.production.js'], ['react-dom/client','react-dom-client.production.js']]
    for (const [lib, file] of libs) {
      const code = await readFile(join(dirname(require.resolve(lib)), 'cjs', file), 'utf8')
      bundle += `modules[${JSON.stringify(lib)}]=(()=>{const module={exports:{}};const exports=module.exports;const require=n=>modules[n];${code};return module.exports;})();`
    }
    bundle += `
      let view;
      window.__ModuleLoader__={load:p=>p.factory(n=>modules[n]).apply({tavernUi:{
        assetUrl:path=>'/assets/'+path,
        registerGameModeView: v=>view={...v,owner:p.id,page:v.presentation==='page'},
      }})};
      const React=modules.react, ReactDOM=modules['react-dom'];
      const useTavernUiExtensions=()=>0, tavernSessionSignals={subscribe:()=>()=>{}};
      const tavernPluginBoundary=()=>p=>p.children;
      const tavernUiExtensions={gameModeView:key=>key===view?.owner+':'+view?.name?view:null};
      const rpc=(_,input)=>window.modeRPC(input);
      ${client}
      ${surface}
      modules['react-dom/client'].createRoot(document.getElementById('app')).render(
        React.createElement(TavernGameModeSurface,{sessionId:location.pathname.slice(1),pageHost:true}));
    `
    browser = await chromium.launch({ channel: process.env.TAVERN_BROWSER_CHANNEL || 'chrome', headless: true })
    const errors = []
    async function open(gameId, viewport) {
      const page = await browser.newPage({ viewport })
      page.on('pageerror', error => errors.push(error.message))
      await page.exposeFunction('modeRPC', async input => {
        if (input.op === 'view') return { mode: await hostMode.view(gameId) }
        if (input.op === 'list') return { modes: await hostMode.list(gameId) }
        calls.push({ gameId, ...input })
        return { mode: await hostMode.execute(gameId, input) }
      })
      await page.route('http://127.0.0.1/**', async route => {
        const { pathname } = new URL(route.request().url())
        if (pathname === '/assets/table.css' || pathname === '/assets/generals.webp') {
          return route.fulfill({ path: join(pluginDir, pathname.slice(1)) })
        }
        return route.fulfill({ contentType: 'text/html',
          body: '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div>' })
      })
      await page.goto('http://127.0.0.1/' + gameId)
      await page.addScriptTag({ content: bundle })
      await page.waitForFunction(() => {
        const board = document.querySelector('[data-sanguosha-host]')?.shadowRoot.querySelector('.board')
        return board && getComputedStyle(board).position === 'relative'
      })
      return page
    }

    const game = await open('flow', { width: 1440, height: 900 })
    await game.getByRole('button', { name: '开始五人身份场' }).click()
    await game.getByRole('heading', { name: '你的身份', exact: true }).waitFor()
    await game.getByRole('button', { name: '进入选将' }).click()
    const pick = game.getByRole('button', { name: '选择武将 刘备' })
    await pick.click()
    assert.equal(await pick.getAttribute('aria-pressed'), 'true')
    await game.getByRole('button', { name: '确认武将' }).click()
    await game.getByText('出牌阶段 · 选择一张手牌或发动技能', { exact: true }).waitFor()
    assert.equal(await game.locator('.seat').count(), 5)
    const before = await hostMode.view('flow')
    const slash = before.data.action.options.find(o => o.name === '杀' && !o.ui.skill)
    const target = slash.ui.targets[0]
    const hand = game.locator('[aria-label="我的手牌"]')
    const strike = hand.getByRole('button', { name: before.data.hand.find(c => c.id === slash.ui.cards[0]).label, exact: true })
    const play = game.getByRole('button', { name: '出牌', exact: true })
    await strike.click()
    assert.ok(await play.isDisabled())
    const legalTarget = game.locator('[data-seat="' + target + '"] button.portrait')
    await legalTarget.click()
    assert.ok(await play.isEnabled())
    assert.equal((await hostMode.view('flow')).revision, before.revision, '选牌和目标只改变界面')
    if (process.env.SANGUOSHA_PREVIEW) await game.locator('.board').screenshot({ path: process.env.SANGUOSHA_PREVIEW })
    await play.click()
    await game.locator('[aria-label="已打出的牌"] .playing-card').first().waitFor()
    const recent = (await hostMode.view('flow')).data.moves
    assert.ok(recent.some(move => move.name === '杀' && move.targets.includes(target)))
    await game.getByRole('button', { name: '回退一步', exact: true }).click()
    await game.getByRole('button', { name: '继续', exact: true }).waitFor()
    await game.getByRole('button', { name: '撤销回退', exact: true }).click()
    await game.getByRole('button', { name: '返回酒馆', exact: true }).click()
    await game.getByRole('button', { name: '返回游戏页面', exact: true }).click()
    await game.locator('.seat').first().waitFor()

    await hostMode.execute('response', { op: 'create', key: modeKey, actionId: randomUUID() })
    const phone = await open('response', { width: 844, height: 390 })
    const played = await phone.locator('.center-cards .playing-card').boundingBox()
    const prompt = await phone.locator('.commands .prompt').boundingBox()
    assert.ok(played.x + played.width < prompt.x, '横屏的提示不能挡住桌心的牌')
    const dodge = phone.locator('[aria-label="我的手牌"]').getByRole('button', { name: / 闪$/ })
    await dodge.click()
    await phone.getByRole('button', { name: '确定', exact: true }).click()
    await phone.getByRole('button', { name: '结束出牌', exact: true }).click()
    await phone.getByText(/弃牌阶段 · 已选 0/).waitFor()
    const { selection } = (await hostMode.view('response')).data.action
    assert.ok(selection.min >= 2)
    const discard = phone.getByRole('button', { name: '确认弃牌' })
    assert.ok(await discard.isDisabled())
    const cards = phone.locator('[aria-label="我的手牌"] button.playing-card')
    for (let i = 0; i < selection.min; i++) await cards.nth(i).click()
    assert.ok(await discard.isEnabled())
    await discard.click()
    await discard.waitFor({ state: 'hidden' })
    assert.equal(calls.findLast(call => call.gameId === 'response' && Array.isArray(call.input?.selection)).input.selection.length, selection.min)
    await phone.setViewportSize({ width: 390, height: 844 })
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await phone.getByRole('button', { name: '记录', exact: true }).click()
    await phone.getByRole('heading', { name: '牌局记录' }).waitFor()
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    await zip.close()
    const verified = await realpath(dir)
    if (verified.startsWith(tmp + sep + 'table-')) await rm(verified, { recursive: true, force: true })
  }
})
