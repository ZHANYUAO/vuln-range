========================================================================
### usestrix/strix
  README 17905 bytes
  L77: - Docker (running)
  L78: - An LLM API key from any [supported provider](https://docs.strix.ai/llm-providers/overview) (OpenAI, Anthropic, Google, etc.)
  L87: export STRIX_LLM="openrouter/z-ai/glm-5.3"
  L88: export LLM_API_KEY="your-api-key"
  L95: > First run automatically pulls the sandbox Docker image. Results are saved to `strix_runs/<run-name>`
  L107: Installed with pipx, uv, or pip? `strix --update` prints the matching upgrade command instead (`pipx upgrade strix-agent`, `uv tool upgrade strix-agent`, `pip install --upgrade strix-ag
  L113: - **Open Source** - free, runs locally with Docker and your own LLM key. [Quick Start](https://docs.strix.ai/quickstart)
  L133: Get the same Strix experience with enterprise-grade controls: SSO (SAML/OIDC), custom compliance-ready penetration testing reports (SOC 2, ISO 27001, PCI DSS), dedicated support and SLA
  L141: Strix is agent-ready. Give Claude Code, Cursor, Codex, or any [SKILL.md-compatible](https://agentskills.io) agent the ability to run pentests, fix findings, and set up CI scanning:
  L286: LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
  L303: export LLM_API_BASE="your-api-base-url"  # if using a local model, e.g. Ollama, LMStudio
  L316: export STRIX_LLM="chatgpt/gpt-5.4"   # chatgpt/<model> runs on the subscription
  L322: Run scans on [app.strix.ai](https://app.strix.ai) from the terminal, without Docker or an LLM key:
  L337: Strix can connect to Model Context Protocol (MCP) servers you list and expose their tools to the agent during a run. Create `~/.strix/mcp-servers.json` with a JSON list of local `stdio`
  L353: **Recommended models for best results:**
  L355: - [Z.ai GLM-5.3 on OpenRouter](https://openrouter.ai/z-ai/glm-5.3) - `openrouter/z-ai/glm-5.3` (the default pick)
  L356: - [OpenAI GPT-5.4](https://openai.com/api/) - `openai/gpt-5.4`
  L357: - [Anthropic Claude Sonnet 4.6](https://claude.com/platform/api) - `anthropic/claude-sonnet-4-6`
  L358: - [Google Gemini 3 Pro Preview](https://cloud.google.com/vertex-ai) - `vertex_ai/gemini-3-pro-preview`
  L359: - [DeepSeek V4 Pro](https://platform.deepseek.com) - `deepseek/deepseek-v4-pro`
  L362: See the [LLM Providers documentation](https://docs.strix.ai/llm-providers/overview) for all supported providers including Vertex AI, Bedrock, Azure, and local models.
  L382: Strix builds on the incredible work of open-source projects like [LiteLLM](https://github.com/BerriAI/litellm), [Caido](https://github.com/caido/caido), [Nuclei](https://github.com/proj
========================================================================
### KeygraphHQ/shannon
  README 26582 bytes
  L2: > **[Cyber verification for Anthropic and OpenAI models](https://github.com/KeygraphHQ/shannon/discussions/483):** complete your provider's cyber verification program to prevent model f
  L68: - [Can I run Shannon on a local or self-hosted model?](#can-i-run-shannon-on-a-local-or-self-hosted-model)
  L85: Thanks to tools like Claude Code and Cursor, your team ships code non-stop. But your penetration test? That happens once a year. This creates a massive security gap. For the other 364 d
  L95: It's named after Claude Shannon, the father of information theory. At its core, pentesting is an information problem: every probe reduces uncertainty about a system's state. The best to
  L97: Also, we wanted you to be able to say, "Hey Claude, run Shannon" to find all the security flaws in your vibe-coded app.
  L105: Shannon is built to work alongside expert pentesters and red teamers, not replace them. Great pentesters understand the business, chain attacks in ways nobody anticipated, and bring yea
  L120: | Model             | Report                                                                       | SARIF                                                            |
  L122: | DeepSeek v4 Flash | [View report](benchmark/photoview-deepseek-v4-flash.pdf) | [SARIF](benchmark/photoview-deepseek-v4-flash.sarif) |
  L124: | Claude Opus 5     | [View report](benchmark/photoview-opus-5.pdf)            | [SARIF](benchmark/photoview-opus-5.sarif)            |
  L132: - **Docker**: required for the worker container.
  L134: - **AI provider credentials**: Shannon runs on Anthropic, OpenAI, xAI, AWS Bedrock, and [any other provider](docs/ai-providers.md#any-other-provider) in the harness catalogue — each of 
  L135: - **Cyber safeguards cleared with your provider**: Anthropic and OpenAI apply real-time safeguards to cyber-security workloads, which can interrupt a scan mid-run. Complete their guidan
  L154: Shannon pulls the worker image from Docker Hub, starts the required local infrastructure, mounts the target repository read-only inside an ephemeral worker container, and writes results
  L161: > - **OpenAI Codex:** The latest version of Shannon supports ChatGPT Plus and Pro subscriptions. Follow the [OpenAI Codex subscription setup guide](docs/ai-providers.md#openai-codex-cha
  L163: > - **Claude Code:** The latest version of Shannon does not support Claude Code subscriptions. Follow the [Claude Code subscription setup guide](docs/ai-providers.md#claude-code-subscri
  L178: - **Provider agnostic and BYOK**: Supports Anthropic, OpenAI, xAI, AWS Bedrock, compatible APIs and LLM gateways, and local models served through Ollama, vLLM, or LM Studio.
  L179: - **Private by design**: Runs in your infrastructure, stores results locally, and sends model requests directly to your chosen endpoint. A local endpoint keeps data inside your environm
  L220: api-key: ${{ secrets.SHANNON_AI_API_KEY }}
  L230: - a runner with Docker and Docker Compose v2;
  L232: - a model-provider credential stored as a GitHub Actions secret.
  L240: | **Shannon** (open source) | This repository. A complete autonomous pentester you run yourself, locally or in CI/CD, against an application whose source code you have. Well suited to i
  L293: Each scan runs in an ephemeral Docker container with an isolated workspace and per-invocation orchestration.
  L304: | [AI providers](docs/ai-providers.md)                      | Selecting the model, the supported providers (Anthropic, OpenAI, xAI, AWS Bedrock, and any other Pi-supported provider), an
  L305: | [Platforms and networking](docs/platforms.md)             | Windows/WSL2, Linux, macOS, Docker networking, local apps, and custom hostnames.                                           
  L307: | [Safety and limitations](docs/safety.md)                  | Authorized-use requirements, non-production guidance, mutative effects, cost, and model caveats.                           
  L324: - Anthropic, OpenAI, xAI, and AWS Bedrock are built-in providers, and any other provider in the harness catalogue works too — each reachable through a custom base URL that points it at 
  L325: - A full run can take roughly 1 to 1.5 hours and may incur LLM API costs depending on model pricing and application complexity.
  L381: Keygraph never receives your source code and never proxies your model traffic. Your model requests go straight to the provider or endpoint you configure, and they carry source and appli
  L385: Yes, always. You provide the LLM credentials Shannon uses to run a pentest, in every deployment, open source and commercial. Keygraph never proxies your model traffic.
  L393: Anthropic, OpenAI, xAI, and AWS Bedrock are built in and configured directly by provider ID. Beyond those, Shannon runs on any provider in the Pi harness catalogue, named the same `<pro
========================================================================
### vxcontrol/pentagi
  README 253617 bytes
  L26: - [Agent Docker Access](#giving-agents-docker-without-giving-away-the-host)
  L31: - [Azure OpenAI](#using-azure-openai)
  L32: - [Ollama](#ollama-provider-configuration)
  L33: - [OpenAI](#openai-provider-configuration)
  L34: - [Anthropic](#anthropic-provider-configuration)
  L35: - [Google AI (Gemini)](#google-ai-gemini-provider-configuration)
  L37: - [DeepSeek](#deepseek-provider-configuration)
  L49: - [Docker Image Configuration](#docker-image-configuration)
  L60: PentAGI is an open-source, self-hosted multi-agent system for autonomous penetration testing. You describe a target and a goal in plain language; a team of specialized AI agents plans t
  L63: - **What sets it apart.** It runs on your own servers with the model of your choice: 10+ cloud LLM providers, your own OpenAI-compatible gateway, or local models through Ollama or vLLM.
  L64: - **How to install.** An interactive installer for Linux, macOS and Windows sets PentAGI up with Docker Compose — see [Quick Start](#quick-start).
  L73: - Secure & Isolated. All operations are performed in a sandboxed Docker environment with complete isolation.
  L78: - Web Intelligence. Built-in browser via [scraper](https://hub.docker.com/r/vxcontrol/scraper) for gathering latest information from web sources.
  L80: - Team of Specialists. Delegation system with specialized AI agents for research, development, and infrastructure tasks, enhanced with optional execution monitoring and intelligent task
  L83: - Smart Container Management. Automatic Docker image selection based on specific task requirements.
  L86: - Persistent Storage. All commands and outputs are stored in PostgreSQL with [pgvector](https://hub.docker.com/r/vxcontrol/pgvector) extension.
  L89: - Flexible Authentication. Support for 10+ LLM providers ([OpenAI](https://platform.openai.com/), [Anthropic](https://www.anthropic.com/), [Google AI/Gemini](https://ai.google.dev/), [A
  L91: - Quick Deployment. Easy setup through [Docker Compose](https://docs.docker.com/compose/) with comprehensive environment configuration.
  L98: - Provider flexibility is available today through built-in providers and custom/OpenAI-compatible endpoints. See [Custom LLM Provider Configuration](#custom-llm-provider-configuration) 
  L119: (OpenAI/Anthropic/Ollama/Bedrock/Gemini/Custom)"]
  L486: **Best for**: Smaller models (< 32B parameters), complex attack scenarios requiring continuous guidance, preventing agents from getting stuck on single approach
  L498: **Best for**: Models < 32B parameters, complex penetration testing workflows, improving success rates on sophisticated tasks
  L500: **Enhanced Adviser Configuration**: Works exceptionally well when adviser agent uses stronger model or enhanced settings. Example: using same base model with maximum reasoning mode for 
  L518: ### Recommendations for Open Source Models
  L520: **Must-Have for Models < 32B Parameters**:
  L521: Testing with Qwen3.5-27B-FP8 demonstrates that enabling both Execution Monitoring and Task Planning is **essential** for smaller open source models:
  L531: - Model requirements: Works best when adviser uses enhanced configuration (higher reasoning parameters, stronger model variant, or different model)
  L534: For optimal performance with smaller models, configure adviser agent with enhanced settings:
  L535: - Use same model with maximum reasoning mode (example: [`vllm-qwen3.5-27b-fp8.provider.yml`](examples/configs/vllm-qwen3.5-27b-fp8.provider.yml))
  L536: - Or use stronger model for adviser while keeping base model for other agents