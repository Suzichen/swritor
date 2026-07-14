# Swritor

基于 Tauri 框架的 Material 风格桌面博客管理应用程序，用于管理和初始化 Spage 博客项目。

## 功能特性

- 🚀 **初始化博客** - 通过图形化界面创建新的 Spage 博客项目
- 📂 **管理现有博客** - 选择并管理现有 Spage 博客
- ⚡ **Rust 驱动** - 使用 [spage](https://github.com/Suzichen/spage) 系列 Rust crate（scaffold / engine），无需外部运行时
- 🌐 **在线模板** - 初始化时自动从 npm registry 拉取最新项目模板
- 🖥️ **跨平台支持** - 支持 Windows 和 macOS 平台
- 🎉 **一键发布** - 支持一键部署到 `Spage` 平台


## 界面截图

![初始界面](https://img.spage.me/s-writor/20260615/Snipaste_0.png "初始界面")

![初始界面2](https://img.spage.me/s-writor/20260615/Snipaste_7.png "初始界面2")

![文章管理](https://img.spage.me/s-writor/20260615/Snipaste_4.png "文章管理")

![设置界面](https://img.spage.me/s-writor/20260615/Snipaste_9.png "设置界面")


## 技术栈

- **桌面框架**: Tauri 2.x（Rust 后端 + WebView 前端）
- **前端**: React 18 + TypeScript + Vite
- **样式**: MDUI + Tailwind CSS
- **初始化引擎**: spage-scaffold（Rust crate，项目脚手架生成，依赖自spage）
- **构建引擎**: spage-engine（Rust crate，博客构建和数据生成，依赖自依赖自spage）

## 环境要求

### 开发环境

- Node.js 18+
- Rust 1.70+
- Tauri CLI 2.x

### 安装 Rust

```bash
# Windows (PowerShell)
winget install Rustlang.Rustup

# macOS
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 安装 Tauri CLI

```bash
npm install -g @tauri-apps/cli
```

## 快速开始

### 1. 克隆项目

```bash
git clone git@github.com:Suzichen/swritor.git
cd swritor
```

### 2. 安装依赖

```bash
npm install
```

### 3. （可选）更新 Rust 依赖到最新版本

spage 相关依赖 通过 git 依赖引入，Cargo.lock 会锁定 commit。如需拉取最新：

```bash
cd src-tauri
cargo update
```

### 4. 开发模式运行

```bash
npm run tauri dev
```

### 5. 构建生产版本

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/` 目录下。

## 项目结构

```
swritor/
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   ├── hooks/              # 自定义 Hooks
│   ├── types/              # TypeScript 类型定义
│   ├── utils/              # 工具函数
│   ├── App.tsx             # 应用根组件
│   ├── main.tsx            # 入口文件
│   └── styles.css          # 全局样式
├── src-tauri/              # Tauri 后端源码
│   ├── src/                # Rust 源码
│   │   ├── commands.rs     # Tauri 命令（初始化、目录操作等）
│   │   ├── template_fetcher.rs  # npm 模板下载模块
│   │   ├── error.rs        # 错误类型
│   │   ├── models.rs       # 数据模型
│   │   └── lib.rs          # 入口
│   ├── capabilities/       # 权限配置
│   ├── icons/              # 应用图标
│   ├── Cargo.toml          # Rust 依赖配置
│   └── tauri.conf.json     # Tauri 配置
├── package.json            # Node.js 依赖配置
├── vite.config.ts          # Vite 配置
├── tailwind.config.js      # Tailwind CSS 配置
└── tsconfig.json           # TypeScript 配置
```

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器（仅前端） |
| `npm run build` | 构建前端代码 |
| `npm run tauri dev` | 启动 Tauri 开发模式（完整应用） |
| `npm run tauri build` | 构建生产版本安装包 |

## 架构说明

### 模板策略

初始化博客时，`spage-scaffold` crate 使用编译时内嵌的模板文件。使用最新spage模板需更新 scaffold 依赖：

```bash
cd src-tauri
cargo update
```

### spage crate 集成

通过 Cargo git 依赖引入 [spage](https://github.com/Suzichen/spage) 仓库中的 crate：

**当前已集成：**

- `spage-scaffold` — 博客项目脚手架生成（目录结构、配置文件模板渲染）
- `spage-engine` — 博客构建管线（frontmatter 解析、相册处理、SEO / Sitemap / RSS 生成）

开发时如需联调本地 spage 仓库，可在 `Cargo.toml` 末尾添加 `[patch]` 段：

```toml
[patch."https://github.com/Suzichen/spage.git"]
spage-scaffold = { path = "../spage/crates/spage-scaffold" }
spage-engine = { path = "../spage/crates/spage-engine" }
```

## TODO

- [x] 初始化博客项目（在线拉取模板）
- [x] 编辑配置（config.json / album.config.json 可视化编辑）
- [ ] 编写文章（Markdown 编辑器，frontmatter 表单）
- [ ] 管理相册（相册浏览、图片增删、封面设置）
- [x] 启动预览（调用 spage-engine serve 并在浏览器中查看效果）
- [x] 构建（一键 build，输出产物目录）
- [ ] 构建发布（一键构建并发布到对应平台）

## 使用说明

### 初始化新博客

1. 启动应用后，点击「初始化博客」按钮
2. 选择博客项目的创建目录
3. 填写博客配置信息（项目名称、描述、作者等）
4. 点击确认，等待模板下载和初始化完成
5. 初始化成功后自动跳转到项目浏览页面

### 管理现有博客

1. 点击「选择现有博客」按钮
2. 选择已有的博客项目目录
3. 尽情地享受吧！
