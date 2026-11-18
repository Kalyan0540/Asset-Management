# Connect Atlas to Codex

Use Atlas 0.4 or newer and run Codex locally on the same computer. Atlas includes an MCP server that Codex launches when it needs to search or read the library. This works without Ollama.

1. Open Atlas and choose **Agents → Copy Codex MCP Setup**.
2. Open your local Codex `config.toml` from Codex settings, or open the `.codex/config.toml` file in your home folder. Paste the copied block at the end. If you already have a `[mcp_servers.atlas]` block, replace that block and its `.env` section.
3. Keep Atlas open and start a new **local** Codex session. Try “Use Atlas to find my notes about typography and summarize the most relevant ones.” Approve the tool call if Codex prompts you.

The copied setup offers search across titles, descriptions, tags and note text. Codex can read item metadata and note bodies, and view PNG, JPEG, WebP and GIF originals up to 4 MiB. The setup provides access to the whole active library through read tools. Codex receives the contents returned by the tools you let it run. If you switch Atlas libraries, the adapter follows the active library.

Use **Agents → Copy Read-only MCP Configuration** for a local MCP client that accepts JSON. Atlas's **AI suggestions** panel connects to Ollama for writing drafts, tags, descriptions, folder memberships and relationships.

Atlas 0.9 also supports queueing reviewable organization proposals from a compatible local agent. Set `ATLAS_MCP_WRITE=1` in the adapter environment to expose `propose_organization`, `update_item`, and `create_note`. The proposal tool accepts selected item IDs and an installed Ollama model name. Review the results in Atlas. This opt-in grants whole-library write tools, so use the read-only configuration when you only want the assistant to find and summarize your material.

## ChatGPT on the web and cloud Codex

A hosted session cannot launch an app on your computer through this local configuration. A future option for an eligible ChatGPT workspace would be a private **Secure MCP Tunnel** or an authenticated remote MCP service. That setup needs workspace access and a choice about which library data the service may read. Atlas currently ships the local Codex connection. [Codex MCP configuration](https://developers.openai.com/codex/mcp) · [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
