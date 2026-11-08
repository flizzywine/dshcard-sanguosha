window.__ModuleLoader__.load({ id: 'dsh-card-sanguosha', factory: require => {
  const React = require('react')
  const { createPortal } = require('react-dom')
  const h = React.createElement
  const title = '汉末五席 · 三国杀'
  const css = `
    :host{display:block;color-scheme:dark}
    *{box-sizing:border-box}
    .table{--ink:#f5e8ce;--muted:#c4b59a;--gold:#e5be78;--line:#7e694c;--dark:#211c19;background:radial-gradient(ellipse at 45% 0%,#493329,#1b1715 64%);color:var(--ink);font:14px/1.55 system-ui,"Microsoft YaHei",sans-serif;border:1px solid #594839;border-radius:14px;padding:clamp(13px,3vw,32px);min-height:68vh}
    .table h1,.table h2,.table p{margin:0}.table h1{font:500 clamp(23px,4vw,38px)/1.25 Georgia,"SimSun",serif;letter-spacing:.08em}.table h2{font-size:15px;color:var(--gold)}
    .kicker,.muted{color:var(--muted);font-size:12px}.kicker{color:var(--gold);letter-spacing:.15em}
    .header,.row,.action-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.header{justify-content:space-between;margin-bottom:18px}
    .mark{color:#fff1d4;background:#943f34;border:1px solid #d5806e;border-radius:5px;padding:6px 11px;font:bold 25px/1.4 "SimSun",serif}
    .turn{border:1px solid var(--line);padding:7px 12px;border-radius:100px;color:var(--gold);font-size:12px}
    .seats{display:grid;grid-template-columns:repeat(auto-fit,minmax(116px,1fr));gap:8px}
    .seat{min-width:0;border:1px solid #62543f;border-radius:9px;padding:9px;background:#231b17}.seat.self{border-color:var(--gold)}.seat.active{box-shadow:inset 0 3px #bd6653}.seat.dead{opacity:.6}
    .seat .person{display:flex;gap:5px;align-items:baseline;flex-wrap:wrap}.seat strong{font:600 19px "Microsoft YaHei",sans-serif}.seat small{color:var(--muted)}.seat .role{color:var(--gold)}.seat summary{margin-top:4px}
    .equip{margin-top:6px;display:flex;gap:4px;flex-wrap:wrap}.equip span{border:1px solid #746044;padding:1px 4px;border-radius:4px;color:#e7cfab;font-size:11px}
    .arena{display:grid;grid-template-columns:minmax(0,1fr) minmax(188px,29%);gap:12px;margin-top:14px}
    .box{min-width:0;background:#171312b0;border:1px solid #574b3a;border-radius:9px;padding:12px}.controls{min-width:0;display:grid;gap:10px;align-content:start}
    .box h2{margin-bottom:8px}.hand{display:flex;gap:6px;flex-wrap:wrap}.card,.table button{font:inherit}.card{display:inline-flex;align-items:center;gap:5px;border:1px solid #ad9571;background:#f0dfbb;color:#2d231b;border-radius:5px;padding:5px 8px;white-space:nowrap}.red{color:#882c28}
    .table button{cursor:pointer;min-height:34px;border:1px solid #947b58;border-radius:5px;background:#45352b;color:#fff0d5;padding:5px 10px}.table button:hover:enabled,.table button[aria-pressed=true]{background:#6a4835;border-color:#e5be78}
    .table button:disabled{opacity:.58;cursor:default}.table button:focus-visible,summary:focus-visible{outline:2px solid var(--gold);outline-offset:3px}.table button.primary{background:#913e32;border-color:#d17c65}.table button.primary:hover:enabled{background:#aa4c3e}
    .table button.card{background:#f0dfbb;color:#2d231b}.table button.card:hover:enabled{background:#fff2cd;color:#2d231b}.table button.card:disabled{opacity:1}
    .options{display:flex;flex-wrap:wrap;gap:6px;max-height:230px;overflow:auto;padding:4px}.groups{margin:6px 0}.target-list{border-top:1px solid #574b3a;padding-top:9px}
    .action-head{justify-content:space-between;margin-bottom:7px}.error{color:#ffbfac;margin:6px 0}
    .log{height:clamp(180px,44vh,480px);overflow:auto;overscroll-behavior:contain}.log p{padding:5px 0;border-bottom:1px solid #ffffff12;overflow-wrap:anywhere}.log .private{color:#f3c395}
    .footer{padding-top:12px}.footer p{margin-top:6px}.winner{font-size:21px;color:var(--gold)}
    .lobby{display:grid;place-content:center;text-align:center;gap:16px;min-height:64vh}.lobby .mark{justify-self:center;font-size:54px;padding:10px 23px}.lobby button{justify-self:center;padding:10px 32px}
    @media(max-width:720px){.arena{grid-template-columns:minmax(0,1fr)}.log{height:180px}.seats{grid-template-columns:repeat(auto-fit,minmax(98px,1fr))}}
  `
  const rules = '主公、忠臣、两名反贼和一名内奸。主公明置身份，阵亡时亮明身份。主公先选将并先行动，起手各四张。每回合依次经过准备、判定、摸牌、出牌、弃牌和结束。杀一般每个出牌阶段限一张，距离按存活座位计算。手牌上限等于当前体力。击杀反贼摸三张，主公击杀忠臣弃光手牌和装备。'
  function Surface({ children, lobby = false }) {
    const host = React.useRef(null)
    const [shadow, setShadow] = React.useState(null)
    React.useLayoutEffect(() => setShadow(host.current.shadowRoot || host.current.attachShadow({ mode: 'open' })), [])
    return h('div', { ref: host, 'data-sanguosha-host': '' }, shadow && createPortal(h(React.Fragment, null,
      h('style', null, css), h('main', { className: 'table' + (lobby ? ' lobby' : ''), 'aria-label': title }, children)), shadow))
  }

  function Card({ card, choose }) {
    const content = [h('strong', { key: 'suit', className: card.red ? 'red' : '' }, card.label.split(' ')[0]),
      h('span', { key: 'name' }, card.name)]
    const props = { className: 'card', title: card.hint || card.label }
    return choose ? h('button', { ...props, onClick: choose, type: 'button' }, content) : h('span', props, content)
  }

  function Seat({ seat, self, current }) {
    const { general, role, alive, hp, maxHp, handCount, equip, delay } = seat
    return h('article', { className: 'seat' + (self ? ' self' : '') + (current ? ' active' : '') + (!alive ? ' dead' : '') },
      h('div', { className: 'person' }, h('small', null, seat.id + '席' + (self ? ' · 你' : '')),
        h('span', { className: 'role' }, role || '身份未明')),
      h('strong', null, general?.name || '选将中'),
      general && h('div', { className: 'muted' }, general.faction + ' · ' + (alive ? '体力 ' + hp + '/' + maxHp : '阵亡') + ' · 手牌 ' + handCount),
      h('div', { className: 'equip' }, ...equip.map(card => h('span', { key: card.id, title: card.hint }, card.name)),
        ...delay.map(card => h('span', { key: card.id, title: card.label }, '判定 · ' + card.as))),
      general && h('details', null, h('summary', { className: 'muted' }, '武将技'), h('p', null, general.skills)))
  }

  function Game({ data, busy, advance, revision, paused, error, resume }) {
    const attempted = React.useRef(null), last = React.useRef(null), log = React.useRef(null)
    const [selection, setSelection] = React.useState(null)
    const [privateLog, setPrivateLog] = React.useState(false)
    const act = data.action
    const auto = act?.kind === 'auto'
    React.useEffect(() => {
      if (!auto || busy || paused || error || attempted.current === revision) return
      const timer = setTimeout(() => {
        attempted.current = revision
        void advance(null)
      }, 350)
      return () => clearTimeout(timer)
    }, [advance, auto, revision, busy, paused, error])
    React.useEffect(() => {
      const frame = requestAnimationFrame(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight })
      return () => cancelAnimationFrame(frame)
    }, [data.history.at(-1)?.seq, privateLog])

    function send(option) {
      last.current = { revision, choice: option.index }
      void advance({ choice: option.index })
    }

    function retry() {
      attempted.current = null
      resume()
      if (error && !auto && last.current?.revision === revision) void advance({ choice: last.current.choice })
    }

    const choose = (option, key = option.index) => h('button', {
      key, type: 'button', disabled: busy || paused || Boolean(error),
      className: option.kind === 'pass' ? '' : 'primary', onClick: () => send(option),
      title: option.details?.skills,
    }, option.label)

    const options = act?.options || []

    const grouped = new Map()
    for (const option of options) {
      if (!option.group) continue
      if (!grouped.has(option.group)) grouped.set(option.group, [])
      grouped.get(option.group).push(option)
    }
    const selected = selection?.revision === revision ? selection : null
    const activeGroup = grouped.get(selected?.group)
    const visibleGroups = [...grouped].filter(([, items]) => selected?.card === undefined || items.some(item => item.card === selected.card))
    const change = next => setSelection(next ? { revision, ...next } : null)
    function chooseCard(card) {
      if (selected?.card === card) return change(null)
      const groups = [...grouped].filter(([, items]) => items.some(option => option.card === card))
      change({ card, group: groups.length === 1 ? groups[0][0] : null })
    }
    const history = data.history.filter(entry => privateLog ? entry.private : !entry.private)
    return h(Surface, null,
      h('header', { className: 'header' },
        h('div', { className: 'row' }, h('div', { className: 'mark', 'aria-hidden': true }, '漢'),
          h('div', null, h('p', { className: 'kicker' }, '经典标准包 · 五人身份场'), h('h1', null, title))),
        h('span', { className: 'turn' }, data.turn ? '第 ' + data.turn + ' 回合 · ' + data.phase : data.phase)),
      h('section', { className: 'seats', 'aria-label': '牌桌座位' },
        data.seats.map(seat => h(Seat, { key: seat.id, seat, self: data.self === seat.id, current: data.current === seat.id }))),
      h('div', { className: 'arena' },
        h('section', { className: 'controls', 'aria-label': '我的行动' },
          h('section', { className: 'box' },
            h('div', { className: 'action-head' }, h('h2', null, '我的身份 · ' + data.role),
              h('span', { className: 'muted' }, '牌堆 ' + data.deckCount + ' · 弃牌堆 ' + data.discardCount)),
            h('p', { className: 'muted' }, data.goal),
            data.hand.length > 0 && h('div', { className: 'hand', 'aria-label': '我的手牌' },
              data.hand.map(card => h(Card, { key: card.id, card,
                choose: !busy && !paused && !error && options.some(option => option.group && option.card === card.id)
                  ? () => chooseCard(card.id) : null })))),
          data.market?.length > 0 && h('section', { className: 'box' }, h('h2', null, '五谷丰登 · 明牌'),
            h('div', { className: 'hand' }, data.market.map(card => h(Card, { key: card.id, card })))),
          h('section', { className: 'box' },
            h('div', { className: 'action-head', 'aria-live': 'polite' },
              h('h2', null, data.winner ? '终局' : busy ? '正在结算…' : auto ? '对手行动中' : act?.prompt),
              h('span', { className: 'muted' }, data.npc === 'model' ? '后台模型' : '本地策略')),
            data.winner && h('p', { className: 'winner' }, data.winner),
            !data.seats[data.self - 1].alive && !data.winner && h('p', { className: 'muted' }, '你已阵亡，继续观战。'),
            (paused || error) && h('div', { role: 'status' }, error && h('p', { className: 'error' }, error),
              h('div', { className: 'row' }, h('button', { type: 'button', disabled: busy, onClick: retry }, error ? '重试' : '继续'),
                auto && data.npc === 'model' && h('button', { type: 'button', disabled: busy, onClick: () => {
                  attempted.current = revision
                  resume()
                  void advance({ local: true })
                } }, '切换本地策略'))),
            visibleGroups.length > 0 && h('div', { className: 'options groups', 'aria-label': '可用牌与技能' },
              selected?.card !== undefined && h('button', { type: 'button', onClick: () => change(null) }, '全部行动'),
              ...visibleGroups.map(([group]) => h('button', { key: group, type: 'button', disabled: busy || paused || Boolean(error),
                'aria-pressed': group === selected?.group, onClick: () => change({ group, card: selected?.card }) }, group))),
            activeGroup && h('div', { className: 'options target-list', 'aria-label': '选择目标或确认行动' },
              activeGroup.map(option => choose(option))),
            act?.kind === 'general' && h('details', { className: 'footer' },
              h('summary', null, '候选武将技能'),
              options.map(option => h('p', { key: option.index }, option.general + ' · ' + option.details.skills))),
            options.some(option => !option.group) && h('div', { className: 'options', 'aria-label': '可用行动' },
              options.filter(option => !option.group).map(option => choose(option))))),
        h('aside', { className: 'box' },
          h('div', { className: 'action-head' }, h('h2', null, '牌局记录'),
            h('button', { type: 'button', 'aria-pressed': privateLog, onClick: () => setPrivateLog(!privateLog) }, privateLog ? '查看公开' : '查看私密')),
          h('div', { className: 'log', role: 'log', 'aria-label': privateLog ? '私密记录' : '公开记录', tabIndex: 0, ref: log },
            history.length ? history.map(entry => h('p', { className: entry.private ? 'private' : '', key: entry.seq }, entry.text))
              : h('p', { className: 'muted' }, '暂无记录')))),
      h('details', { className: 'footer' }, h('summary', null, '本局规则'), h('p', null, rules)))
  }

  function Lobby({ start, busy }) {
    return h(Surface, { lobby: true },
      h('div', { className: 'mark', 'aria-hidden': true }, '漢'),
      h('p', { className: 'kicker' }, '五人身份场 · 经典标准版'),
      h('h1', null, title),
      h('p', null, '一主 · 一忠 · 两反 · 一内'),
      h('p', { className: 'muted' }, '一位真人、四位对手 · 随机座位和身份 · 25 名武将 / 108 张游戏牌'),
      h('button', { type: 'button', className: 'primary', onClick: start, disabled: busy }, busy ? '正在入席…' : '开始五人身份场'))
  }
  return { name: 'dsh-card-sanguosha', inject: ['tavernUi'], apply(ctx) {
    ctx.tavernUi.registerGameModeView({ name: 'five-player', presentation: 'page', render: Game, lobby: Lobby })
  } }
} })
