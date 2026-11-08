window.__ModuleLoader__.load({ id: 'dsh-card-sanguosha', factory: require => {
  const React = require('react')
  const { createPortal } = require('react-dom')
  const h = React.createElement
  const title = '汉末五席 · 三国杀'
  const portraits = ['曹操', '司马懿', '夏侯惇', '张辽', '许褚', '郭嘉', '甄姬', '刘备', '关羽', '张飞',
    '诸葛亮', '赵云', '马超', '黄月英', '孙权', '甘宁', '吕蒙', '黄盖', '周瑜', '大乔', '陆逊', '孙尚香', '华佗', '吕布', '貂蝉']
  const factions = { 魏: '#395a77', 蜀: '#963f37', 吴: '#3b6350', 群: '#806444' }
  const initials = { 主公: '主', 忠臣: '忠', 反贼: '反', 内奸: '内' }
  const positions = [
    { x: 0, y: 0 }, { x: 87, y: 1 }, { x: 63, y: 0 }, { x: 37, y: 0 }, { x: 13, y: 1 },
  ]
  const cardArt = {
    杀: 'sha', 闪: 'shan', 桃: 'tao', 决斗: 'juedou', 过河拆桥: 'guohe', 顺手牵羊: 'shunshou',
    南蛮入侵: 'nanman', 万箭齐发: 'wanjian', 无中生有: 'wuzhong', 五谷丰登: 'wugu', 桃园结义: 'taoyuan',
    借刀杀人: 'jiedao', 无懈可击: 'wuxie', 乐不思蜀: 'lebu', 闪电: 'shandian', 诸葛连弩: 'zhuge',
    雌雄双股剑: 'cixiong', 青釭剑: 'qinggang', 青龙偃月刀: 'qinglong', 丈八蛇矛: 'zhangba', 贯石斧: 'guanshi',
    方天画戟: 'fangtian', 麒麟弓: 'qilin', 寒冰剑: 'hanbing', 八卦阵: 'bagua', 仁王盾: 'renwang',
    赤兔: 'chitu', 大宛: 'dawan', 紫骍: 'zixin', 的卢: 'dilu', 爪黄飞电: 'zhuahuang', 绝影: 'jueying',
  }
  let assets

  function Surface({ children, onKeyDown, onContextMenu, onClickCapture }) {
    const ref = React.useRef(null)
    const [root, setRoot] = React.useState(null)
    React.useLayoutEffect(() => setRoot(ref.current.shadowRoot || ref.current.attachShadow({ mode: 'open' })), [])
    return h('div', { ref, 'data-sanguosha-host': '' }, root && createPortal(h(React.Fragment, null,
      h('link', { rel: 'stylesheet', href: assets('table.css') }),
      h('main', { className: 'board', 'aria-label': title, tabIndex: 0, onKeyDown, onContextMenu, onClickCapture,
        style: { '--atlas': 'url("' + assets('generals.webp') + '")' } }, children)), root))
  }

  function Badge({ role }) {
    return h('span', { className: 'role role-mark', 'data-role': role, title: role || '身份未明', 'aria-label': role || '身份未明' }, initials[role] || '？')
  }

  function Bar({ data, onRecords, onInfo, onAudio, overlay }) {
    return h('header', { className: 'bar' },
      h('div', { className: 'brand' }, h('span', { className: 'seal', 'aria-hidden': true }, '漢'),
        h('strong', null, '汉末五席'), h('small', null, '标准身份场')),
      h('div', { className: 'bar-end' },
        data?.turn > 0 && h('span', { className: 'pill round-pill' }, '第 ' + data.turn + ' 回合'),
        data?.turn > 0 && h('span', { className: 'deck', title: '牌堆与弃牌堆' }, '牌堆 ' + data.deckCount + ' · 弃 ' + data.discardCount),
        onRecords && h('button', { className: 'small-button', type: 'button', onClick: onRecords, 'aria-expanded': overlay === 'log' }, '记录'),
        onAudio && h('button', { className: 'small-button', type: 'button', onClick: onAudio, 'aria-expanded': overlay === 'audio', 'aria-label': '声音设置' }, '♫'),
        onInfo && h('button', { className: 'small-button', type: 'button', onClick: onInfo }, '规则')))
  }

  function Portrait({ general, role, hp, maxHp, handCount, pressed, disabled, onClick, actionLabel }) {
    const index = portraits.indexOf(general?.name)
    const paint = index < 0 ? {} : {
      '--portrait-x': (index % 5 * 25) + '%', '--portrait-y': (Math.floor(index / 5) * 25) + '%',
      '--faction': factions[general.faction],
    }
    const props = { className: 'portrait', style: paint }
    if (onClick) Object.assign(props, { type: 'button', 'aria-label': actionLabel, 'aria-pressed': pressed, disabled, onClick })
    return h(onClick ? 'button' : 'div', props,
      h('span', { className: 'face' + (index < 0 ? ' empty' : ''), 'aria-hidden': true }),
      general && h('span', { className: 'faction' }, general.faction),
      h('strong', { className: 'general-name' }, general?.name || '选将中'),
      role !== undefined && h(Badge, { role }),
      maxHp > 0 && h('span', { className: 'hp', title: '体力 ' + hp + '/' + maxHp, 'aria-label': '体力 ' + hp + '/' + maxHp },
        Array.from({ length: maxHp }, (_, i) => h('i', { key: i, className: i < hp ? 'full' : '' }))),
      handCount !== undefined && h('span', { className: 'hand-count', title: '手牌 ' + handCount }, handCount))
  }

  function Seat({ seat, position, active, target, selected, flash, onTarget, onInfo, equipChoices, onEquip, pickedCards }) {
    const { x, y } = positions[position]
    const cls = ['seat', active && 'active', !seat.alive && 'dead', target && 'aim', selected && 'selected'].filter(Boolean).join(' ')
    const name = seat.general?.name || seat.id + '号'
    const badges = (items, zone) => items.map(card => {
      const options = equipChoices || []
      const interactive = zone === 'equip' && options.includes(card.id)
      const props = { key: card.id, className: 'badge', title: card.hint || card.label, 'data-zone': zone }
      if (interactive) Object.assign(props, { type: 'button', 'aria-pressed': pickedCards.includes(card.id),
        onClick: () => onEquip(card.id), 'aria-label': '选择装备 ' + card.label })
      return h(interactive ? 'button' : 'span', props, card.as || card.name)
    })
    return h('article', { className: cls, 'data-position': position, 'data-seat': seat.id,
      'aria-label': position === 0 ? '我的武将' : name, style: { '--seat-x': x + '%', '--seat-offset': y } },
      h(Portrait, { ...seat, pressed: Boolean(selected), onClick: target ? () => onTarget(seat.id) : undefined, actionLabel: '选择目标 ' + name }),
      selected > 0 && h('span', { className: 'target-number', 'aria-hidden': true }, selected),
      flash && h('span', { key: flash.seq, className: 'hit ' + flash.kind }, (flash.kind === 'heal' ? '+' : '−') + flash.amount),
      h('div', { className: 'seat-caption' }, !seat.alive ? '阵亡' : position === 0 ? '你 · ' + seat.role : (active ? '● 行动中' : seat.id + '号位')),
      h('div', { className: 'badges' }, ...badges(seat.equip, 'equip'), ...badges(seat.delay, 'delay')),
      seat.general && h('button', { type: 'button', className: 'seat-info', 'aria-label': '查看' + name + '技能', onClick: () => onInfo(seat.id) }, 'i'))
  }

  function Card({ card, as, choose, selected, unavailable, appearance }) {
    const name = as || card.name
    const transformed = as && as !== card.name
    const slot = transformed ? null : card.slot
    const delay = transformed ? ['乐不思蜀', '闪电'].includes(name) : card.delay
    const family = slot ? 'equip' : ['杀', '闪', '桃'].includes(name) ? 'basic' : 'trick'
    const category = slot || (delay ? '延时锦囊' : family === 'trick' ? '锦囊' : '基本牌')
    const rank = ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[card.rank] || card.rank
    const art = cardArt[name]
    const props = {
      className: ['playing-card', name.length > 2 && 'long', unavailable && 'unavailable', appearance && 'move-card'].filter(Boolean).join(' '),
      'data-family': family, title: card.hint || card.label, 'aria-label': (card.suit || '') + rank + ' ' + name,
    }
    if (choose) Object.assign(props, { type: 'button', onClick: choose, 'aria-pressed': Boolean(selected) })
    return h(choose ? 'button' : 'div', props,
      h('span', { className: 'rank' + (card.red ? ' red' : ''), 'aria-hidden': true }, h('span', null, rank), h('span', null, card.suit)),
      h('strong', { className: 'card-title' }, name),
      art && h('img', { className: 'card-art', src: assets('noname/cards/' + art + '.png'), alt: '', draggable: false }),
      h('span', { className: 'card-kind' }, category))
  }

  function Command({ children, onClick, disabled, primary }) {
    return h('button', { type: 'button', className: 'command' + (primary ? ' primary' : ''), onClick, disabled }, children)
  }

  function Recovery({ paused, error, busy, retry, local }) {
    if (!paused && !error) return null
    return h('div', { role: 'status' },
      h('p', { className: 'prompt error' }, error || '牌局已暂停'),
      h('div', { className: 'controls' },
        h(Command, { onClick: retry, disabled: busy, primary: true }, error ? '重试' : '继续'),
        local && h(Command, { onClick: local, disabled: busy }, '切换本地策略')))
  }

  function Opening({ data, plan, change, send, locked, recovery }) {
    const [settings, setSettings] = React.useState(false)
    const act = data.action
    const lord = data.seats.find(seat => seat.role === '主公')
    const own = data.seats[data.self - 1]
    const candidates = act?.kind === 'general' ? act.options : []
    const chosen = candidates.find(option => option.index === plan.option)
    const identity = h('div', { className: 'identity' }, h(Badge, { role: data.role }),
      h('div', null, h('strong', null, '你的身份 · ' + data.role), h('p', null, data.goal)))
    if (act?.kind === 'setup') return h('section', { className: 'opening', 'aria-label': '亮明身份' },
      h('div', { className: 'stage-seal', 'aria-hidden': true }, '漢'),
      h('p', { className: 'eyebrow' }, '五人身份场 · 身份揭晓'), h('h1', null, '你的身份'),
      identity,
      h('div', { className: 'controls' },
        h(Command, { primary: true, disabled: locked, onClick: () => send({ choice: 0 }) }, '进入选将'),
        h('button', { type: 'button', className: 'small-button', 'aria-expanded': settings, onClick: () => setSettings(!settings) }, '对手设置')),
      settings && h('div', { className: 'controls' }, h('span', { className: 'muted' }, '默认本地策略'),
        h(Command, { disabled: locked, onClick: () => send({ choice: 1 }) }, '使用后台模型开局')),
      recovery)
    const banner = lord.general && data.self !== lord.id && h('div', { className: 'lord-banner' },
      h(Portrait, lord), h('div', null, h('p', { className: 'eyebrow' }, '主公已选将'), h('strong', null, lord.general.name)))
    return h('section', { className: 'opening', 'aria-label': '武将选择' },
      identity, banner,
      candidates.length
        ? h(React.Fragment, null, h('p', { className: 'eyebrow' }, '选择武将'),
          h('div', { className: 'general-pool' }, candidates.map(option => h('div', { className: 'candidate', key: option.index },
            h(Portrait, { general: option.details, hp: option.details.hp + Number(data.self === lord.id),
              maxHp: option.details.hp + Number(data.self === lord.id), pressed: option.index === plan.option,
              disabled: locked, actionLabel: '选择武将 ' + option.general, onClick: () => change({ option: option.index }) })))),
          h('p', { className: 'general-description' }, chosen ? chosen.details.skills : '点选武将查看技能'),
          h(Command, { disabled: !chosen || locked, primary: true, onClick: () => send({ choice: chosen.index }) }, '确认武将'))
        : h(React.Fragment, null, own.general && h('div', { className: 'candidate' }, h(Portrait, own)),
          h('p', { className: 'prompt', role: 'status' }, lord.general ? '等待其他武将入席' : '主公正在选将')),
      recovery)
  }

  const includesAll = (whole, part) => part.every(value => whole.includes(value))
  const fitsTargets = ({ targets, ordered }, selected) => ordered
    ? selected.every((id, index) => targets[index] === id)
    : includesAll(targets, selected)
  const toggled = (list, value) => list.includes(value) ? list.filter(item => item !== value) : [...list, value]
  const planned = option => option.ui.cards.length || option.ui.targets.length || option.ui.skill
  const emptyPlan = { cards: [], targets: [], skill: null, option: null }

  function getPlan(options, plan, multi) {
    const actionOptions = options.filter(option => option.kind !== 'pass' && planned(option))
    const modes = actionOptions.filter(option => option.ui.skill === plan.skill)
    const costMatches = modes.filter(({ ui }) => ui.cards.length === plan.cards.length && includesAll(ui.cards, plan.cards))
    const targetMatches = costMatches.filter(({ ui }) => fitsTargets(ui, plan.targets))
    const exact = targetMatches.find(({ ui }) => ui.targets.length === plan.targets.length)
    const plain = options.filter(option => option.kind !== 'pass' && !planned(option))
    const cards = multi?.cards || [...new Set(modes.flatMap(option => option.ui.cards))]
    const skills = [...new Set(actionOptions.map(option => option.ui.skill).filter(Boolean))]
    return { cards, skills, modes, plain, pass: options.find(option => option.kind === 'pass'),
      exact: multi ? null : plain.find(option => option.index === plan.option) || exact,
      targets: multi ? [] : [...new Set(costMatches.flatMap(({ ui }) =>
        ui.targets.filter(id => plan.targets.includes(id) || fitsTargets(ui, [...plan.targets, id]) || ui.targets.length === 1)))],
      targetMatches }
  }

  function Center({ data, routes, plan, change, locked }) {
    const act = data.action
    const moves = data.moves || []
    const faceMoves = moves.flatMap(move => (move.kind === 'discard' ? move.cards : move.cards.slice(0, 1))
      .map(card => ({ move, card }))).slice(-4)
    const last = moves.at(-1)
    const current = data.seats[data.current - 1]
    const market = act?.kind === 'market' && data.market
    return h('section', { className: 'table-middle', 'aria-label': '桌面牌区' },
      h('p', { className: 'round-line' }, (current?.general?.name || '') + ' · ' + data.phase + '阶段 · 第 ' + data.turn + ' 回合'),
      data.market?.length
        ? h('div', { className: 'center-cards tray', 'aria-label': '五谷丰登明牌' }, data.market.map(card => {
          const option = market && routes.plain.find(item => item.card === card.id)
          return h(Card, { key: card.id, card, selected: option && plan.option === option.index,
            choose: option && !locked ? () => change({ option: option.index }) : undefined })
        }))
        : faceMoves.length ? h('div', { className: 'center-cards', 'aria-label': '已打出的牌' },
          faceMoves.map(({ move, card }) => h(Card, { key: move.seq + ':' + card.id, card, appearance: true,
            as: ['play', 'respond'].includes(move.kind) ? move.name : undefined })))
          : null,
      last && h('p', { className: 'cue-caption', title: last.text }, last.text))
  }

  function Routes({ paths, me, ordered, transient }) {
    const svg = React.useRef(null)
    const [centers, setCenters] = React.useState([])
    React.useLayoutEffect(() => {
      const board = svg.current.parentElement
      const measure = () => {
        const area = svg.current.getBoundingClientRect()
        setCenters(Array.from(board.querySelectorAll('.seat .portrait'), portrait => {
          const rect = portrait.getBoundingClientRect()
          return [(rect.left + rect.width / 2 - area.left), (rect.top + rect.height / 2 - area.top)]
        }))
      }
      measure()
      const observer = new ResizeObserver(measure)
      observer.observe(board)
      return () => observer.disconnect()
    }, [])
    const coords = [centers[me], ...paths.map(i => centers[i])]
    return h('svg', { ref: svg, className: 'target-lines' + (transient ? ' transient' : ''), 'aria-hidden': true },
      coords.every(Boolean) && coords.slice(1).map(([x2, y2], i) => {
        const [x1, y1] = ordered ? coords[i] : coords[0]
        return h('line', { key: i, x1, y1, x2, y2 })
      }))
  }

  const soundKey = 'dsh-card-sanguosha:audio'
  const audioUrl = name => assets('noname/sound/' + name + '.mp3')
  const equipSound = { 武器: 'equip1', 防具: 'equip2', 防御马: 'equip3', 进攻马: 'equip4' }
  const effectSound = { draw: 'draw', discard: 'discard', judge: 'judge', heal: 'recover' }

  function useAudio(data, gameId, paused) {
    const [volume, setVolume] = React.useState(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(soundKey)) || {}
        const read = (name, fallback) => Number.isFinite(saved[name]) ? Math.max(0, Math.min(100, saved[name])) : fallback
        return { music: read('music', 24), effects: read('effects', 60) }
      } catch { return { music: 24, effects: 60 } }
    })
    const music = React.useRef(null)
    const voice = React.useRef(null)
    const effect = React.useRef(null)
    const started = React.useRef(false)
    const head = data.history.at(-1)?.seq ?? 0
    const previous = React.useRef({ gameId, head })

    function applyMusic(level) {
      const player = music.current
      if (!player) return
      player.volume = level / 100
      if (started.current && level) void player.play().catch(() => {})
      else player.pause()
    }
    function start() {
      started.current = true
      if (volume.music && music.current?.paused) applyMusic(volume.music)
    }
    function adjust(name, level) {
      const next = { ...volume, [name]: level }
      setVolume(next)
      try { localStorage.setItem(soundKey, JSON.stringify(next)) } catch {}
      applyMusic(next.music)
      for (const player of [voice.current, effect.current]) {
        if (!player) continue
        player.volume = next.effects / 100
        if (!next.effects) player.pause()
      }
    }
    React.useEffect(() => {
      const last = previous.current
      previous.current = { gameId, head }
      if (paused || last.gameId !== gameId || head < last.head) {
        voice.current?.pause()
        effect.current?.pause()
        return
      }
      if (head === last.head || !started.current || !volume.effects) return
      let spoken, sound
      for (const cue of data.sounds || []) {
        if (cue.seq <= last.head) continue
        const gender = data.seats[cue.actor - 1]?.general?.female ? 'female' : 'male'
        if (cue.kind === 'play' || cue.kind === 'respond') {
          const id = cardArt[cue.name]
          spoken = id && id !== 'tao' ? id + '-' + gender : 'card'
          if (equipSound[cue.slot]) sound = equipSound[cue.slot]
        } else if (cue.kind === 'damage') {
          sound = cue.seq % 2 ? 'damage' : 'damage2'
        } else if (cue.kind === 'death') {
          sound = 'die_' + gender
        } else if (effectSound[cue.kind]) {
          sound = effectSound[cue.kind]
        }
      }
      for (const [player, name] of [[voice.current, spoken], [effect.current, sound]]) {
        if (!player || !name) continue
        player.src = audioUrl(name)
        player.volume = volume.effects / 100
        void player.play().catch(() => {})
      }
    }, [data.seats, data.sounds, gameId, head, paused, volume.effects])
    // Pause even when Tavern removes the page's shadow-root portal.
    const [musicRef, voiceRef, effectRef] = React.useMemo(() => [music, voice, effect].map(ref => node => {
      ref.current = node
      if (node) return () => { node.pause(); ref.current = null }
    }), [])
    return { volume, start, adjust, players: h(React.Fragment, null,
      h('audio', { ref: musicRef, src: audioUrl('music'), preload: 'none', loop: true }),
      h('audio', { ref: voiceRef, preload: 'none' }),
      h('audio', { ref: effectRef, preload: 'none' })) }
  }

  function History({ entries, close }) {
    const [privateLog, setPrivateLog] = React.useState(false)
    const log = React.useRef(null)
    React.useEffect(() => { log.current.scrollTop = log.current.scrollHeight }, [entries.at(-1)?.seq, privateLog])
    const items = entries.filter(entry => entry.private === privateLog)
    return h('aside', { className: 'popover', 'aria-label': '牌局记录' },
      h('header', null, h('h2', null, privateLog ? '私密记录' : '牌局记录'), h('div', { className: 'controls' },
        h('button', { className: 'small-button', type: 'button', onClick: () => setPrivateLog(!privateLog) }, privateLog ? '公开记录' : '私密记录'),
        h('button', { className: 'small-button', type: 'button', onClick: close }, '关闭'))),
      h('div', { className: 'log', ref: log, role: 'log' },
        items.length ? items.map(entry => h('p', { className: entry.private ? 'private' : '', key: entry.seq }, entry.text)) : h('p', null, '暂无记录')))
  }

  const rules = '五人身份场。一主、一忠、两反、一内。主公先亮明身份、选将并行动。每人起手四张。回合依次经过准备、判定、摸牌、出牌、弃牌和结束。手牌上限等于当前体力。击杀反贼摸三张，主公击杀忠臣弃光手牌和装备。'

  function Game({ data, gameId, busy, advance, revision, paused, error, resume }) {
    const attempted = React.useRef(null)
    const last = React.useRef(null)
    const [input, setInput] = React.useState(null)
    const [overlay, setOverlay] = React.useState(null)
    const [dismissed, dismiss] = React.useState(null)
    const act = data.action
    const auto = act?.kind === 'auto'
    const multi = act?.selection
    const plan = input?.revision === revision ? input : { ...emptyPlan, cards: multi?.selected || [] }
    const change = next => setInput({ ...emptyPlan, ...next, revision })
    const options = act?.options || []
    const routes = data.turn ? getPlan(options, plan, multi) : null
    const own = data.seats[data.self - 1]
    const locked = busy || paused || Boolean(error)
    const lastCue = data.moves?.at(-1)?.seq
    const audio = useAudio(data, gameId, paused)

    React.useEffect(() => {
      if (!auto || busy || paused || error || attempted.current === revision) return
      const timer = setTimeout(() => {
        attempted.current = revision
        void advance(null)
      }, !data.turn ? 160 : lastCue ? 560 : 260)
      return () => clearTimeout(timer)
    }, [advance, auto, busy, paused, error, revision, data.turn, lastCue])

    function send(payload) {
      last.current = { revision, payload }
      void advance(payload)
    }
    function retry() {
      attempted.current = null
      resume()
      if (error && !auto && last.current?.revision === revision) void advance(last.current.payload)
    }
    function local() {
      attempted.current = revision
      resume()
      void advance({ local: true })
    }
    const recovery = h(Recovery, { paused, error, busy, retry, local: auto && data.npc === 'model' ? local : null })
    const showInfo = id => setOverlay(overlay === id ? null : id)
    function cancel(event) {
      event.preventDefault()
      if (overlay !== null) setOverlay(null)
      else change(null)
    }
    const info = typeof overlay === 'number' ? data.seats[overlay - 1] : null
    const popovers = h(React.Fragment, null,
      overlay === 'log' && h(History, { entries: data.history, close: () => setOverlay(null) }),
      overlay === 'audio' && h('aside', { className: 'popover audio-settings', 'aria-label': '声音设置' },
        h('header', null, h('h2', null, '声音设置'),
          h('button', { className: 'small-button', type: 'button', onClick: () => setOverlay(null) }, '关闭')),
        [['music', '背景音乐'], ['effects', '音效与报牌']].map(([name, label]) =>
          h('label', { key: name }, h('span', null, label), h('input', { type: 'range', min: 0, max: 100,
            value: audio.volume[name], onChange: event => audio.adjust(name, Number(event.target.value)) }),
          h('output', null, audio.volume[name] + '%')))),
      (overlay === 'rules' || info) && h('aside', { className: 'popover info', 'aria-label': '详情' },
        h('header', null, h('h2', null, info?.general?.name || '本局规则'),
          h('button', { className: 'small-button', type: 'button', onClick: () => setOverlay(null) }, '关闭')),
        h('p', null, info?.general?.skills || rules)))
    const bar = h(Bar, { data, onInfo: () => showInfo('rules'),
      onRecords: () => showInfo('log'), onAudio: () => showInfo('audio'), overlay })
    if (!data.turn) return h(Surface, { onKeyDown: event => {
      if (event.key === 'Escape' && (overlay !== null || plan.option !== null)) cancel(event)
    }, onClickCapture: audio.start }, audio.players, bar,
    h(Opening, { data, plan, change, send, locked, recovery }), popovers)

    function chooseCard(id) {
      if (multi) {
        const cards = toggled(plan.cards, id)
        if (cards.length <= multi.max) change({ cards })
        else if (multi.max === 1) change({ cards: [id] })
        return
      }
      const cards = toggled(plan.cards, id)
      const possible = routes.modes.some(option => includesAll(option.ui.cards, cards))
      change({ skill: plan.skill, cards: possible ? cards : [id] })
    }

    function chooseTarget(id) {
      let targets = toggled(plan.targets, id)
      if (routes.targetMatches.some(option => option.ui.ordered) && plan.targets.includes(id)) {
        targets = plan.targets.slice(0, plan.targets.indexOf(id))
      } else if (!plan.targets.includes(id) && !routes.targetMatches.some(({ ui }) => fitsTargets(ui, targets))) {
        targets = [id]
      }
      change({ ...plan, targets })
    }

    const isSelected = Boolean(routes.exact || plan.cards.length || plan.targets.length || plan.skill || plan.option !== null)
    const ready = !locked && (multi ? plan.cards.length >= multi.min && plan.cards.length <= multi.max : Boolean(routes.exact))
    const confirm = () => send(multi ? { selection: plan.cards } : { choice: routes.exact.index })
    const order = Array.from({ length: 5 }, (_, position) => data.seats[(data.self - 1 + position) % 5])
    const seatPositions = Object.fromEntries(order.map((seat, position) => [seat.id, position]))
    const current = data.seats[data.current - 1]
    const availableSkills = [...new Set([...(own.general?.skills.split('；').map(line => line.split('：')[0]) || []), ...routes.skills])]
    const phaseHint = act?.kind === 'play' ? '出牌阶段 · 选择一张手牌或发动技能' : act?.prompt
    const targetHint = routes.targetMatches.length && routes.targetMatches.every(option => option.ui.ordered)
      ? routes.targetMatches.some(option => option.kind === 'borrow')
        ? (plan.targets.length ? '再选择借刀攻击的目标' : '先选择持有武器的角色')
        : (plan.targets.length ? '再选择另一名决斗武将' : '先选择先出杀的武将')
      : '选择目标武将'
    const needsTarget = routes.targets.length > 0 && isSelected && !routes.exact
    const namedAction = routes.exact?.name || routes.exact?.ui.skill
    const actionTargetNames = plan.targets.map(id => data.seats[id - 1].general?.name || id + '号')
    const readyHint = act?.kind === 'play' && namedAction ? '已选 ' + namedAction + (actionTargetNames.length ? ' → ' + actionTargetNames.join('、') : '') : null
    const prompt = !own.alive && !data.winner ? '你已阵亡 · 正在观战'
      : auto ? (current?.general?.name || '对手') + '的回合 · ' + data.phase
      : multi ? (act.kind === 'discard' ? '弃牌阶段' : act.prompt.split(' · ')[0]) + ' · 已选 ' + plan.cards.length + ' / ' + (multi.min === multi.max ? multi.max : multi.min + '–' + multi.max) + ' 张'
      : needsTarget ? targetHint : readyHint || (plan.skill && !routes.exact ? plan.skill + ' · 选择要使用的牌' : phaseHint)
    const hidePlain = act?.kind === 'market' || multi
    const pass = routes.pass
    function shortcuts(event) {
      if (event.key === 'Escape' && (overlay !== null || isSelected)) return cancel(event)
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey || locked || overlay !== null) return
      const target = event.target
      if (target.closest('input, textarea, select, [contenteditable], button:not(.playing-card):not(.portrait)')) return
      if (event.key === 'Enter' && ready) {
        event.preventDefault()
        confirm()
      } else if (pass && ((event.key === ' ' && act.kind !== 'play') || (event.key.toLowerCase() === 'e' && act.kind === 'play'))) {
        event.preventDefault()
        send({ choice: pass.index })
      }
    }
    const selectedMove = (data.moves || []).findLast(move => move.kind === 'play' && move.targets?.length)
    const routeSource = plan.targets.length ? 0 : seatPositions[selectedMove?.actor]
    const routeTargets = (plan.targets.length ? plan.targets : selectedMove?.targets || [])
      .filter(id => seatPositions[id] !== routeSource).map(id => seatPositions[id])

    return h(Surface, { onKeyDown: shortcuts, onClickCapture: audio.start,
      onContextMenu: event => { if (overlay !== null || isSelected) cancel(event) } }, audio.players, bar,
      routeSource !== undefined && routeTargets.length > 0 && h(Routes, { key: plan.targets.length ? 'selection' : selectedMove?.seq,
        me: routeSource, paths: routeTargets, ordered: Boolean(plan.targets.length && routes.exact?.ui.ordered), transient: !plan.targets.length }),
      order.map((seat, position) => h(Seat, {
        key: seat.id, seat, position, active: seat.id === data.current && !data.winner,
        target: !locked && routes.targets.includes(seat.id), selected: plan.targets.indexOf(seat.id) + 1,
        flash: (data.moves || []).findLast(move => move.actor === seat.id && ['damage', 'heal'].includes(move.kind)),
        onTarget: chooseTarget, onInfo: showInfo, equipChoices: position === 0 && !locked ? routes.cards : [],
        onEquip: chooseCard, pickedCards: plan.cards,
      })),
      h(Center, { data, routes, plan, change, locked }),
      h('section', { className: 'dock', 'aria-label': '手牌与技能' },
        h('div', { className: 'hand' + (!data.hand.length ? ' empty' : ''), 'aria-label': '我的手牌', style: { '--hand-count': data.hand.length } },
          data.hand.length ? data.hand.map(card => h(Card, {
            key: card.id, card, selected: plan.cards.includes(card.id), unavailable: !auto && !routes.cards.includes(card.id),
            choose: !locked && routes.cards.includes(card.id) ? () => chooseCard(card.id) : undefined,
          })) : '无手牌'),
        h('div', { className: 'dock-meta' },
          h('span', { className: 'muted' }, '手牌 ' + own.handCount + ' / ' + Math.max(0, own.hp)),
          h('div', { className: 'skills', 'aria-label': '我的技能' }, availableSkills.map(skill =>
            h('button', { key: skill, className: 'skill', type: 'button', disabled: locked || !routes.skills.includes(skill),
              title: own.general?.skills.split('；').find(line => line.startsWith(skill + '：')),
              'aria-pressed': plan.skill === skill, onClick: () => change({ skill: plan.skill === skill ? null : skill }) }, skill))))),
      !data.winner && h('section', { className: 'commands', 'aria-label': '本步操作' },
        locked && (paused || error) ? recovery : h(React.Fragment, null,
          h('p', { className: 'prompt', role: 'status' }, busy && auto && data.npc === 'model' ? prompt + ' · 思考中' : prompt),
          !hidePlain && routes.plain.length > 0 && h('div', { className: 'plain-choices' },
            routes.plain.map(option => h('button', { key: option.index, type: 'button', className: 'plain-choice',
              disabled: locked, 'aria-pressed': plan.option === option.index, onClick: () => change({ option: option.index }) }, option.label))),
          !auto && h('div', { className: 'controls' },
            h(Command, { disabled: !ready, onClick: confirm, primary: true }, act?.kind === 'play' ? '出牌' : act?.kind === 'discard' ? '确认弃牌' : '确定'),
            isSelected && h(Command, { disabled: locked, onClick: () => change(null) }, '取消选择'),
            pass && h(Command, { disabled: locked, onClick: () => send({ choice: pass.index }) }, pass.label)))),
      data.winner && dismissed !== revision && h('section', { className: 'outcome', 'aria-label': '终局结果' },
        h('p', { className: 'eyebrow' }, '身份揭晓'), h('h2', null, data.winner),
        h(Command, { primary: true, onClick: () => dismiss(revision) }, '查看牌桌')),
      data.winner && dismissed === revision && h('div', { className: 'commands' }, h('p', { className: 'prompt' }, data.winner)),
      popovers)
  }

  function Lobby({ start, busy }) {
    return h(Surface, null, h(Bar, null), h('section', { className: 'opening', 'aria-label': '身份场大厅' },
      h('div', { className: 'stage-seal', 'aria-hidden': true }, '漢'),
      h('p', { className: 'eyebrow' }, '经典标准包 · 五人身份场'),
      h('h1', null, '汉末五席'),
      h('p', null, '一主 · 一忠 · 两反 · 一内'),
      h(Command, { onClick: start, disabled: busy, primary: true }, busy ? '正在入席…' : '开始五人身份场')))
  }

  return { name: 'dsh-card-sanguosha', inject: ['tavernUi'], apply(ctx) {
    assets = path => ctx.tavernUi.assetUrl(path)
    ctx.tavernUi.registerGameModeView({ name: 'five-player', presentation: 'page', render: Game, lobby: Lobby })
  } }
} })
