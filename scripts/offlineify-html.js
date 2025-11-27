#!/usr/bin/env node

/**
 * 将包含 CDN 和 <script type="text/babel"> 的单页 HTML 转成离线版本：
 * - 下载常用 CDN 依赖到 ./vendor
 * - 移除外网依赖，改为本地引用
 * - 将 <script type="text/babel"> 内联代码用 Babel 预编译为 app.js
 *
 * 用法：
 *   node offlineify-html.js <input.html> [output-dir]
 *
 * 输出：
 *   [output-dir]/index.html
 *   [output-dir]/app.js
 *   [output-dir]/vendor/*  (tailwind/react/react-dom/confetti)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const babel = require("@babel/core");

if (!process.argv[2]) {
    console.error("Usage: node offlineify-html.js <input.html> [output-dir]");
    process.exit(1);
}

const inputPath = path.resolve(process.argv[2]);
const htmlName = path.basename(inputPath, path.extname(inputPath));
const outputDir = path.resolve(process.argv[3] || path.join(process.cwd(), "offline", htmlName));
const vendorDir = path.join(outputDir, "vendor");

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(vendorDir, { recursive: true });

const download = async (url, dest) => {
    if (fs.existsSync(dest)) {
        return;
    }
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`下载失败 ${url}: ${res.status} ${res.statusText}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`✓ 下载 ${path.basename(dest)}`);
};

const main = async () => {
    let html = fs.readFileSync(inputPath, "utf8");

    // 提取并编译 <script type="text/babel">
    const babelScript = html.match(/<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!babelScript) {
        throw new Error("未找到 <script type=\"text/babel\"> 块");
    }

    const { code } = await babel.transformAsync(babelScript[1], {
        presets: [["@babel/preset-react", { runtime: "classic", development: false }]],
        filename: "inline.jsx",
    });

    fs.writeFileSync(path.join(outputDir, "app.js"), code, "utf8");
    console.log("✓ 生成 app.js");

    // 替换脚本/样式引用为本地文件
    const replacements = [
        { regex: /<script[^>]+cdn\.tailwindcss\.com[^>]*><\/script>/i, replacement: '<link rel="stylesheet" href="./vendor/tailwind.min.css">' },
        { regex: /<script[^>]+unpkg.com\/react@18\/umd\/react\.development\.js[^>]*><\/script>/i, replacement: '<script src="./vendor/react.production.min.js"></script>' },
        { regex: /<script[^>]+unpkg.com\/react-dom@18\/umd\/react-dom\.development\.js[^>]*><\/script>/i, replacement: '<script src="./vendor/react-dom.production.min.js"></script>' },
        { regex: /<script[^>]+@babel\/standalone[^>]*><\/script>\s*/i, replacement: "" },
        { regex: /<script[^>]+canvas-confetti[^>]*><\/script>/i, replacement: '<script src="./vendor/confetti.browser.min.js"></script>' },
        { regex: babelScript[0], replacement: '<script src="./app.js"></script>' },
    ];

    replacements.forEach(({ regex, replacement }) => {
        html = html.replace(regex, replacement);
    });

    // 去掉 Google Fonts 远程 import（避免离线拉取失败）
    html = html.replace(/@import url\(['"]https?:\/\/fonts\.googleapis\.com[^)]+\);?/g, "");

    fs.writeFileSync(path.join(outputDir, "index.html"), html, "utf8");
    console.log(`✓ 输出 ${path.join(outputDir, "index.html")}`);

    // 使用 tailwind CLI 生成仅包含页面所需类名的精简 CSS
    try {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tailwind-"));
        const inputCss = path.join(tmpDir, "input.css");
        fs.writeFileSync(inputCss, "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n", "utf8");

        const contentArgs = [
            path.join(outputDir, "index.html"),
            path.join(outputDir, "app.js"),
            inputPath,
        ];

        execFileSync(
            "npx",
            [
                "tailwindcss",
                "-i",
                inputCss,
                "-o",
                path.join(vendorDir, "tailwind.min.css"),
                ...contentArgs.flatMap((p) => ["--content", p]),
                "--minify",
            ],
            { stdio: "inherit" }
        );
        console.log("✓ 生成本地 tailwind.min.css");
    } catch (err) {
        console.error("生成 Tailwind CSS 失败，请确认已安装 tailwindcss 包");
        throw err;
    }

    // 下载并缓存依赖
    await Promise.all([
        download("https://unpkg.com/react@18/umd/react.production.min.js", path.join(vendorDir, "react.production.min.js")),
        download("https://unpkg.com/react-dom@18/umd/react-dom.production.min.js", path.join(vendorDir, "react-dom.production.min.js")),
        download("https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js", path.join(vendorDir, "confetti.browser.min.js")),
    ]);

    console.log("✓ 本地依赖准备完成");
};

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
