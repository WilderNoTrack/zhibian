# 部署：zhibian.wildernotrack.me

2026-09-15 部署到阿里云 ECS（Ubuntu 24.04，Node 20，Caddy 2.11）。站点公开、无登录。

## 布局

| 用途 | 位置 |
|---|---|
| 代码（每次发布一个目录） | `/srv/apps/zhibian/releases/<时间戳>-<commit>`，`current` 为软链接 |
| 知乎官方 CLI（Linux amd64） | `/srv/apps/zhibian/bin/zhihu-cli` |
| 密钥与配置 | `/etc/zhibian/zhibian.env`（root:root 0600） |
| 运行期数据（辩题库、检索词、健康度） | `/var/lib/zhibian` |
| 备份 | `/var/backups/apps/zhibian` |
| 服务 | `zhibian.service`，以 `zhibian` 系统用户运行，监听 `127.0.0.1:3104` |
| 反向代理 | `/etc/caddy/conf.d/zhibian.wildernotrack.me.caddy`，Caddy 自动签发 HTTPS 证书 |

`zhibian.env` 里的变量：`ZHIHU_ACCESS_SECRET`、`DEEPSEEK_API_KEY`、`PORT=3104`、`ZHIBIAN_DATA_DIR=/var/lib/zhibian`、`ZHIBIAN_PUBLIC_HOSTS=zhibian.wildernotrack.me`、`ZHIHU_CLI_PATH=/srv/apps/zhibian/bin/zhihu-cli`。服务器上没有系统密钥链，知乎 CLI 从环境变量读取 Access Secret。写这个文件时不能带 UTF-8 BOM，否则 systemd 认不出第一行。

## 为部署做的代码改动

- `serve.mjs` 原本只接受 `localhost` / `127.0.0.1` 的 Host。新增 `ZHIBIAN_PUBLIC_HOSTS`，列出允许的公开域名；本机访问不受影响，未列出的域名仍然 403。
- 跨站校验改为比较 Origin 的主机名：HTTPS 在 Caddy 终止，浏览器发来的是 `https://`，而 Node 进程看到的是 HTTP，原来的整串比较会把自己的页面也拒掉。
- 见 `tests/public-host.test.mjs`。

## 启动方式里的一个坑

`serve.mjs` 通过比较 `process.argv[1]` 和 `import.meta.url` 判断自己是不是入口。经过 `current` 软链接启动时，Node 默认把模块路径解析成真实的 `releases/...` 路径，两者对不上，进程直接以 0 退出、不监听端口。服务单元因此用：

```
/usr/bin/node --preserve-symlinks-main --preserve-symlinks /srv/apps/zhibian/current/scripts/serve.mjs
```

## 发布新版本

1. 本地：`git archive --format=tar.gz -o zhibian-release.tar.gz HEAD scripts web package.json README.md`，上传到服务器。
2. 服务器：解压到新的 `releases/<时间戳>-<commit>`，`chown -R root:root`，`ln -sfn` 切换 `current`。
3. `sudo systemctl restart zhibian`，再用 `curl -H 'Host: zhibian.wildernotrack.me' http://127.0.0.1:3104/topics` 和公网地址各验一次。

回滚：把 `current` 指回上一个 release，重启服务。

下线：`sudo systemctl disable --now zhibian`，删除 Caddy 片段后 `sudo caddy validate --config /etc/caddy/Caddyfile` 通过再 `sudo systemctl reload caddy`。

## 公开访问的代价

站点不需要登录。访客打开辩论、读 AI 摘要、质询、提问与自动编排，都会消耗部署者的知乎搜索额度和 DeepSeek 费用；首页的 `/api/topics` 还会在后台触发热榜收录。应用自带每小时 60 次未缓存搜索的上限，但 DeepSeek 调用没有总量上限。需要收紧时，可以在 Caddy 片段里加 `basic_auth`。
