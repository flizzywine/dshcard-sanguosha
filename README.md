# 汉末五席 · 三国杀

DSH Tavern 独立人物卡。经典标准版五人身份场，一位真人与四位对手。身份为一主、一忠、两反、一内，牌池为 25 名武将和 108 张游戏牌（含 EX）。

## 开局

1. 用支持 `gameMode` 和独立游戏页面的 DSH Tavern main 版本导入 `dist/sanguosha.dshcard`，启用卡内插件。
2. 新开游玩，在专属页面点击「开始五人身份场」。选择本地策略可以直接开局。选择后台模型需配置本局模型，选将和主动出牌会调用独立代理。
3. 查看自己的身份并选将。出牌、响应、判定和结算由卡内插件管理，Tavern 保存对局并提供回退与恢复。

## 本地开发

Node.js 22.19 或更新版本。运行 `node --test tests/*.test.mjs` 和 `node build.mjs`。打包脚本可以用 `node build.mjs <输出路径>` 指定产物位置。

沿用 [月下六席](https://github.com/flizzywine/dshcard-werewolf) 的独立卡包结构与打包工具，遵循 AGPL-3.0。五人身份分配与标准版牌池见[规则说明](https://game.qidian.com/Game/showNews/index?name=sgs&nid=1082111)和[标准版 FAQ](https://ks3-cn-beijing.ksyun.com/attachment/74ad98665ac744c138ba8c988d85d149)。封面为自制文字图案。
