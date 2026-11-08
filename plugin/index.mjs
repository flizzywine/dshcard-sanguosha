import { gameMode } from './rules.mjs'
export const name = 'dsh-card-sanguosha'
export const inject = ['tavern']
export function apply(ctx) {
  if (ctx.tavern.capabilities?.gameMode !== 1) throw new Error('五人三国杀需要支持 gameMode 的新版 DSH Tavern')
  for (let seat = 1; seat <= 5; seat++) ctx.tavern.member({ name: 'npc-' + seat, title: seat + '号武将' })
  ctx.tavern.gameMode(gameMode)
}
