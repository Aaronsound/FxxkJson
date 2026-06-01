# Changelog

## Unreleased

- Documented the project evolution from HanJson to HanJson-vite and FxxkJson in the Chinese and English README files.
- Fixed bundle size reporting on Windows workspaces whose paths contain spaces.
- Added repository line-ending defaults for consistent local formatting on Windows and CI.
- Added an npm override for the transitive `tmp` dependency advisory pulled in by Electron packaging.
- Moved desktop release notes into a shared Markdown file so the release workflow does not duplicate the same body text.

## v1.0.25

- Renamed the public project and app metadata to FxxkJson.
- Added Chinese / English UI switching.
- Restored consistent right-pane typography between small JSON and large JSON viewers.
- Added open-source readiness files: MIT license, contributing guide, issue templates, pull request template, and security policy.
- Improved release workflow checks and release asset validation.

## v1.0.24

- Prepared the project for public release.
- Updated package metadata, app id, and desktop product name.
- Added repository documentation for release and validation workflows.

## v1.0.23

- Kept small and large JSON right-pane typography in sync with a shared guard test.
- Extracted right editor context menu responsibilities.
- Centralized worker interactive request cleanup.
- Added large JSON viewer line-title optimization.
- Expanded Electron E2E and performance CI coverage.

## v1.0.22

- Improved large JSON locate accuracy by calibrating JSON Path behavior.
- Added JSON compare dialog for added, removed, and changed fields.
- Enhanced right-side node actions: copy path/key/value, copy compact/formatted JSON, edit, delete, and rename.
- Improved right search with recent searches and pinned paths.
- Split search quick access, right node actions, and worker node edit operations out of larger modules.
- Added Electron JSON flow E2E coverage.
