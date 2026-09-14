# web-classic —— 上一版界面的归档

这个目录**不在服务路径上**。正式界面是仓库根目录下的 `web/`（知乎风格）。

保留它只是为了对照：如果想知道「换成知乎风格之前长什么样」，可以把它单独跑起来。

## 为什么留着

仓库没有 git，删掉就没有回头路。这里原样保存了替换前的整套前端，
以及它自己的那份 DOM 测试。

## 目录内容

- `index.html`、`app.js`、`data.js`、`library.js`、`lobby.js`、`topic-ids.js`
- `styles.css`、`lobby.css`：上一版的样式
- `tests/ui.test.mjs`、`tests/lobby.test.mjs`：上一版的 DOM 测试
- `serve-classic.mjs`：只为本目录服务的静态服务，`/api/` 仍然交给 `../scripts/serve.mjs`，
  所以数据规则、缓存、限流不会分叉

## 怎么起

```bash
node web-classic/serve-classic.mjs        # 默认 http://localhost:5175/topics
CLASSIC_UI_PORT=5180 node web-classic/serve-classic.mjs
```

## 怎么跑它的测试

```bash
node --test web-classic/tests/*.test.mjs
```

这两个文件不在 `npm test` 的范围里 —— 它们守的是一套已经退役的界面，
留在主套件里会变成维护负担。如果哪天要恢复这一版界面，先把它们挪回 `tests/`。

## 注意

这一版界面**不会再更新**。`web/` 里的新功能（例如独立对立复核、`/search` 页、
`debateTitle` 润色标题）不会回流到这里。
