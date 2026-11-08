import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeZipEntries } from './lib/zip-entries.js'
import { pluginManifestProblem } from './lib/plugin-manifest.js'
import { TITLE } from './plugin/standard.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(process.argv[2] || resolve(here, 'dist/sanguosha.dshcard'))
const pkg = JSON.parse(await readFile(resolve(here, 'plugin/package.json'), 'utf8'))
const problem = pluginManifestProblem(pkg)
if (problem) throw new Error(problem)
const cover = 'assets/icon/main.png'
const plugin = 'plugins/sanguosha/'
const card = { spec: 'chara_card_v3', spec_version: '3.0', data: {
  name: TITLE, description: '经典标准包五人身份场。一位真人、四位对手，程序负责发牌、判定和结算。',
  personality: '', scenario: '', mes_example: '',
  first_mes: '欢迎入席。打开专属游戏页面，点击「开始五人身份场」。身份和座位随机分配。先选择对手模式，再从候选武将中选将。',
  creator: 'DSH Tavern', character_version: pkg.version, tags: ['三国杀', '身份场', '桌游'],
  creator_notes: '需支持 gameMode 的新版 DSH Tavern。默认可选本地策略直接开局，也可选已配置的本局后台模型。',
  assets: [{ type: 'icon', name: 'main', ext: 'png', uri: 'embeded://' + cover }],
  extensions: {},
} }
const manifest = { format: 'dshcard', formatVersion: 1, card: { version: pkg.version, title: TITLE, author: 'DSH Tavern' },
  requires: { tavernApi: 7 }, plugins: [{ name: pkg.name, path: plugin, purpose: '五人身份场规则、独立对手与牌桌界面' }] }
const entries = [
  { path: 'card.json', content: JSON.stringify(card, null, 2) },
  { path: 'dsh.json', content: JSON.stringify(manifest, null, 2) },
  { path: cover, content: await readFile(resolve(here, 'cover.png')) },
  { path: 'LICENSE', content: await readFile(resolve(here, 'LICENSE')) },
]
const pluginRoot = resolve(here, 'plugin')
const files = (await readdir(pluginRoot, { recursive: true, withFileTypes: true }))
  .filter(file => file.isFile()).map(file => join(file.parentPath, file.name)).sort()
for (const file of files) {
  entries.push({ path: plugin + relative(pluginRoot, file).split(sep).join('/'), content: await readFile(file) })
}
await mkdir(dirname(target), { recursive: true })
await writeFile(target, writeZipEntries(entries))
console.log(target)
