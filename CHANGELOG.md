# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2026-09-04

### Added
- **pi.dev Gallery Preview**: Added `"image"` metadata in `package.json` pointing to official banner for visual preview in `pi.dev/packages` catalog.
- **Enhanced Peer Dependencies**: Added core Pi runtime packages (`@earendil-works/pi-ai`, `@earendil-works/pi-tui`) with optional peer resolution.
- **Repository Normalization**: Cleaned git repository metadata and explicit `publishConfig.access: "public"`.

## [1.0.2] - 2026-09-03

### Fixed
- **`caido_get_request`**: Removed invalid `include` parameter and implemented correct `serialization: { include_body: true }` schema matching native Caido MCP `get_requests_by_ids`.
- **`caido_send_requests`**: Renamed and synchronized parameters to `{ ids: [...] }` to match Caido's native `send_requests` replay tool.
- **`caido_create_finding`**: Fixed schema mapping to `{ items: [{ title, description, reporter, request_id }] }` with proper `request_id` resolution.
- **Documentation**: Documented known Caido server-side GraphQL bug on `query_replay_sessions` (`Unknown field "collection" on type "ReplaySession"`) and provided workarounds with `list_replay_collections_detailed`.

## [1.0.1] - 2026-09-03

### Added
- **Bundled Agent Skill (`skills/caido/SKILL.md`)**: Full HTTPQL guide, tool selection matrix, and workflow patterns.
- **Tool Prompt Snippets**: Integrated `promptSnippet` and `promptGuidelines` into each registered tool.

## [1.0.0] - 2026-09-03

### Added
- Initial release of `pi-caido` extension.
