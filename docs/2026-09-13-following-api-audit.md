# 知乎关注流接口核查

核查日期：2026-09-13。本文区分赛事能力介绍、接口契约和实际调用结果。

## 赛事资料中的声明

本地《知乎黑客松 2026 _ 校园新锐季 开发者手册.pdf》第 12 页明确列出：

- `GET /openapi/feed/following`：关注人动态与内容流。
- `GET /openapi/user/following`：关注列表。
- `GET /openapi/user/followers`：粉丝列表。

《参赛者开发流程文档.pdf》第 8 页也介绍相同能力，但未列路径。
这些页面没有给出该组三个接口的完整域名、鉴权、参数、分页或响应示例。
它们证明赛事材料宣称提供这些能力，不足以证明当前账号可调用或支持任意用户 ID。

## 官方 Skill 对照

检查已安装 0.7.0，以及通过官方状态检查获取下载地址、下载并校验 SHA-256 的 0.7.2-beta.20260911131715 文档包。两者均未找到上述三个路径、关注流或粉丝列表的详细说明。

0.7.2 包仅下载至 `tmp/zhihu-api-audit/skill-0.7.2.zip` 查阅，未安装或执行。

已有完整契约的关注接口为 `GET https://developer.zhihu.com/api/v1/user/followees`，仅接受 Offset、Limit。身份由 Access Secret 决定；第三方应用可按文档另加已授权用户的 X-OAuth-Token。CLI 日常命令不支持 OAuth 身份切换。

关注记录字段：Fullname、UrlToken、Url、AvatarUrl、Headline、Gender、FollowerCount。返回目标人物的 UrlToken 不表示其他接口接受它作为代查参数。

## 最小实际调用

使用官方 CLI 返回的绝对路径执行 `me followees --limit 1 --offset 0`，响应 Code=0、Message=success，返回一条记录及分页信息。

七个文档字段均实际出现；本次样本 Headline 为空。未继续翻页，不在本报告保存人物记录或完整关注列表。

本次没有成功调用赛事材料中的三个 `/openapi/...` 接口，其鉴权和目标用户选择规则仍待官方补充。官网文档通过网页读取和浏览器访问均未能完成加载，不能据此判断接口下线。

## 对知辨的影响

1. 可以从本人或已授权用户的关注列表获得其中创作者的公开字段，用于身份匹配和背景卡；简介可能为空。
2. 该途径不能保证任意搜索答主都在返回范围内，也不能自动取得其历史帖子。
3. 关注流是可继续核实的候选能力，暂不作为首版可运行主流程的依赖。
4. 查询粉丝列表与获取粉丝数是不同能力；GET 关注列表也不等于执行关注。

需向官方核实的问题：请提供这三个接口当前的完整域名、鉴权及 scope、请求/响应示例；确认是否已上线、是否迁移，以及是否支持指定用户标识或仅当前授权用户。

## 后续核查：官网实时文档

同日继续核查，已成功通过只读 HTTP 获取官网。由首页引用的公开脚本定位到官方文档目录 `https://developer.zhihu.com/console/api/v3/docs`，该地址不携带凭证即可返回 HTTP 200、success=true。公开原始响应保存于 `tmp/zhihu-api-audit/official-docs-2026-09-13.json`。

当前在线文档“知乎用户数据”分类列出 OAuth 接入、用户内容、用户关注、近期收藏、收藏夹列表和收藏夹内容。逐项检索未找到上述三个 `/openapi/...` 路径。

在线“用户关注 API”与本地文档一致：请求地址 `/api/v1/user/followees`；Query 只有 Offset、Limit；不传 OAuth 凭证查询本人，查询其他用户需取得该用户 OAuth 授权。不能据此把目标答主 UrlToken 当作授权凭证。

另已查阅《开发者手册》第 11 页链接的 `https://zhstatic.zhihu.com/skill/zhihu-hackathon-skill_s2_v260815.zip`，包括其中嵌套的官方 CLI Skill 文档包，亦未找到三个目标路径。该下载地址的文件名不作为内容版本的证明。

因此，“未收录”现在不仅是本地 Skill 的观察，也适用于本次获取的官网公开文档目录；这仍不能证明接口不存在、已下线或不对特定参赛账号开放。由于完整域名与鉴权尚不明确，没有猜测多个主机后发送用户凭证。

可直接发给官方的核实问题（尚未发送）：

> 开发者手册第 12 页列出 GET /openapi/feed/following、GET /openapi/user/following、GET /openapi/user/followers，但当前官网文档与官方 Skill 0.7.2 未找到它们的详细说明。请问这三个接口本届是否开放？完整域名是什么，使用 Access Secret 还是赛事 OAuth Token？是否支持指定答主 ID，还是仅当前授权用户？烦请提供一个最小请求和返回示例；若已迁移，请告知替代接口。我们已成功调用 /api/v1/user/followees，但它只有分页参数，不能直接用于任意答主历史内容查询。
