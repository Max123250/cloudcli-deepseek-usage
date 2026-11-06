# DeepSeek Balance · CloudCLI Plugin

**English** | [简体中文](README.zh-CN.md)

![preview](preview.png)

Adds a **Usage** tab to CloudCLI UI that shows your DeepSeek account balance, sourced from the official DeepSeek API. The balance refreshes automatically every 5 minutes; you can also click `↻ refresh` in the top-right corner to refresh it manually.

## API key source (in priority order)

1. `DEEPSEEK_API_KEY` environment variable
2. `ANTHROPIC_AUTH_TOKEN` environment variable
3. `env.ANTHROPIC_AUTH_TOKEN` in `~/.claude/settings.json`

The key only ever exists in the plugin backend process memory and request headers.

## Build

```bash
npm install
npm run build
```

## Install in CloudCLI

Copy the whole directory (at minimum `manifest.json`, `dist/`, and `icon.svg`) to:

```
~/.claude-code-ui/plugins/deepseek-balance
```

Then refresh the CloudCLI page and open the **DeepSeek 余额** tab.

Alternatively, push this project to a Git repository and install it from **Settings → Plugins** by pasting the repository URL.
